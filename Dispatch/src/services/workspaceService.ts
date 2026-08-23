import { invoke } from "@tauri-apps/api/core";
import type {
  ArchiveMode,
  ArchivePreview,
  RecentWorkspace,
  WorkspaceSession,
} from "../types/workspace";

export function getCurrentWorkspace(): Promise<WorkspaceSession | null> {
  return invoke<WorkspaceSession | null>("get_current_workspace");
}

export function listRecentWorkspaces(): Promise<RecentWorkspace[]> {
  return invoke<RecentWorkspace[]>("list_recent_workspaces");
}

export function createWorkspace(path: string, name: string): Promise<WorkspaceSession> {
  return invoke<WorkspaceSession>("create_workspace", { path, name });
}

export function openWorkspace(path: string): Promise<WorkspaceSession> {
  return invoke<WorkspaceSession>("open_workspace", { path });
}

export function closeWorkspace(): Promise<void> {
  return invoke<void>("close_workspace");
}

export function exportWorkspaceArchive(path: string, mode: ArchiveMode): Promise<void> {
  return invoke<void>("export_workspace_archive", { path, mode });
}

export function inspectWorkspaceArchive(path: string): Promise<ArchivePreview> {
  return invoke<ArchivePreview>("inspect_workspace_archive", { path });
}

export function importWorkspaceArchive(
  archivePath: string,
  destinationParent: string,
  workspaceName?: string
): Promise<WorkspaceSession> {
  return invoke<WorkspaceSession>("import_workspace_archive", {
    archivePath,
    destinationParent,
    workspaceName,
  });
}
