/// <reference lib="webworker" />

import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";
import type {
  ScriptErrorKind,
  ScriptExecutionInput,
  ScriptExecutionResult,
} from "../types/script";

const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const STACK_LIMIT_BYTES = 512 * 1024;
const EXECUTION_TIMEOUT_MS = 1_000;

interface ScriptWorkerRequest {
  id: string;
  input: ScriptExecutionInput;
}

interface ScriptWorkerResponse {
  id: string;
  result?: ScriptExecutionResult;
  error?: string;
  errorKind?: ScriptErrorKind;
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown script error";
  }
};

export const createScriptProgram = (input: ScriptExecutionInput) => {
  const serializedInput = JSON.stringify(JSON.stringify(input));

  return `
(() => {
  "use strict";
  const __input = JSON.parse(${serializedInput});
  const __request = JSON.parse(JSON.stringify(__input.request));
  const __environment = JSON.parse(JSON.stringify(__input.environment || {}));
  const __iterationDataValues = JSON.parse(JSON.stringify(__input.iteration_data || {}));
  const __mutations = [];
  const __logs = [];
  const __tests = [];

  const __stringify = (value) => {
    if (typeof value === "string") return value;
    if (typeof value === "undefined") return "undefined";
    if (typeof value === "function") return "[Function]";
    if (value && typeof value === "object" && typeof value.toString === "function") {
      const stringValue = value.toString();
      if (stringValue !== "[object Object]") return stringValue;
    }
    try {
      const json = JSON.stringify(value);
      return typeof json === "string" ? json : String(value);
    } catch (_) {
      return String(value);
    }
  };
  const __message = (values) => values.map(__stringify).join(" ");
  const __MAX_DEPTH = 5;
  const __MAX_ITEMS = 100;
  const __MAX_STRING = 10000;
  const __serialize = (value, depth = 0, seen = []) => {
    if (value === null) return { kind: "null" };
    if (typeof value === "undefined") return { kind: "undefined" };
    if (typeof value === "boolean") return { kind: "boolean", value };
    if (typeof value === "number") {
      return { kind: "number", value: Number.isFinite(value) ? value : String(value) };
    }
    if (typeof value === "bigint") return { kind: "special", label: String(value) + "n" };
    if (typeof value === "symbol") return { kind: "special", label: String(value) };
    if (typeof value === "function") return { kind: "special", label: "[Function " + (value.name || "anonymous") + "]" };
    if (typeof value === "string") {
      return value.length > __MAX_STRING
        ? { kind: "string", value: value.slice(0, __MAX_STRING), truncated: true }
        : { kind: "string", value };
    }
    if (depth >= __MAX_DEPTH) return { kind: "special", label: "[Max depth]" };
    if (seen.includes(value)) return { kind: "special", label: "[Circular]" };
    const nextSeen = seen.concat([value]);
    if (Array.isArray(value)) {
      return {
        kind: "array",
        items: value.slice(0, __MAX_ITEMS).map((item) => __serialize(item, depth + 1, nextSeen)),
        truncated: value.length > __MAX_ITEMS
      };
    }
    if (value instanceof Error) {
      return {
        kind: "object",
        entries: [
          { key: "name", value: __serialize(value.name, depth + 1, nextSeen) },
          { key: "message", value: __serialize(value.message, depth + 1, nextSeen) },
          { key: "stack", value: __serialize(value.stack, depth + 1, nextSeen) }
        ],
        truncated: false
      };
    }
    const keys = Object.keys(value);
    return {
      kind: "object",
      entries: keys.slice(0, __MAX_ITEMS).map((key) => {
        try { return { key, value: __serialize(value[key], depth + 1, nextSeen) }; }
        catch (error) { return { key, value: { kind: "special", label: "[Thrown: " + __stringify(error) + "]" } }; }
      }),
      truncated: keys.length > __MAX_ITEMS
    };
  };
  const __writeLog = (level, values) => {
    __logs.push({
      operation: "write",
      level,
      message: __message(values),
      values: values.map((value) => __serialize(value)),
      sequence: __logs.length
    });
  };
  const __normalizeHeader = (name) => String(name).trim().toLowerCase();
  const __headerKey = (name) => Object.keys(__request.headers || {}).find(
    (key) => key.toLowerCase() === __normalizeHeader(name)
  );
  const __decode = (value) => {
    try { return decodeURIComponent(String(value).replace(/\\+/g, " ")); }
    catch (_) { return String(value); }
  };
  const __queryParts = () => {
    const url = String(__request.url || "");
    const hashIndex = url.indexOf("#");
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
    const queryIndex = withoutHash.indexOf("?");
    const base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    const search = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
    const pairs = search
      ? search.split("&").filter(Boolean).map((part) => {
          const separator = part.indexOf("=");
          return separator < 0
            ? [__decode(part), ""]
            : [__decode(part.slice(0, separator)), __decode(part.slice(separator + 1))];
        })
      : [];
    return { base, hash, pairs };
  };
  const __writeQuery = (parts) => {
    const query = parts.pairs
      .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
      .join("&");
    __request.url = parts.base + (query ? "?" + query : "") + parts.hash;
  };
  const __equal = (left, right) => {
    if (Object.is(left, right)) return true;
    try { return JSON.stringify(left) === JSON.stringify(right); }
    catch (_) { return false; }
  };
  const __expect = (actual, negated = false) => {
    const chain = {};
    const assert = (condition, message) => {
      const failed = negated ? condition : !condition;
      if (failed) throw new Error(negated ? "Not: " + message : message);
      return chain;
    };
    const equal = (expected) => assert(
      Object.is(actual, expected),
      "Expected " + __stringify(actual) + " to equal " + __stringify(expected)
    );
    const eql = (expected) => assert(
      __equal(actual, expected),
      "Expected " + __stringify(actual) + " to deeply equal " + __stringify(expected)
    );
    const include = (expected) => assert(
      actual != null && typeof actual.includes === "function" && actual.includes(expected),
      "Expected " + __stringify(actual) + " to include " + __stringify(expected)
    );
    const status = (expected) => {
      const current = actual && typeof actual === "object"
        ? (typeof actual.code === "number" ? actual.code : actual.status)
        : actual;
      return assert(current === expected, "Expected status " + __stringify(current) + " to equal " + expected);
    };
    const property = (name, expected) => {
      const exists = actual != null && Object.prototype.hasOwnProperty.call(Object(actual), String(name));
      assert(exists, "Expected " + __stringify(actual) + " to have property " + String(name));
      if (typeof expected !== "undefined") {
        assert(__equal(actual[String(name)], expected), "Expected property " + String(name) + " to equal " + __stringify(expected));
      }
      return chain;
    };
    const type = (expected) => {
      const normalized = String(expected).toLowerCase();
      const current = Array.isArray(actual) ? "array" : typeof actual;
      return assert(current === normalized, "Expected " + __stringify(actual) + " to be a " + normalized);
    };

    Object.assign(chain, {
      equal,
      equals: equal,
      eq: equal,
      eql,
      eqls: eql,
      include,
      includes: include,
      contain: include,
      contains: include,
      property,
      status,
      header(name, expected) {
        const value = actual && actual.headers && typeof actual.headers.get === "function"
          ? actual.headers.get(name)
          : undefined;
        assert(typeof value !== "undefined", "Expected response to have header " + String(name));
        if (typeof expected !== "undefined") {
          assert(__equal(value, expected), "Expected header " + String(name) + " to equal " + __stringify(expected));
        }
        return chain;
      },
      body(expected) {
        const value = actual && typeof actual === "object" && "body" in actual ? actual.body : actual;
        return assert(typeof expected === "undefined" ? typeof value === "string" : __equal(value, expected), "Expected response body to equal " + __stringify(expected));
      },
      jsonBody() {
        try {
          const value = actual && typeof actual.json === "function" ? actual.json() : JSON.parse(String(actual));
          return assert(value !== null, "Expected response to have a JSON body");
        } catch (_) {
          return assert(false, "Expected response to have a JSON body");
        }
      },
      a: type,
      an: type,
      lengthOf(expected) {
        return assert(actual != null && actual.length === expected, "Expected length " + __stringify(actual && actual.length) + " to equal " + expected);
      },
      match(expected) {
        return assert(expected instanceof RegExp && expected.test(String(actual)), "Expected " + __stringify(actual) + " to match " + String(expected));
      },
      oneOf(expected) {
        return assert(Array.isArray(expected) && expected.some((value) => __equal(value, actual)), "Expected " + __stringify(actual) + " to be one of " + __stringify(expected));
      },
      above(expected) { return assert(actual > expected, "Expected " + actual + " to be above " + expected); },
      greaterThan(expected) { return assert(actual > expected, "Expected " + actual + " to be greater than " + expected); },
      below(expected) { return assert(actual < expected, "Expected " + actual + " to be below " + expected); },
      lessThan(expected) { return assert(actual < expected, "Expected " + actual + " to be less than " + expected); },
      least(expected) { return assert(actual >= expected, "Expected " + actual + " to be at least " + expected); },
      most(expected) { return assert(actual <= expected, "Expected " + actual + " to be at most " + expected); },
      toBe: equal,
      notToBe(expected) { return __expect(actual, true).equal(expected); },
      toEqual: eql,
      toBeTruthy() { return assert(Boolean(actual), "Expected " + __stringify(actual) + " to be truthy"); },
      toBeFalsy() { return assert(!actual, "Expected " + __stringify(actual) + " to be falsy"); },
      toContain: include,
      toHaveStatus: status
    });
    Object.defineProperties(chain, {
      to: { get: () => chain },
      be: { get: () => chain },
      been: { get: () => chain },
      is: { get: () => chain },
      that: { get: () => chain },
      which: { get: () => chain },
      and: { get: () => chain },
      has: { get: () => chain },
      have: { get: () => chain },
      with: { get: () => chain },
      at: { get: () => chain },
      of: { get: () => chain },
      same: { get: () => chain },
      deep: { get: () => chain },
      not: { get: () => __expect(actual, !negated) },
      true: { get: () => assert(actual === true, "Expected " + __stringify(actual) + " to be true") },
      false: { get: () => assert(actual === false, "Expected " + __stringify(actual) + " to be false") },
      null: { get: () => assert(actual === null, "Expected " + __stringify(actual) + " to be null") },
      undefined: { get: () => assert(typeof actual === "undefined", "Expected value to be undefined") },
      exist: { get: () => assert(actual !== null && typeof actual !== "undefined", "Expected value to exist") },
      ok: { get: () => {
        const condition = actual && typeof actual === "object" && typeof actual.status === "number"
          ? actual.status >= 200 && actual.status < 400
          : Boolean(actual);
        return assert(condition, "Expected " + __stringify(actual) + " to be ok");
      } },
      success: { get: () => {
        const code = actual && typeof actual === "object" ? actual.status : actual;
        return assert(code >= 200 && code < 300, "Expected status " + code + " to be successful");
      } },
      clientError: { get: () => {
        const code = actual && typeof actual === "object" ? actual.status : actual;
        return assert(code >= 400 && code < 500, "Expected status " + code + " to be a client error");
      } },
      serverError: { get: () => {
        const code = actual && typeof actual === "object" ? actual.status : actual;
        return assert(code >= 500 && code < 600, "Expected status " + code + " to be a server error");
      } },
      empty: { get: () => assert(actual != null && actual.length === 0, "Expected " + __stringify(actual) + " to be empty") }
    });
    return chain;
  };

  const __headerInput = (nameOrItem, value) => {
    if (nameOrItem && typeof nameOrItem === "object") {
      return { name: nameOrItem.key, value: nameOrItem.value, disabled: nameOrItem.disabled === true };
    }
    return { name: nameOrItem, value, disabled: false };
  };
  const __setHeader = (nameOrItem, value) => {
    const item = __headerInput(nameOrItem, value);
    const normalizedName = String(item.name || "").trim();
    if (!normalizedName) throw new Error("Header name cannot be empty");
    if (item.disabled) return;
    const existing = __headerKey(normalizedName);
    if (existing && existing !== normalizedName) delete __request.headers[existing];
    __request.headers[normalizedName] = String(item.value == null ? "" : item.value);
  };

  const __headers = Object.freeze({
    get(name) {
      const key = __headerKey(name);
      return key ? __request.headers[key] : undefined;
    },
    has(name) { return Boolean(__headerKey(name)); },
    set(name, value) { __setHeader(name, value); },
    upsert(item) { __setHeader(item); },
    add(item) { __setHeader(item); },
    remove(name) {
      const key = __headerKey(name);
      if (key) delete __request.headers[key];
    },
    all() { return Object.entries(__request.headers).map(([key, value]) => ({ key, value })); },
    each(callback) { Object.entries(__request.headers).forEach(([key, value]) => callback({ key, value })); },
    toObject() { return JSON.parse(JSON.stringify(__request.headers)); }
  });

  const __queryInput = (nameOrItem, value) => {
    if (nameOrItem && typeof nameOrItem === "object") {
      return { key: nameOrItem.key, value: nameOrItem.value, disabled: nameOrItem.disabled === true };
    }
    return { key: nameOrItem, value, disabled: false };
  };
  const __setQuery = (nameOrItem, value, append) => {
    const item = __queryInput(nameOrItem, value);
    const key = String(item.key || "");
    if (!key) throw new Error("Query parameter name cannot be empty");
    if (item.disabled) return;
    const parts = __queryParts();
    if (!append) parts.pairs = parts.pairs.filter(([current]) => current !== key);
    parts.pairs.push([key, String(item.value == null ? "" : item.value)]);
    __writeQuery(parts);
  };

  const __query = Object.freeze({
    get(name) {
      const pair = __queryParts().pairs.find(([key]) => key === String(name));
      return pair ? pair[1] : undefined;
    },
    has(name) { return __queryParts().pairs.some(([key]) => key === String(name)); },
    set(name, value) { __setQuery(name, value, false); },
    upsert(item) { __setQuery(item, undefined, false); },
    add(item) { __setQuery(item, undefined, true); },
    getAll(name) { return __queryParts().pairs.filter(([key]) => key === String(name)).map(([, value]) => value); },
    remove(name) {
      const parts = __queryParts();
      parts.pairs = parts.pairs.filter(([key]) => key !== String(name));
      __writeQuery(parts);
    },
    all() { return __queryParts().pairs.map(([key, value]) => ({ key, value })); },
    each(callback) { __queryParts().pairs.forEach(([key, value]) => callback({ key, value })); },
    toObject() {
      const result = {};
      __queryParts().pairs.forEach(([key, value]) => { result[key] = value; });
      return result;
    }
  });

  const __urlApi = Object.freeze({
    query: __query,
    toString() { return __request.url; },
    toJSON() { return __request.url; },
    valueOf() { return __request.url; },
    [Symbol.toPrimitive]() { return __request.url; }
  });
  const __bodyApi = Object.freeze({
    get mode() {
      if (__request.body_type === "x-www-form-urlencoded") return "urlencoded";
      if (__request.body_type === "form-data") return "formdata";
      return __request.body_type === "none" ? "none" : "raw";
    },
    get raw() { return __request.body; },
    update(value) {
      if (typeof value === "string") {
        __request.body = value;
        return;
      }
      if (!value || typeof value !== "object") throw new Error("dp.request.body.update expects a string or body object");
      const mode = String(value.mode || "raw");
      if (mode === "raw") {
        __request.body = String(value.raw == null ? "" : value.raw);
        const language = value.options && value.options.raw ? String(value.options.raw.language || "") : "";
        __request.body_type = language === "json" ? "json" : language === "xml" ? "xml" : language === "html" ? "html" : "text";
        __request.form_fields = [];
        return;
      }
      const fields = mode === "urlencoded" ? value.urlencoded : value.formdata;
      if (mode === "urlencoded" || mode === "formdata") {
        __request.body_type = mode === "urlencoded" ? "x-www-form-urlencoded" : "form-data";
        __request.form_fields = Array.isArray(fields)
          ? fields.filter((field) => field && field.disabled !== true).map((field) => ({ key: String(field.key || ""), value: String(field.value == null ? "" : field.value) }))
          : [];
        __request.body = "";
        return;
      }
      if (mode === "none") {
        __request.body_type = "none";
        __request.body = "";
        __request.form_fields = [];
        return;
      }
      throw new Error("Unsupported request body mode: " + mode);
    },
    toString() { return __request.body; },
    toJSON() { return __request.body; }
  });

  const __requestApi = {};
  Object.defineProperties(__requestApi, {
    method: { enumerable: true, get: () => __request.method, set: (value) => { __request.method = String(value).toUpperCase(); } },
    url: { enumerable: true, get: () => __urlApi, set: (value) => { __request.url = String(value); } },
    body: { enumerable: true, get: () => __bodyApi, set: (value) => { __request.body = typeof value === "string" ? value : JSON.stringify(value); } },
    headers: { enumerable: true, value: __headers },
    query: { enumerable: true, value: __query }
  });
  Object.freeze(__requestApi);

  const __responseHeaderValues = __input.response
    ? JSON.parse(JSON.stringify(__input.response.headers || {}))
    : {};
  const __responseHeaders = Object.freeze({
    get(name) {
      const normalized = String(name).trim().toLowerCase();
      const key = Object.keys(__responseHeaderValues).find((candidate) => candidate.toLowerCase() === normalized);
      return key ? __responseHeaderValues[key] : undefined;
    },
    has(name) {
      const normalized = String(name).trim().toLowerCase();
      return Object.keys(__responseHeaderValues).some((candidate) => candidate.toLowerCase() === normalized);
    },
    all() { return Object.entries(__responseHeaderValues).map(([key, value]) => ({ key, value })); },
    each(callback) { Object.entries(__responseHeaderValues).forEach(([key, value]) => callback({ key, value })); },
    toObject() { return JSON.parse(JSON.stringify(__responseHeaderValues)); }
  });
  let __responseApi = null;
  if (__input.response) {
    const responseObject = {
      status: __input.response.status,
      code: __input.response.status,
      responseTime: __input.response.response_time_ms,
      responseTimeMs: __input.response.response_time_ms,
      headers: __responseHeaders,
      body: __input.response.body,
      text() { return __input.response.body; },
      json() { return JSON.parse(__input.response.body); }
    };
    Object.defineProperty(responseObject, "to", { enumerable: true, get: () => __expect(responseObject) });
    __responseApi = Object.freeze(responseObject);
  }

  const __localVariables = {};
  const __variables = Object.freeze({
    get(name) {
      const key = String(name);
      return Object.prototype.hasOwnProperty.call(__localVariables, key)
        ? __localVariables[key]
        : __environment[key];
    },
    has(name) {
      const key = String(name);
      return Object.prototype.hasOwnProperty.call(__localVariables, key) || Object.prototype.hasOwnProperty.call(__environment, key);
    },
    set(name, value) {
      const key = String(name).trim();
      if (!key) throw new Error("Variable name cannot be empty");
      __localVariables[key] = String(value);
    },
    unset(name) { delete __localVariables[String(name)]; },
    replaceIn(value) {
      return String(value).replace(/\\{\\{\\s*([^{}]+?)\\s*\\}\\}/g, (match, name) => {
        if (Object.prototype.hasOwnProperty.call(__localVariables, name)) return __localVariables[name];
        return Object.prototype.hasOwnProperty.call(__environment, name) ? __environment[name] : match;
      });
    }
  });
  const __environmentApi = Object.freeze({
    get(name) { return __environment[String(name)]; },
    set(name, value) {
      if (!__input.hasActiveEnvironment) throw new Error("pm/dp.environment.set requires an active environment");
      const key = String(name).trim();
      if (!key) throw new Error("Environment variable name cannot be empty");
      __environment[key] = String(value);
      __mutations.push({ operation: "set", key, value: String(value) });
    },
    unset(name) {
      if (!__input.hasActiveEnvironment) throw new Error("pm/dp.environment.unset requires an active environment");
      const key = String(name).trim();
      delete __environment[key];
      __mutations.push({ operation: "unset", key });
    }
  });
  const __iterationData = Object.freeze({
    get(name) { return __iterationDataValues[String(name)]; },
    has(name) { return Object.prototype.hasOwnProperty.call(__iterationDataValues, String(name)); },
    replaceIn(value) {
      return String(value).replace(/\\{\\{\\s*([^{}]+?)\\s*\\}\\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(__iterationDataValues, name)
          ? __iterationDataValues[name]
          : match
      );
    },
    toObject() { return JSON.parse(JSON.stringify(__iterationDataValues)); }
  });

  globalThis.console = Object.freeze({
    log(...values) { __writeLog("log", values); },
    info(...values) { __writeLog("info", values); },
    warn(...values) { __writeLog("warn", values); },
    error(...values) { __writeLog("error", values); },
    clear() { __logs.push({ operation: "clear", sequence: __logs.length }); }
  });

  const __unsupported = (feature, guidance) => {
    throw new Error(feature + " is not supported by Dispatch scripts yet." + (guidance ? " " + guidance : ""));
  };
  const __unsupportedScope = (feature) => Object.freeze({
    get() { return __unsupported(feature); },
    has() { return __unsupported(feature); },
    set() { return __unsupported(feature); },
    unset() { return __unsupported(feature); },
    replaceIn() { return __unsupported(feature); }
  });
  const __scriptApi = Object.freeze({
    request: __requestApi,
    response: __responseApi,
    variables: __variables,
    environment: __environmentApi,
    info: Object.freeze({
      eventName: __input.phase === "pre-request" ? "prerequest" : "test",
      iteration: Number.isInteger(__input.iteration) ? __input.iteration : 0,
      iterationCount: Number.isInteger(__input.iteration_count) ? __input.iteration_count : 1
    }),
    globals: __unsupportedScope("pm/dp.globals"),
    collectionVariables: __unsupportedScope("pm/dp.collectionVariables"),
    iterationData: __iterationData,
    cookies: Object.freeze({
      jar() { return __unsupported("pm/dp.cookies.jar", "Use Dispatch's workspace Cookie Manager instead."); }
    }),
    visualizer: Object.freeze({
      set() { return __unsupported("pm/dp.visualizer.set"); }
    }),
    execution: Object.freeze({
      skipRequest() { return __unsupported("pm/dp.execution.skipRequest"); }
    }),
    vault: Object.freeze({
      get() { return __unsupported("pm/dp.vault.get"); },
      set() { return __unsupported("pm/dp.vault.set"); }
    }),
    sendRequest() {
      return __unsupported("pm/dp.sendRequest", "Scripts cannot start additional network requests in the sandbox.");
    },
    expect: __expect,
    test(name, callback) {
      const testName = String(name || "Unnamed test");
      try {
        const result = callback();
        if (result && typeof result.then === "function") throw new Error("Async tests are not supported yet");
        __tests.push({ name: testName, passed: true });
      } catch (error) {
        __tests.push({ name: testName, passed: false, error: error && error.message ? String(error.message) : __stringify(error) });
      }
    }
  });
  globalThis.dp = __scriptApi;
  globalThis.pm = __scriptApi;

  let __runtimeError = null;
  try {
    const __runner = Function(__input.source);
    const __returnValue = __runner.call(undefined);
    if (__returnValue && typeof __returnValue.then === "function") {
      throw new Error("Async scripts are not supported yet");
    }
  } catch (error) {
    __runtimeError = {
      kind: error && error.name === "SyntaxError" ? "syntax" : "runtime",
      message: error && error.message ? String(error.message) : __stringify(error),
      stack: error && error.stack ? String(error.stack) : undefined
    };
  }

  return {
    request: __request,
    environment: __environment,
    environment_mutations: __mutations,
    logs: __logs,
    tests: __tests,
    runtime_error: __runtimeError
  };
})()
`;
};

