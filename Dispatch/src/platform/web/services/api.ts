import { sendBrowserRequest } from "../adapters/http/browserHttpClient";
import { bytesToBase64, decodeResponseText, isUtf8 } from "../adapters/http/responseBody";
import type { ApiRequest } from "../../../types/request";
import type { ApiResponse } from "../../../types/response";
import { loadGlobalHttpSettings } from "./httpSettingsService";
import { classifyResponseBodyCore, prepareRequestCore } from "./wasmClient";

export async function sendRequest(request: ApiRequest): Promise<ApiResponse> {
  const globalSettings = await loadGlobalHttpSettings();
  const prepared = await prepareRequestCore(request, globalSettings);
  const response = await sendBrowserRequest(prepared);
  const bodyKind = await classifyResponseBodyCore(
    response.contentType,
    isUtf8(response.bytes),
    response.bytes.byteLength === 0,
  );
  return {
    status: response.status,
    response_time_ms: response.responseTimeMs,
    body: bodyKind === "text" ? decodeResponseText(response.bytes, response.contentType) : "",
    body_base64: bodyKind === "binary" ? bytesToBase64(response.bytes) : undefined,
    body_size: response.sizeBytes,
    headers: response.headers,
    cookies: [],
    cookie_handling: "browser",
  };
}

export async function getAuthorizationCodeToken(request?: unknown): Promise<string> {
  void request;
  throw new Error("OAuth 2.0 authorization code akışı web sürümünde desteklenmiyor.");
}
