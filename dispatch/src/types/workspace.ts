import type { Collection } from "./collection";
import type { Environment } from "./environment";

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

export interface WorkspaceSession {
  root_path: string;
  manifest: WorkspaceManifest;
}

export interface RecentWorkspace {
  id: string;
  name: string;
  path: string;
  last_opened_at: string;
  token?: string;
}

export interface WorkspaceLocation {
  label: string;
  token: string;
}

export type ArchiveMode = "backup" | "safe_share";

export interface ArchivePreview {
  workspace_name: string;
  collection_count: number;
  environment_count: number;
  mode: ArchiveMode;
}

export interface PlatformCapabilities {
  desktop: boolean;
  nativeWindow: boolean;
  workspaceArchive: boolean;
  advancedHttpSettings: boolean;
}
