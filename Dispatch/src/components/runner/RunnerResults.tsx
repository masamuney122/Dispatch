import { useMemo, useState } from "react";
import { getMethodHexColor } from "../../constants/httpConstants";
import type { CollectionRunnerState, RunnerResultStatus } from "../../types/runner";
import { formatSize } from "../../utils/responseUtils";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import type { ConsoleEvent } from "../../types/console";
import { RequestConsole } from "../layout/RequestConsole";
import {
  performanceConditionSymbol,
  performanceMetricLabel,
} from "../../utils/performanceRunner";

interface RunnerResultsProps {
  runner: CollectionRunnerState;
  environmentName: string;
  onRerun: () => void;
  onNewRun: () => void;
  onStop: () => void;
  consoleEvents: ConsoleEvent[];
}

type ResultFilter = "all" | RunnerResultStatus | "console";

const duration = (milliseconds: number) =>
  milliseconds >= 1000
    ? `${Math.floor(milliseconds / 1000)}s ${milliseconds % 1000}ms`
    : `${milliseconds}ms`;

const resultBadgeStyle = (
  httpStatus: number | null,
  resultStatus: RunnerResultStatus,
) => {
  if (httpStatus != null) {
    if (httpStatus >= 200 && httpStatus < 300) {
      return "bg-emerald-500/15 text-emerald-300";
    }
    if (httpStatus >= 300 && httpStatus < 400) {
      return "bg-sky-500/15 text-sky-300";
    }
    if (httpStatus >= 400 && httpStatus < 500) {
      return "bg-amber-500/15 text-amber-300";
    }
    if (httpStatus >= 500) {
      return "bg-red-500/15 text-red-300";
    }
    return "bg-zinc-500/15 text-zinc-400";
  }

  if (resultStatus === "failed") return "bg-amber-500/15 text-amber-300";
  if (resultStatus === "error") return "bg-red-500/15 text-red-300";
  return "bg-zinc-500/15 text-zinc-400";
};

