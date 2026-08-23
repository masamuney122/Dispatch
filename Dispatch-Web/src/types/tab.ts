import type { HttpMethod, RequestSectionTab, BinaryBody, BodyField, RequestBodyType } from "./request";
import type { ApiResponse } from "./response";
import type { AuthConfig } from "./auth";

export interface QueryParamItem {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface HeaderItem {
  key: string;
  value: string;
  enabled?: boolean;
}

/**
 * Full state for a single request tab.
 * Each tab holds its own method, URL, params, headers, body,
 * auth config, response, and selection tracking.
 */
export interface RequestTabState {
  id: string;
  title: string;
  method: HttpMethod;
  url: string;
  queryParams: QueryParamItem[];
  headers: HeaderItem[];
  body: string;
  bodyType: RequestBodyType;
  formFields: BodyField[];
  binary?: BinaryBody;
  auth: AuthConfig;
  activeSectionTab: RequestSectionTab;
  response: ApiResponse | null;
  loading: boolean;
  error: string | null;
  selectedHistoryId: string | null;
  selectedSavedRequestId: string | null;
  isDirty: boolean;
}

export interface RequestWorkspaceTab {
  id: string;
  kind: "request";
  requestId: string;
}

export interface EnvironmentWorkspaceTab {
  id: string;
  kind: "environment";
  environmentId: string;
}

/**
 * Lightweight references for the tabs shown in the shared workspace tab bar.
 * Environment data remains in the application-level environment state.
 */
export type WorkspaceTab = RequestWorkspaceTab | EnvironmentWorkspaceTab;

/** Creates a fresh tab with default values. */
export const createDefaultTab = (index: number = 1): RequestTabState => ({
  id: crypto.randomUUID(),
  title: index === 1 ? "Untitled Request" : `Untitled Request ${index}`,
  method: "GET",
  url: "",
  queryParams: [],
  headers: [],
  body: "",
  bodyType: "json",
  formFields: [],
  auth: { type: "None" },
  activeSectionTab: "Params",
  response: null,
  loading: false,
  error: null,
  selectedHistoryId: null,
  selectedSavedRequestId: null,
  isDirty: false,
});
