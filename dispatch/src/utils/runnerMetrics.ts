import type {
  RunnerRequestResult,
  RunnerSummary,
} from "../types/runner";

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

export function runnerSummary(
  results: RunnerRequestResult[],
  startedAt: string | null,
  finishedAt: string | null,
): RunnerSummary {
  const responseTimes = results
    .map((result) => result.responseTimeMs)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const durationMs =
    startedAt && finishedAt
      ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
      : 0;
  const tests = results.flatMap((result) =>
    result.scriptReports.flatMap((report) => report.tests),
  );
  const totalResponseTime = responseTimes.reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    startedAt,
    finishedAt,
    durationMs,
    totalRequests: results.length,
    passedRequests: results.filter((result) => result.status === "passed").length,
    failedRequests: results.filter((result) => result.status === "failed").length,
    errorRequests: results.filter((result) => result.status === "error").length,
    skippedRequests: results.filter((result) => result.status === "skipped").length,
    passedTests: tests.filter((test) => test.passed).length,
    failedTests: tests.filter((test) => !test.passed).length,
    responseSampleCount: responseTimes.length,
    averageResponseTimeMs:
      responseTimes.length > 0
        ? Math.round(totalResponseTime / responseTimes.length)
        : 0,
    requestsPerSecond:
      durationMs > 0
        ? Math.round((results.length / (durationMs / 1000)) * 100) / 100
        : 0,
    minResponseTimeMs: responseTimes[0] || 0,
    p50ResponseTimeMs: percentile(responseTimes, 0.5),
    p95ResponseTimeMs: percentile(responseTimes, 0.95),
    p99ResponseTimeMs: percentile(responseTimes, 0.99),
    maxResponseTimeMs: responseTimes.at(-1) || 0,
  };
}
