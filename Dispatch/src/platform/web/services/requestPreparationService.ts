import type { ApiRequest } from "../../../types/request";
import { resolveRequestVariablesCore as resolveWithWasm } from "./wasmClient";

export interface RequestResolutionResult {
  request: ApiRequest;
  unresolved: string[];
}

export function resolveRequestVariablesCore(
  request: ApiRequest,
  variables: Record<string, string>,
): Promise<RequestResolutionResult> {
  return resolveWithWasm(request, variables);
}
