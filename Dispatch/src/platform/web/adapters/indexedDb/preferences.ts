import {
  openIndexedDb,
  requestResult,
  transactionDone,
  withDatabase,
} from "./database";

const DATABASE_NAME = "dispatch-web-preferences";
const STORE_NAME = "values";

function database(): Promise<IDBDatabase> {
  return openIndexedDb(DATABASE_NAME, 1, (current) => {
    current.createObjectStore(STORE_NAME);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  key: string,
  value?: T,
): Promise<T | undefined> {
  return withDatabase(database, async (current) => {
    const transaction = current.transaction(STORE_NAME, mode);
    const completion = transactionDone(transaction);
    const request =
      mode === "readonly"
        ? transaction.objectStore(STORE_NAME).get(key)
        : transaction.objectStore(STORE_NAME).put(value, key);
    const result = await requestResult(request as IDBRequest<T | undefined>);
    await completion;
    return result;
  });
}

export function getActiveEnvironment(workspaceId: string): Promise<string | undefined> {
  return transact<string>("readonly", `active-environment:${workspaceId}`);
}

export async function setActiveEnvironment(
  workspaceId: string,
  environmentId: string,
): Promise<void> {
  await transact("readwrite", `active-environment:${workspaceId}`, environmentId);
}
