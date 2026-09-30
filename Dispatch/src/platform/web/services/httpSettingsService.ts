import {
  DEFAULT_HTTP_SETTINGS,
  type GlobalHttpSettings,
} from "../../../types/httpSettings";

const STORAGE_KEY = "dispatch.http-settings.v1";

export async function loadGlobalHttpSettings(): Promise<GlobalHttpSettings> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_HTTP_SETTINGS };
    const parsed = JSON.parse(saved) as Partial<GlobalHttpSettings>;
    return {
      ...DEFAULT_HTTP_SETTINGS,
      ...parsed,
      max_redirects: normalizeRedirectLimit(parsed.max_redirects),
      request_timeout_ms: normalizeTimeout(parsed.request_timeout_ms),
      max_response_size_mb: normalizeResponseSize(parsed.max_response_size_mb),
      cookies_enabled: parsed.cookies_enabled !== false,
      cookie_credentials: normalizeCookieCredentials(parsed.cookie_credentials),
    };
  } catch {
    return { ...DEFAULT_HTTP_SETTINGS };
  }
}

export async function saveGlobalHttpSettings(
  settings: GlobalHttpSettings,
): Promise<GlobalHttpSettings> {
  const normalized = {
    ...settings,
    max_redirects: normalizeRedirectLimit(settings.max_redirects),
    request_timeout_ms: normalizeTimeout(settings.request_timeout_ms),
    max_response_size_mb: normalizeResponseSize(settings.max_response_size_mb),
    cookies_enabled: settings.cookies_enabled !== false,
    cookie_credentials: normalizeCookieCredentials(settings.cookie_credentials),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeCookieCredentials(value: unknown): GlobalHttpSettings["cookie_credentials"] {
  return value === "omit" || value === "include" || value === "same-origin"
    ? value
    : "same-origin";
}

function normalizeRedirectLimit(value: unknown): number {
  return Math.min(100, Math.max(1, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 10));
}

function normalizeTimeout(value: unknown): number {
  const milliseconds = Number(value);
  return Math.min(
    3_600_000,
    Math.max(0, Number.isFinite(milliseconds) ? Math.round(milliseconds) : 0),
  );
}

function normalizeResponseSize(value: unknown): number {
  const megabytes = Number(value);
  return Math.min(
    1_024,
    Math.max(0, Number.isFinite(megabytes) ? Math.round(megabytes) : 50),
  );
}
