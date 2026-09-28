import { useCallback, type Dispatch, type SetStateAction } from "react";

import { sendRequest } from "../services/api";
import { loadHistory, saveHistory } from "../services/historyService";
import {
  resolveRequestVariables,
  VariableResolutionError,
} from "../services/environmentVariableResolver";
import { executeRequestScript } from "../services/scriptService";
import type { Environment } from "../types/environment";
import type { HistoryItem } from "../types/history";
import type { ApiRequest } from "../types/request";
import type { ScriptExecutionReport } from "../types/script";
import type { RequestTabState } from "../types/tab";
import { buildRequestUrl, createRequestPayload } from "../utils/requestDraft";

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
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
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
}: RequestExecutionOptions) {
  return useCallback(async () => {
    updateActiveTab({
      loading: true,
      error: null,
      selectedSavedRequestId: null,
      scriptReports: [],
    });
    const originalRequest = createRequestPayload(activeTab);
    const scriptReports: ScriptExecutionReport[] = [];

    try {
      const activeEnvironment = environments.find(
        (environment) => environment.id === activeEnvironmentId,
      );
      let runtimeRequest = originalRequest;
      let runtimeVariables = { ...(activeEnvironment?.variables || {}) };

      const preResult = await executeRequestScript({
        phase: "pre-request",
        source: activeTab.scripts.pre_request,
        request: runtimeRequest,
        environment: runtimeVariables,
        hasActiveEnvironment: Boolean(activeEnvironment),
      });
      scriptReports.push(preResult.report);
      updateActiveTab({ scriptReports: [...scriptReports] });
      if (preResult.report.status === "failed") {
        throw new Error(
          `Pre-request script failed: ${preResult.report.error || "Unknown error"}`,
        );
      }
      runtimeRequest = preResult.request;
      runtimeVariables = preResult.environment;
      if (activeEnvironment && preResult.environment_mutations.length > 0) {
        await commitEnvironment(
          activeEnvironment.id,
          activeEnvironment.name,
          runtimeVariables,
        );
      }

      const resolvedTemplate = await resolveRequestVariables(
        { request: runtimeRequest, queryParams: [] },
        runtimeVariables,
      );
      const resolvedRequest: ApiRequest = {
        ...resolvedTemplate.request,
        url: buildRequestUrl(
          resolvedTemplate.request.url,
          resolvedTemplate.queryParams,
        ),
      };
      const response = await sendRequest(resolvedRequest);
      const postResult = await executeRequestScript({
        phase: "post-response",
        source: activeTab.scripts.post_response,
        request: resolvedRequest,
        response,
        environment: runtimeVariables,
        hasActiveEnvironment: Boolean(activeEnvironment),
      });
      scriptReports.push(postResult.report);
      if (
        postResult.report.status === "passed" &&
        activeEnvironment &&
        postResult.environment_mutations.length > 0
      ) {
        try {
          await commitEnvironment(
            activeEnvironment.id,
            activeEnvironment.name,
            postResult.environment,
          );
        } catch (commitError) {
          postResult.report.status = "failed";
          postResult.report.error = `Environment changes could not be saved: ${errorMessage(commitError)}`;
        }
      }
      updateActiveTab({
        response,
        loading: false,
        scriptReports: [...scriptReports],
      });

      const item = historyItem(activeTab, originalRequest, {
        status: response.status,
        response_time_ms: response.response_time_ms,
        error: null,
      });
      await saveHistory(item);
      setHistory((await loadHistory()) || []);
      updateActiveTab({ selectedHistoryId: item.id });
    } catch (error) {
      const message = errorMessage(error);
      updateActiveTab({
        error: message,
        response: null,
        loading: false,
        scriptReports: [...scriptReports],
      });
      if (error instanceof VariableResolutionError) return;

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
    commitEnvironment,
    environments,
    setHistory,
    updateActiveTab,
  ]);
}
