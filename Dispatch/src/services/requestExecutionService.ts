import { sendRequest } from "./api";
import {
  resolveRequestVariables,
  VariableResolutionError,
} from "./environmentVariableResolver";
import { executeRequestScript } from "./scriptService";
import { createExecutionConsoleEvents } from "./console/consoleRecorder";
import type { ApiRequest } from "../types/request";
import type { ApiResponse } from "../types/response";
import type {
  ConsoleTelemetryTarget,
  RequestExecutionTrace,
} from "../types/console";
import type {
  RequestScripts,
  ScriptEnvironmentMutation,
  ScriptExecutionReport,
} from "../types/script";

export interface RequestExecutionContext {
  request: ApiRequest;
  scripts: RequestScripts;
  environment: Record<string, string>;
  hasActiveEnvironment: boolean;
  iteration?: number;
  iterationCount?: number;
  iterationData?: Record<string, string>;
  send?: (request: ApiRequest) => Promise<ApiResponse>;
  onEnvironmentMutated?: (
    environment: Record<string, string>,
    mutations: ScriptEnvironmentMutation[],
  ) => Promise<void>;
  telemetry?: ConsoleTelemetryTarget;
}

export interface RequestExecutionResult {
  request: ApiRequest;
  response: ApiResponse;
  environment: Record<string, string>;
  reports: ScriptExecutionReport[];
  trace: RequestExecutionTrace;
}

export class RequestExecutionError extends Error {
  readonly reports: ScriptExecutionReport[];
  readonly environment: Record<string, string>;
  readonly originalCause: unknown;
  readonly request?: ApiRequest;
  readonly response?: ApiResponse;
  readonly trace: RequestExecutionTrace;
  readonly stage: RequestExecutionStage;

  constructor(
    message: string,
    reports: ScriptExecutionReport[],
    environment: Record<string, string>,
    originalCause?: unknown,
    request?: ApiRequest,
    response?: ApiResponse,
    trace: RequestExecutionTrace = { input: request || ({} as ApiRequest) },
    stage: RequestExecutionStage = "network",
  ) {
    super(message, { cause: originalCause });
    this.name = "RequestExecutionError";
    this.reports = reports;
    this.environment = environment;
    this.originalCause = originalCause;
    this.request = request;
    this.response = response;
    this.trace = trace;
    this.stage = stage;
  }
}

export type RequestExecutionStage =
  | "pre-request"
  | "variable-resolution"
  | "network"
  | "post-response";

export function executionErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown request error";
  }
}

export function isVariableResolutionFailure(error: unknown): boolean {
  return (
    error instanceof VariableResolutionError ||
    (error instanceof RequestExecutionError &&
      error.originalCause instanceof VariableResolutionError)
  );
}

export async function executeRequestCycle({
  request,
  scripts,
  environment,
  hasActiveEnvironment,
  iteration = 0,
  iterationCount = 1,
  iterationData = {},
  send = sendRequest,
  onEnvironmentMutated,
  telemetry,
}: RequestExecutionContext): Promise<RequestExecutionResult> {
  const executionId = crypto.randomUUID();
  const reports: ScriptExecutionReport[] = [];
  let runtimeEnvironment = { ...environment };
  let executionRequest = request;
  let executionResponse: ApiResponse | undefined;
  let stage: RequestExecutionStage = "pre-request";
  const trace: RequestExecutionTrace = {
    input: structuredClone(request),
  };

  try {
    const preResult = await executeRequestScript({
      phase: "pre-request",
      source: scripts.pre_request,
      request,
      environment: runtimeEnvironment,
      hasActiveEnvironment,
      iteration,
      iteration_count: iterationCount,
      iteration_data: iterationData,
    });
    reports.push(preResult.report);
    executionRequest = preResult.request;
    trace.afterPreRequest = structuredClone(preResult.request);
    if (preResult.report.status === "failed") {
      throw new Error(
        `Pre-request script failed: ${preResult.report.error || "Unknown error"}`,
      );
    }
    runtimeEnvironment = preResult.environment;
    if (preResult.environment_mutations.length > 0) {
      await onEnvironmentMutated?.(
        runtimeEnvironment,
        preResult.environment_mutations,
      );
    }

    stage = "variable-resolution";
    const resolvedTemplate = await resolveRequestVariables(
      { request: preResult.request, queryParams: [] },
      { ...runtimeEnvironment, ...iterationData },
    );
    const resolvedRequest = resolvedTemplate.request;
    executionRequest = resolvedRequest;
    trace.resolved = structuredClone(resolvedRequest);
    stage = "network";
    const response = await send(resolvedRequest);
    executionResponse = response;
    stage = "post-response";
    const postResult = await executeRequestScript({
      phase: "post-response",
      source: scripts.post_response,
      request: resolvedRequest,
      response,
      environment: runtimeEnvironment,
      hasActiveEnvironment,
      iteration,
      iteration_count: iterationCount,
      iteration_data: iterationData,
    });
    reports.push(postResult.report);
    if (postResult.report.status === "failed") {
      throw new Error(
        `Post-response script failed: ${postResult.report.error || "Unknown error"}`,
      );
    }
    runtimeEnvironment = postResult.environment;
    if (postResult.environment_mutations.length > 0) {
      await onEnvironmentMutated?.(
        runtimeEnvironment,
        postResult.environment_mutations,
      );
    }

    const result = {
      request: resolvedRequest,
      response,
      environment: runtimeEnvironment,
      reports,
      trace,
    };
    telemetry?.append(
      createExecutionConsoleEvents({
        executionId,
        source: telemetry.source,
        trace,
        response,
        reports,
        additionalSecrets: telemetry.knownSecrets,
      }),
    );
    return result;
  } catch (error) {
    if (error instanceof RequestExecutionError) throw error;
    const executionError = new RequestExecutionError(
      executionErrorMessage(error),
      reports,
      runtimeEnvironment,
      error,
      executionRequest,
      executionResponse,
      trace,
      stage,
    );
    telemetry?.append(
      createExecutionConsoleEvents({
        executionId,
        source: telemetry.source,
        trace,
        response: executionResponse,
        reports,
        error: { message: executionError.message, stage },
        additionalSecrets: telemetry.knownSecrets,
      }),
    );
    throw executionError;
  }
}
