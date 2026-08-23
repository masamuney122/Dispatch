export interface WorkspaceManifest {
  format: "dispatch-workspace";
  schema_version: number;
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
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

export type ArchiveMode = "backup" | "safe_share";
import type { Collection } from "./collection";
import type { Environment } from "./environment";
