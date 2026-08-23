export interface WorkspaceManifest {
  format: "dispatch-workspace";
  schema_version: number;
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  name: string;
  collection_id: string;
  parent_folder_id?: string | null;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface SavedRequest {
  id: string;
  name: string;
  request: Record<string, unknown>;
  folder_id?: string | null;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  name: string;
  folders: Folder[];
  requests: SavedRequest[];
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  workspace_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CollectionsDocument {
  schema_version: number;
  workspace_id: string;
  revision: number;
  updated_at: string;
  collections: Collection[];
}

export interface EnvironmentsDocument {
  schema_version: number;
  workspace_id: string;
  revision: number;
  updated_at: string;
  environments: Environment[];
}

export interface WorkspaceBundle {
  manifest: WorkspaceManifest;
  collections: CollectionsDocument;
  environments: EnvironmentsDocument;
}

export interface OpenWorkspace {
  directory: FileSystemDirectoryHandle;
  bundle: WorkspaceBundle;
}

export interface RecentWorkspaceRecord {
  id: string;
  name: string;
  directoryName: string;
  lastOpenedAt: string;
  handle: FileSystemDirectoryHandle;
}

