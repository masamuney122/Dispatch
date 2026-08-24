export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type RequestBodyType =
  | "none"
  | "json"
  | "text"
  | "html"
  | "xml"
  | "form-data"
  | "x-www-form-urlencoded"
  | "binary";

export type AuthConfig =
  | { type: "None" }
  | { type: "Bearer"; token: string }
  | { type: "Basic"; username: string; password: string }
  | { type: "ApiKey"; key: string; value: string; add_to: "Header" | "QueryParam" };

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  body: string;
  body_type: RequestBodyType;
  form_fields: Array<{ key: string; value: string }>;
  binary?: { name: string; mime_type: string; data_base64: string };
  headers: Record<string, string>;
  auth?: AuthConfig;
}

export interface HeaderRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  responseTimeMs: number;
  sizeBytes: number;
  body: string;
  bodyBase64?: string;
  headers: Record<string, string>;
}

export interface HistoryEntry {
  id: string;
  workspaceId: string;
  sentAt: string;
  request: ApiRequest;
  response?: ApiResponse;
  error?: string;
}

export const EMPTY_REQUEST: ApiRequest = {
  method: "GET",
  url: "",
  body: "",
  body_type: "none",
  form_fields: [],
  headers: {},
  auth: { type: "None" },
};
