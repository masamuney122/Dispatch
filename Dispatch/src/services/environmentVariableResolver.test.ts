import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../types/request";

const { resolveRequestVariablesCore } = vi.hoisted(() => ({
  resolveRequestVariablesCore: vi.fn(),
}));

vi.mock("@platform/requestPreparationService", () => ({
  resolveRequestVariablesCore,
}));

import {
  resolveRequestVariables,
  VariableResolutionError,
} from "./environmentVariableResolver";

const request: ApiRequest = {
  method: "GET",
  url: "{{baseUrl}}/users",
  body: "",
  body_type: "none",
  form_fields: [],
  headers: {},
  auth: { type: "None" },
  settings: {},
  scripts: { pre_request: "", post_response: "" },
};

describe("request variable resolution facade", () => {
  beforeEach(() => resolveRequestVariablesCore.mockReset());

  it("returns the immutable request produced by the shared core", async () => {
    const resolved = { ...request, url: "https://example.com/users" };
    resolveRequestVariablesCore.mockResolvedValue({ request: resolved, unresolved: [] });

    await expect(
      resolveRequestVariables({ request, queryParams: [] }, { baseUrl: "https://example.com" }),
    ).resolves.toEqual({ request: resolved, queryParams: [] });
    expect(request.url).toBe("{{baseUrl}}/users");
  });

  it("preserves the UI error contract for missing variables", async () => {
    resolveRequestVariablesCore.mockResolvedValue({ request, unresolved: ["token", "baseUrl"] });

    const promise = resolveRequestVariables({ request, queryParams: [] }, {});
    await expect(promise).rejects.toBeInstanceOf(VariableResolutionError);
    await expect(promise).rejects.toMatchObject({ variableNames: ["baseUrl", "token"] });
  });
});
