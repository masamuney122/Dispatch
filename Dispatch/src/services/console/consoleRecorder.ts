import type {
  ConsoleErrorCategory,
  ConsoleEvent,
  ConsoleEventBase,
  ConsoleEventLevel,
  ConsoleEventSource,
  RequestExecutionTrace,
} from "../../types/console";
import type { ApiResponse } from "../../types/response";
import type {
  ScriptExecutionReport,
  ScriptLogLevel,
} from "../../types/script";
import {
  knownSecretsForRequest,
  redactConsoleValues,
  redactRequest,
  redactResponse,
  redactText,
} from "./redaction";

export type RequestExecutionStage =
  | "pre-request"
  | "variable-resolution"
  | "network"
  | "post-response";

interface ExecutionConsoleInput {
  executionId: string;
  source: ConsoleEventSource;
  trace: RequestExecutionTrace;
  response?: ApiResponse;
  reports: ScriptExecutionReport[];
  error?: {
    message: string;
    stage: RequestExecutionStage;
  };
  additionalSecrets?: string[];
}

const eventLevel = (level: ScriptLogLevel): ConsoleEventLevel =>
  level === "warn" ? "warning" : level;

function errorCategory(
  stage: RequestExecutionStage,
  message: string,
): ConsoleErrorCategory {
  const normalized = message.toLowerCase();
  if (stage === "variable-resolution") return "variable-resolution";
  if (stage === "pre-request" || stage === "post-response") {
    if (normalized.includes("execution limit") || normalized.includes("interrupted")) {
      return "script-timeout";
    }
    if (normalized.includes("syntax")) return "script-syntax";
    return "script-runtime";
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "network-timeout";
  }
  if (normalized.includes("dns") || normalized.includes("name resolution")) {
    return "network-dns";
  }
  if (
    normalized.includes("tls") ||
    normalized.includes("certificate") ||
    normalized.includes("ssl")
  ) {
    return "network-tls";
  }
  if (normalized.includes("abort") || normalized.includes("cancel")) {
    return "network-aborted";
  }
  if (
    normalized.includes("connection") ||
    normalized.includes("connect") ||
    normalized.includes("refused")
  ) {
    return "network-connection";
  }
  if (normalized.includes("response exceeds")) return "response-limit";
  if (normalized.includes("tarayıcı") || normalized.includes("cors")) {
    return "browser-network";
  }
  return stage === "network" ? "network" : "unknown";
}

