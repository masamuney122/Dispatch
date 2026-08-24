export type HttpVersionPreference = "auto" | "http1" | "http2";

export interface GlobalHttpSettings {
  http_version: HttpVersionPreference;
  verify_ssl: boolean;
  follow_redirects: boolean;
  remove_referer_on_redirect: boolean;
  max_redirects: number;
}

export type RequestHttpSettings = Partial<GlobalHttpSettings>;

export const DEFAULT_HTTP_SETTINGS: GlobalHttpSettings = {
  http_version: "auto",
  verify_ssl: true,
  follow_redirects: true,
  remove_referer_on_redirect: false,
  max_redirects: 10,
};

export function resolveHttpSettings(
  globalSettings: GlobalHttpSettings,
  requestSettings?: RequestHttpSettings,
): GlobalHttpSettings {
  const overrides = Object.fromEntries(
    Object.entries(requestSettings || {}).filter(([, value]) => value !== null && value !== undefined),
  ) as RequestHttpSettings;
  return { ...globalSettings, ...overrides };
}
