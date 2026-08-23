import { invoke } from "@tauri-apps/api/core";
import type {
  OpenApiExportOptions,
  OpenApiExportResult,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiImportResult,
} from "../types/openapi";

export const inspectOpenApi = (path: string) =>
  invoke<OpenApiImportPreview>("inspect_openapi", { path });

export const importOpenApi = (path: string, options: OpenApiImportOptions) =>
  invoke<OpenApiImportResult>("import_openapi", { path, options });

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
