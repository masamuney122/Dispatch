import { useCallback, useRef, useState } from "react";
import {
  runFunctionalCollection,
  runPerformanceCollection,
} from "../services/collectionRunnerService";
import type { Collection } from "../types/collection";
import type { Environment } from "../types/environment";
import {
  EMPTY_RUNNER_SUMMARY,
  type CollectionRunnerState,
  type RunnerConfiguration,
  type RunnerRequestResult,
  type RunnerScope,
} from "../types/runner";
import { collectionRequestsInRunOrder } from "../utils/collectionRunOrder";
import { runnerSummary } from "../utils/runnerMetrics";
import type { ConsoleEvent } from "../types/console";

interface CollectionRunnerOptions {
  environments: Environment[];
  activeEnvironmentId: string | null;
  commitEnvironment: (
    id: string,
    name: string,
    variables: Record<string, string>,
  ) => Promise<unknown>;
  appendConsoleEvents?: (events: ConsoleEvent[]) => void;
}

function defaultConfiguration(
  collection: Collection,
  environmentId: string | null,
  scope: RunnerScope,
): RunnerConfiguration {
  return {
    runType: "functional",
    environmentId,
    requestSelection: collectionRequestsInRunOrder(collection, scope).map(({ request }) => ({
      requestId: request.id,
      selected: true,
    })),
    iterations: 1,
    delayMs: 0,
    iterationData: [],
    iterationDataFileName: null,
    persistResponses: true,
    disableLogs: false,
    stopOnError: true,
    keepVariableValues: false,
    useStoredCookies: true,
    saveCookiesAfterRun: true,
    performanceDurationSeconds: 30,
    virtualUsers: 1,
    loadProfile: "fixed",
  };
}

export function useCollectionRunner({
  environments,
  activeEnvironmentId,
  commitEnvironment,
  appendConsoleEvents,
}: CollectionRunnerOptions) {
  const [runners, setRunners] = useState<CollectionRunnerState[]>([]);
  const stopRequests = useRef(new Set<string>());

  const openRunner = useCallback(
    (collection: Collection, scope: RunnerScope = { type: "collection" }) => {
      const id = crypto.randomUUID();
      const runner: CollectionRunnerState = {
        id,
        collectionId: collection.id,
        collectionName: collection.name,
        scope,
        collectionSnapshot: structuredClone(collection),
        status: "draft",
        configuration: defaultConfiguration(collection, activeEnvironmentId, scope),
        results: [],
        summary: { ...EMPTY_RUNNER_SUMMARY },
        stopRequested: false,
      };
      setRunners((current) => [...current, runner]);
      return runner;
    },
    [activeEnvironmentId],
  );

  const closeRunner = useCallback((id: string) => {
    stopRequests.current.add(id);
    setRunners((current) => current.filter((runner) => runner.id !== id));
  }, []);

  const updateConfiguration = useCallback(
    (id: string, configuration: RunnerConfiguration) => {
      setRunners((current) =>
        current.map((runner) =>
          runner.id === id ? { ...runner, configuration } : runner,
        ),
      );
    },
    [],
  );

  const newRun = useCallback((id: string) => {
    stopRequests.current.delete(id);
    setRunners((current) =>
      current.map((runner) =>
        runner.id === id
          ? {
              ...runner,
              status: "draft",
              results: [],
              summary: { ...EMPTY_RUNNER_SUMMARY },
              stopRequested: false,
            }
          : runner,
      ),
    );
  }, []);

  const stopRun = useCallback((id: string) => {
    stopRequests.current.add(id);
    setRunners((current) =>
      current.map((runner) =>
        runner.id === id ? { ...runner, stopRequested: true } : runner,
      ),
    );
  }, []);

  const startRun = useCallback(
    async (id: string) => {
      const runner = runners.find((item) => item.id === id);
      if (!runner || runner.status === "running") return;
      const requestsById = new Map(
        collectionRequestsInRunOrder(runner.collectionSnapshot, runner.scope).map((item) => [
          item.request.id,
          item,
        ]),
      );
      const requests = runner.configuration.requestSelection
        .filter((selection) => selection.selected)
        .map((selection) => requestsById.get(selection.requestId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (requests.length === 0) return;

      stopRequests.current.delete(id);
      const startedAt = new Date().toISOString();
      const runResults: RunnerRequestResult[] = [];
      setRunners((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "running",
                results: [],
                stopRequested: false,
                summary: { ...EMPTY_RUNNER_SUMMARY, startedAt },
              }
            : item,
        ),
      );

      const environment = environments.find(
        (item) => item.id === runner.configuration.environmentId,
      );
      const onResult = (result: RunnerRequestResult) => {
        runResults.push(result);
        if (
          runner.configuration.runType === "performance" &&
          runResults.length >= 25_000
        ) {
          stopRequests.current.add(id);
        }
        setRunners((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  results: [...runResults],
                  summary: runnerSummary(
                    runResults,
                    startedAt,
                    new Date().toISOString(),
                  ),
                }
              : item,
          ),
        );
      };
      const input = {
        configuration: runner.configuration,
        requests,
        environment,
        isStopRequested: () => stopRequests.current.has(id),
        onResult,
        runnerId: id,
        appendConsoleEvents,
      };
      try {
        const output =
          runner.configuration.runType === "performance"
            ? await runPerformanceCollection(input)
            : await runFunctionalCollection(input);

        if (
          runner.configuration.runType === "functional" &&
          runner.configuration.keepVariableValues &&
          environment
        ) {
          await commitEnvironment(
            environment.id,
            environment.name,
            output.environment,
          );
        }
        const finishedAt = new Date().toISOString();
        setRunners((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: output.stopped ? "stopped" : "completed",
                  stopRequested: output.stopped,
                  results: [...runResults],
                  summary: runnerSummary(runResults, startedAt, finishedAt),
                }
              : item,
          ),
        );
      } catch (error) {
        const finishedAt = new Date().toISOString();
        const failedResult: RunnerRequestResult = {
          id: crypto.randomUUID(),
          iteration: 0,
          requestId: "runner",
          name: "Collection runner",
          method: "RUN",
          url: "",
          status: "error",
          httpStatus: null,
          responseTimeMs: null,
          responseSize: null,
          error: error instanceof Error ? error.message : String(error),
          scriptReports: [],
        };
        runResults.push(failedResult);
        setRunners((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "stopped",
                  results: [...runResults],
                  summary: runnerSummary(runResults, startedAt, finishedAt),
                }
              : item,
          ),
        );
      }
    },
    [appendConsoleEvents, commitEnvironment, environments, runners],
  );

  return {
    runners,
    openRunner,
    closeRunner,
    updateConfiguration,
    newRun,
    startRun,
    stopRun,
  };
}
