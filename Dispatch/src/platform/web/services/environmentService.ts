import { saveEnvironmentsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import { getActiveEnvironment as readActiveEnvironment, setActiveEnvironment as storeActiveEnvironment } from "../adapters/indexedDb/preferences";
import type { Environment } from "../../../types/environment";
import { getActiveWorkspace, updateActiveWorkspace } from "./workspaceRuntime";

async function save(environments: Environment[]): Promise<void> {
  const workspace = getActiveWorkspace();
  const updated = await saveEnvironmentsDocument(workspace, { ...workspace.bundle.environments, environments });
  updateActiveWorkspace(updated);
}

export async function createEnvironment(name: string, variables: Record<string, string>): Promise<Environment> {
  const workspace = getActiveWorkspace();
  const now = new Date().toISOString();
  const environment: Environment = { id: crypto.randomUUID(), name, variables, workspace_id: workspace.bundle.manifest.id, created_at: now, updated_at: now };
  await save([...(await listEnvironments()), environment]);
  return environment;
}

export async function listEnvironments(): Promise<Environment[]> {
  return getActiveWorkspace().bundle.environments.environments;
}

export async function updateEnvironment(id: string, name: string, variables: Record<string, string>): Promise<Environment> {
  const existing = (await listEnvironments()).find((item) => item.id === id);
  if (!existing) throw new Error("Environment bulunamadı.");
  const updated = { ...existing, name, variables, updated_at: new Date().toISOString() };
  await save((await listEnvironments()).map((item) => item.id === id ? updated : item));
  return updated;
}

export async function deleteEnvironment(id: string): Promise<void> {
  await save((await listEnvironments()).filter((item) => item.id !== id));
  const workspace = getActiveWorkspace();
  if ((await readActiveEnvironment(workspace.bundle.manifest.id)) === id) await storeActiveEnvironment(workspace.bundle.manifest.id, "");
}

export async function setActiveEnvironment(id: string | null): Promise<void> {
  const workspace = getActiveWorkspace();
  await storeActiveEnvironment(workspace.bundle.manifest.id, id ?? "");
}

export async function getActiveEnvironment(): Promise<Environment | null> {
  const workspace = getActiveWorkspace();
  const id = await readActiveEnvironment(workspace.bundle.manifest.id);
  return (await listEnvironments()).find((item) => item.id === id) ?? null;
}
