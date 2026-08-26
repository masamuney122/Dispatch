import { useState, useRef, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Collection, OrderItem, SavedRequest } from "../../types/collection";
import type { Environment } from "../../types/environment";
import type { HistoryItem } from "../../types/history";
import { MethodBadge } from "../common/MethodBadge";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import { EnvironmentSidebarSection } from "../environment/EnvironmentSidebarSection";
import {
  CollectionTreeNode,
  type TreeDropIndicator,
  type TreeDropIntent,
} from "./CollectionTreeNode";
import { FolderContextMenu } from "./FolderContextMenu";
import { RequestContextMenu } from "./RequestContextMenu";
import { deleteHistoryItem } from "../../services/historyService";
import {
  buildCollectionTree,
  flattenTreeToOrderItems,
  getDescendantFolderIds,
  reorderTree,
  type TreeNode,
} from "../../utils/collectionTree";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExplorerSidebarProps {
  width: number;
  mode: "collections" | "history";
  onSelectMode: (mode: "collections" | "history") => void;
  collections: Collection[];
  onCreateCollection: (name: string) => Promise<void>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onExportCollectionOpenApi: (collection: Collection) => void;
  onSelectSavedRequest: (item: SavedRequest) => void;
  selectedSavedRequestId: string | null;
  history: HistoryItem[];
  onSelectHistory: (item: HistoryItem) => void;
  onClearHistory: () => void;
  selectedHistoryId: string | null;
  environments: Environment[];
  activeEnvironmentId: string | null;
  onOpenEnvironment: (environment: Environment) => void;
  onCreateEnvironment: (name: string, variables: Record<string, string>) => Promise<Environment>;
  onUpdateEnvironment: (id: string, name: string, variables: Record<string, string>) => void;
  onDeleteEnvironment: (id: string) => Promise<void>;
  searchQuery: string;
  onCreateFolder: (collectionId: string, name: string, parentFolderId: string | null) => Promise<void>;
  onRenameFolder: (collectionId: string, folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (collectionId: string, folderId: string) => Promise<void>;
  onDuplicateFolder: (collectionId: string, folderId: string) => Promise<void>;
  onCreateRequest: (collectionId: string, folderId: string | null) => Promise<SavedRequest>;
  onRenameRequest: (collectionId: string, requestId: string, name: string) => Promise<void>;
  onDuplicateRequest: (collectionId: string, requestId: string) => Promise<void>;
  onDeleteRequest: (collectionId: string, requestId: string) => Promise<void>;
  onReorderItems: (collectionId: string, items: OrderItem[]) => Promise<void>;
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

const DeleteFolderConfirm: React.FC<{
  folderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ folderName, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div className="w-full max-w-md rounded-xl border border-[#414141] bg-[#242424] shadow-2xl p-7">
      <h2 className="text-base font-bold text-zinc-100 mb-3">Delete Folder</h2>
      <p className="text-sm text-zinc-400 mb-6">
        <span className="text-zinc-200 font-medium">"{folderName}"</span> contains requests or
        subfolders. All contents will be permanently removed. This cannot be undone.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="rounded-lg text-sm font-semibold text-zinc-300 hover:text-white hover:bg-[#2a2a2a] transition-colors px-5 py-2"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-red-600 hover:bg-red-500 text-sm font-bold text-white shadow-lg transition-colors px-5 py-2"
        >
          Delete All
        </button>
      </div>
    </div>
  </div>
);

// ── Drag preview (overlay) ────────────────────────────────────────────────────

const DragPreview: React.FC<{ label: string; isFolder: boolean; method?: string }> = ({
  label,
  isFolder,
  method,
}) => (
  <div className="flex items-center gap-2 rounded-md bg-[#2a2a2a] border border-[#444] px-3 py-2 shadow-xl text-xs text-zinc-200 opacity-90 max-w-[220px]">
    {isFolder ? (
      <svg className="w-3.5 h-3.5 shrink-0 text-amber-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ) : (
      method && <MethodBadge method={method} />
    )}
    <span className="truncate font-medium">{label}</span>
  </div>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllNodeIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      ids.push(node.folder.id);
      ids.push(...getAllNodeIds(node.children));
    } else {
      ids.push(node.request.id);
    }
  }
  return ids;
}

