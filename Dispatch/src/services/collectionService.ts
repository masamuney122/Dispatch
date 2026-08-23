import { invoke } from "@tauri-apps/api/core";
import type { ApiRequest } from "../types/request";
import type { Collection, Folder, OrderItem, SavedRequest } from "../types/collection";

// ── Collection ────────────────────────────────────────────────────────────────

export const listCollections = () => invoke<Collection[]>("list_collections");

export const createCollection = (name: string) =>
  invoke<Collection>("create_collection", { name });

export const deleteCollection = (id: string) =>
  invoke<void>("delete_collection", { id });

export const renameCollection = (id: string, name: string) =>
  invoke<void>("rename_collection", { id, name });

// ── Folder ────────────────────────────────────────────────────────────────────

export const createFolder = (
  collectionId: string,
  name: string,
  parentFolderId?: string | null
) =>
  invoke<Folder>("create_folder", {
    collectionId,
    name,
    parentFolderId: parentFolderId ?? null,
  });

export const renameFolder = (
  collectionId: string,
  folderId: string,
  name: string
) => invoke<void>("rename_folder", { collectionId, folderId, name });

export const deleteFolder = (collectionId: string, folderId: string) =>
  invoke<void>("delete_folder", { collectionId, folderId });

export const duplicateFolder = (collectionId: string, folderId: string) =>
  invoke<Folder>("duplicate_folder", { collectionId, folderId });

// ── Request ───────────────────────────────────────────────────────────────────

export const createRequestInCollection = (
  collectionId: string,
  folderId: string | null,
  name: string
) =>
  invoke<SavedRequest>("create_request_in_collection", {
    collectionId,
    folderId,
    name,
  });

export const saveRequestToCollection = (
  collectionId: string,
  name: string,
  request: ApiRequest,
  folderId?: string | null
) =>
  invoke<SavedRequest>("save_request_to_collection", {
    collectionId,
    name,
    request,
    folderId: folderId ?? null,
  });

export const updateRequestInCollection = (
  collectionId: string,
  requestId: string,
  name: string,
  request: ApiRequest
) =>
  invoke<SavedRequest>("update_request_in_collection", {
    collectionId,
    requestId,
    name,
    request,
  });

export const renameRequestInCollection = (
  collectionId: string,
  requestId: string,
  name: string
) =>
  invoke<SavedRequest>("rename_request_in_collection", {
    collectionId,
    requestId,
    name,
  });

export const duplicateRequestInCollection = (
  collectionId: string,
  requestId: string
) =>
  invoke<SavedRequest>("duplicate_request_in_collection", {
    collectionId,
    requestId,
  });

export const deleteRequestFromCollection = (
  collectionId: string,
  requestId: string
) => invoke<void>("delete_request_from_collection", { collectionId, requestId });

// ── Reorder ───────────────────────────────────────────────────────────────────

export const reorderItems = (collectionId: string, items: OrderItem[]) =>
  invoke<void>("reorder_items", { collectionId, items });
