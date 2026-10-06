import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScriptExecutionInput, ScriptExecutionResult } from "../types/script";
import { executeRequestScript } from "./scriptService";

interface WorkerMessage {
  id?: string;
  ready?: true;
  result?: ScriptExecutionResult;
}

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: Array<{ id: string; input: ScriptExecutionInput }> = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(message: { id: string; input: ScriptExecutionInput }) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message: WorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerMessage>);
  }
}

const input = (): ScriptExecutionInput => ({
  phase: "post-response",
  source: "pm.test('status', () => pm.expect(pm.response.code).to.equal(200));",
  request: {
    method: "GET",
    url: "https://example.com",
    body: "",
    body_type: "none",
    form_fields: [],
    headers: {},
    settings: {},
    scripts: { pre_request: "", post_response: "" },
  },
  response: {
    status: 200,
    response_time_ms: 1,
    body: "{}",
    headers: {},
    request_headers: {},
    network: { transport: "browser", http_version: null, remote_address: null },
    cookies: [],
    cookie_handling: "browser",
  },
  environment: {},
  hasActiveEnvironment: false,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  MockWorker.instances = [];
});

describe("executeRequestScript worker lifecycle", () => {
  it("waits for the runtime to be ready before starting execution", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Worker", MockWorker);

    const execution = executeRequestScript(input());
    const worker = MockWorker.instances[0];
    expect(worker.messages).toHaveLength(0);

    worker.emit({ ready: true });
    expect(worker.messages).toHaveLength(1);
    const { id, input: sentInput } = worker.messages[0];
    const result: ScriptExecutionResult = {
      request: sentInput.request,
      environment: sentInput.environment,
      environment_mutations: [],
      report: {
        phase: sentInput.phase,
        status: "passed",
        duration_ms: 1,
        logs: [],
        tests: [],
      },
    };
    worker.emit({ id, result });

    await expect(execution).resolves.toEqual(result);
    expect(worker.terminated).toBe(true);
  });

  it("reports runtime initialization separately from script execution", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Worker", MockWorker);

    const execution = executeRequestScript(input());
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await execution;
    expect(result.report.error_info?.kind).toBe("worker");
    expect(result.report.error).toContain("runtime could not initialize");
    expect(MockWorker.instances[0].messages).toHaveLength(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
  });
});
