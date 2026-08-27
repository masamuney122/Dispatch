import type { AuthConfig } from "./auth";
import type { RequestHttpSettings } from "./httpSettings";
import type { RequestScripts } from "./script";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type RequestSectionTab = "Docs" | "Params" | "Authorization" | "Headers" | "Body" | "Scripts" | "Settings";

export type RequestBodyType =
  | "none"
  | "json"
  | "text"
  | "html"
  | "xml"
  | "form-data"
  | "x-www-form-urlencoded"
  | "binary";

export interface BodyField {
  key: string;
  value: string;
}

export interface BinaryBody {
  name: string;
  mime_type: string;
  data_base64: string;
}

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  body: string;
  body_type: RequestBodyType;
  form_fields: BodyField[];
  binary?: BinaryBody;
  headers: Record<string, string>;
  auth?: AuthConfig;
  settings?: RequestHttpSettings;
  scripts?: RequestScripts;
}
