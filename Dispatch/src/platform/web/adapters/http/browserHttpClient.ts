import type { ApiRequest } from "../../../../types/request";
import type { GlobalHttpSettings } from "../../../../types/httpSettings";

interface BrowserApiResponse {
  status: number;
  statusText: string;
  responseTimeMs: number;
  sizeBytes: number;
  body: string;
  bodyBase64?: string;
  headers: Record<string, string>;
}

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
  if (auth.type === "OAuth2") {
    if (!auth.access_token) throw new Error("OAuth 2.0 web sürümünde desteklenmiyor.");
    headers.set("Authorization", `Bearer ${auth.access_token}`);
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
  if (request.body_type === "html" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "text/html;charset=UTF-8");
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

function isTextualContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  return mime.startsWith("text/")
    || mime.endsWith("+json")
    || mime.endsWith("+xml")
    || [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/x-javascript",
      "application/graphql",
      "application/sql",
      "application/x-www-form-urlencoded",
      "image/svg+xml",
    ].includes(mime);
}

function decodeText(bytes: Uint8Array, contentType: string | null): string {
  const charset = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function sendBrowserRequest(
  request: ApiRequest,
  settings: GlobalHttpSettings,
  signal?: AbortSignal,
): Promise<BrowserApiResponse> {
  const headers = new Headers(request.headers);
  const url = applyAuthentication(request, headers);
  const body = requestBody(request, headers);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      signal,
      credentials: settings.cookie_credentials,
      redirect: settings.follow_redirects ? "follow" : "error",
      referrerPolicy: settings.remove_referer_on_redirect ? "no-referrer" : undefined,
    });
    const contentType = response.headers.get("content-type");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const decodeAsText = isTextualContentType(contentType) || (!contentType && isUtf8(bytes));
    const responseBody = decodeAsText ? decodeText(bytes, contentType) : "";
    return {
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: Math.round(performance.now() - startedAt),
      sizeBytes: bytes.byteLength,
      body: responseBody,
      bodyBase64: !decodeAsText && bytes.byteLength > 0 ? bytesToBase64(bytes) : undefined,
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
