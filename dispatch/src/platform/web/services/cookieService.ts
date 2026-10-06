import type { CookieKey, CookieManagerSnapshot, StoredCookie } from "../../../types/cookie";

const browserSnapshot = (): CookieManagerSnapshot => ({ mode: "browser", cookies: [] });

export async function loadCookieManager(): Promise<CookieManagerSnapshot> {
  return browserSnapshot();
}

const unsupported = (): never => {
  throw new Error("Cookies are managed by the browser in the web version.");
};

export async function saveCookie(
  cookie: StoredCookie,
  previous?: CookieKey,
): Promise<CookieManagerSnapshot> {
  void cookie;
  void previous;
  return unsupported();
}

export async function setCookieEnabled(
  key: CookieKey,
  enabled: boolean,
): Promise<CookieManagerSnapshot> {
  void key;
  void enabled;
  return unsupported();
}

export async function deleteCookie(key: CookieKey): Promise<CookieManagerSnapshot> {
  void key;
  return unsupported();
}

export async function clearCookies(): Promise<void> {
  unsupported();
}
