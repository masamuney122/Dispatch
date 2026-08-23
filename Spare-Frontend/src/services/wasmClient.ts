import init, { resolve_template, validate_workspace } from "../wasm/dispatch_web_wasm";
import type { WorkspaceBundle } from "../types/workspace";

let initialization: Promise<unknown> | undefined;

function ensureInitialized() {
  initialization ??= init();
  return initialization;
}

interface ResolveResult {
  value: string;
  unresolved: string[];
}

export async function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): Promise<ResolveResult> {
  await ensureInitialized();
  return resolve_template(template, variables) as ResolveResult;
}

export async function validateWorkspace(
  manifestJson: string,
  collectionsJson: string,
  environmentsJson: string,
): Promise<WorkspaceBundle> {
  await ensureInitialized();
  try {
    return validate_workspace(manifestJson, collectionsJson, environmentsJson) as WorkspaceBundle;
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "Workspace doğrulanamadı", {
      cause: error,
    });
  }
}
