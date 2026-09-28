import { createWorkspaceBundle, validateWorkspace } from "../../services/wasmClient";
import type {
  CollectionsDocument,
  EnvironmentsDocument,
  OpenWorkspace,
  WorkspaceBundle,
} from "../../types/workspace";

const MANIFEST_FILE = "dispatch.workspace.json";
const COLLECTIONS_FILE = "collections.json";
const ENVIRONMENTS_FILE = "environments.json";
const REQUIRED_FILES = [MANIFEST_FILE, COLLECTIONS_FILE, ENVIRONMENTS_FILE] as const;

export function supportsFileSystemAccess(): boolean {
  return "showDirectoryPicker" in window && window.isSecureContext;
}

export async function chooseWorkspaceDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!supportsFileSystemAccess()) {
    throw new Error("Workspace klasörleri yalnızca güncel Chromium tarayıcılarında ve güvenli bağlantıda açılabilir.");
  }
  return window.showDirectoryPicker({ id: "dispatch-workspace", mode: "readwrite" });
}

export async function ensureWorkspacePermission(
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  const options = { mode: "readwrite" as const };
  if ((await directory.queryPermission(options)) === "granted") return;
  if ((await directory.requestPermission(options)) !== "granted") {
    throw new Error("Workspace klasörüne okuma ve yazma izni verilmedi.");
  }
}

async function readTextFile(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
  try {
    const handle = await directory.getFileHandle(name);
    return (await handle.getFile()).text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error(`${name} bulunamadı. Seçilen klasör bir Dispatch workspace olmayabilir.`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function writeJsonFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  value: unknown,
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(`${JSON.stringify(value, null, 2)}\n`);
  await writable.close();
}

export async function openWorkspaceDirectory(
  directory: FileSystemDirectoryHandle,
): Promise<OpenWorkspace> {
  await ensureWorkspacePermission(directory);
  const [manifest, collections, environments] = await Promise.all([
    readTextFile(directory, MANIFEST_FILE),
    readTextFile(directory, COLLECTIONS_FILE),
    readTextFile(directory, ENVIRONMENTS_FILE),
  ]);
  const bundle = await validateWorkspace(manifest, collections, environments);
  return { directory, bundle };
}

export async function createWorkspaceDirectory(
  directory: FileSystemDirectoryHandle,
  workspaceName: string,
): Promise<OpenWorkspace> {
  await ensureWorkspacePermission(directory);
  const name = workspaceName.trim();
  if (!name) throw new Error("Workspace adı boş olamaz.");

  for (const file of REQUIRED_FILES) {
    try {
      await directory.getFileHandle(file);
      throw new Error(`${file} zaten var. Yeni workspace için boş bir klasör seç.`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  }

  const now = new Date().toISOString();
  const workspaceId = crypto.randomUUID();
  const bundle: WorkspaceBundle = await createWorkspaceBundle(name, workspaceId, now);
  await Promise.all([
    writeJsonFile(directory, MANIFEST_FILE, bundle.manifest),
    writeJsonFile(directory, COLLECTIONS_FILE, bundle.collections),
    writeJsonFile(directory, ENVIRONMENTS_FILE, bundle.environments),
    directory.getDirectoryHandle("assets", { create: true }),
  ]);
  return { directory, bundle };
}

async function currentRevision(
  directory: FileSystemDirectoryHandle,
  file: typeof COLLECTIONS_FILE | typeof ENVIRONMENTS_FILE,
): Promise<number> {
  const parsed = JSON.parse(await readTextFile(directory, file)) as { revision?: unknown };
  if (typeof parsed.revision !== "number") throw new Error(`${file} revision alanı geçersiz.`);
  return parsed.revision;
}

export async function saveCollectionsDocument(
  workspace: OpenWorkspace,
  collections: CollectionsDocument,
): Promise<OpenWorkspace> {
  const diskRevision = await currentRevision(workspace.directory, COLLECTIONS_FILE);
  if (diskRevision !== workspace.bundle.collections.revision) {
    throw new Error("collections.json başka bir uygulamada değişmiş. Workspace'i yeniden açıp tekrar dene.");
  }
  const next = { ...collections, revision: diskRevision + 1, updated_at: new Date().toISOString() };
  await validateWorkspace(
    JSON.stringify(workspace.bundle.manifest),
    JSON.stringify(next),
    JSON.stringify(workspace.bundle.environments),
  );
  await writeJsonFile(workspace.directory, COLLECTIONS_FILE, next);
  return { ...workspace, bundle: { ...workspace.bundle, collections: next } };
}

export async function saveEnvironmentsDocument(
  workspace: OpenWorkspace,
  environments: EnvironmentsDocument,
): Promise<OpenWorkspace> {
  const diskRevision = await currentRevision(workspace.directory, ENVIRONMENTS_FILE);
  if (diskRevision !== workspace.bundle.environments.revision) {
    throw new Error("environments.json başka bir uygulamada değişmiş. Workspace'i yeniden açıp tekrar dene.");
  }
  const next = { ...environments, revision: diskRevision + 1, updated_at: new Date().toISOString() };
  await validateWorkspace(
    JSON.stringify(workspace.bundle.manifest),
    JSON.stringify(workspace.bundle.collections),
    JSON.stringify(next),
  );
  await writeJsonFile(workspace.directory, ENVIRONMENTS_FILE, next);
  return { ...workspace, bundle: { ...workspace.bundle, environments: next } };
}
