import { saveCollectionsDocument, saveEnvironmentsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import type { AuthConfig } from "../types/auth";
import type { Collection, Folder, SavedRequest } from "../types/collection";
import type { Environment } from "../types/environment";
import type {
  OpenApiExportOptions,
  OpenApiExportResult,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiImportResult,
  OpenApiSource,
  OpenApiWarning,
} from "../types/openapi";
import type { ApiRequest, BodyField, RequestBodyType } from "../types/request";
import { parseOpenApi, serializeOpenApiYaml } from "./wasmClient";
import { getActiveWorkspace, updateActiveWorkspace } from "./workspaceRuntime";

type JsonObject = Record<string, unknown>;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
const MAX_OPERATIONS = 2_000;

const objectValue = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const stringValue = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const warning = (code: string, message: string, location: string | null = null): OpenApiWarning => ({
  code,
  message,
  location,
});

async function parseSource(source: OpenApiSource): Promise<JsonObject> {
  return parseOpenApi(source.content);
}

function serverUrls(spec: JsonObject): string[] {
  return arrayValue(spec.servers)
    .map(objectValue)
    .filter((server): server is JsonObject => server !== null)
    .map((server) => stringValue(server.url))
    .filter((server): server is string => Boolean(server));
}

function firstStaticPathSegment(path: string): string | null {
  return (
    path
      .split("/")
      .map((segment) => segment.trim())
      .find(
        (segment) =>
          segment.length > 0 && !(segment.startsWith("{") && segment.endsWith("}"))
      ) ?? null
  );
}

function inspectSpec(spec: JsonObject, fallbackTitle: string): OpenApiImportPreview {
  const paths = objectValue(spec.paths) ?? {};
  const tags = new Set<string>();
  const pathFolders = new Set<string>();
  const warnings: OpenApiWarning[] = [];
  let endpointCount = 0;

  if (spec.webhooks !== undefined) {
    warnings.push(warning("unsupported-webhooks", "Webhooks içe aktarılmıyor."));
  }

  for (const [pathName, rawPathItem] of Object.entries(paths)) {
    const pathItem = objectValue(rawPathItem);
    if (!pathItem) continue;
    if (pathItem.$ref !== undefined) {
      warnings.push(
        warning(
          "external-or-path-reference",
          "Referans verilen Path Item nesneleri ilk sürümde içe aktarılmıyor.",
          pathName
        )
      );
      continue;
    }
    const operations = Object.entries(pathItem).filter(([method]) =>
      HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])
    );
    if (operations.length > 0) {
      const folder = firstStaticPathSegment(pathName);
      if (folder) pathFolders.add(folder);
    }
    for (const [method, rawOperation] of operations) {
      const operation = objectValue(rawOperation);
      if (!operation) continue;
      endpointCount += 1;
      if (endpointCount > MAX_OPERATIONS) {
        throw new Error(`OpenAPI belgesi ${MAX_OPERATIONS} işlem sınırını aşıyor.`);
      }
      const operationTags = arrayValue(operation.tags).filter(
        (tag): tag is string => typeof tag === "string"
      );
      if (operationTags[0]) tags.add(operationTags[0]);
      if (operationTags.length > 1) {
        warnings.push(
          warning(
            "multiple-tags",
            "İşlemde birden fazla tag var; Tags düzeninde ilk tag klasör olarak kullanılır.",
            `${method.toUpperCase()} ${pathName}`
          )
        );
      }
      if (operation.callbacks !== undefined) {
        warnings.push(
          warning(
            "unsupported-callback",
            "Callbacks içe aktarılmıyor.",
            `${method.toUpperCase()} ${pathName}`
          )
        );
      }
    }
  }

  const info = objectValue(spec.info) ?? {};
  const securitySchemes = objectValue(objectValue(spec.components)?.securitySchemes) ?? {};
  return {
    title: stringValue(info.title) || fallbackTitle,
    specification_version: stringValue(spec.openapi) || "",
    endpoint_count: endpointCount,
    folder_count: tags.size,
    tag_folder_count: tags.size,
    path_folder_count: pathFolders.size,
    servers: serverUrls(spec),
    security_schemes: Object.keys(securitySchemes),
    warnings,
  };
}

