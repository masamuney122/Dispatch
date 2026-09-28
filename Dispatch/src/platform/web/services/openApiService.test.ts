import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Collection } from "../../../types/collection";
import type { OpenApiExportOptions } from "../../../types/openapi";

const {
  exportCollectionOpenApiCore,
  importOpenApiCore,
  inspectOpenApiCore,
  saveCollectionsDocument,
  saveEnvironmentsDocument,
  updateActiveWorkspace,
  getActiveWorkspace,
} = vi.hoisted(() => ({
  exportCollectionOpenApiCore: vi.fn(),
  importOpenApiCore: vi.fn(),
  inspectOpenApiCore: vi.fn(),
  saveCollectionsDocument: vi.fn(),
  saveEnvironmentsDocument: vi.fn(),
  updateActiveWorkspace: vi.fn(),
  getActiveWorkspace: vi.fn(),
}));

vi.mock("./wasmClient", () => ({
  exportCollectionOpenApiCore,
  importOpenApiCore,
  inspectOpenApiCore,
  parseOpenApi: vi.fn(),
}));

vi.mock("../adapters/fileSystem/workspaceFileSystem", () => ({
  saveCollectionsDocument,
  saveEnvironmentsDocument,
}));

vi.mock("./workspaceRuntime", () => ({
  getActiveWorkspace,
  updateActiveWorkspace,
}));

import { buildCollectionOpenApi, importOpenApi, inspectOpenApi } from "./openApiService";

describe("web OpenAPI exporter adapter", () => {
  beforeEach(() => {
    exportCollectionOpenApiCore.mockReset();
    importOpenApiCore.mockReset();
    inspectOpenApiCore.mockReset();
    saveCollectionsDocument.mockReset();
    saveEnvironmentsDocument.mockReset();
    updateActiveWorkspace.mockReset();
    getActiveWorkspace.mockReset();
  });

  it("delegates import conversion to the shared WASM core before persistence", async () => {
    const { parseOpenApi } = await import("./wasmClient");
    const spec = {
      openapi: "3.0.3",
      info: { title: "Demo" },
      servers: [{ url: "https://api.example.com" }],
      paths: { "/users": { get: { summary: "Users" } } },
    };
    vi.mocked(parseOpenApi).mockResolvedValue(spec);
    const workspace = {
      bundle: {
        manifest: { id: "workspace-1" },
        collections: { collections: [] },
        environments: { environments: [] },
      },
    };
    const collection: Collection = {
      id: "collection-1",
      name: "Demo",
      folders: [],
      requests: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    getActiveWorkspace.mockReturnValue(workspace);
    importOpenApiCore.mockResolvedValue({
      collection,
      environment_variables: {},
      warnings: [],
    });
    saveCollectionsDocument.mockResolvedValue(workspace);

    const result = await importOpenApi(
      { kind: "text", content: "{}" },
      {
        collection_name: "Demo",
        selected_server: null,
        create_environment: false,
        environment_name: null,
        request_naming: "fallback",
        folder_organization: "tags",
      },
    );

    expect(result.collection).toBe(collection);
    expect(importOpenApiCore).toHaveBeenCalledOnce();
    expect(importOpenApiCore.mock.calls[0][0]).toBe(spec);
    expect(importOpenApiCore.mock.calls[0][1]).toBe("Demo");
    expect(importOpenApiCore.mock.calls[0][2]).toBe("https://api.example.com");
    expect(saveCollectionsDocument).toHaveBeenCalledOnce();
  });

  it("delegates export to the shared WASM core without changing the contract", async () => {
    const collection: Collection = {
      id: "collection",
      name: "Mixed API",
      folders: [],
      requests: [],
      created_at: "",
      updated_at: "",
    };
    const options: OpenApiExportOptions = {
      title: "Mixed API",
      api_version: "1.0.0",
      format: "json",
      server_url: null,
    };
    const coreResult = {
      content: "{\n  \"openapi\": \"3.0.3\"\n}\n",
      mime_type: "application/json",
      extension: "json" as const,
      request_count: 5,
      endpoint_count: 3,
      grouped_request_count: 2,
      warnings: [],
    };
    exportCollectionOpenApiCore.mockResolvedValue(coreResult);

    await expect(buildCollectionOpenApi(collection, options)).resolves.toBe(coreResult);
    expect(exportCollectionOpenApiCore).toHaveBeenCalledOnce();
    expect(exportCollectionOpenApiCore).toHaveBeenCalledWith(collection, options);
  });

  it("delegates an already parsed document inspection to the shared WASM core", async () => {
    const { parseOpenApi } = await import("./wasmClient");
    const spec = { openapi: "3.0.3", info: { title: "Demo" }, paths: {} };
    vi.mocked(parseOpenApi).mockResolvedValue(spec);
    const preview = {
      title: "Demo",
      specification_version: "3.0.3",
      endpoint_count: 0,
      folder_count: 0,
      tag_folder_count: 0,
      path_folder_count: 0,
      servers: [],
      security_schemes: [],
      warnings: [],
    };
    inspectOpenApiCore.mockResolvedValue(preview);

    await expect(
      inspectOpenApi({ kind: "text", content: '{"openapi":"3.0.3","paths":{}}' }),
    ).resolves.toBe(preview);
    expect(inspectOpenApiCore).toHaveBeenCalledWith(spec, "Imported API");
  });
});
