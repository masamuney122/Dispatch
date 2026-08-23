import { useCallback, useEffect, useState } from "react";
import {
  closeWorkspace,
  createWorkspace,
  getCurrentWorkspace,
  importWorkspaceArchive,
  listRecentWorkspaces,
  openWorkspace,
} from "../services/workspaceService";
import type { RecentWorkspace, WorkspaceSession } from "../types/workspace";
import { flushWorkspaceChanges } from "../services/workspaceLifecycle";

export function useWorkspaceSession() {
  const [workspace, setWorkspace] = useState<WorkspaceSession | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRecents = useCallback(async () => {
    const recents = await listRecentWorkspaces();
    setRecentWorkspaces(recents);
  }, []);

  useEffect(() => {
    Promise.all([getCurrentWorkspace(), listRecentWorkspaces()])
      .then(([current, recents]) => {
        setWorkspace(current);
        setRecentWorkspaces(recents);
      })
      .catch((reason: unknown) => {
        setError(toMessage(reason));
      })
      .finally(() => setLoading(false));
  }, []);

  const create = async (path: string, name: string) => {
    setError(null);
    const session = await createWorkspace(path, name);
    setWorkspace(session);
    await refreshRecents();
  };

  const open = async (path: string) => {
    setError(null);
    const session = await openWorkspace(path);
    setWorkspace(session);
    await refreshRecents();
  };

  const importArchive = async (
    archivePath: string,
    destinationParent: string,
    workspaceName?: string
  ) => {
    setError(null);
    const session = await importWorkspaceArchive(
      archivePath,
      destinationParent,
      workspaceName
    );
    setWorkspace(session);
    await refreshRecents();
  };

  const close = async () => {
    setError(null);
    await flushWorkspaceChanges();
    await closeWorkspace();
    setWorkspace(null);
  };

  return {
    workspace,
    recentWorkspaces,
    loading,
    error,
    setError,
    create,
    open,
    importArchive,
    close,
  };
}

function toMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : "Workspace operation failed.";
}
