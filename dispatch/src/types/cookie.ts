export type CookieCredentials = "omit" | "same-origin" | "include";

export interface CookieKey {
  domain: string;
  path: string;
  name: string;
}

export interface StoredCookie extends CookieKey {
  value: string;
  expires_at: number | null;
  secure: boolean;
  http_only: boolean;
  same_site: "strict" | "lax" | "none" | null;
  host_only: boolean;
  enabled: boolean;
}

export type CookieManagerMode = "workspace" | "browser";

export interface CookieManagerSnapshot {
  mode: CookieManagerMode;
  cookies: StoredCookie[];
}
