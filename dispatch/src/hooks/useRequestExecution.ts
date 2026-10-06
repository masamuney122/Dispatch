import { useCallback, type Dispatch, type SetStateAction } from "react";

import { loadHistory, saveHistory } from "../services/historyService";
import {
  executeRequestCycle,
  executionErrorMessage,
  isVariableResolutionFailure,
  RequestExecutionError,
} from "../services/requestExecutionService";
import type { Environment } from "../types/environment";
import type { HistoryItem } from "../types/history";
import type { ApiRequest } from "../types/request";
import type { RequestTabState } from "../types/tab";
import type { ConsoleEvent } from "../types/console";
import { createRequestPayload } from "../utils/requestDraft";
import { isSensitiveName } from "../services/console/redaction";

interface RequestExecutionOptions {
  activeTab: RequestTabState;
  environments: Environment[];
  activeEnvironmentId: string | null;
  updateActiveTab: (updates: Partial<RequestTabState>) => void;
  commitEnvironment: (
    id: string,
    name: string,
    variables: Record<string, string>,
  ) => Promise<unknown>;
  setHistory: Dispatch<SetStateAction<HistoryItem[]>>;
  appendConsoleEvents: (events: ConsoleEvent[]) => void;
}

function historyItem(
  tab: RequestTabState,
  request: ApiRequest,
  result: Pick<HistoryItem, "status" | "response_time_ms" | "error">,
): HistoryItem {
  return {
    id: crypto.randomUUID(),
    method: tab.method,
    url: request.url,
    body: request.body,
    timestamp: new Date().toISOString(),
    auth: request.auth,
    ...result,
  };
}

export function useRequestExecution({
  activeTab,
  environments,
  activeEnvironmentId,
  updateActiveTab,
  commitEnvironment,
  setHistory,
  appendConsoleEvents,
}: RequestExecutionOptions) {
  return useCallback(async () => {
    updateActiveTab({
      loading: true,
      error: null,
      scriptReports: [],
      lastExecutedRequest: null,
    });
    const originalRequest = createRequestPayload(activeTab);

    try {
      const activeEnvironment = environments.find(
        (environment) => environment.id === activeEnvironmentId,
      );
      const execution = await executeRequestCycle({
        request: originalRequest,
        scripts: activeTab.scripts,
        environment: activeEnvironment?.variables || {},
        hasActiveEnvironment: Boolean(activeEnvironment),
        telemetry: {
          source: {
            kind: "interactive",
            requestId: activeTab.selectedSavedRequestId || activeTab.id,
            requestName: activeTab.title,
          },
          append: appendConsoleEvents,
          knownSecrets: Object.entries(activeEnvironment?.variables || {})
            .filter(([name]) => isSensitiveName(name))
            .map(([, value]) => value),
        },
        onEnvironmentMutated: activeEnvironment
          ? async (variables) => {
              await commitEnvironment(
                activeEnvironment.id,
                activeEnvironment.name,
                variables,
              );
            }
          : undefined,
      });
      updateActiveTab({
        response: execution.response,
        loading: false,
        scriptReports: execution.reports,
        lastExecutedRequest: execution.request,
      });
      const item = historyItem(activeTab, originalRequest, {
        status: execution.response.status,
        response_time_ms: execution.response.response_time_ms,
        error: null,
      });
      await saveHistory(item);
      setHistory((await loadHistory()) || []);
      updateActiveTab({ selectedHistoryId: item.id });
    } catch (error) {
      const message = executionErrorMessage(error);
      const scriptReports =
        error instanceof RequestExecutionError ? error.reports : [];
      updateActiveTab({
        error: message,
        response:
          error instanceof RequestExecutionError
            ? error.response || null
            : null,
        loading: false,
        scriptReports: [...scriptReports],
        lastExecutedRequest:
          error instanceof RequestExecutionError
            ? error.request || originalRequest
            : originalRequest,
      });
      if (isVariableResolutionFailure(error)) return;

      const item = historyItem(activeTab, originalRequest, {
        status: null,
        response_time_ms: null,
        error: message,
      });
      await saveHistory(item);
      setHistory((await loadHistory()) || []);
      updateActiveTab({ selectedHistoryId: item.id });
    }
  }, [
    activeEnvironmentId,
    activeTab,
    appendConsoleEvents,
    commitEnvironment,
    environments,
    setHistory,
    updateActiveTab,
  ]);
}
