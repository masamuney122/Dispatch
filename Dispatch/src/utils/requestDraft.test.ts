import { describe, expect, it } from "vitest";

import { createDefaultTab } from "../types/tab";
import {
  buildRequestUrl,
  createRequestPayload,
  requestDisplayName,
} from "./requestDraft";

describe("request draft utilities", () => {
  it("merges non-empty query params with the URL", () => {
    expect(
      buildRequestUrl("https://example.com/users?existing=1", [
        { key: "page", value: "2" },
        { key: "existing", value: "updated" },
        { key: " ", value: "ignored" },
      ]),
    ).toBe("https://example.com/users?existing=updated&page=2");
  });

  it("only includes enabled, named headers in the request payload", () => {
    const tab = {
      ...createDefaultTab(),
      url: "https://example.com/items",
      queryParams: [{ key: "limit", value: "10" }],
      headers: [
        { key: " Accept ", value: "application/json" },
        { key: "X-Disabled", value: "ignored", enabled: false },
        { key: "", value: "ignored" },
      ],
    };

    expect(createRequestPayload(tab)).toMatchObject({
      url: "https://example.com/items?limit=10",
      headers: { Accept: "application/json" },
    });
  });

  it("uses a useful URL-based name for untitled requests", () => {
    const tab = {
      ...createDefaultTab(),
      method: "POST" as const,
      url: "https://api.example.com/v1/orders?draft=true",
    };

    expect(requestDisplayName(tab)).toBe("POST api.example.com/v1/orders");
  });

  it("preserves an explicit request title", () => {
    const tab = { ...createDefaultTab(), title: "Create order" };
    expect(requestDisplayName(tab)).toBe("Create order");
  });
});
