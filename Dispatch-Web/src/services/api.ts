import { sendBrowserRequest } from "../adapters/http/browserHttpClient";
import type { ApiRequest } from "../types/request";
import type { ApiResponse } from "../types/response";
import { resolveHttpSettings } from "../types/httpSettings";
import { loadGlobalHttpSettings } from "./httpSettingsService";

export async function sendRequest(request: ApiRequest): Promise<ApiResponse> {
  const globalSettings = await loadGlobalHttpSettings();
  const settings = resolveHttpSettings(globalSettings, request.settings);
  const response = await sendBrowserRequest(request, settings);
  return {
    status: response.status,
    response_time_ms: response.responseTimeMs,
    body: response.body,
    body_base64: response.bodyBase64,
    body_size: response.sizeBytes,
    headers: response.headers,
  };
}

export async function getAuthorizationCodeToken(request?: unknown): Promise<string> {
  void request;
  throw new Error("OAuth 2.0 authorization code akışı web sürümünde desteklenmiyor.");
}
