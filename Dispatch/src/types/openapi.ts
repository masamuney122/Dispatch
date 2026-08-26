import type { Collection } from "./collection";
import type { Environment } from "./environment";

export type OpenApiExportFormat = "json" | "yaml";
export type OpenApiSource =
  | { kind: "file"; name: string; path?: string; content?: string }
  | { kind: "text"; content: string };
export type OpenApiRequestNaming = "fallback" | "path" | "url";
export type OpenApiFolderOrganization = "tags" | "path";

export interface OpenApiWarning {
  code: string;
  message: string;
  location: string | null;
}

export interface OpenApiImportPreview {
  title: string;
  specification_version: string;
  endpoint_count: number;
  folder_count: number;
  tag_folder_count: number;
  path_folder_count: number;
  servers: string[];
  security_schemes: string[];
  warnings: OpenApiWarning[];
}

export interface OpenApiImportOptions {
  collection_name: string;
  selected_server: string | null;
  create_environment: boolean;
  environment_name: string | null;
  request_naming: OpenApiRequestNaming;
  folder_organization: OpenApiFolderOrganization;
}

export interface OpenApiImportResult {
  collection: Collection;
  environment: Environment | null;
  warnings: OpenApiWarning[];
}

export interface OpenApiExportOptions {
  title: string;
  api_version: string;
  format: OpenApiExportFormat;
  server_url: string | null;
}

export interface OpenApiExportResult {
  endpoint_count: number;
  warnings: OpenApiWarning[];
  cancelled?: boolean;
}
