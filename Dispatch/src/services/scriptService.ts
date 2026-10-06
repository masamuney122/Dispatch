import type {
  ScriptErrorKind,
  ScriptExecutionInput,
  ScriptExecutionReport,
  ScriptExecutionResult,
} from "../types/script";

const RUNTIME_STARTUP_TIMEOUT_MS = 10_000;
const WORKER_RESPONSE_WATCHDOG_MS = 5_000;

interface ScriptWorkerResponse {
  id?: string;
  ready?: true;
  initializationError?: string;
  result?: ScriptExecutionResult;
  error?: string;
  errorKind?: ScriptErrorKind;
}

const failedResult = (
  input: ScriptExecutionInput,
  error: string,
  durationMs: number,
  kind: ScriptErrorKind,
): ScriptExecutionResult => ({
  request: input.request,
  environment: input.environment,
  environment_mutations: [],
  report: {
    phase: input.phase,
    status: "failed",
    duration_ms: durationMs,
    logs: [],
    tests: [],
    error,
    error_info: { kind, message: error },
  },
});

export const createSkippedScriptReport = (
  phase: ScriptExecutionReport["phase"]
): ScriptExecutionReport => ({
  phase,
  status: "skipped",
  duration_ms: 0,
  logs: [],
  tests: [],
});

export const executeRequestScript = async (
  input: ScriptExecutionInput
): Promise<ScriptExecutionResult> => {
  if (!input.source.trim()) {
    return {
      request: input.request,
      environment: input.environment,
      environment_mutations: [],
      report: createSkippedScriptReport(input.phase),
    };
  }

  const startedAt = performance.now();
  const worker = new Worker(
    new URL("../workers/scriptRunner.worker.ts", import.meta.url),
    { type: "module", name: `dispatch-${input.phase}-script` }
  );

  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    let settled = false;
    let responseWatchdogId: number | undefined;
    const finish = (result: ScriptExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimeoutId);
      if (responseWatchdogId !== undefined) clearTimeout(responseWatchdogId);
      worker.terminate();
      resolve(result);
    };
    const startupTimeoutId = window.setTimeout(() => {
      finish(
        failedResult(
          input,
          `Script runtime could not initialize within ${RUNTIME_STARTUP_TIMEOUT_MS} ms`,
          RUNTIME_STARTUP_TIMEOUT_MS,
          "worker",
        )
      );
    }, RUNTIME_STARTUP_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<ScriptWorkerResponse>) => {
      if (event.data.ready) {
        clearTimeout(startupTimeoutId);
        responseWatchdogId = window.setTimeout(() => {
          finish(
            failedResult(
              input,
              `Script worker did not respond within ${WORKER_RESPONSE_WATCHDOG_MS} ms after initialization`,
              Math.round((performance.now() - startedAt) * 10) / 10,
              "worker",
            )
          );
        }, WORKER_RESPONSE_WATCHDOG_MS);
        worker.postMessage({ id, input });
        return;
      }
      if (event.data.initializationError) {
        finish(
          failedResult(
            input,
            `Script runtime initialization failed: ${event.data.initializationError}`,
            Math.round((performance.now() - startedAt) * 10) / 10,
            "worker",
          )
        );
        return;
      }
      if (event.data.id !== id) return;
      if (event.data.result) {
        finish(event.data.result);
        return;
      }
      finish(
        failedResult(
          input,
          event.data.error || "Script execution failed",
          Math.round((performance.now() - startedAt) * 10) / 10,
          event.data.errorKind || "worker",
        )
      );
    };
    worker.onerror = (event) => {
      finish(
        failedResult(
          input,
          event.message || "Script worker failed",
          Math.round((performance.now() - startedAt) * 10) / 10,
          "worker",
        )
      );
    };
  });
};
