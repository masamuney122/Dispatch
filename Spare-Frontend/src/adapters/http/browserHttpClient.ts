import type { ApiRequest, ApiResponse } from "../../types/api";

function applyAuthentication(request: ApiRequest, headers: Headers): string {
  const auth = request.auth;
  if (!auth || auth.type === "None") return request.url;
  if (auth.type === "Bearer") {
    headers.set("Authorization", `Bearer ${auth.token}`);
    return request.url;
  }
  if (auth.type === "Basic") {
    headers.set("Authorization", `Basic ${btoa(`${auth.username}:${auth.password}`)}`);
    return request.url;
  }
  if (auth.add_to === "Header") {
    headers.set(auth.key, auth.value);
    return request.url;
  }
  const url = new URL(request.url);
  url.searchParams.set(auth.key, auth.value);
  return url.toString();
}

function requestBody(request: ApiRequest, headers: Headers): BodyInit | undefined {
  if (["GET", "HEAD"].includes(request.method) || request.body_type === "none") return undefined;
  if (request.body_type === "json" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (request.body_type === "xml" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/xml");
  }
  if (request.body_type === "text" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "text/plain;charset=UTF-8");
  }
  if (request.body_type === "form-data") {
    headers.delete("Content-Type");
    const form = new FormData();
    request.form_fields.forEach((field) => form.append(field.key, field.value));
    return form;
  }
  if (request.body_type === "x-www-form-urlencoded") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
    return new URLSearchParams(request.form_fields.map((field) => [field.key, field.value]));
  }
  if (request.body_type === "binary") {
    if (!request.binary) return undefined;
    if (!headers.has("Content-Type") && request.binary.mime_type) {
      headers.set("Content-Type", request.binary.mime_type);
    }
    const bytes = Uint8Array.from(atob(request.binary.data_base64), (character) => character.charCodeAt(0));
    return new Blob([bytes]);
  }
  return request.body;
}

export async function sendBrowserRequest(request: ApiRequest, signal?: AbortSignal): Promise<ApiResponse> {
  const headers = new Headers(request.headers);
  const url = applyAuthentication(request, headers);
  const body = requestBody(request, headers);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { method: request.method, headers, body, signal });
    const responseBody = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: Math.round(performance.now() - startedAt),
      sizeBytes: new Blob([responseBody]).size,
      body: responseBody,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      "Request tarayıcı tarafından gönderilemedi. Endpoint CORS izni vermiyor, ağ erişilemiyor veya URL geçersiz olabilir.",
      { cause: error },
    );
  }
}
