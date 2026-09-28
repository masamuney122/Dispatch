import { saveEnvironmentsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import {
  getActiveEnvironment as readActiveEnvironment,
  setActiveEnvironment as storeActiveEnvironment,
} from "../adapters/indexedDb/preferences";
import type { Environment } from "../../../types/environment";
import { applyEnvironmentMutationCore } from "./wasmClient";
import { getActiveWorkspace, updateActiveWorkspace } from "./workspaceRuntime";

interface MutationResult {
  environments: Environment[];
  active_environment_id: string | null;
  environment: Environment | null;
}

async function mutate(
  mutation: Record<string, unknown>,
  needsEntityId = false,
  persistDocument = true,
): Promise<MutationResult> {
  const workspace = getActiveWorkspace();
  const workspaceId = workspace.bundle.manifest.id;
  const activeId = (await readActiveEnvironment(workspaceId)) || null;
  const result = await applyEnvironmentMutationCore(
    workspace.bundle.environments.environments,
    activeId,
    mutation,
    {
      timestamp: new Date().toISOString(),
      entity_id: needsEntityId ? crypto.randomUUID() : "",
      workspace_id: workspaceId,
    },
  );

  if (persistDocument) {
    const updated = await saveEnvironmentsDocument(workspace, {
      ...workspace.bundle.environments,
      environments: result.environments,
    });
    updateActiveWorkspace(updated);
  }
  if (result.active_environment_id !== activeId) {
    await storeActiveEnvironment(workspaceId, result.active_environment_id ?? "");
  }
  return result;
}

function requireEnvironment(result: MutationResult): Environment {
  if (!result.environment) throw new Error("Environment işlemi sonuç üretmedi.");
  return result.environment;
}

export async function createEnvironment(
  name: string,
  variables: Record<string, string>,
): Promise<Environment> {
  return requireEnvironment(await mutate({ action: "create", name, variables }, true));
}

export async function listEnvironments(): Promise<Environment[]> {
  return getActiveWorkspace().bundle.environments.environments;
}

export async function updateEnvironment(
  id: string,
  name: string,
  variables: Record<string, string>,
): Promise<Environment> {
  return requireEnvironment(await mutate({ action: "update", id, name, variables }));
}

export async function deleteEnvironment(id: string): Promise<void> {
  await mutate({ action: "delete", id });
}

export async function setActiveEnvironment(id: string | null): Promise<void> {
  await mutate({ action: "set_active", id }, false, false);
}

export async function getActiveEnvironment(): Promise<Environment | null> {
  const workspace = getActiveWorkspace();
  const id = await readActiveEnvironment(workspace.bundle.manifest.id);
  return workspace.bundle.environments.environments.find((item) => item.id === id) ?? null;
}
