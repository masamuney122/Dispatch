import {
  classify_response_body,
  prepare_request,
  resolve_request_variables,
} from "../../wasm/dispatch_web_wasm";
import type { GlobalHttpSettings } from "../../../../types/httpSettings";
import type { ApiRequest, PreparedRequest } from "../../../../types/request";
import { ensureWasmInitialized, wasmError } from "./wasmRuntime";

export interface CoreRequestResolution {
  request: ApiRequest;
  unresolved: string[];
}

export async function resolveRequestVariablesCore(
  request: ApiRequest,
  variables: Record<string, string>,
): Promise<CoreRequestResolution> {
  await ensureWasmInitialized();
  try {
    return resolve_request_variables(request, variables) as CoreRequestResolution;
  } catch (error) {
    throw wasmError(error, "Request variables could not be resolved");
  }
}

export async function prepareRequestCore(
  request: ApiRequest,
  globalSettings: GlobalHttpSettings,
): Promise<PreparedRequest> {
  await ensureWasmInitialized();
  try {
    return prepare_request(request, globalSettings) as PreparedRequest;
  } catch (error) {
    throw wasmError(error, "The request could not be prepared for sending");
  }
}

export type CoreResponseBodyKind = "empty" | "text" | "binary";

export async function classifyResponseBodyCore(
  contentType: string | null,
  isUtf8: boolean,
  isEmpty: boolean,
): Promise<CoreResponseBodyKind> {
  await ensureWasmInitialized();
  return classify_response_body(
    contentType ?? undefined,
    isUtf8,
    isEmpty,
  ) as CoreResponseBodyKind;
}
