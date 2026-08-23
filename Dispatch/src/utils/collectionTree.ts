import type { Collection, Folder, OrderItem, SavedRequest } from "../types/collection";

// ── Tree Node Types ───────────────────────────────────────────────────────────

export interface FolderTreeNode {
  type: "folder";
  folder: Folder;
  children: TreeNode[];
}

export interface RequestTreeNode {
  type: "request";
  request: SavedRequest;
}

export type TreeNode = FolderTreeNode | RequestTreeNode;

// ── Pure Builder Functions ────────────────────────────────────────────────────

/**
 * Builds a recursive tree of folders and requests for a given parent scope,
 * sorted by the `order` field.
 */
function buildSubTree(
  allFolders: Folder[],
  allRequests: SavedRequest[],
  parentFolderId: string | null
): TreeNode[] {
  const childFolders: TreeNode[] = allFolders
    .filter((f) => (f.parent_folder_id ?? null) === parentFolderId)
    .map((folder) => ({
      type: "folder",
      folder,
      children: buildSubTree(allFolders, allRequests, folder.id),
    }));

  const childRequests: TreeNode[] = allRequests
    .filter((r) => (r.folder_id ?? null) === parentFolderId)
    .map((request) => ({ type: "request", request }));

  // Folders and requests share one sibling order. Keeping them in separate
  // groups made a persisted folder move snap back after refresh.
  return [...childFolders, ...childRequests].sort((left, right) => {
    const leftOrder = left.type === "folder" ? left.folder.order : left.request.order;
    const rightOrder = right.type === "folder" ? right.folder.order : right.request.order;
    const orderDifference = (leftOrder ?? 0) - (rightOrder ?? 0);
    if (orderDifference !== 0) return orderDifference;

    // Use a deterministic folder-first tie-breaker if two sibling order values collide.
    if (left.type === right.type) return 0;
    return left.type === "folder" ? -1 : 1;
  });
}

/**
 * Builds the complete tree for a collection.
 * Returns root-level nodes sorted by order.
 */
export function buildCollectionTree(collection: Collection): TreeNode[] {
  return buildSubTree(collection.folders ?? [], collection.requests, null);
}

/**
 * Flattens a tree into an ordered list of (id, type, parentFolderId, order) tuples.
 * Used to compute OrderItem[] after a DnD reorder.
 */
export function flattenTreeToOrderItems(
  nodes: TreeNode[],
  parentFolderId: string | null = null
): OrderItem[] {
  const items: OrderItem[] = [];
  nodes.forEach((node, index) => {
    if (node.type === "folder") {
      items.push({
        id: node.folder.id,
        item_type: "folder",
        parent_folder_id: parentFolderId,
        order: index,
      });
      items.push(...flattenTreeToOrderItems(node.children, node.folder.id));
    } else {
      items.push({
        id: node.request.id,
        item_type: "request",
        parent_folder_id: parentFolderId,
        order: index,
      });
    }
  });
  return items;
}

/**
 * Returns all descendant folder IDs of a given folder (recursive).
 * Used to prevent circular parent-child relationships during DnD.
 */
export function getDescendantFolderIds(
  allFolders: Folder[],
  folderId: string
): string[] {
  const result: string[] = [];
  const directChildren = allFolders.filter(
    (f) => f.parent_folder_id === folderId
  );
  for (const child of directChildren) {
    result.push(child.id);
    result.push(...getDescendantFolderIds(allFolders, child.id));
  }
  return result;
}

/**
 * Counts all requests in a subtree (including nested folders).
 */
export function countRequestsInTree(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "request") {
      count += 1;
    } else {
      count += countRequestsInTree(node.children);
    }
  }
  return count;
}

/**
 * Checks whether a folder has any children (folders or requests).
 */
export function folderHasChildren(
  collection: Collection,
  folderId: string
): boolean {
  const hasChildFolders = (collection.folders ?? []).some(
    (f) => f.parent_folder_id === folderId
  );
  const hasChildRequests = collection.requests.some(
    (r) => r.folder_id === folderId
  );
  return hasChildFolders || hasChildRequests;
}

/**
 * Returns a human-readable path for a folder, e.g. "Root / Parent / Child".
 */
export function getFolderPath(allFolders: Folder[], folderId: string): string {
  const parts: string[] = [];
  let current: Folder | undefined = allFolders.find((f) => f.id === folderId);
  while (current) {
    parts.unshift(current.name);
    const parentId = current.parent_folder_id ?? null;
    current = parentId
      ? allFolders.find((f) => f.id === parentId)
      : undefined;
  }
  return parts.join(" / ");
}

/**
 * Inserts a node into a tree before/after a target node.
 * Returns new tree. Used for DnD reorder preview.
 */
export function reorderTree(
  nodes: TreeNode[],
  draggedId: string,
  targetId: string,
  position: "before" | "after" | "inside"
): TreeNode[] {
  // Remove dragged node from tree
  const dragged = findNodeById(nodes, draggedId);
  if (!dragged) return nodes;

  const withoutDragged = removeNodeById(nodes, draggedId);

  if (position === "inside") {
    return insertInsideFolder(withoutDragged, targetId, dragged);
  }

  return insertAdjacentToNode(withoutDragged, targetId, dragged, position);
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.type === "folder" && node.folder.id === id) return node;
    if (node.type === "request" && node.request.id === id) return node;
    if (node.type === "folder") {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function removeNodeById(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((node) => {
      if (node.type === "folder") return node.folder.id !== id;
      return node.request.id !== id;
    })
    .map((node) => {
      if (node.type === "folder") {
        return { ...node, children: removeNodeById(node.children, id) };
      }
      return node;
    });
}

function insertInsideFolder(
  nodes: TreeNode[],
  folderId: string,
  toInsert: TreeNode
): TreeNode[] {
  return nodes.map((node) => {
    if (node.type === "folder" && node.folder.id === folderId) {
      return { ...node, children: [...node.children, toInsert] };
    }
    if (node.type === "folder") {
      return { ...node, children: insertInsideFolder(node.children, folderId, toInsert) };
    }
    return node;
  });
}

function insertAdjacentToNode(
  nodes: TreeNode[],
  targetId: string,
  toInsert: TreeNode,
  position: "before" | "after"
): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const nodeId = node.type === "folder" ? node.folder.id : node.request.id;
    if (nodeId === targetId) {
      if (position === "before") result.push(toInsert);
      result.push(node);
      if (position === "after") result.push(toInsert);
    } else if (node.type === "folder") {
      result.push({
        ...node,
        children: insertAdjacentToNode(node.children, targetId, toInsert, position),
      });
    } else {
      result.push(node);
    }
  }
  return result;
}