export async function inspectOpenApi(source: OpenApiSource): Promise<OpenApiImportPreview> {
  const spec = await parseSource(source);
  const fallback = source.kind === "file" ? source.name.replace(/\.(json|ya?ml)$/i, "") : "Imported API";
  return inspectSpec(spec, fallback);
}

function resolveLocal(spec: JsonObject, value: unknown): unknown | null {
  let current: unknown = value;
  for (let depth = 0; depth < 16; depth += 1) {
    const object = objectValue(current);
    const reference = object ? stringValue(object.$ref) : null;
    if (!reference) return current;
    if (!reference.startsWith("#/")) return null;
    current = reference
      .slice(2)
      .split("/")
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce<unknown>((target, part) => objectValue(target)?.[part], spec);
    if (current === undefined) return null;
  }
  return null;
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function generateExample(spec: JsonObject, rawSchema: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  const schema = objectValue(resolveLocal(spec, rawSchema));
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  const enumValues = arrayValue(schema.enum);
  if (enumValues.length > 0) return enumValues[0];
  const type = stringValue(schema.type) || (objectValue(schema.properties) ? "object" : "string");
  if (type === "object") {
    return Object.fromEntries(
      Object.entries(objectValue(schema.properties) ?? {}).map(([key, value]) => [
        key,
        generateExample(spec, value, depth + 1),
      ])
    );
  }
  if (type === "array") return [generateExample(spec, schema.items, depth + 1)];
  if (type === "integer") return 0;
  if (type === "number") return 0;
  if (type === "boolean") return true;
  return "string";
}

function parameterExample(spec: JsonObject, parameter: JsonObject, name: string): string {
  if (parameter.example !== undefined) return scalarText(parameter.example);
  const schema = objectValue(resolveLocal(spec, parameter.schema));
  if (schema) {
    const example = schema.example ?? schema.default ?? arrayValue(schema.enum)[0];
    if (example !== undefined) return scalarText(example);
  }
  return `{{${name}}}`;
}

function encodeQueryPart(value: string): string {
  return value.includes("{{") ? value : encodeURIComponent(value);
}

function requestBody(
  spec: JsonObject,
  operation: JsonObject,
  headers: Record<string, string>,
  warnings: OpenApiWarning[]
): { body: string; bodyType: RequestBodyType; formFields: BodyField[] } {
  const body = objectValue(resolveLocal(spec, operation.requestBody));
  if (!body) return { body: "", bodyType: "none", formFields: [] };
  const content = objectValue(body.content) ?? {};
  const choices: Array<[string, RequestBodyType]> = [
    ["application/json", "json"],
    ["multipart/form-data", "form-data"],
    ["application/x-www-form-urlencoded", "x-www-form-urlencoded"],
    ["application/xml", "xml"],
    ["text/html", "html"],
    ["text/plain", "text"],
  ];
  const selected = choices.find(([contentType]) => content[contentType] !== undefined);
  if (!selected) {
    warnings.push(warning("unsupported-request-body", "Request body content type desteklenmiyor."));
    return { body: "", bodyType: "none", formFields: [] };
  }
  const [contentType, bodyType] = selected;
  headers["Content-Type"] = contentType;
  const media = objectValue(content[contentType]) ?? {};
  const example = media.example ?? generateExample(spec, media.schema);
  if (bodyType === "form-data" || bodyType === "x-www-form-urlencoded") {
    const values = objectValue(example) ?? {};
    return {
      body: "",
      bodyType,
      formFields: Object.entries(values).map(([key, value]) => ({ key, value: scalarText(value) })),
    };
  }
  if (bodyType === "json") {
    return { body: JSON.stringify(example ?? {}, null, 2), bodyType, formFields: [] };
  }
  return { body: scalarText(example), bodyType, formFields: [] };
}

function operationAuth(spec: JsonObject, operation: JsonObject): AuthConfig {
  const security = arrayValue(operation.security ?? spec.security);
  const requirement = objectValue(security[0]);
  const schemeName = requirement ? Object.keys(requirement)[0] : undefined;
  const schemes = objectValue(objectValue(spec.components)?.securitySchemes) ?? {};
  const scheme = schemeName ? objectValue(resolveLocal(spec, schemes[schemeName])) : null;
  if (!scheme) return { type: "None" };
  const type = stringValue(scheme.type)?.toLowerCase();
  if (type === "http" && stringValue(scheme.scheme)?.toLowerCase() === "bearer") {
    return { type: "Bearer", token: "" };
  }
  if (type === "http" && stringValue(scheme.scheme)?.toLowerCase() === "basic") {
    return { type: "Basic", username: "", password: "" };
  }
  if (type === "apikey") {
    return {
      type: "ApiKey",
      key: stringValue(scheme.name) || "X-API-Key",
      value: "",
      add_to: stringValue(scheme.in) === "query" ? "QueryParam" : "Header",
    };
  }
  if (type === "oauth2") {
    const flows = objectValue(scheme.flows) ?? {};
    const authorization = objectValue(flows.authorizationCode);
    const client = objectValue(flows.clientCredentials);
    const password = objectValue(flows.password);
    const flow = authorization ?? client ?? password ?? {};
    const scopes = Object.keys(objectValue(flow.scopes) ?? {}).join(" ");
    return {
      type: "OAuth2",
      grant_type: authorization
        ? "authorization_code"
        : client
          ? "client_credentials"
          : "password",
      access_token_url: stringValue(flow.tokenUrl) || "",
      client_id: "",
      client_secret: "",
      scope: scopes,
      username: "",
      password: "",
      access_token: "",
      authorization_url: stringValue(flow.authorizationUrl) || "",
      redirect_uri: "",
    };
  }
  return { type: "None" };
}

function convertOperation(
  spec: JsonObject,
  pathName: string,
  pathItem: JsonObject,
  method: string,
  operation: JsonObject,
  selectedServer: string | null,
  variables: Record<string, string>,
  warnings: OpenApiWarning[]
): ApiRequest {
  let urlPath = pathName;
  const query: Array<[string, string]> = [];
  const headers: Record<string, string> = {};
  for (const rawParameter of [...arrayValue(pathItem.parameters), ...arrayValue(operation.parameters)]) {
    const parameter = objectValue(resolveLocal(spec, rawParameter));
    if (!parameter) {
      warnings.push(warning("unsupported-reference", "Bir parameter referansı çözülemedi."));
      continue;
    }
    const name = stringValue(parameter.name);
    if (!name) continue;
    const value = parameterExample(spec, parameter, name);
    switch (stringValue(parameter.in)) {
      case "path":
        urlPath = urlPath.replaceAll(`{${name}}`, `{{${name}}}`);
        if (!value.startsWith("{{")) variables[name] ??= value;
        break;
      case "query":
        query.push([name, value]);
        break;
      case "header":
        headers[name] = value;
        break;
      case "cookie":
        warnings.push(warning("unsupported-cookie-parameter", "Cookie parameterleri içe aktarılmıyor."));
        break;
    }
  }
  let url = selectedServer ? `{{baseUrl}}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}` : urlPath;
  if (query.length > 0) {
    url += `${url.includes("?") ? "&" : "?"}${query
      .map(([key, value]) => `${encodeQueryPart(key)}=${encodeQueryPart(value)}`)
      .join("&")}`;
  }
  const convertedBody = requestBody(spec, operation, headers, warnings);
  return {
    method: method.toUpperCase() as ApiRequest["method"],
    url,
    body: convertedBody.body,
    body_type: convertedBody.bodyType,
    form_fields: convertedBody.formFields,
    headers,
    auth: operationAuth(spec, operation),
  };
}

function fallbackRequestName(
  operation: JsonObject,
  method: string,
  pathName: string,
  request: ApiRequest
): string {
  const summary = stringValue(operation.summary)?.trim();
  const operationId = stringValue(operation.operationId)?.trim();
  const description = stringValue(operation.description)
    ?.split("\n")
    .find((line) => line.trim())
    ?.trim();
  return summary || operationId || description || request.url || `${method.toUpperCase()} ${pathName}`;
}

function uniqueName(requested: string, existing: string[]): string {
  if (!existing.includes(requested)) return requested;
  if (!existing.includes(`${requested} (Imported)`)) return `${requested} (Imported)`;
  for (let number = 2; ; number += 1) {
    const candidate = `${requested} (Imported ${number})`;
    if (!existing.includes(candidate)) return candidate;
  }
}

function convertToCollection(
  spec: JsonObject,
  name: string,
  server: string | null,
  options: OpenApiImportOptions
): { collection: Collection; variables: Record<string, string>; warnings: OpenApiWarning[] } {
  const collectionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const paths = objectValue(spec.paths) ?? {};
  const folders: Folder[] = [];
  const folderIds = new Map<string, string>();
  const requests: SavedRequest[] = [];
  const variables: Record<string, string> = {};
  const warnings = inspectSpec(spec, name).warnings;

  const ensureFolder = (folderName: string): string => {
    const existing = folderIds.get(folderName);
    if (existing) return existing;
    const id = crypto.randomUUID();
    folderIds.set(folderName, id);
    folders.push({
      id,
      name: folderName,
      collection_id: collectionId,
      parent_folder_id: null,
      order: folders.length,
      created_at: now,
      updated_at: now,
    });
    return id;
  };

  if (options.folder_organization === "tags") {
    const usedTags = new Set(
      Object.values(paths)
        .map(objectValue)
        .filter((item): item is JsonObject => item !== null)
        .flatMap((item) =>
          Object.entries(item)
            .filter(([method]) => HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number]))
            .map(([, operation]) => stringValue(arrayValue(objectValue(operation)?.tags)[0]))
        )
        .filter((tag): tag is string => Boolean(tag))
    );
    for (const rawTag of arrayValue(spec.tags)) {
      const tag = objectValue(rawTag);
      const tagName = tag ? stringValue(tag.name) : null;
      if (tagName && usedTags.has(tagName)) ensureFolder(tagName);
    }
  }

  for (const [pathName, rawPathItem] of Object.entries(paths)) {
    const pathItem = objectValue(rawPathItem);
    if (!pathItem || pathItem.$ref !== undefined) continue;
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) continue;
      const operation = objectValue(rawOperation);
      if (!operation) continue;
      const folderName =
        options.folder_organization === "tags"
          ? stringValue(arrayValue(operation.tags)[0])
          : firstStaticPathSegment(pathName);
      const folderId = folderName ? ensureFolder(folderName) : null;
      const request = convertOperation(
        spec,
        pathName,
        pathItem,
        method,
        operation,
        server,
        variables,
        warnings
      );
      const requestName =
        options.request_naming === "path"
          ? `${method.toUpperCase()} ${pathName}`
          : options.request_naming === "url"
            ? request.url
            : fallbackRequestName(operation, method, pathName, request);
      requests.push({
        id: crypto.randomUUID(),
        name: requestName,
        request,
        folder_id: folderId,
        order: requests.filter((item) => (item.folder_id ?? null) === folderId).length,
        created_at: now,
        updated_at: now,
      });
    }
  }
  if (requests.length === 0) throw new Error("OpenAPI belgesinde desteklenen bir operation bulunamadı.");
  return {
    collection: { id: collectionId, name, folders, requests, created_at: now, updated_at: now },
    variables,
    warnings,
  };
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
  const server = options.selected_server?.trim() || serverUrls(spec)[0] || null;
  const converted = convertToCollection(spec, collectionName, server, options);
  if (server) converted.variables.baseUrl = server;

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
      variables: converted.variables,
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

