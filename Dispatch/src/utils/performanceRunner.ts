import type {
  PerformanceCondition,
  PerformanceCriterion,
  PerformanceCriterionEvaluation,
  PerformanceMetric,
  RunnerConfiguration,
  RunnerSummary,
} from "../types/runner";

export const PERFORMANCE_METRIC_OPTIONS: ReadonlyArray<{
  value: PerformanceMetric;
  label: string;
}> = [
  { value: "average", label: "Average response" },
  { value: "p50", label: "P50" },
  { value: "p95", label: "P95" },
  { value: "p99", label: "P99" },
  { value: "max", label: "Maximum response" },
];

export const PERFORMANCE_CONDITION_OPTIONS: ReadonlyArray<{
  value: PerformanceCondition;
  label: string;
  symbol: string;
}> = [
  { value: "less-than", label: "is less than", symbol: "<" },
  { value: "less-than-or-equal", label: "is at most", symbol: "≤" },
  { value: "greater-than", label: "is greater than", symbol: ">" },
  { value: "greater-than-or-equal", label: "is at least", symbol: "≥" },
];

export function performanceMetricLabel(metric: PerformanceMetric): string {
  return PERFORMANCE_METRIC_OPTIONS.find((option) => option.value === metric)?.label || metric;
}

export function performanceConditionSymbol(condition: PerformanceCondition): string {
  return PERFORMANCE_CONDITION_OPTIONS.find((option) => option.value === condition)?.symbol || condition;
}

export function virtualUserStartDelayMs(
  configuration: Pick<
    RunnerConfiguration,
    "loadProfile" | "performanceDurationSeconds" | "virtualUsers" | "initialLoad"
  >,
  virtualUser: number,
): number {
  const userCount = Math.max(1, Math.trunc(configuration.virtualUsers));
  if (configuration.loadProfile !== "ramp-up" || userCount === 1) return 0;

  const initialLoad = Math.min(
    userCount,
    Math.max(1, Math.trunc(configuration.initialLoad)),
  );
  if (virtualUser <= initialLoad || initialLoad === userCount) return 0;

  const durationMs = Math.max(1, configuration.performanceDurationSeconds) * 1000;
  const initialHoldMs = durationMs * 0.25;
  const rampDurationMs = durationMs * 0.25;
  const rampUserIndex = virtualUser - initialLoad;
  const rampUserCount = userCount - initialLoad;

  return Math.round(
    initialHoldMs + rampDurationMs * (rampUserIndex / rampUserCount),
  );
}

function metricValue(summary: RunnerSummary, metric: PerformanceMetric): number {
  switch (metric) {
    case "average":
      return summary.averageResponseTimeMs;
    case "p50":
      return summary.p50ResponseTimeMs;
    case "p95":
      return summary.p95ResponseTimeMs;
    case "p99":
      return summary.p99ResponseTimeMs;
    case "max":
      return summary.maxResponseTimeMs;
  }
}

function compare(actual: number, condition: PerformanceCondition, target: number): boolean {
  switch (condition) {
    case "less-than":
      return actual < target;
    case "less-than-or-equal":
      return actual <= target;
    case "greater-than":
      return actual > target;
    case "greater-than-or-equal":
      return actual >= target;
  }
}

export function evaluatePerformanceCriterion(
  summary: RunnerSummary,
  criterion: PerformanceCriterion,
  completed: boolean,
): PerformanceCriterionEvaluation | null {
  if (!criterion.enabled) return null;

  const base = {
    metric: criterion.metric,
    condition: criterion.condition,
    target: criterion.value,
  };
  if (!completed) {
    return {
      ...base,
      status: "not-evaluated",
      actual: null,
      reason: "The run did not complete.",
    };
  }
  if (summary.responseSampleCount === 0) {
    return {
      ...base,
      status: "not-evaluated",
      actual: null,
      reason: "No response time samples were recorded.",
    };
  }

  const actual = metricValue(summary, criterion.metric);
  return {
    ...base,
    status: compare(actual, criterion.condition, criterion.value)
      ? "passed"
      : "failed",
    actual,
  };
}
