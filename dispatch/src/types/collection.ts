import type { ApiRequest } from "./request";

/**
 * A folder inside a collection. Folders can be nested via parent_folder_id.
 * NOTE: All fields use snake_case to match Tauri's default JSON serialization.
 */
export interface Folder {
  id: string;
  name: string;
  collection_id: string;
  /** null/undefined → collection root, string → nested inside that folder */
  parent_folder_id?: string | null;
  /** Sort order within the same parent level. Lower = higher in list. */
  order: number;
  created_at: string;
  updated_at: string;
}

export interface SavedRequest {
  id: string;
  name: string;
  request: ApiRequest;
  /** null/undefined → collection root, string → inside that folder */
  folder_id?: string | null;
  /** Sort order within the same parent level. */
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  name: string;
  /** Flat list of all folders in the collection. Tree is built on the frontend. */
  folders: Folder[];
  requests: SavedRequest[];
  created_at: string;
  updated_at: string;
}

/** Used to atomically update order + parent after drag-and-drop. */
export interface OrderItem {
  id: string;
  /** "folder" | "request" */
  item_type: string;
  parent_folder_id: string | null;
  order: number;
}
