import { useEffect, useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import type { TreeNode } from "../../utils/collectionTree";
import type { SavedRequest } from "../../types/collection";
import { MethodBadge } from "../common/MethodBadge";
import { FolderContextMenu } from "./FolderContextMenu";
import { RequestContextMenu } from "./RequestContextMenu";

// ── Icons ─────────────────────────────────────────────────────────────────────

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
    fill="none" viewBox="0 0 24 24" stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
  </svg>
);

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-amber-400/80"
    fill={open ? "currentColor" : "none"}
    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
  >
    {open ? (
      <path d="M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1H2V6zM2 10v8a2 2 0 002 2h16a2 2 0 002-2V10H2z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    )}
  </svg>
);

const DotsIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

// ── Drop zone indicator ────────────────────────────────────────────────────────

export type TreeDropIntent = "before" | "inside" | "after";

export interface TreeDropIndicator {
  targetId: string;
  intent: TreeDropIntent;
}

const AdjacentDropIndicator: React.FC<{
  intent: TreeDropIntent | null;
  left: number;
}> = ({ intent, left }) => {
  if (intent !== "before" && intent !== "after") return null;
  return (
    <div
      className="absolute z-20 h-0.5 rounded-full bg-sky-400 pointer-events-none"
      style={{
        left: `${left}px`,
        right: "8px",
        [intent === "before" ? "top" : "bottom"]: "-1px",
      }}
    />
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CollectionTreeNodeProps {
  node: TreeNode;
  depth: number;
  collectionId: string;
  selectedSavedRequestId: string | null;
  openFolderIds: Record<string, boolean>;
  onToggleFolder: (folderId: string) => void;
  // Actions
  onSelectRequest: (item: SavedRequest) => void;
  onCreateFolder: (collectionId: string, name: string, parentFolderId: string | null) => Promise<void>;
  onRenameFolder: (collectionId: string, folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (collectionId: string, folderId: string, hasChildren: boolean) => void;
  onDuplicateFolder: (collectionId: string, folderId: string) => Promise<void>;
  onCreateRequest: (collectionId: string, folderId: string | null) => Promise<void>;
  onRenameRequest: (collectionId: string, requestId: string, name: string) => Promise<void>;
  onDuplicateRequest: (collectionId: string, requestId: string) => Promise<void>;
  onDeleteRequest: (collectionId: string, requestId: string) => Promise<void>;
  // DnD
  dropIndicator?: TreeDropIndicator | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CollectionTreeNode: React.FC<CollectionTreeNodeProps> = ({
  node,
  depth,
  collectionId,
  selectedSavedRequestId,
  openFolderIds,
  onToggleFolder,
  onSelectRequest,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  onCreateRequest,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
  dropIndicator,
}) => {
  const nodeId = node.type === "folder" ? node.folder.id : node.request.id;

  // DnD
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: nodeId,
    data: {
      type: node.type,
      collectionId,
      parentFolderId: node.type === "folder"
        ? (node.folder.parent_folder_id ?? null)
        : (node.request.folder_id ?? null),
    },
  });

  const style = {
    opacity: isDragging ? 0.4 : 1,
  };

  // Local state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isCreatingSubFolder, setIsCreatingSubFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const dotsRef = useRef<HTMLButtonElement>(null);
  const newSubFolderFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isCreatingSubFolder) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (newSubFolderFormRef.current?.contains(event.target as Node)) return;
      setIsCreatingSubFolder(false);
      setNewFolderName("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isCreatingSubFolder]);

  const indent = depth * 11;

  // ── Request node ──────────────────────────────────────────────────────────

  if (node.type === "request") {
    const { request } = node;
    const isSelected = selectedSavedRequestId === request.id;
    const activeDropIntent =
      dropIndicator?.targetId === nodeId ? dropIndicator.intent : null;

    const startRequestRename = () => {
      setRenameValue(request.name || "Untitled Request");
      setIsRenaming(true);
      setContextMenu(null);
    };

    const finishRequestRename = async () => {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== request.name) {
        await onRenameRequest(collectionId, request.id, trimmed);
      }
      setIsRenaming(false);
    };

    const openRequestMenu = (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY });
    };

    const openRequestMenuFromDots = (event: React.MouseEvent) => {
      event.stopPropagation();
      const rect = dotsRef.current?.getBoundingClientRect();
      setContextMenu(
        rect
          ? { x: rect.left, y: rect.bottom + 4 }
          : { x: event.clientX, y: event.clientY }
      );
    };

    const copyRequest = () => {
      void navigator.clipboard.writeText(
        JSON.stringify({ name: request.name, ...request.request }, null, 2)
      );
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative"
        {...attributes}
        {...listeners}
      >
        <AdjacentDropIndicator intent={activeDropIntent} left={11 + indent} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectRequest(request)}
          onContextMenu={openRequestMenu}
          style={{
            paddingLeft: `${11 + indent}px`,
            paddingRight: "6px",
          }}
          className={`w-full group flex min-h-[23px] items-center gap-1 rounded-md text-left transition-colors cursor-pointer ${
            isSelected
              ? "bg-[#333333] text-white"
              : "text-zinc-300 hover:bg-[#252525] hover:text-zinc-100"
          }`}
        >
          <MethodBadge method={request.request.method} compact />
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={() => void finishRequestRename()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setIsRenaming(false);
              }}
              className="min-w-0 flex-1 border-b border-[#637083] bg-transparent py-0.5 font-sans text-[11px] text-white outline-none"
            />
          ) : (
            <span className="truncate font-sans text-[11px] flex-1 min-w-0">
              {request.name || request.request.url || "Untitled Request"}
            </span>
          )}
          {!isRenaming && (
            <button
              ref={dotsRef}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={openRequestMenuFromDots}
              className={`shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-[#303030] hover:text-white ${
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              title="Request options"
              aria-label={`Options for ${request.name || "request"}`}
            >
              <DotsIcon />
            </button>
          )}
        </div>
        {contextMenu && (
          <RequestContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onRename={startRequestRename}
            onCopy={copyRequest}
            onDuplicate={() => void onDuplicateRequest(collectionId, request.id)}
            onDelete={() => void onDeleteRequest(collectionId, request.id)}
          />
        )}
      </div>
    );
  }

  // ── Folder node ───────────────────────────────────────────────────────────

  const { folder, children } = node;
  const isExpanded = openFolderIds[folder.id] !== false;
  const hasChildren = children.length > 0;
  const activeDropIntent =
    dropIndicator?.targetId === nodeId ? dropIndicator.intent : null;

  const startRename = () => {
    setRenameValue(folder.name);
    setIsRenaming(true);
    setContextMenu(null);
  };

  const finishRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      await onRenameFolder(collectionId, folder.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleCreateSubFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await onCreateFolder(collectionId, trimmed, folder.id);
    setNewFolderName("");
    setIsCreatingSubFolder(false);
  };

  const openContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const openContextMenuFromDots = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = dotsRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenu({ x: rect.left, y: rect.bottom + 4 });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  // Only an "inside" intent highlights the folder body. Adjacent intents use a line.
  const isInsideDropTarget = activeDropIntent === "inside";

  return (
    <div style={style}>
      <div className="relative">
        <AdjacentDropIndicator intent={activeDropIntent} left={5 + indent} />
        {/* Folder row */}
        <div
          ref={setNodeRef}
          {...attributes}
          className={`group flex min-h-[24px] items-center gap-1 rounded-md cursor-pointer transition-colors text-zinc-300 ${
            isInsideDropTarget
              ? "bg-sky-500/20 ring-1 ring-inset ring-sky-400/50"
              : "hover:bg-[#252525]"
          }`}
          style={{
            paddingLeft: `${5 + indent}px`,
            paddingRight: "6px",
          }}
          onClick={() => onToggleFolder(folder.id)}
          onContextMenu={openContextMenu}
          {...listeners}
        >
        {/* Chevron */}
        <span className="w-3 shrink-0 flex items-center">
          <ChevronIcon expanded={isExpanded} />
        </span>

        <FolderIcon open={isExpanded && hasChildren} />

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void finishRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            className="flex-1 min-w-0 border-b border-[#637083] bg-transparent py-0.5 text-xs text-white outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-xs font-medium select-none">
            {folder.name}
          </span>
        )}

        {/* Hover actions: + and ... */}
        {!isRenaming && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
            {/* Add request */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isExpanded) onToggleFolder(folder.id);
                void onCreateRequest(collectionId, folder.id);
              }}
              className="rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-[#303030] transition-colors"
              title="Add request"
            >
              <PlusIcon />
            </button>
            {/* Context menu trigger */}
            <button
              ref={dotsRef}
              onClick={openContextMenuFromDots}
              className="rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-[#303030] transition-colors"
              title="More options"
            >
              <DotsIcon />
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FolderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAddRequest={() => {
            if (!isExpanded) onToggleFolder(folder.id);
            void onCreateRequest(collectionId, folder.id);
          }}
          onAddFolder={() => {
            if (!isExpanded) onToggleFolder(folder.id);
            setIsCreatingSubFolder(true);
          }}
          onRename={startRename}
          onDuplicate={() => void onDuplicateFolder(collectionId, folder.id)}
          onDelete={() => onDeleteFolder(collectionId, folder.id, hasChildren)}
        />
      )}

      {/* Children */}
      {isExpanded && (
        <div className="relative">
          {/* Vertical guide line */}
          <div 
            className="absolute top-0 bottom-0 border-l border-[#2e2e2e] pointer-events-none" 
            style={{ left: `${10 + indent}px` }} 
          />
          
          {/* Inline: new subfolder form */}
          {isCreatingSubFolder && (
            <form
              ref={newSubFolderFormRef}
              onSubmit={(e) => void handleCreateSubFolder(e)}
              className="flex gap-1.5 items-center py-1 relative z-10"
              style={{
                paddingLeft: `${19 + indent}px`,
                paddingRight: "6px",
              }}
            >
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsCreatingSubFolder(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="Folder name"
                className="flex-1 min-w-0 bg-[#141414] border border-[#383838] rounded text-xs text-zinc-100 focus:outline-none focus:border-[#555] px-2 py-1"
              />
              <button
                type="submit"
                className="rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2 py-1 transition-colors"
              >
                Add
              </button>
            </form>
          )}

          {/* Recursive children */}
          {children.map((child) => (
            <CollectionTreeNode
              key={child.type === "folder" ? child.folder.id : child.request.id}
              node={child}
              depth={depth + 1}
              collectionId={collectionId}
              selectedSavedRequestId={selectedSavedRequestId}
              openFolderIds={openFolderIds}
              onToggleFolder={onToggleFolder}
              onSelectRequest={onSelectRequest}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDuplicateFolder={onDuplicateFolder}
              onCreateRequest={onCreateRequest}
              onRenameRequest={onRenameRequest}
              onDuplicateRequest={onDuplicateRequest}
              onDeleteRequest={onDeleteRequest}
              dropIndicator={dropIndicator}
            />
          ))}

        </div>
      )}
    </div>
  );
};
