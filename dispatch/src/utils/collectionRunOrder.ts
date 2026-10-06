import type { Collection } from "../types/collection";
import type { OrderedRunnerRequest, RunnerScope } from "../types/runner";
import { buildCollectionTree, type TreeNode } from "./collectionTree";

function flattenNodes(
  nodes: TreeNode[],
  folderPath: string[],
): OrderedRunnerRequest[] {
  return nodes.flatMap((node) => {
    if (node.type === "request") {
      return [{ request: node.request, folderPath }];
    }
    return flattenNodes(node.children, [...folderPath, node.folder.name]);
  });
}

export function collectionRequestsInRunOrder(
  collection: Collection,
  scope: RunnerScope = { type: "collection" },
): OrderedRunnerRequest[] {
  const tree = buildCollectionTree(collection);
  if (scope.type === "collection") return flattenNodes(tree, []);

  const folderNode = findFolderNode(tree, scope.folderId);
  return folderNode
    ? flattenNodes(folderNode.children, [folderNode.folder.name])
    : [];
}

function findFolderNode(nodes: TreeNode[], folderId: string): Extract<TreeNode, { type: "folder" }> | null {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    if (node.folder.id === folderId) return node;
    const nested = findFolderNode(node.children, folderId);
    if (nested) return nested;
  }
  return null;
}