function dispatchVariables(value: string): string[] {
  return [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => match[1]).filter(
    (value, index, items) => items.indexOf(value) === index
  );
}

function openApiPathVariables(value: string): string[] {
  return [...value.matchAll(/{([^{}]+)}/g)].map((match) => match[1]).filter(
    (variable, index, variables) => variables.indexOf(variable) === index
  );
}

function exportUrlParts(url: string): { path: string; parameters: JsonObject[] } {
  let raw = url;
  if (raw.startsWith("{{baseUrl}}")) raw = raw.slice("{{baseUrl}}".length);
  else {
    try {
      const parsed = new URL(raw);
      raw = `${parsed.pathname}${parsed.search}`;
    } catch {
      // Relative and templated URLs are handled below.
    }
  }
  const [pathPart, queryPart = ""] = raw.split("?", 2);
  let path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  for (const variable of dispatchVariables(path)) {
    path = path.replaceAll(`{{${variable}}}`, `{${variable}}`);
  }
  const parameters = [...new URLSearchParams(queryPart).entries()].map(([name, example]) => ({
    name,
    in: "query",
    required: false,
    schema: { type: "string" },
    example,
  }));
  return { path, parameters };
}

function inferSchema(value: unknown): unknown {
  if (Array.isArray(value)) return { type: "array", items: inferSchema(value[0]) ?? {} };
  if (value === null) return { nullable: true };
  if (typeof value === "object") {
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value as JsonObject).map(([key, child]) => [key, inferSchema(child)])
      ),
    };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  return { type: "string" };
}

