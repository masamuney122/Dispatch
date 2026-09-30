import type { Environment } from "../types/environment";
import type {
  OrderedRunnerRequest,
  RunnerConfiguration,
  RunnerRequestResult,
} from "../types/runner";
import type { ScriptExecutionReport } from "../types/script";
import {
  executeRequestCycle,
  executionErrorMessage,
  RequestExecutionError,
  type RequestExecutionContext,
  type RequestExecutionResult,
} from "./requestExecutionService";
import { createRunnerTransport } from "./runnerTransportService";
import type { RunnerTransport } from "../types/runnerTransport";
import type { ConsoleEvent } from "../types/console";
import { isSensitiveName } from "./console/redaction";

const MAX_RETAINED_RESPONSE_BYTES = 300 * 1024;

interface RunCallbacks {
  isStopRequested: () => boolean;
  onResult: (result: RunnerRequestResult) => void;
}

export interface CollectionRunInput extends RunCallbacks {
  configuration: RunnerConfiguration;
  requests: OrderedRunnerRequest[];
  environment?: Environment;
  createTransport?: (useStoredCookies: boolean) => Promise<RunnerTransport>;
  executeRequest?: (
    context: RequestExecutionContext,
  ) => Promise<RequestExecutionResult>;
  runnerId?: string;
  appendConsoleEvents?: (events: ConsoleEvent[]) => void;
}

export interface CollectionRunOutput {
  environment: Record<string, string>;
  stopped: boolean;
}

function reportsForStorage(
  reports: ScriptExecutionReport[],
  disableLogs: boolean,
): ScriptExecutionReport[] {
  if (!disableLogs) return reports;
  return reports.map((report) => ({ ...report, logs: [] }));
}

function hasFailedTest(reports: ScriptExecutionReport[]): boolean {
  return reports.some((report) => report.tests.some((test) => !test.passed));
}

function iterationData(
  rows: Array<Record<string, string>>,
  iteration: number,
): Record<string, string> {
  if (rows.length === 0) return {};
  return rows[iteration % rows.length];
}

function retainedResponse(
  persistResponses: boolean,
  response: Awaited<ReturnType<typeof executeRequestCycle>>["response"],
) {
  if (!persistResponses) return undefined;
  const size = response.body_size ?? new TextEncoder().encode(response.body).byteLength;
  return size <= MAX_RETAINED_RESPONSE_BYTES ? response : undefined;
}

async function wait(
  delayMs: number,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  const deadline = performance.now() + delayMs;
  while (delayMs > 0 && !shouldStop()) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) return;
    await new Promise<void>((resolve) =>
      globalThis.setTimeout(resolve, Math.min(remaining, 100)),
    );
  }
}

async function runOneRequest(
  item: OrderedRunnerRequest,
  iteration: number,
  iterationCount: number,
  environment: Record<string, string>,
  configuration: RunnerConfiguration,
  activeEnvironment: boolean,
  transport: RunnerTransport,
  executeRequest: (
    context: RequestExecutionContext,
  ) => Promise<RequestExecutionResult>,
  runnerId?: string,
  appendConsoleEvents?: (events: ConsoleEvent[]) => void,
  virtualUser?: number,
): Promise<{ result: RunnerRequestResult; environment: Record<string, string>; hasError: boolean }> {
  const request = structuredClone(item.request.request);
  const scripts = request.scripts || { pre_request: "", post_response: "" };

  try {
    const execution = await executeRequest({
      request,
      scripts,
      environment,
      hasActiveEnvironment: activeEnvironment,
      iteration,
      iterationCount,
      iterationData: iterationData(configuration.iterationData, iteration),
      send: transport.send,
      telemetry: appendConsoleEvents
        ? {
            source: {
              kind: "runner",
              runnerId,
              requestId: item.request.id,
              requestName: item.request.name,
              iteration,
              virtualUser,
            },
            append: (events) =>
              appendConsoleEvents(
                configuration.disableLogs
                  ? events.filter((event) => event.type !== "script")
                  : events,
              ),
            knownSecrets: Object.entries(environment)
              .filter(([name]) => isSensitiveName(name))
              .map(([, value]) => value),
          }
        : undefined,
    });
    const reports = reportsForStorage(execution.reports, configuration.disableLogs);
    const failed = hasFailedTest(reports);
    return {
      environment: execution.environment,
      hasError: false,
      result: {
        id: crypto.randomUUID(),
        iteration,
        virtualUser,
        requestId: item.request.id,
        name: item.request.name,
        method: execution.request.method,
        url: execution.request.url,
        status: failed ? "failed" : "passed",
        httpStatus: execution.response.status,
        responseTimeMs: execution.response.response_time_ms,
        responseSize:
          execution.response.body_size ??
          new TextEncoder().encode(execution.response.body).byteLength,
        error: null,
        request: configuration.persistResponses ? execution.request : undefined,
        response: retainedResponse(
          configuration.persistResponses,
          execution.response,
        ),
        scriptReports: reports,
      },
    };
  } catch (error) {
    const executionError =
      error instanceof RequestExecutionError ? error : undefined;
    return {
      environment: executionError?.environment || environment,
      hasError: true,
      result: {
        id: crypto.randomUUID(),
        iteration,
        virtualUser,
        requestId: item.request.id,
        name: item.request.name,
        method: request.method,
        url: request.url,
        status: "error",
        httpStatus: null,
        responseTimeMs: null,
        responseSize: null,
        error: executionErrorMessage(error),
        request: configuration.persistResponses ? request : undefined,
        scriptReports: reportsForStorage(
          executionError?.reports || [],
          configuration.disableLogs,
        ),
      },
    };
  }
}

