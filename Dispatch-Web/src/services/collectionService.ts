import { saveCollectionsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import type { ApiRequest } from "../types/request";
import type { Collection, Folder, OrderItem, SavedRequest } from "../types/collection";
import { getActiveWorkspace, updateActiveWorkspace } from "./workspaceRuntime";

const defaultRequest = (): ApiRequest => ({
  method: "GET", url: "", body: "", body_type: "json", form_fields: [], headers: {}, auth: { type: "None" },
});

async function save(collections: Collection[]): Promise<void> {
  const workspace = getActiveWorkspace();
  const updated = await saveCollectionsDocument(workspace, { ...workspace.bundle.collections, collections });
  updateActiveWorkspace(updated);
}

export async function listCollections(): Promise<Collection[]> {
  return getActiveWorkspace().bundle.collections.collections as Collection[];
}

export async function createCollection(name: string): Promise<Collection> {
  const now = new Date().toISOString();
  const collection: Collection = { id: crypto.randomUUID(), name, folders: [], requests: [], created_at: now, updated_at: now };
  await save([...(await listCollections()), collection]);
  return collection;
}

export async function deleteCollection(id: string): Promise<void> {
  await save((await listCollections()).filter((collection) => collection.id !== id));
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  await save((await listCollections()).map((collection) => collection.id === id ? { ...collection, name, updated_at: now } : collection));
}

export async function createFolder(collectionId: string, name: string, parentFolderId?: string | null): Promise<Folder> {
  const collections = await listCollections();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) throw new Error("Collection bulunamadı.");
  const now = new Date().toISOString();
  const parent = parentFolderId ?? null;
  const order = collection.folders.filter((folder) => (folder.parent_folder_id ?? null) === parent).length;
  const folder: Folder = { id: crypto.randomUUID(), name, collection_id: collectionId, parent_folder_id: parent, order, created_at: now, updated_at: now };
  await save(collections.map((item) => item.id === collectionId ? { ...item, folders: [...item.folders, folder], updated_at: now } : item));
  return folder;
}

export async function renameFolder(collectionId: string, folderId: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  await save((await listCollections()).map((collection) => collection.id === collectionId ? { ...collection, folders: collection.folders.map((folder) => folder.id === folderId ? { ...folder, name, updated_at: now } : folder), updated_at: now } : collection));
}

function descendantFolderIds(folders: Folder[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_folder_id && ids.has(folder.parent_folder_id) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
    }
  }
  return ids;
}

export async function deleteFolder(collectionId: string, folderId: string): Promise<void> {
  const now = new Date().toISOString();
  await save((await listCollections()).map((collection) => {
    if (collection.id !== collectionId) return collection;
    const ids = descendantFolderIds(collection.folders, folderId);
    return { ...collection, folders: collection.folders.filter((folder) => !ids.has(folder.id)), requests: collection.requests.filter((request) => !request.folder_id || !ids.has(request.folder_id)), updated_at: now };
  }));
}

export async function duplicateFolder(collectionId: string, folderId: string): Promise<Folder> {
  const collections = await listCollections();
  const collection = collections.find((item) => item.id === collectionId);
  const source = collection?.folders.find((folder) => folder.id === folderId);
  if (!collection || !source) throw new Error("Klasör bulunamadı.");
  const now = new Date().toISOString();
  const sourceIds = descendantFolderIds(collection.folders, folderId);
  const idMap = new Map([...sourceIds].map((id) => [id, crypto.randomUUID()]));
  const copiedFolders = collection.folders.filter((folder) => sourceIds.has(folder.id)).map((folder) => ({
    ...folder, id: idMap.get(folder.id)!, name: folder.id === folderId ? `${folder.name} Copy` : folder.name,
    parent_folder_id: folder.id === folderId ? folder.parent_folder_id : idMap.get(folder.parent_folder_id!) ?? folder.parent_folder_id,
    created_at: now, updated_at: now,
  }));
  const copiedRequests = collection.requests.filter((request) => request.folder_id && sourceIds.has(request.folder_id)).map((request) => ({ ...request, id: crypto.randomUUID(), folder_id: idMap.get(request.folder_id!)!, created_at: now, updated_at: now }));
  await save(collections.map((item) => item.id === collectionId ? { ...item, folders: [...item.folders, ...copiedFolders], requests: [...item.requests, ...copiedRequests], updated_at: now } : item));
  return copiedFolders[0];
}

export async function createRequestInCollection(collectionId: string, folderId: string | null, name: string): Promise<SavedRequest> {
  return saveRequestToCollection(collectionId, name, defaultRequest(), folderId);
}

export async function saveRequestToCollection(collectionId: string, name: string, request: ApiRequest, folderId?: string | null): Promise<SavedRequest> {
  const collections = await listCollections();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) throw new Error("Collection bulunamadı.");
  const now = new Date().toISOString();
  const parent = folderId ?? null;
  const saved: SavedRequest = { id: crypto.randomUUID(), name, request, folder_id: parent, order: collection.requests.filter((item) => (item.folder_id ?? null) === parent).length, created_at: now, updated_at: now };
  await save(collections.map((item) => item.id === collectionId ? { ...item, requests: [...item.requests, saved], updated_at: now } : item));
  return saved;
}

export async function updateRequestInCollection(collectionId: string, requestId: string, name: string, request: ApiRequest): Promise<SavedRequest> {
  let updated: SavedRequest | undefined;
  const now = new Date().toISOString();
  const collections = (await listCollections()).map((collection) => collection.id === collectionId ? { ...collection, requests: collection.requests.map((item) => item.id === requestId ? (updated = { ...item, name, request, updated_at: now }) : item), updated_at: now } : collection);
  if (!updated) throw new Error("Request bulunamadı.");
  await save(collections);
  return updated;
}

export async function renameRequestInCollection(collectionId: string, requestId: string, name: string): Promise<SavedRequest> {
  const collections = await listCollections();
  const existing = collections.find((collection) => collection.id === collectionId)?.requests.find((request) => request.id === requestId);
  if (!existing) throw new Error("Request bulunamadı.");
  return updateRequestInCollection(collectionId, requestId, name, existing.request);
}

export async function duplicateRequestInCollection(collectionId: string, requestId: string): Promise<SavedRequest> {
  const collections = await listCollections();
  const existing = collections.find((collection) => collection.id === collectionId)?.requests.find((request) => request.id === requestId);
  if (!existing) throw new Error("Request bulunamadı.");
  return saveRequestToCollection(collectionId, `${existing.name} Copy`, existing.request, existing.folder_id);
}

export async function deleteRequestFromCollection(collectionId: string, requestId: string): Promise<void> {
  const now = new Date().toISOString();
  await save((await listCollections()).map((collection) => collection.id === collectionId ? { ...collection, requests: collection.requests.filter((request) => request.id !== requestId), updated_at: now } : collection));
}

export async function reorderItems(collectionId: string, items: OrderItem[]): Promise<void> {
  const orders = new Map(items.map((item) => [item.id, item]));
  const now = new Date().toISOString();
  await save((await listCollections()).map((collection) => collection.id === collectionId ? {
    ...collection,
    folders: collection.folders.map((folder) => { const order = orders.get(folder.id); return order ? { ...folder, parent_folder_id: order.parent_folder_id, order: order.order, updated_at: now } : folder; }),
    requests: collection.requests.map((request) => { const order = orders.get(request.id); return order ? { ...request, folder_id: order.parent_folder_id, order: order.order, updated_at: now } : request; }),
    updated_at: now,
  } : collection));
}

