import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyCollectionMutationCore,
  getActiveWorkspace,
  saveCollectionsDocument,
  updateActiveWorkspace,
} = vi.hoisted(() => ({
  applyCollectionMutationCore: vi.fn(),
  getActiveWorkspace: vi.fn(),
  saveCollectionsDocument: vi.fn(),
  updateActiveWorkspace: vi.fn(),
}));

vi.mock("./wasmClient", () => ({ applyCollectionMutationCore }));
vi.mock("./workspaceRuntime", () => ({ getActiveWorkspace, updateActiveWorkspace }));
vi.mock("../adapters/fileSystem/workspaceFileSystem", () => ({ saveCollectionsDocument }));

import { createFolder, deleteRequestFromCollection, moveFolder } from "./collectionService";

describe("web collection adapter", () => {
  const workspace = {
    bundle: {
      collections: { revision: 0, collections: [] },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getActiveWorkspace.mockReturnValue(workspace);
    saveCollectionsDocument.mockResolvedValue(workspace);
  });

  it("delegates folder creation to the shared core and persists its document", async () => {
    const folder = { id: "folder-1", name: "Users", collection_id: "collection-1" };
    const collections = [{ id: "collection-1", folders: [folder], requests: [] }];
    applyCollectionMutationCore.mockResolvedValue({ collections, entity: folder });

    await expect(createFolder("collection-1", "Users", null)).resolves.toBe(folder);
    expect(applyCollectionMutationCore.mock.calls[0][1]).toEqual({
      action: "create_folder",
      collection_id: "collection-1",
      name: "Users",
      parent_folder_id: null,
    });
    expect(saveCollectionsDocument.mock.calls[0][1].collections).toBe(collections);
    expect(updateActiveWorkspace).toHaveBeenCalledWith(workspace);
  });

  it("persists mutations that do not return an entity", async () => {
    applyCollectionMutationCore.mockResolvedValue({ collections: [], entity: null });
    await deleteRequestFromCollection("collection-1", "request-1");
    expect(applyCollectionMutationCore.mock.calls[0][1]).toEqual({
      action: "delete_request",
      collection_id: "collection-1",
      request_id: "request-1",
    });
    expect(saveCollectionsDocument).toHaveBeenCalledOnce();
  });

  it("moves a folder through one shared-core mutation", async () => {
    const folder = { id: "folder-1", name: "Users", collection_id: "collection-2" };
    applyCollectionMutationCore.mockResolvedValue({ collections: [], entity: folder });

    await expect(moveFolder(
      "collection-1",
      "folder-1",
      "collection-2",
      "target-parent",
    )).resolves.toBe(folder);
    expect(applyCollectionMutationCore.mock.calls[0][1]).toEqual({
      action: "move_folder",
      source_collection_id: "collection-1",
      folder_id: "folder-1",
      target_collection_id: "collection-2",
      target_parent_folder_id: "target-parent",
    });
    expect(saveCollectionsDocument).toHaveBeenCalledOnce();
  });
});
