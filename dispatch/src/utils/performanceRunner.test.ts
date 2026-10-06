import { describe, expect, it } from "vitest";
import type { PerformanceCriterion, RunnerSummary } from "../types/runner";
import { EMPTY_RUNNER_SUMMARY } from "../types/runner";
import {
  evaluatePerformanceCriterion,
  virtualUserStartDelayMs,
} from "./performanceRunner";

const rampConfiguration = {
  loadProfile: "ramp-up" as const,
  performanceDurationSeconds: 60,
  virtualUsers: 20,
  initialLoad: 5,
};

const summary = (overrides: Partial<RunnerSummary> = {}): RunnerSummary => ({
  ...EMPTY_RUNNER_SUMMARY,
  responseSampleCount: 100,
  averageResponseTimeMs: 180,
  p50ResponseTimeMs: 150,
  p95ResponseTimeMs: 420,
  p99ResponseTimeMs: 640,
  maxResponseTimeMs: 900,
  ...overrides,
});

const criterion = (
  overrides: Partial<PerformanceCriterion> = {},
): PerformanceCriterion => ({
  enabled: true,
  metric: "p95",
  condition: "less-than",
  value: 500,
  ...overrides,
});

describe("virtualUserStartDelayMs", () => {
  it("starts the initial load immediately and ramps remaining users during the second quarter", () => {
    expect(virtualUserStartDelayMs(rampConfiguration, 1)).toBe(0);
    expect(virtualUserStartDelayMs(rampConfiguration, 5)).toBe(0);
    expect(virtualUserStartDelayMs(rampConfiguration, 6)).toBe(16_000);
    expect(virtualUserStartDelayMs(rampConfiguration, 20)).toBe(30_000);
  });

  it("starts every user immediately for a fixed profile or a full initial load", () => {
    expect(virtualUserStartDelayMs({ ...rampConfiguration, loadProfile: "fixed" }, 20)).toBe(0);
    expect(virtualUserStartDelayMs({ ...rampConfiguration, initialLoad: 20 }, 20)).toBe(0);
  });

  it("defensively clamps an invalid initial load", () => {
    expect(virtualUserStartDelayMs({ ...rampConfiguration, initialLoad: 100 }, 20)).toBe(0);
    expect(virtualUserStartDelayMs({ ...rampConfiguration, initialLoad: 0 }, 1)).toBe(0);
  });
});

describe("evaluatePerformanceCriterion", () => {
  it("passes and fails strict latency thresholds", () => {
    expect(evaluatePerformanceCriterion(summary(), criterion(), true)?.status).toBe("passed");
    expect(evaluatePerformanceCriterion(summary({ p95ResponseTimeMs: 500 }), criterion(), true)?.status).toBe("failed");
  });

  it("supports inclusive and greater-than comparisons", () => {
    expect(evaluatePerformanceCriterion(
      summary({ p99ResponseTimeMs: 640 }),
      criterion({ metric: "p99", condition: "less-than-or-equal", value: 640 }),
      true,
    )?.status).toBe("passed");
    expect(evaluatePerformanceCriterion(
      summary({ averageResponseTimeMs: 180 }),
      criterion({ metric: "average", condition: "greater-than", value: 100 }),
      true,
    )?.status).toBe("passed");
  });

  it("does not evaluate stopped runs or runs without response samples", () => {
    expect(evaluatePerformanceCriterion(summary(), criterion(), false)).toMatchObject({
      status: "not-evaluated",
      actual: null,
    });
    expect(evaluatePerformanceCriterion(
      summary({ responseSampleCount: 0 }),
      criterion(),
      true,
    )).toMatchObject({ status: "not-evaluated", actual: null });
  });

  it("returns no evaluation when the criterion is disabled", () => {
    expect(evaluatePerformanceCriterion(
      summary(),
      criterion({ enabled: false }),
      true,
    )).toBeNull();
  });
});
