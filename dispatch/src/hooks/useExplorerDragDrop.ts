import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import type { TreeDropIndicator, TreeDropIntent } from "../components/layout/CollectionTreeNode";
import type { Collection, OrderItem } from "../types/collection";
import {
  buildCollectionTree,
  flattenTreeToOrderItems,
  getDescendantFolderIds,
  reorderTree,
  type TreeNode,
} from "../utils/collectionTree";

const FOLDER_EDGE_RATIO = 0.25;
const SIDEBAR_SCROLL_EDGE_PX = 48;
const SIDEBAR_SCROLL_MAX_SPEED = 10;
const AUTO_EXPAND_DELAY_MS = 700;

type DragPositionEvent = Pick<DragMoveEvent, "active" | "over">;

interface ExplorerDragDropOptions {
  collections: Collection[];
  openFolderIds: Record<string, boolean>;
  setOpenFolderIds: Dispatch<SetStateAction<Record<string, boolean>>>;
  onReorderItems: (collectionId: string, items: OrderItem[]) => Promise<void>;
}

function dropIntent(
  pointerY: number,
  targetRect: { top: number; height: number },
  targetIsFolder: boolean,
): TreeDropIntent {
  const relativeY = Math.min(
    1,
    Math.max(0, (pointerY - targetRect.top) / targetRect.height),
  );
  if (!targetIsFolder) return relativeY < 0.5 ? "before" : "after";
  if (relativeY < FOLDER_EDGE_RATIO) return "before";
  if (relativeY > 1 - FOLDER_EDGE_RATIO) return "after";
  return "inside";
}

function findTreeNode(nodes: TreeNode[], id: string | number): TreeNode | null {
  for (const node of nodes) {
    if (node.type === "folder" && node.folder.id === id) return node;
    if (node.type === "request" && node.request.id === id) return node;
    if (node.type === "folder") {
      const found = findTreeNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function useExplorerDragDrop({
  collections,
  openFolderIds,
  setOpenFolderIds,
  onReorderItems,
}: ExplorerDragDropOptions) {
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const stopEdgeScroll = useCallback(() => {
    edgeScrollSpeed.current = 0;
    if (edgeScrollFrame.current !== null) {
      cancelAnimationFrame(edgeScrollFrame.current);
      edgeScrollFrame.current = null;
    }
  }, []);

  const setEdgeScroll = useCallback(
    (speed: number) => {
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
    },
    [stopEdgeScroll],
  );

  const clearAutoExpandTimer = useCallback(() => {
    if (!autoExpandTimer.current) return;
    clearTimeout(autoExpandTimer.current.timer);
    autoExpandTimer.current = null;
  }, []);

  const indicatorFor = (event: DragPositionEvent): TreeDropIndicator | null => {
    const { active, over } = event;
    if (!over || active.id === over.id) return null;
    const collectionId = active.data.current?.collectionId as string | undefined;
    const collection = collections.find((item) => item.id === collectionId);
    const pointerY = pointerClientY.current;
    if (!collection || pointerY === null || over.rect.height <= 0) return null;
    const targetId = over.id as string;
    return {
      targetId,
      intent: dropIntent(
        pointerY,
        over.rect,
        collection.folders.some((folder) => folder.id === targetId),
      ),
    };
  };

  const updateAutoExpandTarget = (
    event: DragPositionEvent,
    indicator: TreeDropIndicator | null,
  ) => {
    if (!indicator || indicator.intent !== "inside") {
      clearAutoExpandTimer();
      return;
    }
    const folderId = indicator.targetId;
    const collectionId = event.active.data.current?.collectionId as string | undefined;
    const collection = collections.find((item) => item.id === collectionId);
    const isFolder = collection?.folders.some((folder) => folder.id === folderId) ?? false;
    if (!isFolder || openFolderIds[folderId] !== false) {
      clearAutoExpandTimer();
      return;
    }
    if (autoExpandTimer.current?.folderId === folderId) return;
    clearAutoExpandTimer();
    autoExpandTimer.current = {
      folderId,
      timer: setTimeout(() => {
        setOpenFolderIds((current) => ({ ...current, [folderId]: true }));
        autoExpandTimer.current = null;
      }, AUTO_EXPAND_DELAY_MS),
    };
  };

  const updateAutoScroll = (pointerY: number | null) => {
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
    const topDistance = pointerY - rect.top;
    const bottomDistance = rect.bottom - pointerY;
    if (topDistance < SIDEBAR_SCROLL_EDGE_PX) {
      const intensity = 1 - topDistance / SIDEBAR_SCROLL_EDGE_PX;
      setEdgeScroll(-Math.max(2, intensity * SIDEBAR_SCROLL_MAX_SPEED));
    } else if (bottomDistance < SIDEBAR_SCROLL_EDGE_PX) {
      const intensity = 1 - bottomDistance / SIDEBAR_SCROLL_EDGE_PX;
      setEdgeScroll(Math.max(2, intensity * SIDEBAR_SCROLL_MAX_SPEED));
    } else {
      stopEdgeScroll();
    }
  };

  const clearDragState = () => {
    clearAutoExpandTimer();
    stopEdgeScroll();
    setDraggedNode(null);
    setDropIndicator(null);
    pointerClientY.current = null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const collectionId = event.active.data.current?.collectionId as string;
    if ("clientY" in event.activatorEvent) {
      pointerClientY.current = (event.activatorEvent as PointerEvent).clientY;
    }
    setDropIndicator(null);
    stopEdgeScroll();
    clearAutoExpandTimer();
    const collection = collections.find((item) => item.id === collectionId);
    setDraggedNode(
      collection
        ? findTreeNode(buildCollectionTree(collection), event.active.id)
        : null,
    );
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const next = indicatorFor(event);
    setDropIndicator((current) =>
      current?.targetId === next?.targetId && current?.intent === next?.intent
        ? current
        : next,
    );
    updateAutoExpandTarget(event, next);
    updateAutoScroll(pointerClientY.current);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const next = indicatorFor(event);
    setDropIndicator(next);
    updateAutoExpandTarget(event, next);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const finalIndicator = indicatorFor(event);
    clearDragState();
    if (!over || active.id === over.id || !finalIndicator) return;
    const collectionId = active.data.current?.collectionId as string | undefined;
    const collection = collections.find((item) => item.id === collectionId);
    if (!collectionId || !collection) return;
    const draggedId = active.id as string;
    const overId = over.id as string;
    if (active.data.current?.type === "folder") {
      const descendants = getDescendantFolderIds(collection.folders, draggedId);
      if (descendants.includes(overId) || overId === draggedId) return;
    }
    const reordered = reorderTree(
      buildCollectionTree(collection),
      draggedId,
      overId,
      finalIndicator.intent,
    );
    try {
      await onReorderItems(collectionId, flattenTreeToOrderItems(reordered));
    } catch (error) {
      console.error("Failed to reorder items:", error);
    }
  };

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      pointerClientY.current = event.clientY;
    };
    window.addEventListener("pointermove", trackPointer, {
      capture: true,
      passive: true,
    });
    return () => window.removeEventListener("pointermove", trackPointer, { capture: true });
  }, []);

  useEffect(
    () => () => {
      stopEdgeScroll();
      clearAutoExpandTimer();
    },
    [clearAutoExpandTimer, stopEdgeScroll],
  );

  return {
    sensors,
    sidebarScrollRef,
    draggedNode,
    dropIndicator,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
    clearDragState,
  };
}
