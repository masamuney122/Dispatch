import type { PreparedRequest } from "../../../../types/request";

interface BrowserApiResponse {
  status: number;
  statusText: string;
  responseTimeMs: number;
  sizeBytes: number;
  bytes: Uint8Array;
  contentType: string | null;
  headers: Record<string, string>;
  requestHeaders: Record<string, string>;
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

function maximumResponseBytes(megabytes: number): number {
  return megabytes <= 0 ? 0 : megabytes * 1024 * 1024;
}

function responseLimitErrorMessage(megabytes: number): string {
  return `Response exceeds the configured ${megabytes} MB limit. Increase Maximum response size in Global Settings or set it to 0 to disable the limit.`;
}

function timeoutErrorMessage(milliseconds: number): string {
  return `Request timed out after ${milliseconds} ms because it exceeded the configured timeout limit. Increase Request timeout in Global Settings or set it to 0 to disable the limit.`;
}

async function readResponseBytes(
  response: Response,
  maxResponseSizeMb: number,
): Promise<Uint8Array> {
  const limit = maximumResponseBytes(maxResponseSizeMb);
  const declaredLength = Number(response.headers.get("content-length"));
  if (limit > 0 && Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error(responseLimitErrorMessage(maxResponseSizeMb));
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (limit > 0 && bytes.byteLength > limit) {
      throw new Error(responseLimitErrorMessage(maxResponseSizeMb));
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (limit > 0 && size > limit) {
        await reader.cancel();
        throw new Error(responseLimitErrorMessage(maxResponseSizeMb));
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
  const timeoutController = new AbortController();
  const timeoutId =
    settings.request_timeout_ms > 0
      ? globalThis.setTimeout(
          () => timeoutController.abort("timeout"),
          settings.request_timeout_ms,
        )
      : undefined;
  const abortFromCaller = () => timeoutController.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body,
      signal: timeoutController.signal,
      credentials: settings.cookies_enabled
        ? settings.cookie_credentials
        : "omit",
      redirect: settings.follow_redirects ? "follow" : "error",
      referrerPolicy: settings.remove_referer_on_redirect ? "no-referrer" : undefined,
    });
    const contentType = response.headers.get("content-type");
    const bytes = await readResponseBytes(
      response,
      settings.max_response_size_mb,
    );
    return {
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: Math.round(performance.now() - startedAt),
      sizeBytes: bytes.byteLength,
      bytes,
      contentType,
      headers: Object.fromEntries(response.headers.entries()),
      requestHeaders: Object.fromEntries(headers.entries()),
    };
  } catch (error) {
    if (
      timeoutController.signal.aborted &&
      timeoutController.signal.reason === "timeout"
    ) {
      throw new Error(timeoutErrorMessage(settings.request_timeout_ms), {
        cause: error,
      });
    }
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && error.message.startsWith("Response exceeds")) {
      throw error;
    }
    throw new Error(
      "The browser could not send the request. The endpoint may not allow CORS, the network may be unavailable, or the URL may be invalid.",
      { cause: error },
    );
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
