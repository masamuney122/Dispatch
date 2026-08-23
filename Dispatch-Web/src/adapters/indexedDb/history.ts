import type { HistoryEntry } from "../../types/api";

const DATABASE_NAME = "dispatch-web-history";
const STORE_NAME = "entries";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function listHistoryEntries(workspaceId: string, limit = 50): Promise<HistoryEntry[]> {
  const db = await database();
  const entries = await new Promise<HistoryEntry[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as HistoryEntry[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entries
    .filter((entry) => entry.workspaceId === workspaceId)
    .sort((left, right) => right.sentAt.localeCompare(left.sentAt))
    .slice(0, limit);
}
