export interface WorkspaceManifest {
  format: "dispatch-workspace";
  schema_version: number;
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
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
}

export type ArchiveMode = "backup" | "safe_share";

export interface ArchivePreview {
  workspace_name: string;
  collection_count: number;
  environment_count: number;
  mode: ArchiveMode;
}
