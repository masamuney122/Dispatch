import { describe, expect, it } from "vitest";
import { applyConsoleEvents } from "../../hooks/useConsoleStore";
import type { ConsoleEvent } from "../../types/console";
import type { ApiRequest } from "../../types/request";
import { createExecutionConsoleEvents } from "./consoleRecorder";

const request = (): ApiRequest => ({
  method: "POST",
  url: "https://example.com/items?api_key=query-secret",
  body: JSON.stringify({ password: "body-secret", visible: "yes" }),
  body_type: "json",
  form_fields: [],
  headers: {
    Authorization: "Bearer header-secret",
    "X-Visible": "present",
  },
  auth: { type: "Bearer", token: "header-secret" },
  settings: {},
  scripts: { pre_request: "", post_response: "" },
});

describe("console recorder", () => {
  it("creates ordered structured events and redacts secrets before storage", () => {
    const input = request();
    const events = createExecutionConsoleEvents({
      executionId: "execution-1",
      source: { kind: "interactive", requestId: "request-1" },
      trace: { input, afterPreRequest: input, resolved: input },
      response: {
        status: 200,
        response_time_ms: 18,
        body: JSON.stringify({ token: "response-secret", visible: true }),
        body_size: 43,
        headers: { "Set-Cookie": "session=response-secret" },
        request_headers: input.headers,
        network: { transport: "desktop", http_version: "HTTP/2" },
        cookie_handling: "workspace",
        cookies: [{
          name: "session",
          value: "response-secret",
          domain: "example.com",
          path: "/",
          expires_at: null,
          secure: true,
          http_only: true,
          same_site: "lax",
          enabled: true,
          host_only: true,
        }],
      },
      reports: [
        {
          phase: "pre-request",
          status: "passed",
          duration_ms: 1,
          logs: [{
            operation: "write",
            level: "log",
            message: "using header-secret",
            values: [{ kind: "object", entries: [{ key: "token", value: { kind: "string", value: "header-secret" } }], truncated: false }],
            sequence: 0,
          }],
          tests: [],
        },
        {
          phase: "post-response",
          status: "passed",
          duration_ms: 1,
          logs: [],
          tests: [{ name: "status", passed: true }],
        },
      ],
    });

    expect(events.map((event) => event.type)).toEqual([
      "script",
      "network",
      "cookie",
      "test",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("header-secret");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("body-secret");
    expect(serialized).not.toContain("response-secret");
    expect(serialized).toContain("<redacted>");
  });

  it("applies console.clear in timeline order and enforces the history limit", () => {
    const base = (id: string): ConsoleEvent => ({
      schemaVersion: 1,
      id,
      executionId: "execution",
      sequence: 0,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "error",
      level: "error",
      source: { kind: "interactive" },
      payload: { category: "unknown", message: id },
    });
    const clear: ConsoleEvent = {
      schemaVersion: 1,
      id: "clear",
      executionId: "execution",
      sequence: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "script",
      level: "log",
      source: { kind: "interactive" },
      phase: "pre-request",
      payload: { operation: "clear" },
    };

    expect(applyConsoleEvents([base("old")], [base("before"), clear, base("after")])).toEqual([
      base("after"),
    ]);
    expect(applyConsoleEvents([], [base("one"), base("two"), base("three")], 2).map((event) => event.id)).toEqual(["two", "three"]);
  });
});
