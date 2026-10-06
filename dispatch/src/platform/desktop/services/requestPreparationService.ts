import { invoke } from "@tauri-apps/api/core";
import type { ApiRequest } from "../../../types/request";

export interface RequestResolutionResult {
  request: ApiRequest;
  unresolved: string[];
}

export function resolveRequestVariablesCore(
  request: ApiRequest,
  variables: Record<string, string>,
): Promise<RequestResolutionResult> {
  return invoke<RequestResolutionResult>("resolve_request_variables", { request, variables });
}