const FOLDER_EDGE_RATIO = 0.25;
const SIDEBAR_SCROLL_EDGE_PX = 48;
const SIDEBAR_SCROLL_MAX_SPEED = 10;

type DragPositionEvent = Pick<
  DragMoveEvent,
  "active" | "over"
>;

function calculateDropIntent(
  pointerY: number,
  targetRect: { top: number; height: number },
  targetIsFolder: boolean
): TreeDropIntent {
  const relativeY = Math.min(
    1,
    Math.max(0, (pointerY - targetRect.top) / targetRect.height)
  );

  if (!targetIsFolder) {
    return relativeY < 0.5 ? "before" : "after";
  }

  if (relativeY < FOLDER_EDGE_RATIO) return "before";
  if (relativeY > 1 - FOLDER_EDGE_RATIO) return "after";
  return "inside";
}

// ── Main component ────────────────────────────────────────────────────────────

export const ExplorerSidebar: React.FC<ExplorerSidebarProps> = ({
  width,
  mode,
  onSelectMode,
  collections,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onExportCollectionOpenApi,
  onSelectSavedRequest,
  selectedSavedRequestId,
  history,
  onSelectHistory,
  onClearHistory,
  selectedHistoryId,
  environments,
  activeEnvironmentId,
  onOpenEnvironment,
  onCreateEnvironment,
  onUpdateEnvironment,
  onDeleteEnvironment,
  searchQuery,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  onCreateRequest,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
  onReorderItems,
}) => {
  // ── Expand/collapse state ──────────────────────────────────────────────────
  const [collectionsHeaderOpen, setCollectionsHeaderOpen] = useState(true);
  const [openCollectionIds, setOpenCollectionIds] = useState<Record<string, boolean>>({});
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [openFolderIds, setOpenFolderIds] = useState<Record<string, boolean>>({});
  const [openHistoryDateGroups, setOpenHistoryDateGroups] = useState<Record<string, boolean>>({});
  const [historyContextMenu, setHistoryContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [collectionContextMenu, setCollectionContextMenu] = useState<{
    collectionId: string;
    x: number;
    y: number;
  } | null>(null);

  // ── Create/rename collection ───────────────────────────────────────────────
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState("");

  // ── Create root folder ─────────────────────────────────────────────────────
  const [creatingFolderInCollectionId, setCreatingFolderInCollectionId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const newRootFolderFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (creatingFolderInCollectionId === null) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (newRootFolderFormRef.current?.contains(event.target as Node)) return;
      setCreatingFolderInCollectionId(null);
      setNewFolderName("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [creatingFolderInCollectionId]);

  // ── Delete confirmation ────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{
    collectionId: string;
    folderId: string;
    folderName: string;
  } | null>(null);

  // ── DnD state ─────────────────────────────────────────────────────────────
  const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
  const [dropIndicator, setDropIndicator] = useState<TreeDropIndicator | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const autoExpandTimer = useRef<{
    folderId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const edgeScrollFrame = useRef<number | null>(null);
  const edgeScrollSpeed = useRef(0);
  const pointerClientY = useRef<number | null>(null);

  // DnD sensors: 8px movement threshold so normal clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const stopEdgeScroll = useCallback(() => {
    edgeScrollSpeed.current = 0;
    if (edgeScrollFrame.current !== null) {
      cancelAnimationFrame(edgeScrollFrame.current);
      edgeScrollFrame.current = null;
    }
  }, []);

  const setEdgeScroll = useCallback((speed: number) => {
    edgeScrollSpeed.current = speed;
    if (speed === 0) {
      stopEdgeScroll();
      return;
    }
    if (edgeScrollFrame.current !== null) return;

    const tick = () => {
      const container = sidebarScrollRef.current;
      const currentSpeed = edgeScrollSpeed.current;
      if (!container || currentSpeed === 0) {
        edgeScrollFrame.current = null;
        return;
      }

      const previousScrollTop = container.scrollTop;
      container.scrollTop += currentSpeed;
      if (container.scrollTop === previousScrollTop) {
        edgeScrollSpeed.current = 0;
        edgeScrollFrame.current = null;
        return;
      }
      edgeScrollFrame.current = requestAnimationFrame(tick);
    };

    edgeScrollFrame.current = requestAnimationFrame(tick);
  }, [stopEdgeScroll]);

  const clearAutoExpandTimer = useCallback(() => {
    if (autoExpandTimer.current) {
      clearTimeout(autoExpandTimer.current.timer);
      autoExpandTimer.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopEdgeScroll();
    clearAutoExpandTimer();
  }, [clearAutoExpandTimer, stopEdgeScroll]);

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      pointerClientY.current = event.clientY;
    };
    window.addEventListener("pointermove", trackPointer, { capture: true, passive: true });
    return () => window.removeEventListener("pointermove", trackPointer, { capture: true });
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const isCollectionExpanded = (id: string) => openCollectionIds[id] !== false;

  const toggleCollectionOpen = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenCollectionIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  const toggleFolder = useCallback((folderId: string) => {
    setOpenFolderIds((prev) => ({
      ...prev,
      [folderId]: prev[folderId] === undefined ? false : !prev[folderId],
    }));
  }, []);

  const effectiveSearch = searchQuery.toLowerCase();

  const filteredCollections = collections.filter(
    (c) =>
      !effectiveSearch ||
      c.name.toLowerCase().includes(effectiveSearch) ||
      c.requests.some((r) =>
        [r.name, r.request.url, r.request.method].some((v) =>
          v.toLowerCase().includes(effectiveSearch)
        )
      )
  );

  const filteredHistory = history.filter(
    (item) =>
      !effectiveSearch ||
      [item.url, item.method].some((value) =>
        value.toLowerCase().includes(effectiveSearch)
      )
  );

  // ── Collection create/rename ───────────────────────────────────────────────

  const handleCreateCollection = async () => {
    await onCreateCollection("New Collection");
    setCollectionsHeaderOpen(true);
  };

  const startRenamingCollection = (c: Collection) => {
    setEditingCollectionId(c.id);
    setEditingCollectionName(c.name);
  };

  const finishRenamingCollection = async (collection: Collection) => {
    if (!editingCollectionName || editingCollectionName.trim() === "") {
      setEditingCollectionId(null);
      return;
    }
    await onRenameCollection(collection.id, editingCollectionName.trim());
    setEditingCollectionId(null);
  };

  const refreshHistory = () => window.dispatchEvent(new Event("history-updated"));

  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteHistoryItem(id);
      setHistoryContextMenu(null);
      refreshHistory();
    } catch (err) {
      console.error("Failed to delete history item:", err);
    }
  };

  const copyHistoryRequest = (item: HistoryItem) => {
    void navigator.clipboard.writeText(
      JSON.stringify(
        {
          method: item.method,
          url: item.url,
          body: item.body,
          auth: item.auth,
        },
        null,
        2
      )
    );
  };

  // ── Root folder create ─────────────────────────────────────────────────────

  const handleCreateRootFolder = async (e: React.FormEvent, collectionId: string) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await onCreateFolder(collectionId, trimmed, null);
    setNewFolderName("");
    setCreatingFolderInCollectionId(null);
  };

  // ── Delete folder ─────────────────────────────────────────────────────────

  const handleDeleteFolderRequest = (
    collectionId: string,
    folderId: string,
    hasChildren: boolean
  ) => {
    if (hasChildren) {
      const col = collections.find((c) => c.id === collectionId);
      const folder = col?.folders.find((f) => f.id === folderId);
      setDeleteConfirm({
        collectionId,
        folderId,
        folderName: folder?.name ?? "this folder",
      });
    } else {
      void onDeleteFolder(collectionId, folderId);
    }
  };

  const confirmDeleteFolder = () => {
    if (!deleteConfirm) return;
    void onDeleteFolder(deleteConfirm.collectionId, deleteConfirm.folderId);
    setDeleteConfirm(null);
  };

  // ── Create request handler ─────────────────────────────────────────────────

  const handleCreateRequestInFolder = async (
    collectionId: string,
    folderId: string | null
  ) => {
    const saved = await onCreateRequest(collectionId, folderId);
    onSelectSavedRequest(saved);
  };

  // ── DnD handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const collectionId = active.data.current?.collectionId as string;
    if ("clientY" in event.activatorEvent) {
      pointerClientY.current = (event.activatorEvent as PointerEvent).clientY;
    }
    setDropIndicator(null);
    stopEdgeScroll();
    clearAutoExpandTimer();

    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;

    const tree = buildCollectionTree(collection);
    // Find dragged node
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.type === "folder" && n.folder.id === active.id) return n;
        if (n.type === "request" && n.request.id === active.id) return n;
        if (n.type === "folder") {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    setDraggedNode(findNode(tree));
  };

  const getDropIndicator = (
    event: DragPositionEvent
  ): TreeDropIndicator | null => {
    const { active, over } = event;
    if (!over || active.id === over.id) return null;

    const collectionId = active.data.current?.collectionId as string | undefined;
    const collection = collections.find((c) => c.id === collectionId);
    const pointerY = pointerClientY.current;
    if (!collection || pointerY === null || over.rect.height <= 0) return null;

    const targetId = over.id as string;
    const targetIsFolder = collection.folders.some((folder) => folder.id === targetId);
    return {
      targetId,
      intent: calculateDropIntent(pointerY, over.rect, targetIsFolder),
    };
  };

  const updateControlledAutoScroll = (pointerY: number | null) => {
    const container = sidebarScrollRef.current;
    if (!container || pointerY === null) {
      stopEdgeScroll();
      return;
    }

    const rect = container.getBoundingClientRect();
    if (pointerY < rect.top || pointerY > rect.bottom) {
      stopEdgeScroll();
      return;
    }

    const distanceFromTop = pointerY - rect.top;
    const distanceFromBottom = rect.bottom - pointerY;
    if (distanceFromTop < SIDEBAR_SCROLL_EDGE_PX) {
      const intensity = 1 - distanceFromTop / SIDEBAR_SCROLL_EDGE_PX;
      setEdgeScroll(-Math.max(2, intensity * SIDEBAR_SCROLL_MAX_SPEED));
    } else if (distanceFromBottom < SIDEBAR_SCROLL_EDGE_PX) {
      const intensity = 1 - distanceFromBottom / SIDEBAR_SCROLL_EDGE_PX;
      setEdgeScroll(Math.max(2, intensity * SIDEBAR_SCROLL_MAX_SPEED));
    } else {
      stopEdgeScroll();
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const nextIndicator = getDropIndicator(event);
    setDropIndicator((current) =>
      current?.targetId === nextIndicator?.targetId && current?.intent === nextIndicator?.intent
        ? current
        : nextIndicator
    );
    updateAutoExpandTarget(event, nextIndicator);
    updateControlledAutoScroll(pointerClientY.current);
  };

  const updateAutoExpandTarget = (
    event: DragPositionEvent,
    indicator: TreeDropIndicator | null
  ) => {
    if (!indicator || indicator.intent !== "inside") {
      clearAutoExpandTimer();
      return;
    }

    const overId = indicator.targetId;
    const collectionId = event.active.data.current?.collectionId as string | undefined;
    const collection = collections.find((c) => c.id === collectionId);
    const isFolder = collection?.folders.some((f) => f.id === overId) ?? false;

    // Only a collapsed folder's central "inside" zone can auto-expand.
    if (!isFolder || openFolderIds[overId] !== false) {
      clearAutoExpandTimer();
      return;
    }
    if (autoExpandTimer.current?.folderId === overId) return;

    clearAutoExpandTimer();
    autoExpandTimer.current = {
      folderId: overId,
      timer: setTimeout(() => {
        setOpenFolderIds((prev) => ({ ...prev, [overId]: true }));
        autoExpandTimer.current = null;
      }, 700),
    };
  };

  const handleDragOver = (event: DragOverEvent) => {
    const nextIndicator = getDropIndicator(event);
    setDropIndicator(nextIndicator);
    updateAutoExpandTarget(event, nextIndicator);
  };

  const clearDragState = () => {
    clearAutoExpandTimer();
    stopEdgeScroll();
    setDraggedNode(null);
    setDropIndicator(null);
    pointerClientY.current = null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const finalDropIndicator = getDropIndicator(event);
    clearDragState();
    if (!over || active.id === over.id || !finalDropIndicator) return;

    const collectionId = active.data.current?.collectionId as string | undefined;
    if (!collectionId) return;
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;

    const draggedId = active.id as string;
    const overId = over.id as string;

    // Circular check: can't drop folder into its own descendant
    const draggedType = active.data.current?.type as string;
    if (draggedType === "folder") {
      const descendants = getDescendantFolderIds(collection.folders, draggedId);
      if (descendants.includes(overId) || overId === draggedId) return;
    }

    // Build updated tree
    const tree = buildCollectionTree(collection);
    const newTree = reorderTree(tree, draggedId, overId, finalDropIndicator.intent);
    const orderItems = flattenTreeToOrderItems(newTree);

    // Persist
    try {
      await onReorderItems(collectionId, orderItems);
    } catch (err) {
      console.error("Failed to reorder items:", err);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside
      className="border-r border-[#363636] bg-[#242424] flex flex-col shrink-0 select-none text-xs font-sans"
      style={{ width }}
    >
      {/* Header tabs */}
      <div className="h-8 w-full border-b border-[#363636] bg-[#242424] flex items-center justify-center px-4">
        <div className="flex items-center justify-center gap-8 text-zinc-400 font-medium text-[11px] uppercase tracking-wider w-full">
          <button
            onClick={() => onSelectMode("collections")}
            className={`transition-colors hover:text-zinc-200 ${mode === "collections" ? "text-zinc-100 font-bold" : ""}`}
          >
            Collections
          </button>
          <button
            onClick={() => onSelectMode("history")}
            className={`transition-colors hover:text-zinc-200 ${mode === "history" ? "text-zinc-100 font-bold" : ""}`}
          >
            History
          </button>
        </div>
      </div>

      <OverlayScrollArea
          containerClassName="flex min-h-0 flex-1"
          axis="vertical"
          ref={sidebarScrollRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >

        {/* ── Collections mode ──────────────────────────────────────────────── */}
        {mode === "collections" && (
          <div className="flex-1" style={{ padding: '6px' }}>
            {/* Section header */}
            <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-zinc-300 select-none pb-0 mb-[1px]">
              <div
                onClick={() => setCollectionsHeaderOpen(!collectionsHeaderOpen)}
                className="flex items-center gap-2 cursor-pointer hover:text-white"
              >
                <svg
                  className={`h-4 w-4 text-zinc-400 transition-transform ${collectionsHeaderOpen ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                <span>COLLECTIONS</span>
              </div>
              <button
                onClick={() => void handleCreateCollection()}
                className="p-1 text-zinc-400 hover:text-white hover:bg-[#282828] rounded transition-colors"
                title="Create collection"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {collectionsHeaderOpen && (
              <div className="pl-1 mt-0.5">
                {filteredCollections.length === 0 ? (
                  <div className="text-center text-zinc-500 text-xs py-6">
                    <p>No collections found.</p>
                    <button
                      onClick={() => void handleCreateCollection()}
                      className="mt-2 text-sky-400 hover:underline"
                    >
                      Create a collection
                    </button>
                  </div>
                ) : (
                  filteredCollections.map((collection) => {
                    const expanded = isCollectionExpanded(collection.id);
                    const isSelected = selectedCollectionId === collection.id;
                    const treeNodes = buildCollectionTree(collection);
                    const allIds = getAllNodeIds(treeNodes);

                    return (
                      <div key={collection.id} className="mb-0.5">
                        {/* Collection header row */}
                        <div
                          onClick={(e) => {
                            setSelectedCollectionId(collection.id);
                            toggleCollectionOpen(collection.id, e);
                          }}
                          className={`group flex min-h-[24px] items-center gap-1 rounded-md cursor-pointer transition-colors ${isSelected
                            ? "bg-[#333333] text-white"
                            : "text-zinc-300 hover:bg-[#252525]"
                            } px-1`}
                        >
                          <svg
                            className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>

                          {editingCollectionId === collection.id ? (
                            <input
                              autoFocus
                              value={editingCollectionName}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingCollectionName(e.target.value)}
                              onBlur={() => void finishRenamingCollection(collection)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setEditingCollectionId(null);
                              }}
                              className="flex-1 min-w-0 border-b border-[#637083] bg-transparent py-0.5 text-xs text-white outline-none"
                            />
                          ) : (
                            <span
                              className="flex-1 min-w-0 truncate text-xs font-medium"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRenamingCollection(collection);
                              }}
                            >
                              {collection.name}
                            </span>
                          )}

                          {editingCollectionId !== collection.id && (
                            <div className="hidden group-hover:flex shrink-0 items-center gap-0.5">
                              {/* Add Request */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleCreateRequestInFolder(collection.id, null);
                                  if (!expanded) toggleCollectionOpen(collection.id, e);
                                }}
                                className="rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-[#303030] transition-colors"
                                title="Add request"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                              {/* Context menu trigger */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCollectionContextMenu({ collectionId: collection.id, x: e.clientX, y: e.clientY });
                                }}
                                className="rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-[#303030] transition-colors"
                                title="More options"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {collectionContextMenu?.collectionId === collection.id && (
                          <FolderContextMenu
                            x={collectionContextMenu.x}
                            y={collectionContextMenu.y}
                            onClose={() => setCollectionContextMenu(null)}
                            onAddRequest={() => {
                              void handleCreateRequestInFolder(collection.id, null);
                              if (!expanded) {
                                setOpenCollectionIds((prev) => ({ ...prev, [collection.id]: true }));
                              }
                            }}
                            onAddFolder={() => {
                              setCreatingFolderInCollectionId(collection.id);
                              setNewFolderName("");
                              if (!expanded) {
                                setOpenCollectionIds((prev) => ({ ...prev, [collection.id]: true }));
                              }
                            }}
                            onRename={() => startRenamingCollection(collection)}
                            onExportOpenApi={() => onExportCollectionOpenApi(collection)}
                            onDelete={() => void onDeleteCollection(collection.id)}
                          />
                        )}

                        {/* Tree content */}
                        {expanded && (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            autoScroll={false}
                            onDragStart={handleDragStart}
                            onDragMove={handleDragMove}
                            onDragOver={handleDragOver}
                            onDragEnd={(e) => void handleDragEnd(e)}
                            onDragCancel={clearDragState}
                          >
                            <SortableContext
                              items={allIds}
                              strategy={verticalListSortingStrategy}
                            >
                              <div
                                className="border-l border-[#2e2e2e] ml-[10px] pl-0.5 mt-0.5 mb-0.5"
                              >
                                {/* Inline root-folder creation */}
                                {creatingFolderInCollectionId === collection.id && (
                                  <form
                                    ref={newRootFolderFormRef}
                                    onSubmit={(e) => void handleCreateRootFolder(e, collection.id)}
                                    className="flex gap-1.5 items-center px-1 py-1 mb-1"
                                  >
                                    <input
                                      autoFocus
                                      value={newFolderName}
                                      onChange={(e) => setNewFolderName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setCreatingFolderInCollectionId(null);
                                          setNewFolderName("");
                                        }
                                      }}
                                      placeholder="Folder name"
                                      className="flex-1 min-w-0 bg-[#292929] border border-[#404040] rounded text-xs text-zinc-100 focus:outline-none focus:border-[#555] px-2 py-1"
                                    />
                                    <button
                                      type="submit"
                                      className="rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2 py-1"
                                    >
                                      Add
                                    </button>
                                  </form>
                                )}

                                {treeNodes.length > 0 && (
                                  treeNodes.map((node) => (
                                    <CollectionTreeNode
                                      key={node.type === "folder" ? node.folder.id : node.request.id}
                                      node={node}
                                      depth={0}
                                      collectionId={collection.id}
                                      selectedSavedRequestId={selectedSavedRequestId}
                                      openFolderIds={openFolderIds}
                                      onToggleFolder={toggleFolder}
                                      onSelectRequest={onSelectSavedRequest}
                                      onCreateFolder={onCreateFolder}
                                      onRenameFolder={onRenameFolder}
                                      onDeleteFolder={handleDeleteFolderRequest}
                                      onDuplicateFolder={onDuplicateFolder}
                                      onCreateRequest={handleCreateRequestInFolder}
                                      onRenameRequest={onRenameRequest}
                                      onDuplicateRequest={onDuplicateRequest}
                                      onDeleteRequest={onDeleteRequest}
                                      dropIndicator={dropIndicator}
                                    />
                                  ))
                                )}
                              </div>
                            </SortableContext>

                            <DragOverlay>
                              {draggedNode ? (
                                <DragPreview
                                  isFolder={draggedNode.type === "folder"}
                                  label={
                                    draggedNode.type === "folder"
                                      ? draggedNode.folder.name
                                      : draggedNode.request.name || "Request"
                                  }
                                  method={
                                    draggedNode.type === "request"
                                      ? draggedNode.request.request.method
                                      : undefined
                                  }
                                />
                              ) : null}
                            </DragOverlay>
                          </DndContext>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ── History mode ──────────────────────────────────────────────────── */}
        {mode === "history" && (
          <div className="flex-1" style={{ padding: '6px' }}>
            <div className="mb-[1px] flex items-center justify-between gap-3 select-none text-[11px] font-bold tracking-wider text-zinc-300">
              <span>REQUEST HISTORY</span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="shrink-0 rounded p-1 text-[10px] font-semibold normal-case tracking-normal text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Clear History"
                >
                  Clear History
                </button>
              )}
            </div>
            {filteredHistory.length === 0 ? (
              <div className="text-center text-zinc-500 text-xs py-6">
                <p>No requests in history.</p>
              </div>
            ) : (
              (() => {
                const groups: Record<string, HistoryItem[]> = {};
                filteredHistory.forEach((item) => {
                  let g = "Recent";
                  if (item.timestamp) {
                    const d = new Date(item.timestamp);
                    if (!isNaN(d.getTime())) {
                      g = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    }
                  }
                  (groups[g] ??= []).push(item);
                });

                return (
                  <div className="mt-0.5 pl-1">
                    {Object.entries(groups).map(([label, items]) => {
                      const expanded = openHistoryDateGroups[label] !== false;
                      return (
                    <div key={label} className="mb-0.5">
                      <div
                        onClick={() =>
                          setOpenHistoryDateGroups((prev) => ({
                            ...prev,
                            [label]: prev[label] === undefined ? false : !prev[label],
                          }))
                        }
                        className="flex min-h-[24px] cursor-pointer select-none items-center gap-1 rounded-md px-1 text-xs font-medium text-zinc-300 hover:bg-[#252525] hover:text-white"
                      >
                        <svg
                          className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        <span>{label}</span>
                      </div>

                      {expanded && (
                        <div className="relative">
                          {/* Vertical guide line */}
                          <div className="absolute bottom-0 left-[10px] top-0 w-px bg-[#2e2e2e]" />

                          {items.map((item) => {
                            const isSel = selectedHistoryId === item.id;
                            return (
                              <div
                                key={item.id}
                                onClick={() => onSelectHistory(item)}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setHistoryContextMenu({ id: item.id, x: event.clientX, y: event.clientY });
                                }}
                                className={`group relative z-10 flex min-h-[23px] w-full cursor-pointer items-center justify-between gap-1 rounded-md text-left transition-colors ${isSel
                                  ? "bg-[#333333] text-white"
                                  : "text-zinc-300 hover:bg-[#252525]"
                                  }`}
                                style={{ paddingLeft: '22px', paddingRight: '6px' }}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <MethodBadge method={item.method} compact />
                                  <span className="truncate font-sans text-[11px]">{item.url}</span>
                                </div>
                                <div className={`${isSel ? "flex" : "hidden group-hover:flex"} shrink-0 items-center gap-0.5`}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHistoryContextMenu(
                                        historyContextMenu?.id === item.id
                                          ? null
                                          : { id: item.id, x: e.clientX, y: e.clientY }
                                      );
                                    }}
                                    className="rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-[#303030] transition-colors"
                                    title="Options"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </OverlayScrollArea>

      <EnvironmentSidebarSection
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        searchQuery={searchQuery}
        onCreate={onCreateEnvironment}
        onOpen={onOpenEnvironment}
        onRename={onUpdateEnvironment}
        onDelete={onDeleteEnvironment}
      />

      {deleteConfirm && (
        <DeleteFolderConfirm
          folderName={deleteConfirm.folderName}
          onConfirm={confirmDeleteFolder}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {historyContextMenu && (
        <RequestContextMenu
          x={historyContextMenu.x}
          y={historyContextMenu.y}
          onClose={() => setHistoryContextMenu(null)}
          onCopy={() => {
            const item = history.find((entry) => entry.id === historyContextMenu.id);
            if (item) copyHistoryRequest(item);
          }}
          onDelete={() => void handleDeleteHistory(historyContextMenu.id)}
        />
      )}
    </aside>
  );
};
