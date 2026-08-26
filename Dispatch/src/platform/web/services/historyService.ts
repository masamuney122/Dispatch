import type { HistoryItem } from "../../../types/history";
import { getActiveWorkspace } from "./workspaceRuntime";

const DATABASE_NAME = "dispatch-web-tauri-ui-history";
const STORE_NAME = "items";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

interface StoredHistory { key: string; workspaceId: string; item: HistoryItem }

async function all(): Promise<StoredHistory[]> {
  const db = await database();
  const result = await new Promise<StoredHistory[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredHistory[]);
    request.onerror = () => reject(request.error);
  });
  db.close(); return result;
}

async function put(record: StoredHistory): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function saveHistory(item: HistoryItem): Promise<void> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  await put({ key: `${workspaceId}:${item.id}`, workspaceId, item });
}

export async function loadHistory(): Promise<HistoryItem[]> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  return (await all()).filter((record) => record.workspaceId === workspaceId).map((record) => record.item).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function clearHistory(): Promise<void> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  const records = (await all()).filter((item) => item.workspaceId === workspaceId);
  const db = await database();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  for (const record of records) transaction.objectStore(STORE_NAME).delete(record.key);
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(`${workspaceId}:${id}`);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
