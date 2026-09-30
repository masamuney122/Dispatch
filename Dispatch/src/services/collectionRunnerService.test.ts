import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../types/request";
import type { RunnerConfiguration, RunnerRequestResult } from "../types/runner";
import type { RunnerTransport } from "../types/runnerTransport";
import type {
  RequestExecutionContext,
  RequestExecutionResult,
} from "./requestExecutionService";
import { RequestExecutionError } from "./requestExecutionService";
import {
  runFunctionalCollection,
  runPerformanceCollection,
} from "./collectionRunnerService";

const apiRequest = (name: string): ApiRequest => ({
  method: "GET",
  url: `https://example.com/${name}`,
  body: "",
  body_type: "none",
  form_fields: [],
  headers: {},
  scripts: { pre_request: "", post_response: "" },
});

const requests = ["first", "second"].map((name, order) => ({
  folderPath: [],
  request: {
    id: name,
    name,
    order,
    created_at: "",
    updated_at: "",
    request: apiRequest(name),
  },
}));

const configuration = (
  overrides: Partial<RunnerConfiguration> = {},
): RunnerConfiguration => ({
  runType: "functional",
  environmentId: "environment",
  requestSelection: requests.map(({ request }) => ({
    requestId: request.id,
    selected: true,
  })),
  iterations: 2,
  delayMs: 0,
  iterationData: [{ row: "one" }, { row: "two" }],
  iterationDataFileName: "data.json",
  persistResponses: true,
  disableLogs: false,
  stopOnError: true,
  keepVariableValues: true,
  useStoredCookies: true,
  saveCookiesAfterRun: true,
  performanceDurationSeconds: 1,
  virtualUsers: 1,
  loadProfile: "fixed",
  ...overrides,
});

const passingExecution = (
  context: RequestExecutionContext,
): RequestExecutionResult => ({
  request: context.request,
  response: {
    status: 200,
    response_time_ms: 12,
    body: "ok",
    body_size: 2,
    headers: {},
  },
  environment: {
    ...context.environment,
    completed: context.request.url.split("/").at(-1) || "",
  },
  reports: [],
  trace: { input: context.request, resolved: context.request },
});

function transportFactory() {
  const finish = vi.fn(async () => undefined);
  const transport: RunnerTransport = {
    send: vi.fn(async () => {
      throw new Error("The injected execution function owns request sending");
    }),
    finish,
  };
  return {
    create: vi.fn(async () => transport),
    finish,
  };
}

describe("runFunctionalCollection", () => {
  it("runs requests sequentially for every iteration and carries environment state", async () => {
    const transport = transportFactory();
    const contexts: RequestExecutionContext[] = [];
    const results: RunnerRequestResult[] = [];

    const output = await runFunctionalCollection({
      configuration: configuration(),
      requests,
      environment: { id: "environment", name: "Test", variables: { seed: "yes" } },
      isStopRequested: () => false,
      onResult: (result) => results.push(result),
      createTransport: transport.create,
      executeRequest: async (context) => {
        contexts.push(context);
        return passingExecution(context);
      },
    });

    expect(contexts.map(({ request }) => request.url)).toEqual([
      "https://example.com/first",
      "https://example.com/second",
      "https://example.com/first",
      "https://example.com/second",
    ]);
    expect(contexts.map(({ iterationData }) => iterationData?.row)).toEqual([
      "one",
      "one",
      "two",
      "two",
    ]);
    expect(contexts[1].environment.completed).toBe("first");
    expect(contexts[2].environment.completed).toBe("second");
    expect(results.map(({ status }) => status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(output).toEqual({
      environment: { seed: "yes", completed: "second" },
      stopped: false,
    });
    expect(transport.create).toHaveBeenCalledWith(true);
    expect(transport.finish).toHaveBeenCalledWith(true);
  });

  it("stops after an execution error and records the remaining requests as skipped", async () => {
    const transport = transportFactory();
    const results: RunnerRequestResult[] = [];

    const output = await runFunctionalCollection({
      configuration: configuration(),
      requests,
      isStopRequested: () => false,
      onResult: (result) => results.push(result),
      createTransport: transport.create,
      executeRequest: async (context) => {
        throw new RequestExecutionError(
          "network failed",
          [],
          context.environment,
        );
      },
    });

    expect(results.map(({ status }) => status)).toEqual([
      "error",
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(results[0].error).toBe("network failed");
    expect(output.stopped).toBe(true);
    expect(transport.finish).toHaveBeenCalledWith(true);
  });

  it("marks failed assertions as failed without treating them as transport errors", async () => {
    const transport = transportFactory();
    const results: RunnerRequestResult[] = [];

    await runFunctionalCollection({
      configuration: configuration({ iterations: 1 }),
      requests,
      isStopRequested: () => false,
      onResult: (result) => results.push(result),
      createTransport: transport.create,
      executeRequest: async (context) => ({
        ...passingExecution(context),
        reports: [{
          phase: "post-response",
          status: "passed",
          duration_ms: 1,
          logs: [],
          tests: [{ name: "expected value", passed: false, error: "mismatch" }],
        }],
      }),
    });

    expect(results.map(({ status }) => status)).toEqual(["failed", "failed"]);
  });
});

describe("runPerformanceCollection", () => {
  it("uses an isolated transport per virtual user and stops scheduling promptly", async () => {
    const finishCallbacks: Array<ReturnType<typeof vi.fn>> = [];
    const createTransport = vi.fn(async (): Promise<RunnerTransport> => {
      const finish = vi.fn(async () => undefined);
      finishCallbacks.push(finish);
      return {
        send: vi.fn(),
        finish,
      };
    });
    const results: RunnerRequestResult[] = [];
    let stopped = false;

    const output = await runPerformanceCollection({
      configuration: configuration({
        runType: "performance",
        virtualUsers: 3,
        loadProfile: "fixed",
      }),
      requests,
      isStopRequested: () => stopped,
      onResult: (result) => {
        results.push(result);
        stopped = true;
      },
      createTransport,
      executeRequest: async (context) => passingExecution(context),
    });

    expect(results).toHaveLength(3);
    expect(results.map(({ virtualUser }) => virtualUser)).toEqual([1, 2, 3]);
    expect(results.every(({ requestId }) => requestId === "first")).toBe(true);
    expect(output.stopped).toBe(true);
    expect(createTransport).toHaveBeenCalledTimes(3);
    finishCallbacks.forEach((finish) => expect(finish).toHaveBeenCalledWith(false));
  });
});