function exportRequestBody(request: ApiRequest): JsonObject | null {
  if (request.body_type === "none" || request.body_type === "binary") return null;
  let contentType = "text/plain";
  let example: unknown = request.body;
  if (request.body_type === "json") {
    contentType = "application/json";
    try {
      example = JSON.parse(request.body);
    } catch {
      example = request.body;
    }
  } else if (request.body_type === "html") contentType = "text/html";
  else if (request.body_type === "xml") contentType = "application/xml";
  else if (request.body_type === "form-data") {
    contentType = "multipart/form-data";
    example = Object.fromEntries(request.form_fields.map((field) => [field.key, field.value]));
  } else if (request.body_type === "x-www-form-urlencoded") {
    contentType = "application/x-www-form-urlencoded";
    example = Object.fromEntries(request.form_fields.map((field) => [field.key, field.value]));
  }
  return { content: { [contentType]: { schema: inferSchema(example), example } } };
}

function exportSecurity(auth: AuthConfig | undefined): {
  name: string;
  scheme: JsonObject;
  requirement: unknown[];
} | null {
  if (!auth || auth.type === "None") return null;
  if (auth.type === "Bearer") {
    return { name: "bearerAuth", scheme: { type: "http", scheme: "bearer" }, requirement: [] };
  }
  if (auth.type === "Basic") {
    return { name: "basicAuth", scheme: { type: "http", scheme: "basic" }, requirement: [] };
  }
  if (auth.type === "ApiKey") {
    return {
      name: "apiKeyAuth",
      scheme: { type: "apiKey", name: auth.key, in: auth.add_to === "QueryParam" ? "query" : "header" },
      requirement: [],
    };
  }
  const flowName =
    auth.grant_type === "authorization_code"
      ? "authorizationCode"
      : auth.grant_type === "client_credentials"
        ? "clientCredentials"
        : "password";
  const flow: JsonObject = {
    tokenUrl: auth.access_token_url,
    scopes: Object.fromEntries(auth.scope.split(/\s+/).filter(Boolean).map((scope) => [scope, ""])),
  };
  if (flowName === "authorizationCode") flow.authorizationUrl = auth.authorization_url || "";
  return { name: "oauth2", scheme: { type: "oauth2", flows: { [flowName]: flow } }, requirement: [] };
}

