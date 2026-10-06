import { invoke } from "@tauri-apps/api/core";
import type { CookieKey, CookieManagerSnapshot, StoredCookie } from "../../../types/cookie";

const snapshot = (cookies: StoredCookie[]): CookieManagerSnapshot => ({
  mode: "workspace",
  cookies,
});

export async function loadCookieManager(): Promise<CookieManagerSnapshot> {
  return snapshot(await invoke<StoredCookie[]>("list_cookies"));
}

export async function saveCookie(
  cookie: StoredCookie,
  previous?: CookieKey,
): Promise<CookieManagerSnapshot> {
  return snapshot(await invoke<StoredCookie[]>("upsert_cookie", { cookie, previous }));
}

export async function setCookieEnabled(
  key: CookieKey,
  enabled: boolean,
): Promise<CookieManagerSnapshot> {
  return snapshot(await invoke<StoredCookie[]>("set_cookie_enabled", { key, enabled }));
}

export async function deleteCookie(key: CookieKey): Promise<CookieManagerSnapshot> {
  return snapshot(await invoke<StoredCookie[]>("delete_cookie", { key }));
}

export async function clearCookies(): Promise<void> {
  await invoke("clear_cookies");
}
