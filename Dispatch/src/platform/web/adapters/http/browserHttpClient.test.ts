import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreparedRequest } from "../../../../types/request";
import { DEFAULT_HTTP_SETTINGS } from "../../../../types/httpSettings";
import { sendBrowserRequest } from "./browserHttpClient";

function preparedRequest(
  settings: Partial<PreparedRequest["settings"]> = {},
): PreparedRequest {
  return {
    request: {
      method: "GET",
      url: "https://example.com/data",
      body: "",
      body_type: "none",
      form_fields: [],
      headers: {},
    },
    body: { kind: "none" },
    settings: { ...DEFAULT_HTTP_SETTINGS, ...settings },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sendBrowserRequest", () => {
  it("forces credentials omit when cookies are disabled", async () => {
    let init: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options: RequestInit) => {
        init = options;
        return new Response("ok", { status: 200 });
      }),
    );

    await sendBrowserRequest(
      preparedRequest({ cookies_enabled: false, cookie_credentials: "include" }),
    );

    expect(init?.credentials).toBe("omit");
  });

  it("rejects a declared response larger than the configured limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("ignored", {
          status: 200,
          headers: { "content-length": String(1024 * 1024 + 1) },
        }),
      ),
    );

    await expect(
      sendBrowserRequest(preparedRequest({ max_response_size_mb: 1 })),
    ).rejects.toThrow(
      "Response exceeds the configured 1 MB limit. Increase Maximum response size in Global Settings or set it to 0 to disable the limit.",
    );
  });

  it("aborts a request after the configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, options: RequestInit) =>
          await new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const request = sendBrowserRequest(
      preparedRequest({ request_timeout_ms: 25 }),
    );
    const expectation = expect(request).rejects.toThrow(
      "Request timed out after 25 ms because it exceeded the configured timeout limit. Increase Request timeout in Global Settings or set it to 0 to disable the limit.",
    );
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });
});