export function createExecutionConsoleEvents({
  executionId,
  source,
  trace,
  response,
  reports,
  error,
  additionalSecrets = [],
}: ExecutionConsoleInput): ConsoleEvent[] {
  let sequence = 0;
  const createdAt = new Date().toISOString();
  const secrets = knownSecretsForRequest(trace.input, additionalSecrets);
  const events: ConsoleEvent[] = [];
  const base = (
    type: ConsoleEventBase["type"],
    level: ConsoleEventLevel,
    phase?: ConsoleEventBase["phase"],
  ): ConsoleEventBase => ({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    executionId,
    sequence: sequence++,
    timestamp: createdAt,
    type,
    level,
    source,
    phase,
  });

  const addReport = (report: ScriptExecutionReport) => {
    report.logs.forEach((log) => {
      if (log.operation === "clear") {
        events.push({
          ...base("script", "log", report.phase),
          type: "script",
          phase: report.phase,
          payload: { operation: "clear" },
        });
        return;
      }
      events.push({
        ...base("script", eventLevel(log.level), report.phase),
        type: "script",
        phase: report.phase,
        payload: {
          operation: "write",
          method: log.level,
          message: redactText(log.message, secrets),
          values: redactConsoleValues(log.values, secrets),
        },
      });
    });

    report.tests.forEach((test) => {
      const status = test.status || (test.passed ? "passed" : "failed");
      events.push({
        ...base("test", status === "failed" ? "error" : "info", report.phase),
        type: "test",
        phase: report.phase,
        payload: {
          name: redactText(test.name, secrets),
          status,
          error: test.error ? redactText(test.error, secrets) : undefined,
        },
      });
    });

    if (report.status === "failed" && report.error) {
      const kind = report.error_info?.kind || "runtime";
      events.push({
        ...base("error", "error", report.phase),
        type: "error",
        phase: report.phase,
        payload: {
          category:
            kind === "timeout"
              ? "script-timeout"
              : kind === "syntax"
                ? "script-syntax"
                : kind === "worker"
                  ? "worker"
                  : "script-runtime",
          message: redactText(report.error, secrets),
          scriptKind: kind,
          stack: report.error_info?.stack
            ? redactText(report.error_info.stack, secrets)
            : undefined,
        },
      });
    }
  };

  reports.filter((report) => report.phase === "pre-request").forEach(addReport);

  const shouldHaveNetworkEvent =
    Boolean(response) || !error || error.stage === "network" || error.stage === "post-response";
  if (shouldHaveNetworkEvent) {
    const finalRequest =
      trace.resolved || trace.afterPreRequest || trace.input;
    const requestWithTransportHeaders = response?.request_headers
      ? { ...finalRequest, headers: response.request_headers }
      : finalRequest;
    events.push({
      ...base("network", error && !response ? "error" : "info", "network"),
      type: "network",
      phase: "network",
      payload: {
        outcome: error && !response ? "error" : "success",
        request: redactRequest(requestWithTransportHeaders, secrets),
        requestStages: {
          input: redactRequest(trace.input, secrets),
          afterPreRequest: trace.afterPreRequest
            ? redactRequest(trace.afterPreRequest, secrets)
            : undefined,
          resolved: trace.resolved
            ? redactRequest(trace.resolved, secrets)
            : undefined,
        },
        response: response ? redactResponse(response, secrets) : null,
        error: error ? redactText(error.message, secrets) : null,
        capabilities: {
          exactRequestHeaders: false,
          redirectChain: false,
          cookieDetails: response?.cookie_handling === "workspace",
        },
      },
    });

    const cookieHeader = Object.entries(requestWithTransportHeaders.headers).find(
      ([name]) => name.toLowerCase() === "cookie",
    )?.[1];
    cookieHeader
      ?.split(";")
      .map((part) => part.trim().split("=", 1)[0]?.trim())
      .filter(Boolean)
      .forEach((name) => {
        events.push({
          ...base("cookie", "debug", "network"),
          type: "cookie",
          phase: "network",
          payload: {
            action: "request-attached",
            name,
            value: "<redacted>",
            reason: "Included in the captured Cookie request header.",
          },
        });
      });
  }

  if (response?.cookie_handling === "browser") {
    events.push({
      ...base("cookie", "debug", "network"),
      type: "cookie",
      phase: "network",
      payload: {
        action: "browser-managed",
        reason: "Cookie and Set-Cookie details are managed by the browser.",
      },
    });
  } else {
    response?.cookies?.forEach((cookie) => {
      events.push({
        ...base("cookie", "info", "network"),
        type: "cookie",
        phase: "network",
        payload: {
          action: "response-added-or-updated",
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
          value: "<redacted>",
        },
      });
    });
  }

  reports.filter((report) => report.phase === "post-response").forEach(addReport);

  const failedScriptAlreadyRecorded = reports.some(
    (report) => report.status === "failed" && report.error,
  );
  if (error && !failedScriptAlreadyRecorded) {
    const eventPhase =
      error.stage === "pre-request" || error.stage === "post-response"
        ? error.stage
        : "network";
    events.push({
      ...base("error", "error", eventPhase),
      type: "error",
      phase: eventPhase,
      payload: {
        category: errorCategory(error.stage, error.message),
        message: redactText(error.message, secrets),
      },
    });
  }

  return events;
}
