import {
  create_workspace_bundle,
  validate_workspace,
} from "../../wasm/dispatch_web_wasm";
import type { WorkspaceBundle } from "../../types/workspace";
import { ensureWasmInitialized, wasmError } from "./wasmRuntime";

export async function validateWorkspace(
  manifestJson: string,
  collectionsJson: string,
  environmentsJson: string,
): Promise<WorkspaceBundle> {
  await ensureWasmInitialized();
  try {
    return validate_workspace(manifestJson, collectionsJson, environmentsJson) as WorkspaceBundle;
  } catch (error) {
    throw wasmError(error, "Workspace doğrulanamadı");
  }
}

export async function createWorkspaceBundle(
  name: string,
  workspaceId: string,
  timestamp: string,
): Promise<WorkspaceBundle> {
  await ensureWasmInitialized();
  try {
    return create_workspace_bundle(name, workspaceId, timestamp) as WorkspaceBundle;
  } catch (error) {
    throw wasmError(error, "Workspace oluşturulamadı");
  }
}
