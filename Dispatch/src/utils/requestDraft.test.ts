import { describe, expect, it } from "vitest";

import { createDefaultTab } from "../types/tab";
import {
  buildRequestUrl,
  createRequestPayload,
  historyTabUpdates,
  requestBreadcrumb,
  requestDisplayName,
  savedRequestTabUpdates,
} from "./requestDraft";
import type { Collection, SavedRequest } from "../types/collection";

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

  it("maps a history entry to a clean tab update", () => {
    const updates = historyTabUpdates({
      id: "history-1",
      method: "POST",
      url: "https://example.com/items?page=2",
      body: "payload",
      status: 200,
      response_time_ms: 10,
      timestamp: "2026-01-01T00:00:00Z",
      error: null,
    });

    expect(updates).toMatchObject({
      method: "POST",
      queryParams: [{ key: "page", value: "2" }],
      selectedHistoryId: "history-1",
      selectedSavedRequestId: null,
      isDirty: false,
    });
  });

  it("maps a saved request without carrying response state", () => {
    const request = createRequestPayload({
      ...createDefaultTab(),
      url: "https://example.com/items",
      headers: [{ key: "Accept", value: "application/json" }],
    });
    const saved: SavedRequest = {
      id: "request-1",
      name: "List items",
      request,
      folder_id: null,
      order: 0,
      created_at: "",
      updated_at: "",
    };

    expect(savedRequestTabUpdates(saved)).toMatchObject({
      title: "List items",
      headers: [{ key: "Accept", value: "application/json" }],
      response: null,
      selectedSavedRequestId: "request-1",
      isDirty: false,
    });
  });

  it("builds a cycle-safe nested request breadcrumb", () => {
    const request = createRequestPayload(createDefaultTab());
    const collection: Collection = {
      id: "collection-1",
      name: "API",
      folders: [
        {
          id: "parent",
          name: "Parent",
          collection_id: "collection-1",
          parent_folder_id: "child",
          order: 0,
          created_at: "",
          updated_at: "",
        },
        {
          id: "child",
          name: "Child",
          collection_id: "collection-1",
          parent_folder_id: "parent",
          order: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      requests: [
        {
          id: "request-1",
          name: "Request",
          request,
          folder_id: "child",
          order: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      created_at: "",
      updated_at: "",
    };

    expect(requestBreadcrumb([collection], "request-1")).toEqual([
      "API",
      "Parent",
      "Child",
    ]);
  });
});