function folderOrderPath(collection: Collection, folder: Folder): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  const visited = new Set<string>();
  let current: Folder | undefined = folder;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push([current.order, collection.folders.findIndex((item) => item.id === current!.id)]);
    current = current.parent_folder_id
      ? collection.folders.find((item) => item.id === current!.parent_folder_id)
      : undefined;
  }
  return path.reverse();
}

function comparePaths(left: Array<[number, number]>, right: Array<[number, number]>): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index][0] !== right[index][0]) return left[index][0] - right[index][0];
    if (left[index][1] !== right[index][1]) return left[index][1] - right[index][1];
  }
  return left.length - right.length;
}

function fullFolderName(collection: Collection, folder: Folder): string {
  const names = [folder.name];
  const visited = new Set<string>();
  let parentId = folder.parent_folder_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = collection.folders.find((item) => item.id === parentId);
    if (!parent) break;
    names.push(parent.name);
    parentId = parent.parent_folder_id;
  }
  return names.reverse().join(" / ");
}

export async function exportCollectionOpenApi(
  collection: Collection,
  options: OpenApiExportOptions
): Promise<OpenApiExportResult> {
  const paths: JsonObject = {};
  const securitySchemes: JsonObject = {};
  const warnings: OpenApiWarning[] = [];
  const usedFolderIds = new Set<string>();
  let endpointCount = 0;
  const orderedRequests = [...collection.requests].sort((left, right) => {
    const leftFolder = left.folder_id
      ? collection.folders.find((folder) => folder.id === left.folder_id)
      : undefined;
    const rightFolder = right.folder_id
      ? collection.folders.find((folder) => folder.id === right.folder_id)
      : undefined;
    const leftPath = leftFolder ? folderOrderPath(collection, leftFolder) : [];
    const rightPath = rightFolder ? folderOrderPath(collection, rightFolder) : [];
    leftPath.push([left.order, collection.requests.indexOf(left)]);
    rightPath.push([right.order, collection.requests.indexOf(right)]);
    return comparePaths(leftPath, rightPath) || left.name.localeCompare(right.name);
  });

  for (const saved of orderedRequests) {
    const method = saved.request.method.toLowerCase();
    if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
      warnings.push(warning("unsupported-method", "Request metodu dışa aktarılmadı.", saved.name));
      continue;
    }
    const urlParts = exportUrlParts(saved.request.url);
    const pathItem = (objectValue(paths[urlParts.path]) ?? {}) as JsonObject;
    paths[urlParts.path] = pathItem;
    if (pathItem[method]) {
      warnings.push(
        warning("duplicate-operation", "Aynı path ve metodu kullanan sonraki request atlandı.", saved.name)
      );
      continue;
    }
    const operation: JsonObject = { summary: saved.name };
    if (saved.folder_id) {
      const folder = collection.folders.find((item) => item.id === saved.folder_id);
      if (folder) {
        operation.tags = [fullFolderName(collection, folder)];
        usedFolderIds.add(folder.id);
      }
    }
    const parameters = [...urlParts.parameters];
    for (const variable of openApiPathVariables(urlParts.path)) {
      parameters.push({ name: variable, in: "path", required: true, schema: { type: "string" } });
    }
    for (const [key, value] of Object.entries(saved.request.headers)) {
      if (key.toLowerCase() === "content-type" || key.toLowerCase() === "authorization") continue;
      parameters.push({ name: key, in: "header", required: false, schema: { type: "string" }, example: value });
    }
    if (parameters.length > 0) operation.parameters = parameters;
    const body = exportRequestBody(saved.request);
    if (body) operation.requestBody = body;
    const security = exportSecurity(saved.request.auth);
    if (security) {
      securitySchemes[security.name] ??= security.scheme;
      operation.security = [{ [security.name]: security.requirement }];
    }
    operation.responses = { "200": { description: "Successful response" } };
    pathItem[method] = operation;
    endpointCount += 1;
  }

  const spec: JsonObject = {
    openapi: "3.0.3",
    info: {
      title: options.title.trim() || collection.name,
      version: options.api_version.trim() || "1.0.0",
    },
  };
  if (options.server_url?.trim()) spec.servers = [{ url: options.server_url.trim() }];
  const orderedFolders = collection.folders
    .filter((folder) => usedFolderIds.has(folder.id))
    .sort((left, right) => comparePaths(folderOrderPath(collection, left), folderOrderPath(collection, right)));
  if (orderedFolders.length > 0) {
    spec.tags = orderedFolders.map((folder) => ({ name: fullFolderName(collection, folder) }));
  }
  spec.paths = paths;
  if (Object.keys(securitySchemes).length > 0) spec.components = { securitySchemes };

  const content =
    options.format === "json"
      ? `${JSON.stringify(spec, null, 2)}\n`
      : await serializeOpenApiYaml(spec);
  return {
    content,
    mime_type: options.format === "json" ? "application/json" : "application/yaml",
    extension: options.format,
    endpoint_count: endpointCount,
    warnings,
  };
}

export function downloadOpenApi(result: OpenApiExportResult, collectionName: string): void {
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
