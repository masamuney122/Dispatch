import { describe, expect, it } from "vitest";
import type { StoredCookie } from "../../types/cookie";
import {
  cookieKey,
  hostFromUrl,
  normalizeCookieDomain,
  parseCookie,
  serializeCookie,
} from "./cookieDraft";

describe("cookieDraft", () => {
  it("extracts and normalizes cookie domains", () => {
    expect(hostFromUrl("https://Api.Example.com:8443/path")).toBe(
      "api.example.com",
    );
    expect(hostFromUrl("not a URL")).toBe("");
    expect(normalizeCookieDomain(" .Example.COM ")).toBe("example.com");
    expect(normalizeCookieDomain("https://Sub.Example.com/path")).toBe(
      "sub.example.com",
    );
  });

  it("parses a complete Set-Cookie style value", () => {
    expect(
      parseCookie(
        "session=abc=123; Domain=.Example.com; Path=/api; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Secure; HttpOnly; SameSite=Lax",
        "fallback.example.com",
        false,
      ),
    ).toEqual({
      name: "session",
      value: "abc=123",
      domain: "example.com",
      path: "/api",
      expires: "2037-10-21T07:28:00.000Z",
      secure: true,
      http_only: true,
      same_site: "lax",
      host_only: false,
      enabled: false,
    });
  });

  it("calculates Max-Age relative to the supplied clock", () => {
    const now = Date.UTC(2030, 0, 1);

    expect(
      parseCookie("token=value; Max-Age=90", "example.com", true, now)
        .expires,
    ).toBe("2030-01-01T00:01:30.000Z");
  });

  it("serializes stored cookie attributes", () => {
    const cookie: StoredCookie = {
      name: "session",
      value: "abc",
      domain: "example.com",
      path: "/api",
      expires_at: Date.UTC(2037, 9, 21, 8) / 1000,
      secure: true,
      http_only: true,
      same_site: "strict",
      host_only: false,
      enabled: true,
    };

    expect(serializeCookie(cookie)).toBe(
      "session=abc; Path=/api; Domain=example.com; Expires=Wed, 21 Oct 2037 08:00:00 GMT; Secure; HttpOnly; SameSite=Strict;",
    );
    expect(cookieKey(cookie)).toBe("example.com\n/api\nsession");
  });

  it.each([
    ["missing name", "=value", "name=value"],
    ["invalid domain", "name=value; Domain=://", "domain is not valid"],
    ["invalid path", "name=value; Path=api", "path must start"],
    ["invalid SameSite", "name=value; SameSite=Sometimes", "SameSite must"],
    ["invalid Max-Age", "name=value; Max-Age=soon", "must be a number"],
  ])("rejects %s", (_case, value, message) => {
    expect(() => parseCookie(value, "example.com", true)).toThrow(message);
  });
});
