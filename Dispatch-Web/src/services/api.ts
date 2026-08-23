import { sendBrowserRequest } from "../adapters/http/browserHttpClient";
import type { ApiRequest } from "../types/request";
import type { ApiResponse } from "../types/response";

export async function sendRequest(request: ApiRequest): Promise<ApiResponse> {
  const response = await sendBrowserRequest(request);
  return { status: response.status, response_time_ms: response.responseTimeMs, body: response.body, headers: response.headers };
}

export async function getAuthorizationCodeToken(request?: unknown): Promise<string> {
  void request;
  throw new Error("OAuth 2.0 authorization code akışı web sürümünde desteklenmiyor.");
}
