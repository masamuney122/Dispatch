import type { RecentWorkspaceRecord, WorkspaceBundle } from "../../types/workspace";
import {
  openIndexedDb,
  requestResult,
  transactionDone,
  withDatabase,
} from "./database";

const DATABASE_NAME = "dispatch-web";
const DATABASE_VERSION = 1;
const STORE_NAME = "recent-workspaces";

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDb(DATABASE_NAME, DATABASE_VERSION, (database) => {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  });
}

export async function saveRecentWorkspace(
  handle: FileSystemDirectoryHandle,
  bundle: WorkspaceBundle,
): Promise<void> {
  const record: RecentWorkspaceRecord = {
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    directoryName: handle.name,
    lastOpenedAt: new Date().toISOString(),
    handle,
  };
  await withDatabase(openDatabase, async (database) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completion = transactionDone(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
    await completion;
  });
}

export async function listRecentWorkspaces(): Promise<RecentWorkspaceRecord[]> {
  const records = await withDatabase(openDatabase, async (database) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completion = transactionDone(transaction);
    const result = await requestResult(
      transaction.objectStore(STORE_NAME)
        .getAll() as IDBRequest<RecentWorkspaceRecord[]>,
    );
    await completion;
    return result;
  });
  return records.sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  );
}