const handleWorkerMessage = async (event: MessageEvent<ScriptWorkerRequest>) => {
  const { id, input } = event.data;
  const startedAt = performance.now();

  try {
    const QuickJS = await getQuickJS();
    const value = QuickJS.evalCode(createScriptProgram(input), {
      shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS),
      memoryLimitBytes: MEMORY_LIMIT_BYTES,
      maxStackSizeBytes: STACK_LIMIT_BYTES,
    }) as Omit<ScriptExecutionResult, "report"> & {
      logs: ScriptExecutionResult["report"]["logs"];
      tests: ScriptExecutionResult["report"]["tests"];
      runtime_error?: ScriptExecutionResult["report"]["error_info"] | null;
    };
    const duration = Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
    const result: ScriptExecutionResult = {
      request: value.request,
      environment: value.environment,
      environment_mutations: value.environment_mutations,
      report: {
        phase: input.phase,
        status: value.runtime_error ? "failed" : "passed",
        duration_ms: duration,
        logs: value.logs,
        tests: value.tests,
        error: value.runtime_error?.message,
        error_info: value.runtime_error || undefined,
      },
    };
    self.postMessage({ id, result } satisfies ScriptWorkerResponse);
  } catch (error) {
    const message = errorMessage(error);
    const normalized = message.toLowerCase();
    const errorKind: ScriptErrorKind = normalized.includes("interrupted")
      ? "timeout"
      : normalized.includes("memory")
        ? "memory"
        : "worker";
    self.postMessage({ id, error: message, errorKind } satisfies ScriptWorkerResponse);
  }
};

if (typeof self !== "undefined") self.onmessage = handleWorkerMessage;

export {};
