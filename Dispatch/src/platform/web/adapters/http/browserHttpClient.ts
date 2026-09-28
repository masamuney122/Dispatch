import type { PreparedRequest } from "../../../../types/request";

interface BrowserApiResponse {
  status: number;
  statusText: string;
  responseTimeMs: number;
  sizeBytes: number;
  bytes: Uint8Array;
  contentType: string | null;
  headers: Record<string, string>;
}

function requestBody(body: PreparedRequest["body"]): BodyInit | undefined {
  if (body.kind === "none") return undefined;
  if (body.kind === "form-data") {
    const form = new FormData();
    body.fields.forEach((field) => form.append(field.key, field.value));
    return form;
  }
  if (body.kind === "url-encoded" || body.kind === "text") return body.value;
  if (body.kind === "binary") {
    const bytes = Uint8Array.from(atob(body.data_base64), (character) => character.charCodeAt(0));
    return new Blob([bytes]);
  }
  return undefined;
}

export async function sendBrowserRequest(
  prepared: PreparedRequest,
  signal?: AbortSignal,
): Promise<BrowserApiResponse> {
  const { request } = prepared;
  const { settings } = prepared;
  const headers = new Headers(request.headers);
  const body = requestBody(prepared.body);
  const startedAt = performance.now();
  try {
    const response = await fetch(request.url, {
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
    return {
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: Math.round(performance.now() - startedAt),
      sizeBytes: bytes.byteLength,
      bytes,
      contentType,
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
