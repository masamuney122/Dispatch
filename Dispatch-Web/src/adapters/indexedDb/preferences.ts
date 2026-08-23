const DATABASE_NAME = "dispatch-web-preferences";
const STORE_NAME = "values";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, key: string, value?: T): Promise<T | undefined> {
  const db = await database();
  const transaction = db.transaction(STORE_NAME, mode);
  const request = mode === "readonly"
    ? transaction.objectStore(STORE_NAME).get(key)
    : transaction.objectStore(STORE_NAME).put(value, key);
  const result = await new Promise<T | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export function getActiveEnvironment(workspaceId: string): Promise<string | undefined> {
  return transact<string>("readonly", `active-environment:${workspaceId}`);
}

export async function setActiveEnvironment(workspaceId: string, environmentId: string): Promise<void> {
  await transact("readwrite", `active-environment:${workspaceId}`, environmentId);
}

