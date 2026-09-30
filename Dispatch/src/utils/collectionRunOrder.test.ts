import { describe, expect, it } from "vitest";
import type { Collection, SavedRequest } from "../types/collection";
import { collectionRequestsInRunOrder } from "./collectionRunOrder";

const savedRequest = (
  id: string,
  order: number,
  folderId: string | null = null,
): SavedRequest => ({
  id,
  name: id,
  folder_id: folderId,
  order,
  created_at: "",
  updated_at: "",
  request: {
    method: "GET",
    url: `https://example.com/${id}`,
    body: "",
    body_type: "none",
    form_fields: [],
    headers: {},
    settings: {},
    scripts: { pre_request: "", post_response: "" },
  },
});

describe("collectionRequestsInRunOrder", () => {
  it("flattens nested folders depth-first while preserving sibling order", () => {
    const collection: Collection = {
      id: "collection",
      name: "Runner",
      created_at: "",
      updated_at: "",
      folders: [
        { id: "folder-a", name: "A", collection_id: "collection", parent_folder_id: null, order: 1, created_at: "", updated_at: "" },
        { id: "folder-b", name: "B", collection_id: "collection", parent_folder_id: "folder-a", order: 1, created_at: "", updated_at: "" },
      ],
      requests: [
        savedRequest("root-first", 0),
        savedRequest("inside-a", 0, "folder-a"),
        savedRequest("inside-b", 0, "folder-b"),
        savedRequest("root-last", 2),
      ],
    };

    const ordered = collectionRequestsInRunOrder(collection);
    expect(ordered.map((item) => item.request.id)).toEqual([
      "root-first",
      "inside-a",
      "inside-b",
      "root-last",
    ]);
    expect(ordered[2].folderPath).toEqual(["A", "B"]);
  });

  it("limits a folder run to that folder and all of its descendants", () => {
    const collection: Collection = {
      id: "collection",
      name: "Runner",
      created_at: "",
      updated_at: "",
      folders: [
        { id: "folder-a", name: "A", collection_id: "collection", parent_folder_id: null, order: 0, created_at: "", updated_at: "" },
        { id: "folder-b", name: "B", collection_id: "collection", parent_folder_id: "folder-a", order: 1, created_at: "", updated_at: "" },
        { id: "folder-c", name: "C", collection_id: "collection", parent_folder_id: null, order: 2, created_at: "", updated_at: "" },
      ],
      requests: [
        savedRequest("inside-a", 0, "folder-a"),
        savedRequest("inside-b", 0, "folder-b"),
        savedRequest("inside-c", 0, "folder-c"),
        savedRequest("root", 3),
      ],
    };

    const ordered = collectionRequestsInRunOrder(collection, {
      type: "folder",
      folderId: "folder-a",
      folderName: "A",
    });

    expect(ordered.map((item) => item.request.id)).toEqual(["inside-a", "inside-b"]);
    expect(ordered.map((item) => item.folderPath)).toEqual([["A"], ["A", "B"]]);
  });

  it("returns an empty sequence for an empty or missing folder", () => {
    const collection: Collection = {
      id: "collection",
      name: "Runner",
      created_at: "",
      updated_at: "",
      folders: [
        { id: "empty", name: "Empty", collection_id: "collection", parent_folder_id: null, order: 0, created_at: "", updated_at: "" },
      ],
      requests: [savedRequest("root", 1)],
    };

    expect(collectionRequestsInRunOrder(collection, {
      type: "folder",
      folderId: "empty",
      folderName: "Empty",
    })).toEqual([]);
    expect(collectionRequestsInRunOrder(collection, {
      type: "folder",
      folderId: "missing",
      folderName: "Missing",
    })).toEqual([]);
  });
});
