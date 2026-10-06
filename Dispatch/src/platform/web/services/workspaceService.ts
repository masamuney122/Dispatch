import {
  chooseWorkspaceDirectory as pickWorkspaceDirectory,
  createWorkspaceDirectory,
  openWorkspaceDirectory,
} from "../adapters/fileSystem/workspaceFileSystem";
import {
  listRecentWorkspaces as readRecentWorkspaces,
  saveRecentWorkspace,
} from "../adapters/indexedDb/recentWorkspaces";
import type { OpenWorkspace } from "../types/workspace";
import type {
  ArchiveMode,
  ArchivePreview,
  RecentWorkspace,
  WorkspaceLocation,
  WorkspaceSession,
} from "../../../types/workspace";
import { getActiveWorkspace, setActiveWorkspace } from "./workspaceRuntime";

export const supportsWorkspaceArchive = false;

const handles = new Map<string, FileSystemDirectoryHandle>();

function session(workspace: OpenWorkspace): WorkspaceSession {
  return {
    root_path: workspace.directory.name,
    manifest: workspace.bundle.manifest,
  };
}

function rememberHandle(handle: FileSystemDirectoryHandle, token: string = crypto.randomUUID()): string {
  handles.set(token, handle);
  return token;
}

function handleFor(token: string): FileSystemDirectoryHandle {
  const handle = handles.get(token);
  if (!handle) throw new Error("Workspace folder permission was not found. Select the folder again.");
  return handle;
}

export async function getCurrentWorkspace(): Promise<WorkspaceSession | null> {
  try {
    return session(getActiveWorkspace());
  } catch {
    return null;
  }
}

export async function listRecentWorkspaces(): Promise<RecentWorkspace[]> {
  const recents = await readRecentWorkspaces();
  return recents.map((recent) => {
    const token = rememberHandle(recent.handle, `recent:${recent.id}`);
    return {
      id: recent.id,
      name: recent.name,
      path: recent.directoryName,
      last_opened_at: recent.lastOpenedAt,
      token,
    };
  });
}

export async function chooseWorkspaceDirectory(
  _mode: "open" | "create",
): Promise<WorkspaceLocation | null> {
  void _mode;
  try {
    const directory = await pickWorkspaceDirectory();
    return { label: directory.name, token: rememberHandle(directory) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export async function createWorkspace(token: string, name: string): Promise<WorkspaceSession> {
  const workspace = await createWorkspaceDirectory(handleFor(token), name);
  setActiveWorkspace(workspace);
  await saveRecentWorkspace(workspace.directory, workspace.bundle);
  return session(workspace);
}

export async function openWorkspace(token: string): Promise<WorkspaceSession> {
  const workspace = await openWorkspaceDirectory(handleFor(token));
  setActiveWorkspace(workspace);
  await saveRecentWorkspace(workspace.directory, workspace.bundle);
  return session(workspace);
}

export async function closeWorkspace(): Promise<void> {
  setActiveWorkspace(null);
}

export async function exportWorkspaceArchive(_mode: ArchiveMode, _workspaceName: string): Promise<void> {
  void _mode;
  void _workspaceName;
  throw new Error("Exporting .dispatch archives is not supported in the web version.");
}

export async function chooseWorkspaceArchive(): Promise<WorkspaceLocation | null> {
  return null;
}

export async function chooseImportDestination(): Promise<WorkspaceLocation | null> {
  return null;
}

export async function inspectWorkspaceArchive(_token: string): Promise<ArchivePreview> {
  void _token;
  throw new Error("Importing .dispatch archives is not supported in the web version.");
}

export async function importWorkspaceArchive(
  _archiveToken: string,
  _destinationToken: string,
  _workspaceName?: string,
): Promise<WorkspaceSession> {
  void _archiveToken;
  void _destinationToken;
  void _workspaceName;
  throw new Error("Importing .dispatch archives is not supported in the web version.");
}
