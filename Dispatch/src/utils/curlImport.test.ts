import { describe, expect, it } from "vitest";

import { parseCurlCommand } from "./curlImport";

describe("cURL import", () => {
  it("imports a Chrome copy-as-cURL request", () => {
    const result = parseCurlCommand(`curl 'https://api.example.com/users?active=true' \\
      -X POST \\
      -H 'accept: application/json' \\
      -H 'content-type: application/json' \\
      --data-raw '{"name":"Ada"}'`);

    expect(result).toMatchObject({
      method: "POST",
      url: "https://api.example.com/users?active=true",
      bodyType: "json",
      body: '{"name":"Ada"}',
    });
    expect(result.headers).toContainEqual({
      key: "content-type",
      value: "application/json",
      enabled: true,
    });
  });

  it("infers POST and Basic authentication", () => {
    const result = parseCurlCommand(
      `curl https://example.com/login -u user:pass -d 'name=Ada&active=true'`,
    );

    expect(result.method).toBe("POST");
    expect(result.auth).toEqual({
      type: "Basic",
      username: "user",
      password: "pass",
    });
    expect(result.bodyType).toBe("x-www-form-urlencoded");
    expect(result.formFields).toEqual([
      { key: "name", value: "Ada" },
      { key: "active", value: "true" },
    ]);
  });

  it("imports JSON shorthand and default headers", () => {
    const result = parseCurlCommand(
      `curl --json '{"enabled":true}' https://example.com/items`,
    );

    expect(result.method).toBe("POST");
    expect(result.bodyType).toBe("json");
    expect(result.headers).toEqual(
      expect.arrayContaining([
        { key: "Content-Type", value: "application/json", enabled: true },
        { key: "Accept", value: "application/json", enabled: true },
      ]),
    );
  });

  it("supports Windows caret line continuations", () => {
    const result = parseCurlCommand(
      "curl.exe \"https://example.com/items\" ^\r\n  -H \"X-Test: yes\"",
    );

    expect(result.method).toBe("GET");
    expect(result.headers[0]).toMatchObject({ key: "X-Test", value: "yes" });
  });

  it("does not execute or accept non-cURL shell commands", () => {
    expect(() => parseCurlCommand("echo dangerous")).toThrow(
      "must start with curl",
    );
  });

  it("reports unsupported HTTP methods", () => {
    expect(() =>
      parseCurlCommand("curl -X TRACE https://example.com"),
    ).toThrow("HTTP method TRACE is not supported");
  });
});
