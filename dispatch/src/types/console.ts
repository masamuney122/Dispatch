import type { ApiRequest } from "./request";
import type { ApiResponse } from "./response";
import type {
  ScriptConsoleValue,
  ScriptErrorKind,
  ScriptLogLevel,
  ScriptPhase,
} from "./script";

export type ConsoleEventType = "network" | "script" | "test" | "cookie" | "error";
export type ConsoleEventLevel = "debug" | "log" | "info" | "warning" | "error";

export interface ConsoleEventSource {
  kind: "interactive" | "runner" | "auth";
  requestId?: string;
  requestName?: string;
  runnerId?: string;
  iteration?: number;
  virtualUser?: number;
}

export interface ConsoleEventBase {
  schemaVersion: 1;
  id: string;
  executionId: string;
  sequence: number;
  timestamp: string;
  type: ConsoleEventType;
  level: ConsoleEventLevel;
  source: ConsoleEventSource;
  phase?: ScriptPhase | "network";
}

export interface RedactedRequestStages {
  input: ApiRequest;
  afterPreRequest?: ApiRequest;
  resolved?: ApiRequest;
}

export interface NetworkConsoleEvent extends ConsoleEventBase {
  type: "network";
  phase: "network";
  payload: {
    outcome: "success" | "error";
    request: ApiRequest;
    requestStages: RedactedRequestStages;
    response: ApiResponse | null;
    error: string | null;
    capabilities: {
      exactRequestHeaders: boolean;
      redirectChain: boolean;
      cookieDetails: boolean;
    };
  };
}

export interface ScriptConsoleEvent extends ConsoleEventBase {
  type: "script";
  phase: ScriptPhase;
  payload:
    | {
        operation: "write";
        method: ScriptLogLevel;
        message: string;
        values: ScriptConsoleValue[];
      }
    | { operation: "clear" };
}

export interface TestConsoleEvent extends ConsoleEventBase {
  type: "test";
  phase: ScriptPhase;
  payload: {
    name: string;
    status: "passed" | "failed" | "skipped";
    error?: string;
  };
}

export interface CookieConsoleEvent extends ConsoleEventBase {
  type: "cookie";
  phase: "network";
  payload: {
    action: "request-attached" | "response-added-or-updated" | "browser-managed";
    name?: string;
    domain?: string;
    path?: string;
    value?: "<redacted>";
    reason?: string;
  };
}

export type ConsoleErrorCategory =
  | "variable-resolution"
  | "script-syntax"
  | "script-runtime"
  | "script-timeout"
  | "worker"
  | "network-timeout"
  | "network-dns"
  | "network-tls"
  | "network-connection"
  | "network-aborted"
  | "network"
  | "response-limit"
  | "browser-network"
  | "unknown";

export interface ErrorConsoleEvent extends ConsoleEventBase {
  type: "error";
  payload: {
    category: ConsoleErrorCategory;
    message: string;
    scriptKind?: ScriptErrorKind;
    stack?: string;
  };
}

export type ConsoleEvent =
  | NetworkConsoleEvent
  | ScriptConsoleEvent
  | TestConsoleEvent
  | CookieConsoleEvent
  | ErrorConsoleEvent;

export interface RequestExecutionTrace {
  input: ApiRequest;
  afterPreRequest?: ApiRequest;
  resolved?: ApiRequest;
}

export interface ConsoleTelemetryTarget {
  source: ConsoleEventSource;
  append: (events: ConsoleEvent[]) => void;
  knownSecrets?: string[];
}
