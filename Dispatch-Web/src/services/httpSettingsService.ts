import {
  DEFAULT_HTTP_SETTINGS,
  type GlobalHttpSettings,
} from "../types/httpSettings";

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
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeRedirectLimit(value: unknown): number {
  return Math.min(100, Math.max(1, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 10));
}
