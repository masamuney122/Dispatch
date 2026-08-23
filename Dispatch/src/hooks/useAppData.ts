import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryItem } from "../types/history";
import type { Collection, OrderItem } from "../types/collection";
import type { Environment } from "../types/environment";
import { loadHistory, clearHistory } from "../services/historyService";
import {
  createCollection,
  deleteCollection,
  listCollections,
  createFolder,
  renameFolder,
  deleteFolder,
  duplicateFolder,
  createRequestInCollection,
  renameRequestInCollection,
  duplicateRequestInCollection,
  deleteRequestFromCollection,
  reorderItems,
} from "../services/collectionService";
import {
  createEnvironment,
  listEnvironments,
  deleteEnvironment,
  setActiveEnvironment,
  getActiveEnvironment,
  updateEnvironment,
} from "../services/environmentService";
import type { SavedRequest } from "../types/collection";
import { registerWorkspaceFlusher } from "../services/workspaceLifecycle";

/**
 * Manages application-level data that lives outside individual tabs:
 * history, collections, and environments.
 */
export function useAppData() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const environmentSaveTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );
  const environmentSaveVersions = useRef(new Map<string, number>());
  const pendingEnvironmentDrafts = useRef(
    new Map<string, { name: string; variables: Record<string, string> }>()
  );

  const flushPendingEnvironmentSaves = useCallback(async () => {
    environmentSaveTimers.current.forEach((timer) => clearTimeout(timer));
    environmentSaveTimers.current.clear();
    const drafts = [...pendingEnvironmentDrafts.current.entries()];

    await Promise.all(
      drafts.map(async ([id, draft]) => {
        const saved = await updateEnvironment(id, draft.name, draft.variables);
        pendingEnvironmentDrafts.current.delete(id);
        setEnvironments((current) =>
          current.map((environment) =>
            environment.id === saved.id ? saved : environment
          )
        );
      })
    );
  }, []);

  useEffect(
    () => registerWorkspaceFlusher(flushPendingEnvironmentSaves),
    [flushPendingEnvironmentSaves]
  );

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [histList, envList, activeEnv, collectionList] = await Promise.all([
          loadHistory(),
          listEnvironments(),
          getActiveEnvironment(),
          listCollections(),
        ]);
        setHistory(histList || []);
        setEnvironments(envList || []);
        setActiveEnvironmentId(activeEnv ? activeEnv.id : null);
        setCollections(collectionList || []);
      } catch (err) {
        console.error("Failed to load initial data from Tauri backend:", err);
      }
    };
    fetchInitialData();

    const handleHistoryUpdate = async () => {
      try {
        const histList = await loadHistory();
        setHistory(histList || []);
      } catch (err) {
        console.error("Failed to reload history:", err);
      }
    };
    window.addEventListener("history-updated", handleHistoryUpdate);
    return () => window.removeEventListener("history-updated", handleHistoryUpdate);
  }, []);

  const handleClearHistory = async () => {
    await clearHistory();
    setHistory([]);
  };

  // ── Collection handlers ───────────────────────────────────────────────────

  const handleCreateCollection = async (name: string) => {
    const collection = await createCollection(name);
    setCollections((current) => [...current, collection]);
  };

  const handleRenameCollection = async (id: string, name: string) => {
    const { renameCollection } = await import("../services/collectionService");
    await renameCollection(id, name);
    setCollections((current) =>
      current.map((c) => (c.id === id ? { ...c, name } : c))
    );
  };

  const handleDeleteCollection = async (id: string) => {
    await deleteCollection(id);
    setCollections((current) => current.filter((c) => c.id !== id));
  };

  const refreshCollections = async () => {
    const updated = await listCollections();
    setCollections(updated);
  };

  // ── Folder handlers ───────────────────────────────────────────────────────

  const handleCreateFolder = async (
    collectionId: string,
    name: string,
    parentFolderId?: string | null
  ) => {
    const folder = await createFolder(collectionId, name, parentFolderId);
    setCollections((current) =>
      current.map((c) =>
        c.id === collectionId
          ? { ...c, folders: [...(c.folders ?? []), folder] }
          : c
      )
    );
  };

  const handleRenameFolder = async (
    collectionId: string,
    folderId: string,
    name: string
  ) => {
    await renameFolder(collectionId, folderId, name);
    setCollections((current) =>
      current.map((c) => {
        if (c.id !== collectionId) return c;
        return {
          ...c,
          folders: (c.folders ?? []).map((f) =>
            f.id === folderId ? { ...f, name } : f
          ),
        };
      })
    );
  };

  const handleDeleteFolder = async (collectionId: string, folderId: string) => {
    await deleteFolder(collectionId, folderId);
    await refreshCollections();
  };

  const handleDuplicateFolder = async (
    collectionId: string,
    folderId: string
  ) => {
    await duplicateFolder(collectionId, folderId);
    await refreshCollections();
  };

  // ── Request handlers ──────────────────────────────────────────────────────

  /**
   * Creates a blank GET request inside a collection (optionally in a folder).
   * Returns the new SavedRequest so the caller can open it in a tab.
   */
  const handleCreateRequest = async (
    collectionId: string,
    folderId: string | null,
    name = "New Request"
  ): Promise<SavedRequest> => {
    const saved = await createRequestInCollection(collectionId, folderId, name);
    setCollections((current) =>
      current.map((c) =>
        c.id === collectionId
          ? { ...c, requests: [...c.requests, saved] }
          : c
      )
    );
    return saved;
  };

  const handleRenameRequest = async (
    collectionId: string,
    requestId: string,
    name: string
  ) => {
    const updated = await renameRequestInCollection(collectionId, requestId, name);
    setCollections((current) =>
      current.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              requests: collection.requests.map((request) =>
                request.id === requestId ? updated : request
              ),
            }
          : collection
      )
    );
  };

  const handleDuplicateRequest = async (collectionId: string, requestId: string) => {
    await duplicateRequestInCollection(collectionId, requestId);
    await refreshCollections();
  };

  const handleDeleteRequest = async (collectionId: string, requestId: string) => {
    await deleteRequestFromCollection(collectionId, requestId);
    setCollections((current) =>
      current.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              requests: collection.requests.filter((request) => request.id !== requestId),
            }
          : collection
      )
    );
  };

  // ── Reorder handler ───────────────────────────────────────────────────────

  /**
   * Applies an ordered list of items (folders + requests) atomically.
   * Called after every drag-and-drop operation.
   */
  const handleReorderItems = async (
    collectionId: string,
    items: OrderItem[]
  ) => {
    await reorderItems(collectionId, items);
    await refreshCollections();
  };

  // ── Environment handlers ──────────────────────────────────────────────────

  const handleCreateEnvironment = async (
    name: string,
    variables: Record<string, string>
  ) => {
    const environment = await createEnvironment(name, variables);
    setEnvironments((current) => [...current, environment]);
    setEnvironmentError(null);
    return environment;
  };

  const refreshEnvironments = async () => {
    const updated = await listEnvironments();
    setEnvironments(updated || []);
  };

  const handleUpdateEnvironment = (
    id: string,
    name: string,
    variables: Record<string, string>
  ) => {
    const nextEnvironment = { id, name, variables };
    pendingEnvironmentDrafts.current.set(id, { name, variables });
    setEnvironments((current) =>
      current.map((e) =>
        e.id === id ? { ...e, name, variables } : e
      )
    );
    setEnvironmentError(null);

    const saveVersion = (environmentSaveVersions.current.get(id) || 0) + 1;
    environmentSaveVersions.current.set(id, saveVersion);
    const pendingTimer = environmentSaveTimers.current.get(id);
    if (pendingTimer) clearTimeout(pendingTimer);

    environmentSaveTimers.current.set(
      id,
      setTimeout(async () => {
        try {
          const saved = await updateEnvironment(
            nextEnvironment.id,
            nextEnvironment.name,
            nextEnvironment.variables
          );
          if (environmentSaveVersions.current.get(id) === saveVersion) {
            pendingEnvironmentDrafts.current.delete(id);
            setEnvironments((current) =>
              current.map((e) => (e.id === saved.id ? saved : e))
            );
            setEnvironmentError(null);
          }
        } catch (error) {
          if (environmentSaveVersions.current.get(id) === saveVersion) {
            setEnvironmentError(
              error instanceof Error
                ? error.message
                : "Environment changes could not be saved."
            );
          }
        } finally {
          if (environmentSaveVersions.current.get(id) === saveVersion) {
            environmentSaveTimers.current.delete(id);
          }
        }
      }, 450)
    );
  };

  const handleDeleteEnvironment = async (id: string) => {
    const pendingTimer = environmentSaveTimers.current.get(id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      environmentSaveTimers.current.delete(id);
    }
    environmentSaveVersions.current.delete(id);
    pendingEnvironmentDrafts.current.delete(id);
    await deleteEnvironment(id);
    if (activeEnvironmentId === id) {
      setActiveEnvironmentId(null);
    }
    setEnvironments((current) => current.filter((e) => e.id !== id));
    setEnvironmentError(null);
  };

  const handleSelectEnvironment = async (id: string | null) => {
    await setActiveEnvironment(id);
    setActiveEnvironmentId(id);
  };

  return {
    history,
    setHistory,
    collections,
    setCollections,
    environments,
    activeEnvironmentId,
    environmentError,
    handleClearHistory,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    refreshCollections,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleDuplicateFolder,
    handleCreateRequest,
    handleRenameRequest,
    handleDuplicateRequest,
    handleDeleteRequest,
    handleReorderItems,
    handleCreateEnvironment,
    refreshEnvironments,
    handleUpdateEnvironment,
    handleDeleteEnvironment,
    handleSelectEnvironment,
  };
}
