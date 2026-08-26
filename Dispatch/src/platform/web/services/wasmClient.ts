import init, {
  parse_openapi,
  resolve_template,
  serialize_openapi_yaml,
  validate_workspace,
} from "../wasm/dispatch_web_wasm";
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

export async function parseOpenApi(content: string): Promise<Record<string, unknown>> {
  await ensureInitialized();
  try {
    return parse_openapi(content) as Record<string, unknown>;
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "OpenAPI belgesi doğrulanamadı", {
      cause: error,
    });
  }
}

export async function serializeOpenApiYaml(spec: Record<string, unknown>): Promise<string> {
  await ensureInitialized();
  try {
    return serialize_openapi_yaml(spec);
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "OpenAPI YAML oluşturulamadı", {
      cause: error,
    });
  }
}
