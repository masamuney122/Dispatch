import { saveCollectionsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import type { ApiRequest } from "../../../types/request";
import type { Collection, Folder, OrderItem, SavedRequest } from "../../../types/collection";
import { applyCollectionMutationCore } from "./wasmClient";
import { getActiveWorkspace, updateActiveWorkspace } from "./workspaceRuntime";

const defaultRequest = (): ApiRequest => ({
  method: "GET",
  url: "",
  body: "",
  body_type: "none",
  form_fields: [],
  headers: {},
});

interface MutationResult<T> {
  collections: Collection[];
  entity: T | null;
}

async function mutate<T>(mutation: Record<string, unknown>, needsEntityId = false): Promise<MutationResult<T>> {
  const workspace = getActiveWorkspace();
  const result = await applyCollectionMutationCore(
    workspace.bundle.collections.collections as Collection[],
    mutation,
    {
      timestamp: new Date().toISOString(),
      entity_id: needsEntityId ? crypto.randomUUID() : "",
      id_prefix: crypto.randomUUID(),
    },
  ) as MutationResult<T>;
  const updated = await saveCollectionsDocument(workspace, {
    ...workspace.bundle.collections,
    collections: result.collections,
  });
  updateActiveWorkspace(updated);
  return result;
}

function requireEntity<T>(result: MutationResult<T>): T {
  if (result.entity === null) throw new Error("Collection işlemi sonuç üretmedi.");
  return result.entity;
}

export async function listCollections(): Promise<Collection[]> {
  return getActiveWorkspace().bundle.collections.collections as Collection[];
}

export async function createCollection(name: string): Promise<Collection> {
  return requireEntity(await mutate<Collection>({ action: "create_collection", name }, true));
}

export async function deleteCollection(id: string): Promise<void> {
  await mutate({ action: "delete_collection", collection_id: id });
}

export async function renameCollection(id: string, name: string): Promise<void> {
  await mutate({ action: "rename_collection", collection_id: id, name });
}

export async function createFolder(
  collectionId: string,
  name: string,
  parentFolderId?: string | null,
): Promise<Folder> {
  return requireEntity(await mutate<Folder>({
    action: "create_folder", collection_id: collectionId, name,
    parent_folder_id: parentFolderId ?? null,
  }, true));
}

export async function renameFolder(collectionId: string, folderId: string, name: string): Promise<void> {
  await mutate({ action: "rename_folder", collection_id: collectionId, folder_id: folderId, name });
}

export async function deleteFolder(collectionId: string, folderId: string): Promise<void> {
  await mutate({ action: "delete_folder", collection_id: collectionId, folder_id: folderId });
}

export async function duplicateFolder(collectionId: string, folderId: string): Promise<Folder> {
  return requireEntity(await mutate<Folder>({ action: "duplicate_folder", collection_id: collectionId, folder_id: folderId }));
}

export async function moveFolder(
  sourceCollectionId: string,
  folderId: string,
  targetCollectionId: string,
  targetParentFolderId: string | null,
): Promise<Folder> {
  return requireEntity(await mutate<Folder>({
    action: "move_folder",
    source_collection_id: sourceCollectionId,
    folder_id: folderId,
    target_collection_id: targetCollectionId,
    target_parent_folder_id: targetParentFolderId,
  }));
}

export async function createRequestInCollection(
  collectionId: string,
  folderId: string | null,
  name: string,
): Promise<SavedRequest> {
  return saveRequestToCollection(collectionId, name.trim() || "New Request", defaultRequest(), folderId);
}

export async function saveRequestToCollection(
  collectionId: string,
  name: string,
  request: ApiRequest,
  folderId?: string | null,
): Promise<SavedRequest> {
  return requireEntity(await mutate<SavedRequest>({
    action: "save_request", collection_id: collectionId, name, request,
    folder_id: folderId ?? null,
  }, true));
}

export async function updateRequestInCollection(
  collectionId: string,
  requestId: string,
  name: string,
  request: ApiRequest,
): Promise<SavedRequest> {
  return requireEntity(await mutate<SavedRequest>({
    action: "update_request", collection_id: collectionId, request_id: requestId, name, request,
  }));
}

export async function renameRequestInCollection(
  collectionId: string,
  requestId: string,
  name: string,
): Promise<SavedRequest> {
  return requireEntity(await mutate<SavedRequest>({
    action: "rename_request", collection_id: collectionId, request_id: requestId, name,
  }));
}

export async function duplicateRequestInCollection(collectionId: string, requestId: string): Promise<SavedRequest> {
  return requireEntity(await mutate<SavedRequest>({
    action: "duplicate_request", collection_id: collectionId, request_id: requestId,
  }, true));
}

export async function deleteRequestFromCollection(collectionId: string, requestId: string): Promise<void> {
  await mutate({ action: "delete_request", collection_id: collectionId, request_id: requestId });
}

export async function reorderItems(collectionId: string, items: OrderItem[]): Promise<void> {
  await mutate({ action: "reorder", collection_id: collectionId, items });
}
