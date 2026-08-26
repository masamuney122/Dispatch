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
import type {
  CollectionsDocument,
  EnvironmentsDocument,
  WorkspaceManifest,
} from "../../../types/workspace";
export type {
  CollectionsDocument,
  EnvironmentsDocument,
  WorkspaceManifest,
} from "../../../types/workspace";
