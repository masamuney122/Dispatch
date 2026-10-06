import type {
  ApiRequest,
  RequestQueryParam,
  RequestTemplate,
} from "../types/request";
import type { Collection, SavedRequest } from "../types/collection";
import type { HistoryItem } from "../types/history";
import type { RequestTabState } from "../types/tab";
import { EMPTY_REQUEST_SCRIPTS } from "../types/script";

export function buildRequestUrl(
  targetUrl: string,
  params: RequestQueryParam[],
): string {
  const validParams = params.filter((param) => param.key.trim());
  if (validParams.length === 0) return targetUrl;
  try {
    const [base, existingSearch] = targetUrl.split("?");
    const templates: string[] = [];
    const protectTemplates = (value: string) =>
      value.replace(/\{\{[^{}]*\}\}/g, (template) => {
        const marker = `__DISPATCH_TEMPLATE_${templates.length}__`;
        templates.push(template);
        return marker;
      });
    const restoreTemplates = (value: string) =>
      templates.reduce(
        (restored, template, index) =>
          restored.replaceAll(`__DISPATCH_TEMPLATE_${index}__`, template),
        value,
      );

    const searchParams = new URLSearchParams(
      protectTemplates(existingSearch || ""),
    );
    validParams.forEach((param) => {
      searchParams.set(
        protectTemplates(param.key.trim()),
        protectTemplates(param.value),
      );
    });
    return `${base}?${restoreTemplates(searchParams.toString())}`;
  } catch {
    return targetUrl;
  }
}

export function createRequestTemplate(tab: RequestTabState): RequestTemplate {
  const headers = Object.fromEntries(
    tab.headers
      .filter((header) => header.enabled !== false && header.key.trim())
      .map((header) => [header.key.trim(), header.value || ""]),
  );
  return {
    request: {
      method: tab.method,
      url: tab.url,
      body: tab.body,
      body_type: tab.bodyType,
      form_fields: tab.formFields,
      binary: tab.binary,
      headers,
      auth: tab.auth,
      settings: tab.settings,
      scripts: tab.scripts,
    },
    queryParams: tab.queryParams.map(({ key, value }) => ({ key, value })),
  };
}

export function createRequestPayload(tab: RequestTabState): ApiRequest {
  const template = createRequestTemplate(tab);
  return {
    ...template.request,
    url: buildRequestUrl(template.request.url, template.queryParams),
  };
}

export function requestDisplayName(tab: RequestTabState): string {
  if (tab.title && tab.title !== "Untitled Request") return tab.title;
  try {
    const parsed = new URL(tab.url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${tab.method} ${parsed.hostname}${path}`;
  } catch {
    return tab.title || "Untitled Request";
  }
}

export function historyTabUpdates(
  item: HistoryItem,
): Partial<RequestTabState> {
  const queryParams: RequestTabState["queryParams"] = [];
  try {
    if (item.url.includes("?")) {
      const [, search] = item.url.split("?");
      new URLSearchParams(search).forEach((value, key) => {
        queryParams.push({ key, value });
      });
    }
  } catch {
    queryParams.length = 0;
  }

  return {
    method: item.method as RequestTabState["method"],
    url: item.url,
    body: item.body || "",
    queryParams,
    auth: item.auth || { type: "None" },
    settings: {},
    scripts: { ...EMPTY_REQUEST_SCRIPTS },
    scriptReports: [],
    lastExecutedRequest: null,
    response: null,
    error: null,
    selectedHistoryId: item.id,
    selectedSavedRequestId: null,
    isDirty: false,
  };
}

export function savedRequestTabUpdates(
  item: SavedRequest,
): Partial<RequestTabState> {
  return {
    title: item.name,
    method: item.request.method,
    url: item.request.url,
    body: item.request.body,
    bodyType: item.request.body_type,
    formFields: item.request.form_fields,
    binary: item.request.binary,
    queryParams: [],
    headers: Object.entries(item.request.headers).map(([key, value]) => ({
      key,
      value,
    })),
    auth: item.request.auth || { type: "None" },
    settings: item.request.settings || {},
    scripts: {
      ...EMPTY_REQUEST_SCRIPTS,
      ...(item.request.scripts || {}),
    },
    scriptReports: [],
    lastExecutedRequest: null,
    response: null,
    error: null,
    selectedHistoryId: null,
    selectedSavedRequestId: item.id,
    isDirty: false,
  };
}

export function requestBreadcrumb(
  collections: Collection[],
  requestId: string | null,
): string[] {
  if (!requestId) return [];
  const collection = collections.find((item) =>
    item.requests.some((request) => request.id === requestId),
  );
  if (!collection) return [];

  const request = collection.requests.find((item) => item.id === requestId);
  if (!request) return [collection.name];

  const foldersById = new Map(
    collection.folders.map((folder) => [folder.id, folder]),
  );
  const folderNames: string[] = [];
  const visitedFolderIds = new Set<string>();
  let folderId = request.folder_id ?? null;

  while (folderId && !visitedFolderIds.has(folderId)) {
    visitedFolderIds.add(folderId);
    const folder = foldersById.get(folderId);
    if (!folder) break;
    folderNames.unshift(folder.name);
    folderId = folder.parent_folder_id ?? null;
  }

  return [collection.name, ...folderNames];
}
