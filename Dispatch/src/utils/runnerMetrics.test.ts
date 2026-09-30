import { describe, expect, it } from "vitest";
import type { RunnerRequestResult } from "../types/runner";
import { runnerSummary } from "./runnerMetrics";

const result = (
  status: RunnerRequestResult["status"],
  responseTimeMs: number | null,
  testPassed?: boolean,
): RunnerRequestResult => ({
  id: crypto.randomUUID(),
  iteration: 0,
  requestId: crypto.randomUUID(),
  name: "request",
  method: "GET",
  url: "https://example.com",
  status,
  httpStatus: status === "error" ? null : 200,
  responseTimeMs,
  responseSize: 10,
  error: status === "error" ? "network" : null,
  scriptReports: testPassed === undefined ? [] : [{
    phase: "post-response",
    status: "passed",
    duration_ms: 1,
    logs: [],
    tests: [{ name: "test", passed: testPassed }],
  }],
});

describe("runnerSummary", () => {
  it("counts outcomes, tests, throughput and percentiles", () => {
    const summary = runnerSummary(
      [
        result("passed", 10, true),
        result("failed", 20, false),
        result("error", null),
        result("passed", 40),
      ],
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z",
    );

    expect(summary).toMatchObject({
      totalRequests: 4,
      passedRequests: 2,
      failedRequests: 1,
      errorRequests: 1,
      passedTests: 1,
      failedTests: 1,
      averageResponseTimeMs: 23,
      requestsPerSecond: 2,
      p50ResponseTimeMs: 20,
      p95ResponseTimeMs: 40,
    });
  });
});

