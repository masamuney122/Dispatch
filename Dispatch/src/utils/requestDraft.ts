import type { ApiRequest } from "../types/request";
import type { QueryParamItem, RequestTabState } from "../types/tab";

export interface RequestTemplate {
  request: ApiRequest;
  queryParams: Array<Pick<QueryParamItem, "key" | "value">>;
}

export function buildRequestUrl(
  targetUrl: string,
  params: Array<Pick<QueryParamItem, "key" | "value">>,
): string {
  const validParams = params.filter((param) => param.key.trim());
  if (validParams.length === 0) return targetUrl;
  try {
    const [base, existingSearch] = targetUrl.split("?");
    const searchParams = new URLSearchParams(existingSearch || "");
    validParams.forEach((param) => {
      searchParams.set(param.key.trim(), param.value);
    });
    return `${base}?${searchParams.toString()}`;
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
