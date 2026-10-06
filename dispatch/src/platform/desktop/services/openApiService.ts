import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Collection } from "../../../types/collection";
import type {
  OpenApiExportOptions,
  OpenApiExportResult,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiImportResult,
  OpenApiSource,
} from "../../../types/openapi";

function nativeSource(source: OpenApiSource): { kind: "file"; path: string } | { kind: "text"; content: string } {
  if (source.kind === "text") return source;
  if (!source.path) throw new Error("OpenAPI file path was not found.");
  return { kind: "file", path: source.path };
}

export async function chooseOpenApiFile(): Promise<OpenApiSource | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Select an OpenAPI document",
    filters: [{ name: "OpenAPI", extensions: ["json", "yaml", "yml"] }],
  });
  if (typeof selected !== "string") return null;
  return { kind: "file", name: selected.split(/[\\/]/).pop() || selected, path: selected };
}

export const inspectOpenApi = (source: OpenApiSource) =>
  invoke<OpenApiImportPreview>("inspect_openapi", { source: nativeSource(source) });

export const importOpenApi = (source: OpenApiSource, options: OpenApiImportOptions) =>
  invoke<OpenApiImportResult>("import_openapi", { source: nativeSource(source), options });

export async function exportCollectionOpenApi(
  collection: Collection,
  options: OpenApiExportOptions
): Promise<OpenApiExportResult> {
  const extension = options.format === "json" ? "json" : "yaml";
  const path = await save({
    title: "Save OpenAPI document",
    defaultPath: `${collection.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}.${extension}`,
    filters: [{ name: `OpenAPI ${extension.toUpperCase()}`, extensions: [extension] }],
  });
  if (!path) {
    return {
      request_count: 0,
      endpoint_count: 0,
      grouped_request_count: 0,
      warnings: [],
      cancelled: true,
    };
  }
  return invoke<OpenApiExportResult>("export_collection_openapi", {
    collectionId: collection.id,
    path,
    options,
  });
}
