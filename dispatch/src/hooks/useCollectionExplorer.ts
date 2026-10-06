import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import type { Collection, OrderItem, SavedRequest } from "../types/collection";
import { useExplorerDragDrop } from "./useExplorerDragDrop";

interface CollectionExplorerOptions {
  collections: Collection[];
  searchQuery: string;
  onCreateCollection: (name: string) => Promise<void>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onCreateFolder: (
    collectionId: string,
    name: string,
    parentFolderId: string | null,
  ) => Promise<void>;
  onDeleteFolder: (collectionId: string, folderId: string) => Promise<void>;
  onCreateRequest: (
    collectionId: string,
    folderId: string | null,
  ) => Promise<SavedRequest>;
  onSelectSavedRequest: (request: SavedRequest) => void;
  onReorderItems: (collectionId: string, items: OrderItem[]) => Promise<void>;
}

export interface CollectionContextMenuState {
  collectionId: string;
  x: number;
  y: number;
}

interface DeleteFolderState {
  collectionId: string;
  folderId: string;
  folderName: string;
}

export function useCollectionExplorer({
  collections,
  searchQuery,
  onCreateCollection,
  onRenameCollection,
  onCreateFolder,
  onDeleteFolder,
  onCreateRequest,
  onSelectSavedRequest,
  onReorderItems,
}: CollectionExplorerOptions) {
  const [collectionsHeaderOpen, setCollectionsHeaderOpen] = useState(true);
  const [openCollectionIds, setOpenCollectionIds] = useState<
    Record<string, boolean>
  >({});
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null);
  const [openFolderIds, setOpenFolderIds] = useState<Record<string, boolean>>(
    {},
  );
  const [collectionContextMenu, setCollectionContextMenu] =
    useState<CollectionContextMenuState | null>(null);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null,
  );
  const [editingCollectionName, setEditingCollectionName] = useState("");
  const [creatingFolderInCollectionId, setCreatingFolderInCollectionId] =
    useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteConfirm, setDeleteConfirm] =
    useState<DeleteFolderState | null>(null);
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

  const dragDrop = useExplorerDragDrop({
    collections,
    openFolderIds,
    setOpenFolderIds,
    onReorderItems,
  });

  const isCollectionExpanded = (id: string) =>
    openCollectionIds[id] !== false;

  const toggleCollectionOpen = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    setOpenCollectionIds((current) => ({
      ...current,
      [id]: current[id] === undefined ? false : !current[id],
    }));
  };

  const toggleFolder = useCallback((folderId: string) => {
    setOpenFolderIds((current) => ({
      ...current,
      [folderId]: current[folderId] === undefined ? false : !current[folderId],
    }));
  }, []);

  const effectiveSearch = searchQuery.toLowerCase();
  const filteredCollections = collections.filter(
    (collection) =>
      !effectiveSearch ||
      collection.name.toLowerCase().includes(effectiveSearch) ||
      collection.requests.some((request) =>
        [request.name, request.request.url, request.request.method].some(
          (value) => value.toLowerCase().includes(effectiveSearch),
        ),
      ),
  );

  const handleCreateCollection = async () => {
    await onCreateCollection("New Collection");
    setCollectionsHeaderOpen(true);
  };

  const startRenamingCollection = (collection: Collection) => {
    setEditingCollectionId(collection.id);
    setEditingCollectionName(collection.name);
  };

  const finishRenamingCollection = async (collection: Collection) => {
    const name = editingCollectionName.trim();
    if (!name) {
      setEditingCollectionId(null);
      return;
    }
    await onRenameCollection(collection.id, name);
    setEditingCollectionId(null);
  };

  const handleCreateRootFolder = async (
    event: FormEvent,
    collectionId: string,
  ) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    await onCreateFolder(collectionId, name, null);
    setNewFolderName("");
    setCreatingFolderInCollectionId(null);
  };

  const handleDeleteFolderRequest = (
    collectionId: string,
    folderId: string,
    hasChildren: boolean,
  ) => {
    if (!hasChildren) {
      void onDeleteFolder(collectionId, folderId);
      return;
    }
    const collection = collections.find((item) => item.id === collectionId);
    const folder = collection?.folders.find((item) => item.id === folderId);
    setDeleteConfirm({
      collectionId,
      folderId,
      folderName: folder?.name ?? "this folder",
    });
  };

  const confirmDeleteFolder = () => {
    if (!deleteConfirm) return;
    void onDeleteFolder(deleteConfirm.collectionId, deleteConfirm.folderId);
    setDeleteConfirm(null);
  };

  const handleCreateRequestInFolder = async (
    collectionId: string,
    folderId: string | null,
  ) => {
    const request = await onCreateRequest(collectionId, folderId);
    onSelectSavedRequest(request);
  };

  return {
    collectionsHeaderOpen,
    setCollectionsHeaderOpen,
    openCollectionIds,
    setOpenCollectionIds,
    selectedCollectionId,
    setSelectedCollectionId,
    openFolderIds,
    collectionContextMenu,
    setCollectionContextMenu,
    editingCollectionId,
    setEditingCollectionId,
    editingCollectionName,
    setEditingCollectionName,
    creatingFolderInCollectionId,
    setCreatingFolderInCollectionId,
    newFolderName,
    setNewFolderName,
    newRootFolderFormRef,
    deleteConfirm,
    setDeleteConfirm,
    filteredCollections,
    isCollectionExpanded,
    toggleCollectionOpen,
    toggleFolder,
    handleCreateCollection,
    startRenamingCollection,
    finishRenamingCollection,
    handleCreateRootFolder,
    handleDeleteFolderRequest,
    confirmDeleteFolder,
    handleCreateRequestInFolder,
    ...dragDrop,
  };
}
