import { beforeAll, describe, expect, it } from "vitest";
import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from "quickjs-emscripten";
import type { ApiRequest } from "../types/request";
import type { ScriptExecutionInput } from "../types/script";
import { createScriptProgram } from "./scriptRunner.worker";

interface RuntimeOutput {
  request: ApiRequest;
  environment: Record<string, string>;
  environment_mutations: Array<{
    operation: "set" | "unset";
    key: string;
    value?: string;
  }>;
  logs: Array<{ level: string; message: string }>;
  tests: Array<{ name: string; passed: boolean; error?: string }>;
}

const baseRequest = (): ApiRequest => ({
  method: "GET",
  url: "https://example.com/items?existing=one#result",
  body: "",
  body_type: "json",
  form_fields: [],
  headers: { Accept: "application/json" },
  auth: { type: "None" },
  settings: {},
  scripts: { pre_request: "", post_response: "" },
});

const input = (
  source: string,
  overrides: Partial<ScriptExecutionInput> = {}
): ScriptExecutionInput => ({
  phase: "pre-request",
  source,
  request: baseRequest(),
  environment: { baseUrl: "https://example.com" },
  hasActiveEnvironment: true,
  ...overrides,
});

describe("Dispatch script runtime", () => {
  let quickJS: QuickJSWASMModule;

  beforeAll(async () => {
    quickJS = await getQuickJS();
  });

  const evaluate = (
    scriptInput: ScriptExecutionInput,
    timeoutMs = 1_000
  ): RuntimeOutput =>
    quickJS.evalCode(createScriptProgram(scriptInput), {
      shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + timeoutMs),
      memoryLimitBytes: 16 * 1024 * 1024,
      maxStackSizeBytes: 512 * 1024,
    }) as RuntimeOutput;

  it("keeps the legacy dp convenience API backward compatible", () => {
    const result = evaluate(
      input(`
        dp.request.method = "post";
        dp.request.body = { hello: "dispatch" };
        dp.request.headers.set("x-trace-id", "trace-123");
        dp.request.headers.remove("Accept");
        dp.request.query.set("existing", "two");
        dp.request.query.set("added", "yes");
        console.log("prepared", dp.request.method);
      `)
    );

    expect(result.request.method).toBe("POST");
    expect(result.request.body).toBe('{"hello":"dispatch"}');
    expect(result.request.headers).toEqual({ "x-trace-id": "trace-123" });
    expect(result.request.url).toBe(
      "https://example.com/items?existing=two&added=yes#result"
    );
    expect(result.logs).toEqual([
      { level: "log", message: "prepared POST" },
    ]);
  });

  it("reads variables and records persistent environment mutations", () => {
    const result = evaluate(
      input(`
        pm.environment.set("token", "abc");
        pm.environment.unset("baseUrl");
        pm.request.headers.set("Authorization", "Bearer " + pm.variables.get("token"));
      `)
    );

    expect(result.environment).toEqual({ token: "abc" });
    expect(result.environment_mutations).toEqual([
      { operation: "set", key: "token", value: "abc" },
      { operation: "unset", key: "baseUrl" },
    ]);
    expect(result.request.headers.Authorization).toBe("Bearer abc");
  });

  it("exposes response helpers and records passing and failing tests", () => {
    const result = evaluate(
      input(
        `
          pm.test("status is successful", () => {
            pm.expect(pm.response.status).toBe(201);
          });
          pm.test("response body is valid", () => {
            pm.expect(pm.response.json().created).toBeTruthy();
          });
          pm.test("failing assertion is reported", () => {
            pm.expect(pm.response.headers.get("content-type")).toContain("xml");
          });
          console.info(pm.response.text());
        `,
        {
          phase: "post-response",
          response: {
            status: 201,
            response_time_ms: 24,
            body: '{"created":true}',
            headers: { "Content-Type": "application/json" },
          },
        }
      )
    );

    expect(result.tests).toHaveLength(3);
    expect(result.tests[0]).toEqual({
      name: "status is successful",
      passed: true,
    });
    expect(result.tests[1].passed).toBe(true);
    expect(result.tests[2]).toMatchObject({
      name: "failing assertion is reported",
      passed: false,
    });
    expect(result.tests[2].error).toMatch(/to (contain|include)/);
    expect(result.logs[0]).toEqual({
      level: "info",
      message: '{"created":true}',
    });
  });

  it("does not expose browser, network, Node or Tauri host APIs", () => {
    const result = evaluate(
      input(`
        pm.test("runtime is isolated", () => {
          pm.expect(typeof window).toBe("undefined");
          pm.expect(typeof fetch).toBe("undefined");
          pm.expect(typeof process).toBe("undefined");
          pm.expect(typeof __TAURI__).toBe("undefined");
        });
      `)
    );

    expect(result.tests).toEqual([
      { name: "runtime is isolated", passed: true },
    ]);
  });

  it("supports Postman-style request headers, URL query and raw body syntax", () => {
    const result = evaluate(
      input(`
        pm.request.method = "POST";
        pm.request.headers.upsert({ key: "Content-Type", value: "application/json" });
        pm.request.headers.add({ key: "X-From-Postman-Syntax", value: "yes" });
        pm.request.url.query.upsert({ key: "existing", value: "updated" });
        pm.request.url.query.add({ key: "tag", value: "one" });
        pm.request.url.query.add({ key: "tag", value: "two" });
        pm.request.body.update({
          mode: "raw",
          raw: JSON.stringify({ source: "dp" }),
          options: { raw: { language: "json" } }
        });
        console.log(pm.request.url.toString());
      `)
    );

    expect(result.request.method).toBe("POST");
    expect(result.request.body_type).toBe("json");
    expect(result.request.body).toBe('{"source":"dp"}');
    expect(result.request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-From-Postman-Syntax": "yes",
    });
    expect(result.request.url).toBe(
      "https://example.com/items?existing=updated&tag=one&tag=two#result"
    );
    expect(result.logs[0].message).toBe(result.request.url);
  });

  it("supports Postman-style response and Chai assertion chains", () => {
    const result = evaluate(
      input(
        `
          const payload = pm.response.json();
          pm.test("Postman assertion syntax", () => {
            pm.expect(pm.response.code).to.equal(201);
            pm.expect(payload).to.have.property("created", true);
            pm.expect(payload.created).to.be.true;
            pm.expect(["scripts", "cookies"]).to.include("scripts");
            pm.expect("dispatch").to.be.a("string");
            pm.expect(24).to.be.above(10);
            pm.expect(pm.response.headers.get("content-type")).to.contain("json");
            pm.expect(pm.response.code).not.to.equal(500);
            pm.response.to.have.status(201);
            pm.response.to.have.header("Content-Type", "application/json");
            pm.response.to.have.jsonBody();
            pm.response.to.be.success;
          });
        `,
        {
          phase: "post-response",
          response: {
            status: 201,
            response_time_ms: 24,
            body: '{"created":true}',
            headers: { "Content-Type": "application/json" },
          },
        }
      )
    );

    expect(result.tests).toEqual([
      { name: "Postman assertion syntax", passed: true },
    ]);
  });

  it("supports Postman-style urlencoded and form-data body updates", () => {
    const urlencoded = evaluate(
      input(`
        pm.request.body.update({
          mode: "urlencoded",
          urlencoded: [
            { key: "enabled", value: "yes" },
            { key: "ignored", value: "no", disabled: true }
          ]
        });
      `)
    );
    const formData = evaluate(
      input(`
        pm.request.body.update({
          mode: "formdata",
          formdata: [{ key: "name", value: "Dispatch" }]
        });
      `)
    );

    expect(urlencoded.request.body_type).toBe("x-www-form-urlencoded");
    expect(urlencoded.request.form_fields).toEqual([
      { key: "enabled", value: "yes" },
    ]);
    expect(formData.request.body_type).toBe("form-data");
    expect(formData.request.form_fields).toEqual([
      { key: "name", value: "Dispatch" },
    ]);
  });

  it("runs Postman-style pm scripts without renaming the namespace", () => {
    const preRequest = evaluate(
      input(`
        pm.test("namespaces share one API", () => {
          pm.expect(pm === dp).to.be.true;
        });
        pm.variables.set("localToken", "local-value");
        pm.environment.set("savedToken", "saved-value");
        pm.request.method = "POST";
        pm.request.headers.upsert({ key: "X-Local-Token", value: pm.variables.get("localToken") });
        pm.request.url.query.upsert({ key: "source", value: "postman-script" });
        pm.request.body.update({
          mode: "raw",
          raw: JSON.stringify({ compatible: true }),
          options: { raw: { language: "json" } }
        });
      `)
    );

    expect(preRequest.tests).toEqual([
      { name: "namespaces share one API", passed: true },
    ]);
    expect(preRequest.request.method).toBe("POST");
    expect(preRequest.request.headers["X-Local-Token"]).toBe("local-value");
    expect(preRequest.request.url).toContain("source=postman-script");
    expect(preRequest.environment.savedToken).toBe("saved-value");
    expect(preRequest.environment).not.toHaveProperty("localToken");

    const postResponse = evaluate(
      input(
        `
          pm.test("unchanged pm response assertions", () => {
            pm.response.to.have.status(200);
            pm.response.to.have.header("Content-Type");
            pm.expect(pm.response.json()).to.have.property("ok", true);
          });
        `,
        {
          phase: "post-response",
          response: {
            status: 200,
            response_time_ms: 18,
            body: '{"ok":true}',
            headers: { "Content-Type": "application/json" },
          },
        }
      )
    );
    expect(postResponse.tests).toEqual([
      { name: "unchanged pm response assertions", passed: true },
    ]);
  });

  it("exposes phase information and keeps pm.variables local to one execution", () => {
    const result = evaluate(
      input(`
        pm.variables.set("local", "temporary");
        pm.test("pre-request metadata", () => {
          pm.expect(pm.info.eventName).to.equal("prerequest");
          pm.expect(pm.info.iteration).to.equal(0);
          pm.expect(pm.info.iterationCount).to.equal(1);
          pm.expect(pm.variables.has("local")).to.be.true;
          pm.expect(pm.variables.replaceIn("{{local}}/{{baseUrl}}/{{missing}}")).to.equal(
            "temporary/https://example.com/{{missing}}"
          );
        });
        pm.variables.unset("local");
      `)
    );

    expect(result.tests).toEqual([
      { name: "pre-request metadata", passed: true },
    ]);
    expect(result.environment).toEqual({ baseUrl: "https://example.com" });
    expect(result.environment_mutations).toEqual([]);
  });

  it("returns clear errors for known unsupported Postman APIs", () => {
    const unsupportedScripts = [
      'pm.sendRequest("https://example.com");',
      'pm.globals.get("token");',
      'pm.collectionVariables.get("token");',
      'pm.iterationData.get("token");',
      "pm.cookies.jar();",
      "pm.visualizer.set('<h1>test</h1>');",
      "pm.execution.skipRequest();",
      'pm.vault.get("secret");',
      'pm.vault.set("secret", "value");',
    ];

    for (const source of unsupportedScripts) {
      expect(() => evaluate(input(source))).toThrow(
        /not supported by Dispatch scripts yet/
      );
    }
  });

  it("rejects environment writes when no environment is active", () => {
    expect(() =>
      evaluate(
        input('pm.environment.set("token", "abc");', {
          environment: {},
          hasActiveEnvironment: false,
        })
      )
    ).toThrow(/requires an active environment/);
  });

  it("surfaces syntax and runtime errors", () => {
    expect(() => evaluate(input("const broken = ;"))).toThrow();
    expect(() => evaluate(input('throw new Error("script exploded");'))).toThrow(
      /script exploded/
    );
  });

  it("interrupts infinite loops at the execution deadline", () => {
    const startedAt = Date.now();

    expect(() => evaluate(input("while (true) {}"), 50)).toThrow(/interrupted/);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("rejects async scripts and async tests in the synchronous MVP", () => {
    expect(() =>
      evaluate(input("return Promise.resolve('later');"))
    ).toThrow(/Async scripts are not supported/);

    const result = evaluate(
      input(`
        pm.test("async test", async () => true);
      `)
    );
    expect(result.tests[0]).toMatchObject({
      name: "async test",
      passed: false,
      error: "Async tests are not supported yet",
    });
  });
});
