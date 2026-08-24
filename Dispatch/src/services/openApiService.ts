import { invoke } from "@tauri-apps/api/core";
import type {
  OpenApiExportOptions,
  OpenApiExportResult,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiImportResult,
  OpenApiSource,
} from "../types/openapi";

export const inspectOpenApi = (source: OpenApiSource) =>
  invoke<OpenApiImportPreview>("inspect_openapi", { source });

export const importOpenApi = (source: OpenApiSource, options: OpenApiImportOptions) =>
  invoke<OpenApiImportResult>("import_openapi", { source, options });

export const exportCollectionOpenApi = (
  collectionId: string,
  path: string,
  options: OpenApiExportOptions
) =>
  invoke<OpenApiExportResult>("export_collection_openapi", {
    collectionId,
    path,
    options,
  });
