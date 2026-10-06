import { saveCollectionsDocument, saveEnvironmentsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import type { Collection } from "../../../types/collection";
import type { Environment } from "../../../types/environment";
import type {
  OpenApiExportOptions,
  OpenApiExportResult,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiImportResult,
  OpenApiSource,
  OpenApiWarning,
} from "../../../types/openapi";
import {
  exportCollectionOpenApiCore,
  importOpenApiCore,
  inspectOpenApiCore,
  parseOpenApi,
} from "./wasmClient";
import { getActiveWorkspace, updateActiveWorkspace } from "./workspaceRuntime";

type JsonObject = Record<string, unknown>;

interface WebOpenApiExportResult extends OpenApiExportResult {
  content: string;
  mime_type: string;
  extension: "json" | "yaml";
  request_count: number;
  endpoint_count: number;
  grouped_request_count: number;
  warnings: OpenApiWarning[];
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

const objectValue = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const stringValue = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

async function parseSource(source: OpenApiSource): Promise<JsonObject> {
  const content = source.content;
  if (content === undefined) {
    throw new Error("The OpenAPI file could not be read.");
  }
  return parseOpenApi(content);
}

export function chooseOpenApiFile(): Promise<OpenApiSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml,application/json,application/yaml,text/yaml";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ kind: "file", name: file.name, content: await file.text() });
    }, { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

function serverUrls(spec: JsonObject): string[] {
  const result: string[] = [];
  const append = (servers: unknown) => {
    for (const server of arrayValue(servers).map(objectValue)) {
      const url = server ? stringValue(server.url) : null;
      if (url && !result.includes(url)) result.push(url);
    }
  };
  append(spec.servers);
  for (const rawPathItem of Object.values(objectValue(spec.paths) ?? {})) {
    const pathItem = objectValue(rawPathItem);
    if (!pathItem) continue;
    append(pathItem.servers);
    for (const method of HTTP_METHODS) append(objectValue(pathItem[method])?.servers);
  }
  return result;
}

export async function inspectOpenApi(source: OpenApiSource): Promise<OpenApiImportPreview> {
  const spec = await parseSource(source);
  const fallback = source.kind === "file" ? source.name.replace(/\.(json|ya?ml)$/i, "") : "Imported API";
  return inspectOpenApiCore(spec, fallback);
}

function uniqueName(requested: string, existing: string[]): string {
  if (!existing.includes(requested)) return requested;
  if (!existing.includes(`${requested} (Imported)`)) return `${requested} (Imported)`;
  for (let number = 2; ; number += 1) {
    const candidate = `${requested} (Imported ${number})`;
    if (!existing.includes(candidate)) return candidate;
  }
}

export async function importOpenApi(
  source: OpenApiSource,
  options: OpenApiImportOptions
): Promise<OpenApiImportResult> {
  const spec = await parseSource(source);
  const workspace = getActiveWorkspace();
  const info = objectValue(spec.info) ?? {};
  const fallback =
    stringValue(info.title) ||
    (source.kind === "file" ? source.name.replace(/\.(json|ya?ml)$/i, "") : "Imported API");
  const requestedName = options.collection_name.trim() || fallback;
  const collectionName = uniqueName(
    requestedName,
    workspace.bundle.collections.collections.map((collection) => collection.name)
  );
  const discoveredServers = serverUrls(spec);
  const server =
    options.selected_server?.trim() ||
    (discoveredServers.length === 1 && !discoveredServers[0].includes("{")
      ? discoveredServers[0]
      : null);
  const importId = crypto.randomUUID();
  const converted = await importOpenApiCore(
    spec,
    collectionName,
    server,
    options,
    {
      collection_id: crypto.randomUUID(),
      id_prefix: importId,
      timestamp: new Date().toISOString(),
    },
  );
  if (server) converted.environment_variables.baseUrl = server;

  let environment: Environment | null = null;
  if (options.create_environment) {
    const requestedEnvironmentName =
      options.environment_name?.trim() || `${collectionName} Environment`;
    const name = uniqueName(
      requestedEnvironmentName,
      workspace.bundle.environments.environments.map((item) => item.name)
    );
    const now = new Date().toISOString();
    environment = {
      id: crypto.randomUUID(),
      name,
      variables: converted.environment_variables,
      workspace_id: workspace.bundle.manifest.id,
      created_at: now,
      updated_at: now,
    };
  }

  const collections = {
    ...workspace.bundle.collections,
    collections: [...workspace.bundle.collections.collections, converted.collection],
  };
  const afterCollections = await saveCollectionsDocument(workspace, collections);
  try {
    if (environment) {
      const environments = {
        ...afterCollections.bundle.environments,
        environments: [...afterCollections.bundle.environments.environments, environment],
      };
      updateActiveWorkspace(await saveEnvironmentsDocument(afterCollections, environments));
    } else {
      updateActiveWorkspace(afterCollections);
    }
  } catch (error) {
    try {
      const rolledBack = await saveCollectionsDocument(afterCollections, workspace.bundle.collections);
      updateActiveWorkspace(rolledBack);
    } catch {
      // Preserve the original import error; the workspace revision guard will surface rollback issues later.
    }
    throw error;
  }

  return { collection: converted.collection, environment, warnings: converted.warnings };
}

export async function buildCollectionOpenApi(
  collection: Collection,
  options: OpenApiExportOptions
): Promise<WebOpenApiExportResult> {
  return exportCollectionOpenApiCore(collection, options);
}

export async function exportCollectionOpenApi(
  collection: Collection,
  options: OpenApiExportOptions
): Promise<WebOpenApiExportResult> {
  const result = await buildCollectionOpenApi(collection, options);
  downloadOpenApi(result, collection.name);
  return result;
}

export function downloadOpenApi(result: WebOpenApiExportResult, collectionName: string): void {
  const safeName = collectionName.replace(/[^a-zA-Z0-9._-]+/g, "-") || "dispatch-api";
  const blob = new Blob([result.content], { type: `${result.mime_type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}.${result.extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