export async function runFunctionalCollection({
  configuration,
  requests,
  environment,
  isStopRequested,
  onResult,
  createTransport = createRunnerTransport,
  executeRequest = executeRequestCycle,
  runnerId,
  appendConsoleEvents,
}: CollectionRunInput): Promise<CollectionRunOutput> {
  let runtimeEnvironment = { ...(environment?.variables || {}) };
  let stopped = false;
  const transport = await createTransport(configuration.useStoredCookies);

  const addSkippedResults = (iterationStart: number, requestStart: number) => {
    for (let iteration = iterationStart; iteration < configuration.iterations; iteration += 1) {
      const firstRequest = iteration === iterationStart ? requestStart : 0;
      for (let requestIndex = firstRequest; requestIndex < requests.length; requestIndex += 1) {
        const item = requests[requestIndex];
        onResult({
          id: crypto.randomUUID(),
          iteration,
          requestId: item.request.id,
          name: item.request.name,
          method: item.request.request.method,
          url: item.request.request.url,
          status: "skipped",
          httpStatus: null,
          responseTimeMs: null,
          responseSize: null,
          error: null,
          scriptReports: [],
        });
      }
    }
  };

  try {
    outer: for (let iteration = 0; iteration < configuration.iterations; iteration += 1) {
      for (let requestIndex = 0; requestIndex < requests.length; requestIndex += 1) {
        const item = requests[requestIndex];
        if (isStopRequested()) {
          stopped = true;
          addSkippedResults(iteration, requestIndex);
          break outer;
        }
        const execution = await runOneRequest(
          item,
          iteration,
          configuration.iterations,
          runtimeEnvironment,
          configuration,
          Boolean(environment),
          transport,
          executeRequest,
          runnerId,
          appendConsoleEvents,
        );
        runtimeEnvironment = execution.environment;
        onResult(execution.result);
        if (execution.hasError && configuration.stopOnError) {
          stopped = true;
          addSkippedResults(iteration, requestIndex + 1);
          break outer;
        }
        await wait(configuration.delayMs, isStopRequested);
      }
    }
  } finally {
    await transport.finish(configuration.saveCookiesAfterRun);
  }

  return { environment: runtimeEnvironment, stopped };
}

export async function runPerformanceCollection({
  configuration,
  requests,
  environment,
  isStopRequested,
  onResult,
  createTransport = createRunnerTransport,
  executeRequest = executeRequestCycle,
  runnerId,
  appendConsoleEvents,
}: CollectionRunInput): Promise<CollectionRunOutput> {
  const startedAt = performance.now();
  const deadline = startedAt + configuration.performanceDurationSeconds * 1000;
  const userCount = Math.max(1, configuration.virtualUsers);
  let fatalError = false;

  const runVirtualUser = async (virtualUser: number) => {
    let runtimeEnvironment = { ...(environment?.variables || {}) };
    let iteration = 0;
    const transport = await createTransport(configuration.useStoredCookies);
    if (configuration.loadProfile === "ramp-up" && userCount > 1) {
      const rampDelay =
        (configuration.performanceDurationSeconds * 500 * (virtualUser - 1)) /
        (userCount - 1);
      await wait(
        rampDelay,
        () => isStopRequested() || fatalError || performance.now() >= deadline,
      );
    }

    try {
      while (performance.now() < deadline && !isStopRequested() && !fatalError) {
        for (const item of requests) {
          if (performance.now() >= deadline || isStopRequested() || fatalError) break;
          const execution = await runOneRequest(
            item,
            iteration,
            iteration + 1,
            runtimeEnvironment,
            { ...configuration, persistResponses: false },
            Boolean(environment),
            transport,
            executeRequest,
            runnerId,
            appendConsoleEvents,
            virtualUser,
          );
          runtimeEnvironment = execution.environment;
          onResult(execution.result);
          if (execution.hasError && configuration.stopOnError) {
            fatalError = true;
            return;
          }
          await wait(
            configuration.delayMs,
            () =>
              isStopRequested() || fatalError || performance.now() >= deadline,
          );
        }
        iteration += 1;
      }
    } finally {
      await transport.finish(false);
    }
  };

  await Promise.all(
    Array.from({ length: userCount }, (_, index) => runVirtualUser(index + 1)),
  );
  return {
    environment: { ...(environment?.variables || {}) },
    stopped: isStopRequested() || fatalError,
  };
}