export const RunnerResults: React.FC<RunnerResultsProps> = ({
  runner,
  environmentName,
  onRerun,
  onNewRun,
  onStop,
  consoleEvents,
}) => {
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { summary } = runner;
  const criterionEvaluation = runner.performanceEvaluation;
  const visibleResults = useMemo(
    () => filter === "all" || filter === "console"
      ? runner.results
      : runner.results.filter((result) => result.status === filter),
    [filter, runner.results],
  );
  const grouped = useMemo(() => {
    const groups = new Map<number, typeof visibleResults>();
    visibleResults.forEach((result) => {
      groups.set(result.iteration, [...(groups.get(result.iteration) || []), result]);
    });
    return [...groups.entries()];
  }, [visibleResults]);
  const filters: Array<{ key: ResultFilter; label: string; count?: number }> = [
    { key: "all", label: "All", count: summary.totalRequests },
    { key: "passed", label: "Passed", count: summary.passedRequests },
    { key: "failed", label: "Failed", count: summary.failedRequests },
    { key: "skipped", label: "Skipped", count: summary.skippedRequests },
    { key: "error", label: "Errors", count: summary.errorRequests },
    { key: "console", label: "Console", count: consoleEvents.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#202020] text-zinc-300">
      <div className="flex shrink-0 items-center justify-between border-b border-[#343434] px-6 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-zinc-100">
              {runner.collectionName}{runner.scope.type === "folder" ? ` › ${runner.scope.folderName}` : ""} - Run results
            </h1>
            {criterionEvaluation && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                criterionEvaluation.status === "passed"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : criterionEvaluation.status === "failed"
                    ? "bg-red-500/15 text-red-300"
                    : "bg-zinc-500/15 text-zinc-400"
              }`}>
                {criterionEvaluation.status === "passed" ? "Pass" : criterionEvaluation.status === "failed" ? "Fail" : "Not evaluated"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {runner.status === "running" ? "Run in progress" : runner.status === "stopped" ? "Run stopped" : `Ran ${summary.finishedAt ? new Date(summary.finishedAt).toLocaleString() : ""}`}
          </p>
          {runner.configuration.runType === "performance" && (
            <p className="mt-0.5 text-[10px] text-zinc-600">
              {runner.configuration.virtualUsers} VUs · {runner.configuration.performanceDurationSeconds}s · {runner.configuration.loadProfile === "ramp-up" ? `Ramp-up from ${runner.configuration.initialLoad} VUs` : "Fixed load"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {runner.status === "running" ? (
            <button type="button" onClick={onStop} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20">Stop run</button>
          ) : (
            <>
              <button type="button" onClick={onRerun} className="rounded-md bg-[#343434] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#3d3d3d]">Rerun</button>
              <button type="button" onClick={onNewRun} className="rounded-md border border-[#444] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#2b2b2b]">+ New Run</button>
            </>
          )}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-7 gap-px border-b border-[#343434] bg-[#343434]">
        {[
          ["Source", runner.configuration.runType === "performance" ? "Performance" : "Runner"],
          ["Environment", environmentName],
          [runner.configuration.runType === "performance" ? "Virtual users" : "Iterations", runner.configuration.runType === "performance" ? runner.configuration.virtualUsers : runner.configuration.iterations],
          ["Duration", duration(summary.durationMs)],
          ["Tests", summary.passedTests + summary.failedTests],
          ["Errors", summary.errorRequests],
          ["Avg. response", `${summary.averageResponseTimeMs} ms`],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-[#242424] px-4 py-3">
            <p className="text-[10px] text-zinc-500">{label}</p>
            <p className="mt-1 truncate text-xs font-semibold text-zinc-300">{value}</p>
          </div>
        ))}
      </div>

      {runner.configuration.runType === "performance" && (
        <div className="flex shrink-0 gap-6 border-b border-[#343434] px-6 py-2.5 text-[11px] text-zinc-500">
          <span><strong className="text-zinc-300">{summary.requestsPerSecond}</strong> req/s</span>
          <span>P50 <strong className="text-zinc-300">{summary.p50ResponseTimeMs} ms</strong></span>
          <span>P95 <strong className="text-zinc-300">{summary.p95ResponseTimeMs} ms</strong></span>
          <span>P99 <strong className="text-zinc-300">{summary.p99ResponseTimeMs} ms</strong></span>
          <span>Max <strong className="text-zinc-300">{summary.maxResponseTimeMs} ms</strong></span>
        </div>
      )}

      {criterionEvaluation && (
        <div className={`flex shrink-0 items-center justify-between gap-6 border-b px-6 py-3 text-xs ${
          criterionEvaluation.status === "passed"
            ? "border-emerald-900/40 bg-emerald-500/5"
            : criterionEvaluation.status === "failed"
              ? "border-red-900/40 bg-red-500/5"
              : "border-[#343434] bg-[#222222]"
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`text-base font-bold ${
              criterionEvaluation.status === "passed"
                ? "text-emerald-400"
                : criterionEvaluation.status === "failed"
                  ? "text-red-400"
                  : "text-zinc-500"
            }`}>
              {criterionEvaluation.status === "passed" ? "✓" : criterionEvaluation.status === "failed" ? "×" : "–"}
            </span>
            <div>
              <p className="font-semibold text-zinc-300">Performance criterion</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {performanceMetricLabel(criterionEvaluation.metric)} {performanceConditionSymbol(criterionEvaluation.condition)} {criterionEvaluation.target} ms
              </p>
            </div>
          </div>
          <div className="text-right">
            {criterionEvaluation.actual == null ? (
              <p className="text-[10px] text-zinc-500">{criterionEvaluation.reason}</p>
            ) : (
              <><p className="font-mono font-semibold text-zinc-300">{criterionEvaluation.actual} ms</p><p className="text-[10px] text-zinc-600">Actual value</p></>
            )}
          </div>
        </div>
      )}

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#343434] px-5">
        {filters.map((item) => (
          <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`rounded-md px-3 py-1.5 text-xs ${filter === item.key ? "bg-[#303030] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
            {item.label} <span className="ml-1 font-mono text-[10px]">{item.count}</span>
          </button>
        ))}
      </div>

      {filter === "console" ? (
        <RequestConsole events={consoleEvents} />
      ) : (
      <OverlayScrollArea containerClassName="min-h-0 flex-1" axis="vertical" className="overflow-y-auto px-5 py-4">
        {grouped.length > 0 ? (
          <div className="space-y-5">
            {grouped.map(([iteration, results]) => (
              <section key={iteration}>
                <div className="mb-2 flex items-center gap-3 text-xs font-semibold text-zinc-400"><span>Iteration {iteration + 1}</span><span className="h-px flex-1 bg-[#343434]" /></div>
                <div className="space-y-1.5">
                  {results.map((result) => {
                    const tests = result.scriptReports.flatMap((report) => report.tests);
                    const expanded = expandedId === result.id;
                    return (
                      <div key={result.id} className="overflow-hidden rounded-lg border border-[#303030] bg-[#232323]">
                        <button type="button" onClick={() => setExpandedId(expanded ? null : result.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#272727]">
                          <span className="w-12 text-[11px] font-bold" style={{ color: getMethodHexColor(result.method) }}>{result.method}</span>
                          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-zinc-200">{result.name}</p><p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{result.url}</p></div>
                          {result.virtualUser && <span className="text-[10px] text-zinc-600">VU {result.virtualUser}</span>}
                          <span className={`rounded px-2 py-1 font-mono text-[11px] ${resultBadgeStyle(result.httpStatus, result.status)}`}>{result.httpStatus ?? result.status}</span>
                          <span className="w-16 text-right font-mono text-[11px] text-zinc-500">{result.responseTimeMs == null ? "—" : `${result.responseTimeMs} ms`}</span>
                          <span className="w-14 text-right font-mono text-[11px] text-zinc-500">{result.responseSize == null ? "—" : formatSize(result.responseSize)}</span>
                        </button>
                        {expanded && (
                          <div className="border-t border-[#303030] px-4 py-3 text-[11px]">
                            {result.error && <p className="mb-3 rounded bg-red-500/10 px-3 py-2 font-mono text-red-300">{result.error}</p>}
                            {tests.length > 0 ? <div className="space-y-1.5">{tests.map((test, index) => <div key={`${test.name}:${index}`} className="flex gap-2"><span className={test.passed ? "text-emerald-400" : "text-red-400"}>{test.passed ? "✓" : "×"}</span><span className="text-zinc-300">{test.name}</span>{test.error && <span className="text-red-300">— {test.error}</span>}</div>)}</div> : <p className="text-zinc-600">No tests found.</p>}
                            {result.response ? <details className="mt-3"><summary className="cursor-pointer text-zinc-400">Response body</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[#1c1c1c] p-3 font-mono text-[10px] text-zinc-400 select-text">{result.response.body || "Binary or empty response"}</pre></details> : runner.configuration.runType === "functional" && runner.configuration.persistResponses && result.httpStatus ? <p className="mt-3 text-zinc-600">Response body was too large to retain.</p> : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : <p className="py-20 text-center text-xs text-zinc-600">{runner.status === "running" ? "Waiting for the first result…" : "No matching results."}</p>}
      </OverlayScrollArea>
      )}
    </div>
  );
};
