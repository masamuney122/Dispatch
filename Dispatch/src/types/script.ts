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
export type ScriptErrorKind =
  | "syntax"
  | "runtime"
  | "timeout"
  | "worker"
  | "memory"
  | "unknown";

export type ScriptConsoleValue =
  | { kind: "null" }
  | { kind: "undefined" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number | string }
  | { kind: "string"; value: string; truncated?: boolean }
  | { kind: "array"; items: ScriptConsoleValue[]; truncated: boolean }
  | {
      kind: "object";
      entries: Array<{ key: string; value: ScriptConsoleValue }>;
      truncated: boolean;
    }
  | { kind: "special"; label: string };

export interface ScriptConsoleWriteEntry {
  operation: "write";
  level: ScriptLogLevel;
  message: string;
  values: ScriptConsoleValue[];
  sequence: number;
}

export interface ScriptConsoleClearEntry {
  operation: "clear";
  sequence: number;
}

export type ScriptLogEntry = ScriptConsoleWriteEntry | ScriptConsoleClearEntry;

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  status?: "passed" | "failed" | "skipped";
  error?: string;
}

export interface ScriptErrorInfo {
  kind: ScriptErrorKind;
  message: string;
  stack?: string;
}

export interface ScriptExecutionReport {
  phase: ScriptPhase;
  status: ScriptExecutionStatus;
  duration_ms: number;
  logs: ScriptLogEntry[];
  tests: ScriptTestResult[];
  error?: string;
  error_info?: ScriptErrorInfo;
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
  iteration?: number;
  iteration_count?: number;
  iteration_data?: Record<string, string>;
}

export interface ScriptExecutionResult {
  request: ApiRequest;
  environment: Record<string, string>;
  environment_mutations: ScriptEnvironmentMutation[];
  report: ScriptExecutionReport;
}
