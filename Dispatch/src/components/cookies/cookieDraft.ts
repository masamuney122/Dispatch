import type { CookieKey, StoredCookie } from "../../types/cookie";

export type CookieDraft = Omit<StoredCookie, "expires_at"> & {
  expires: string;
};

export const emptyCookieDraft = (domain: string): CookieDraft => ({
  name: "",
  value: "",
  domain,
  path: "/",
  expires: "",
  secure: false,
  http_only: false,
  same_site: null,
  host_only: true,
  enabled: true,
});

export const cookieKey = (cookie: CookieKey): string =>
  `${cookie.domain}\n${cookie.path}\n${cookie.name}`;

export const hostFromUrl = (value: string): string => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

export const normalizeCookieDomain = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    ).hostname
      .replace(/^\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
};

export const serializeCookie = (cookie: StoredCookie): string => {
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path || "/"}`];
  if (!cookie.host_only) parts.push(`Domain=${cookie.domain}`);
  if (cookie.expires_at) {
    parts.push(`Expires=${new Date(cookie.expires_at * 1000).toUTCString()}`);
  }
  if (cookie.secure) parts.push("Secure");
  if (cookie.http_only) parts.push("HttpOnly");
  if (cookie.same_site) {
    parts.push(
      `SameSite=${cookie.same_site[0].toUpperCase()}${cookie.same_site.slice(1)}`,
    );
  }
  return `${parts.join("; ")};`;
};

export const parseCookie = (
  value: string,
  fallbackDomain: string,
  enabled: boolean,
  now = Date.now(),
): CookieDraft => {
  const parts = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const pair = parts.shift();
  if (!pair) throw new Error("Cookie name and value are required.");

  const equalsIndex = pair.indexOf("=");
  if (equalsIndex <= 0) throw new Error("Use the name=value cookie format.");

  const draft = emptyCookieDraft(fallbackDomain);
  draft.name = pair.slice(0, equalsIndex).trim();
  draft.value = pair.slice(equalsIndex + 1).trim();
  draft.enabled = enabled;

  for (const part of parts) {
    const separator = part.indexOf("=");
    const attribute = (separator === -1 ? part : part.slice(0, separator))
      .trim()
      .toLowerCase();
    const attributeValue =
      separator === -1 ? "" : part.slice(separator + 1).trim();

    if (attribute === "path") {
      draft.path = attributeValue || "/";
    } else if (attribute === "domain") {
      const domain = normalizeCookieDomain(attributeValue);
      if (!domain) throw new Error("Cookie domain is not valid.");
      draft.domain = domain;
      draft.host_only = false;
    } else if (attribute === "expires") {
      const expires = new Date(attributeValue);
      if (Number.isNaN(expires.getTime())) {
        throw new Error("Cookie expiry date is not valid.");
      }
      draft.expires = expires.toISOString();
    } else if (attribute === "max-age") {
      const seconds = Number(attributeValue);
      if (!Number.isFinite(seconds)) {
        throw new Error("Cookie Max-Age must be a number.");
      }
      draft.expires = new Date(now + seconds * 1000).toISOString();
    } else if (attribute === "secure") {
      draft.secure = true;
    } else if (attribute === "httponly") {
      draft.http_only = true;
    } else if (attribute === "samesite") {
      const sameSite = attributeValue.toLowerCase();
      if (sameSite !== "strict" && sameSite !== "lax" && sameSite !== "none") {
        throw new Error("SameSite must be Strict, Lax, or None.");
      }
      draft.same_site = sameSite;
    }
  }

  if (!draft.name) throw new Error("Cookie name is required.");
  if (!draft.domain) throw new Error("Cookie domain is required.");
  if (!draft.path.startsWith("/")) {
    throw new Error("Cookie path must start with /.");
  }
  return draft;
};
