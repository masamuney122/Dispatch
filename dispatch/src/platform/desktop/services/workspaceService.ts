import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  ArchiveMode,
  ArchivePreview,
  RecentWorkspace,
  WorkspaceLocation,
  WorkspaceSession,
} from "../../../types/workspace";

export const supportsWorkspaceArchive = true;

export function getCurrentWorkspace(): Promise<WorkspaceSession | null> {
  return invoke<WorkspaceSession | null>("get_current_workspace");
}

export function listRecentWorkspaces(): Promise<RecentWorkspace[]> {
  return invoke<RecentWorkspace[]>("list_recent_workspaces").then((items) =>
    items.map((item) => ({ ...item, token: item.path })),
  );
}

export async function chooseWorkspaceDirectory(mode: "open" | "create"): Promise<WorkspaceLocation | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: mode === "create" ? "Select an empty workspace folder" : "Select a Dispatch workspace folder",
  });
  return typeof selected === "string" ? { label: selected, token: selected } : null;
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

export async function exportWorkspaceArchive(mode: ArchiveMode, workspaceName: string): Promise<void> {
  const path = await save({
    title: mode === "safe_share" ? "Save Safe Share archive" : "Save workspace backup",
    defaultPath: `${workspaceName.replace(/[^a-zA-Z0-9._-]+/g, "-")}.dispatch`,
    filters: [{ name: "Dispatch Workspace", extensions: ["dispatch"] }],
  });
  if (path) await invoke<void>("export_workspace_archive", { path, mode });
}

export async function chooseWorkspaceArchive(): Promise<WorkspaceLocation | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Select a Dispatch archive",
    filters: [{ name: "Dispatch Workspace", extensions: ["dispatch"] }],
  });
  return typeof selected === "string" ? { label: selected, token: selected } : null;
}

export async function chooseImportDestination(): Promise<WorkspaceLocation | null> {
  const selected = await open({
    multiple: false,
    directory: true,
    title: "Select the parent folder for the workspace",
  });
  return typeof selected === "string" ? { label: selected, token: selected } : null;
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
