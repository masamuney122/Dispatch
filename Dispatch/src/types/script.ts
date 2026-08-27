import type { ApiRequest } from "./request";
import type { ApiResponse } from "./response";

export interface RequestScripts {
  pre_request: string;
  post_response: string;
}

export const EMPTY_REQUEST_SCRIPTS: RequestScripts = {
  pre_request: "",
  post_response: "",
};

export type ScriptPhase = "pre-request" | "post-response";
export type ScriptLogLevel = "log" | "info" | "warn" | "error";
export type ScriptExecutionStatus = "passed" | "failed" | "skipped";

export interface ScriptLogEntry {
  level: ScriptLogLevel;
  message: string;
}

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ScriptExecutionReport {
  phase: ScriptPhase;
  status: ScriptExecutionStatus;
  duration_ms: number;
  logs: ScriptLogEntry[];
  tests: ScriptTestResult[];
  error?: string;
}

export interface ScriptEnvironmentMutation {
  operation: "set" | "unset";
  key: string;
  value?: string;
}

export interface ScriptExecutionInput {
  phase: ScriptPhase;
  source: string;
  request: ApiRequest;
  response?: ApiResponse;
  environment: Record<string, string>;
  hasActiveEnvironment: boolean;
}

export interface ScriptExecutionResult {
  request: ApiRequest;
  environment: Record<string, string>;
  environment_mutations: ScriptEnvironmentMutation[];
  report: ScriptExecutionReport;
}

