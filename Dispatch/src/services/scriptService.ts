import type {
  ScriptExecutionInput,
  ScriptExecutionReport,
  ScriptExecutionResult,
} from "../types/script";

const WORKER_TIMEOUT_MS = 1_500;

interface ScriptWorkerResponse {
  id: string;
  result?: ScriptExecutionResult;
  error?: string;
}

const failedResult = (
  input: ScriptExecutionInput,
  error: string,
  durationMs: number
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
    const finish = (result: ScriptExecutionResult) => {
      clearTimeout(timeoutId);
      worker.terminate();
      resolve(result);
    };
    const timeoutId = window.setTimeout(() => {
      finish(
        failedResult(
          input,
          `Script exceeded the ${WORKER_TIMEOUT_MS} ms execution limit`,
          WORKER_TIMEOUT_MS
        )
      );
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<ScriptWorkerResponse>) => {
      if (event.data.id !== id) return;
      if (event.data.result) {
        finish(event.data.result);
        return;
      }
      finish(
        failedResult(
          input,
          event.data.error || "Script execution failed",
          Math.round((performance.now() - startedAt) * 10) / 10
        )
      );
    };
    worker.onerror = (event) => {
      finish(
        failedResult(
          input,
          event.message || "Script worker failed",
          Math.round((performance.now() - startedAt) * 10) / 10
        )
      );
    };
    worker.postMessage({ id, input });
  });
};

