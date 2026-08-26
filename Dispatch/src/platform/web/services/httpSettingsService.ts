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
