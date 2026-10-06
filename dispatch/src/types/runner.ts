import type { Collection, SavedRequest } from "./collection";
import type { ApiRequest } from "./request";
import type { ApiResponse } from "./response";
import type { ScriptExecutionReport } from "./script";

export type RunnerRunType = "functional" | "performance";
export type RunnerLoadProfile = "fixed" | "ramp-up";
export type RunnerStatus = "draft" | "running" | "completed" | "stopped";
export type RunnerResultStatus = "passed" | "failed" | "error" | "skipped";
export type PerformanceMetric = "average" | "p50" | "p95" | "p99" | "max";
export type PerformanceCondition =
  | "less-than"
  | "less-than-or-equal"
  | "greater-than"
  | "greater-than-or-equal";

export interface PerformanceCriterion {
  enabled: boolean;
  metric: PerformanceMetric;
  condition: PerformanceCondition;
  value: number;
}

export interface PerformanceCriterionEvaluation {
  status: "passed" | "failed" | "not-evaluated";
  metric: PerformanceMetric;
  condition: PerformanceCondition;
  target: number;
  actual: number | null;
  reason?: string;
}

export type RunnerScope =
  | { type: "collection" }
  | { type: "folder"; folderId: string; folderName: string };

export interface RunnerRequestSelection {
  requestId: string;
  selected: boolean;
}

export interface RunnerConfiguration {
  runType: RunnerRunType;
  environmentId: string | null;
  requestSelection: RunnerRequestSelection[];
  iterations: number;
  delayMs: number;
  iterationData: Array<Record<string, string>>;
  iterationDataFileName: string | null;
  persistResponses: boolean;
  disableLogs: boolean;
  stopOnError: boolean;
  keepVariableValues: boolean;
  useStoredCookies: boolean;
  saveCookiesAfterRun: boolean;
  performanceDurationSeconds: number;
  virtualUsers: number;
  initialLoad: number;
  loadProfile: RunnerLoadProfile;
  performanceCriterion: PerformanceCriterion;
}

export interface RunnerRequestResult {
  id: string;
  iteration: number;
  virtualUser?: number;
  requestId: string;
  name: string;
  method: string;
  url: string;
  status: RunnerResultStatus;
  httpStatus: number | null;
  responseTimeMs: number | null;
  responseSize: number | null;
  error: string | null;
  request?: ApiRequest;
  response?: ApiResponse;
  scriptReports: ScriptExecutionReport[];
}

export interface RunnerSummary {
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  totalRequests: number;
  passedRequests: number;
  failedRequests: number;
  errorRequests: number;
  skippedRequests: number;
  passedTests: number;
  failedTests: number;
  averageResponseTimeMs: number;
  responseSampleCount: number;
  requestsPerSecond: number;
  minResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  maxResponseTimeMs: number;
}

export interface CollectionRunnerState {
  id: string;
  collectionId: string;
  collectionName: string;
  scope: RunnerScope;
  collectionSnapshot: Collection;
  status: RunnerStatus;
  configuration: RunnerConfiguration;
  results: RunnerRequestResult[];
  summary: RunnerSummary;
  performanceEvaluation: PerformanceCriterionEvaluation | null;
  stopRequested: boolean;
}

export interface OrderedRunnerRequest {
  request: SavedRequest;
  folderPath: string[];
}

export const EMPTY_RUNNER_SUMMARY: RunnerSummary = {
  startedAt: null,
  finishedAt: null,
  durationMs: 0,
  totalRequests: 0,
  passedRequests: 0,
  failedRequests: 0,
  errorRequests: 0,
  skippedRequests: 0,
  passedTests: 0,
  failedTests: 0,
  averageResponseTimeMs: 0,
  responseSampleCount: 0,
  requestsPerSecond: 0,
  minResponseTimeMs: 0,
  p50ResponseTimeMs: 0,
  p95ResponseTimeMs: 0,
  p99ResponseTimeMs: 0,
  maxResponseTimeMs: 0,
};
