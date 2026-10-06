import {
  export_collection_openapi,
  import_openapi,
  inspect_openapi,
  parse_openapi,
} from "../../wasm/dispatch_web_wasm";
import type { Collection } from "../../../../types/collection";
import type {
  OpenApiExportOptions,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiWarning,
} from "../../../../types/openapi";
import { ensureWasmInitialized, wasmError } from "./wasmRuntime";

export interface CoreOpenApiExportDocument {
  content: string;
  mime_type: string;
  extension: "json" | "yaml";
  request_count: number;
  endpoint_count: number;
  grouped_request_count: number;
  warnings: OpenApiWarning[];
}

export interface CoreOpenApiImportContext {
  collection_id: string;
  id_prefix: string;
  timestamp: string;
}

export interface CoreOpenApiImportDocument {
  collection: Collection;
  environment_variables: Record<string, string>;
  warnings: OpenApiWarning[];
}

export async function parseOpenApi(content: string): Promise<Record<string, unknown>> {
  await ensureWasmInitialized();
  try {
    return parse_openapi(content) as Record<string, unknown>;
  } catch (error) {
    throw wasmError(error, "The OpenAPI document could not be validated");
  }
}

export async function exportCollectionOpenApiCore(
  collection: Collection,
  options: OpenApiExportOptions,
): Promise<CoreOpenApiExportDocument> {
  await ensureWasmInitialized();
  try {
    return export_collection_openapi(collection, options) as CoreOpenApiExportDocument;
  } catch (error) {
    throw wasmError(error, "The OpenAPI document could not be generated");
  }
}

export async function inspectOpenApiCore(
  spec: Record<string, unknown>,
  fallbackTitle: string,
): Promise<OpenApiImportPreview> {
  await ensureWasmInitialized();
  try {
    return inspect_openapi(spec, fallbackTitle) as OpenApiImportPreview;
  } catch (error) {
    throw wasmError(error, "The OpenAPI summary could not be generated");
  }
}

export async function importOpenApiCore(
  spec: Record<string, unknown>,
  collectionName: string,
  selectedServer: string | null,
  options: Pick<OpenApiImportOptions, "request_naming" | "folder_organization">,
  context: CoreOpenApiImportContext,
): Promise<CoreOpenApiImportDocument> {
  await ensureWasmInitialized();
  try {
    return import_openapi(
      spec,
      collectionName,
      selectedServer ?? undefined,
      options,
      context,
    ) as CoreOpenApiImportDocument;
  } catch (error) {
    throw wasmError(error, "The OpenAPI document could not be converted into a collection");
  }
}
