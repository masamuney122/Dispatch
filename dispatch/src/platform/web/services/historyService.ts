import type { HistoryItem } from "../../../types/history";
import {
  openIndexedDb,
  requestResult,
  transactionDone,
  withDatabase,
} from "../adapters/indexedDb/database";
import { getActiveWorkspace } from "./workspaceRuntime";

const DATABASE_NAME = "dispatch-web-tauri-ui-history";
const STORE_NAME = "items";

function database(): Promise<IDBDatabase> {
  return openIndexedDb(DATABASE_NAME, 1, (current) => {
    current.createObjectStore(STORE_NAME, { keyPath: "key" });
  });
}

interface StoredHistory {
  key: string;
  workspaceId: string;
  item: HistoryItem;
}

async function all(): Promise<StoredHistory[]> {
  return withDatabase(database, async (current) => {
    const transaction = current.transaction(STORE_NAME);
    const completion = transactionDone(transaction);
    const result = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredHistory[]>,
    );
    await completion;
    return result;
  });
}

async function put(record: StoredHistory): Promise<void> {
  await withDatabase(database, async (current) => {
    const transaction = current.transaction(STORE_NAME, "readwrite");
    const completion = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(record);
    await completion;
  });
}

export async function saveHistory(item: HistoryItem): Promise<void> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  await put({ key: `${workspaceId}:${item.id}`, workspaceId, item });
}

export async function loadHistory(): Promise<HistoryItem[]> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  return (await all())
    .filter((record) => record.workspaceId === workspaceId)
    .map((record) => record.item)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export async function clearHistory(): Promise<void> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  const records = (await all()).filter((item) => item.workspaceId === workspaceId);
  await withDatabase(database, async (current) => {
    const transaction = current.transaction(STORE_NAME, "readwrite");
    const completion = transactionDone(transaction);
    for (const record of records) {
      transaction.objectStore(STORE_NAME).delete(record.key);
    }
    await completion;
  });
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const workspaceId = getActiveWorkspace().bundle.manifest.id;
  await withDatabase(database, async (current) => {
    const transaction = current.transaction(STORE_NAME, "readwrite");
    const completion = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(`${workspaceId}:${id}`);
    await completion;
  });
}
