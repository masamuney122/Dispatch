import type { RecentWorkspaceRecord, WorkspaceBundle } from "../../types/workspace";

const DATABASE_NAME = "dispatch-web";
const DATABASE_VERSION = 1;
const STORE_NAME = "recent-workspaces";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecentWorkspace(
  handle: FileSystemDirectoryHandle,
  bundle: WorkspaceBundle,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const record: RecentWorkspaceRecord = {
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    directoryName: handle.name,
    lastOpenedAt: new Date().toISOString(),
    handle,
  };
  await requestResult(transaction.objectStore(STORE_NAME).put(record));
  database.close();
}

export async function listRecentWorkspaces(): Promise<RecentWorkspaceRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const records = await requestResult(
    transaction.objectStore(STORE_NAME).getAll() as IDBRequest<RecentWorkspaceRecord[]>,
  );
  database.close();
  return records.sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}

