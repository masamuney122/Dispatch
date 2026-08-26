import { useEffect, useMemo, useState } from "react";
import {
  clearCookies,
  deleteCookie,
  loadCookieManager,
  saveCookie,
} from "../../services/cookieService";
import {
  loadGlobalHttpSettings,
  saveGlobalHttpSettings,
} from "../../services/httpSettingsService";
import type {
  CookieCredentials,
  CookieKey,
  CookieManagerSnapshot,
  StoredCookie,
} from "../../types/cookie";
import type { GlobalHttpSettings } from "../../types/httpSettings";
import { SettingsToggle } from "../settings/HttpSettingsEditor";

interface Props {
  requestUrl: string;
  onClose: () => void;
}

type CookieDraft = Omit<StoredCookie, "expires_at"> & { expires: string };

const emptyDraft = (domain: string): CookieDraft => ({
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

const cookieKey = (cookie: CookieKey): string =>
  `${cookie.domain}\n${cookie.path}\n${cookie.name}`;

const hostFromUrl = (value: string): string => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

const normalizeDomain = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname
      .replace(/^\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
};

const serializeCookie = (cookie: StoredCookie): string => {
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path || "/"}`];
  if (!cookie.host_only) parts.push(`Domain=${cookie.domain}`);
  if (cookie.expires_at) parts.push(`Expires=${new Date(cookie.expires_at * 1000).toUTCString()}`);
  if (cookie.secure) parts.push("Secure");
  if (cookie.http_only) parts.push("HttpOnly");
  if (cookie.same_site) {
    parts.push(`SameSite=${cookie.same_site[0].toUpperCase()}${cookie.same_site.slice(1)}`);
  }
  return `${parts.join("; ")};`;
};

const parseCookie = (value: string, fallbackDomain: string, enabled: boolean): CookieDraft => {
  const parts = value.split(";").map((part) => part.trim()).filter(Boolean);
  const pair = parts.shift();
  if (!pair) throw new Error("Cookie name and value are required.");

  const equalsIndex = pair.indexOf("=");
  if (equalsIndex <= 0) throw new Error("Use the name=value cookie format.");

  const draft = emptyDraft(fallbackDomain);
  draft.name = pair.slice(0, equalsIndex).trim();
  draft.value = pair.slice(equalsIndex + 1).trim();
  draft.enabled = enabled;

  for (const part of parts) {
    const separator = part.indexOf("=");
    const attribute = (separator === -1 ? part : part.slice(0, separator)).trim().toLowerCase();
    const attributeValue = separator === -1 ? "" : part.slice(separator + 1).trim();

    if (attribute === "path") {
      draft.path = attributeValue || "/";
    } else if (attribute === "domain") {
      const domain = normalizeDomain(attributeValue);
      if (!domain) throw new Error("Cookie domain is not valid.");
      draft.domain = domain;
      draft.host_only = false;
    } else if (attribute === "expires") {
      const expires = new Date(attributeValue);
      if (Number.isNaN(expires.getTime())) throw new Error("Cookie expiry date is not valid.");
      draft.expires = expires.toISOString();
    } else if (attribute === "max-age") {
      const seconds = Number(attributeValue);
      if (!Number.isFinite(seconds)) throw new Error("Cookie Max-Age must be a number.");
      draft.expires = new Date(Date.now() + seconds * 1000).toISOString();
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
  if (!draft.path.startsWith("/")) throw new Error("Cookie path must start with /.");
  return draft;
};

export function CookieManagerDialog({ requestUrl, onClose }: Props) {
  const requestHost = hostFromUrl(requestUrl);
  const [snapshot, setSnapshot] = useState<CookieManagerSnapshot | null>(null);
  const [draft, setDraft] = useState<CookieDraft | null>(null);
  const [rawDraft, setRawDraft] = useState("");
  const [editorDomain, setEditorDomain] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [previousKey, setPreviousKey] = useState<CookieKey | undefined>();
  const [domainInput, setDomainInput] = useState(requestHost);
  const [addedDomains, setAddedDomains] = useState<string[]>([]);
  const [settings, setSettings] = useState<GlobalHttpSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadCookieManager()
      .then(async (next) => {
        if (!active) return;
        setSnapshot(next);
        if (next.mode === "browser") {
          setSettings(await loadGlobalHttpSettings());
        }
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { active = false; };
  }, [requestHost]);

  const domains = useMemo(() => {
    const grouped = new Map<string, StoredCookie[]>();
    snapshot?.cookies.forEach((cookie) => {
      grouped.set(cookie.domain, [...(grouped.get(cookie.domain) || []), cookie]);
    });
    addedDomains.forEach((domain) => {
      if (!grouped.has(domain)) grouped.set(domain, []);
    });
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [addedDomains, snapshot]);

  const run = async (action: () => Promise<CookieManagerSnapshot | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setSnapshot(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (cookie: StoredCookie) => {
    setPreviousKey({ domain: cookie.domain, path: cookie.path, name: cookie.name });
    setDraft({ ...cookie, expires: cookie.expires_at ? new Date(cookie.expires_at * 1000).toISOString() : "" });
    setRawDraft(serializeCookie(cookie));
    setEditorDomain(cookie.domain);
    setDraftError(null);
  };

  const submitDraft = () => {
    if (!draft || !editorDomain) return;
    const sourceDomain = editorDomain;
    let parsed: CookieDraft;
    try {
      parsed = parseCookie(rawDraft, editorDomain, draft.enabled);
      setDraftError(null);
    } catch (reason) {
      setDraftError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    const expiresAt = parsed.expires ? Math.floor(new Date(parsed.expires).getTime() / 1000) : null;
    const { expires: _expires, ...fields } = parsed;
    void _expires;
    const cookie: StoredCookie = {
      ...fields,
      expires_at: Number.isFinite(expiresAt) ? expiresAt : null,
    };
    void run(async () => {
      const next = await saveCookie(cookie, previousKey);
      setDraft(null);
      setRawDraft("");
      setEditorDomain(null);
      setPreviousKey(undefined);
      setAddedDomains((current) => current.filter(
        (domain) => domain !== sourceDomain && domain !== cookie.domain
      ));
      return next;
    });
  };

  const beginAddCookie = (domain: string) => {
    setPreviousKey(undefined);
    setDraft(emptyDraft(domain));
    setRawDraft("");
    setEditorDomain(domain);
    setDraftError(null);
  };

  const cancelDraft = () => {
    setDraft(null);
    setRawDraft("");
    setEditorDomain(null);
    setPreviousKey(undefined);
    setDraftError(null);
  };

  const addDomain = () => {
    const domain = normalizeDomain(domainInput);
    if (!domain) {
      setError("Enter a valid domain name.");
      return;
    }
    setError(null);
    setAddedDomains((current) => current.includes(domain) ? current : [...current, domain]);
    setDomainInput("");
  };

  const removeDomain = (domain: string, cookies: StoredCookie[]) => {
    if (cookies.length > 0 && !window.confirm(`${domain} alanındaki tüm cookie'ler silinsin mi?`)) return;
    if (editorDomain === domain) cancelDraft();
    setAddedDomains((current) => current.filter((item) => item !== domain));
    if (cookies.length === 0) return;
    void run(async () => {
      let next: CookieManagerSnapshot | undefined;
      for (const cookie of cookies) next = await deleteCookie(cookie);
      return next;
    });
  };

  const updateCredentials = (credentials: CookieCredentials) => {
    if (!settings) return;
    const next = { ...settings, cookie_credentials: credentials };
    setSettings(next);
    void run(async () => { setSettings(await saveGlobalHttpSettings(next)); });
  };

  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/65 p-6" onMouseDown={() => !busy && onClose()}>
      <div
        className="flex w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-[#454545] bg-[#202020] shadow-2xl"
        style={{ height: "60vh" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 pb-3 pt-6">
          <h2 className="text-lg font-bold text-zinc-100">Cookies</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded text-3xl font-light leading-none text-zinc-500 hover:bg-[#303030] hover:text-zinc-200" aria-label="Close cookies">×</button>
        </div>

        {!snapshot ? (
          <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">Cookie jar yükleniyor…</div>
        ) : snapshot.mode === "browser" ? (
          <div className="flex-1 space-y-5 overflow-y-auto px-7 pb-7">
            <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-5">
              <h3 className="text-sm font-semibold text-zinc-100">Browser managed cookies</h3>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-400">
                Web sürümünde Cookie ve Set-Cookie header'ları JavaScript'e kapalıdır. Dispatch cookie değerlerini okuyamaz veya düzenleyemez; tarayıcının cookie deposunu fetch credentials politikasıyla kullanır.
              </p>
            </div>
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
              <label className="text-xs font-semibold text-zinc-200">Fetch credentials</label>
              <p className="mt-1 text-[11px] text-zinc-500">Bu global varsayılan request Settings bölümünden request bazında override edilebilir.</p>
              <div className="mt-4 flex gap-2">
                {(["omit", "same-origin", "include"] as CookieCredentials[]).map((value) => (
                  <button key={value} type="button" disabled={!settings || busy} onClick={() => updateCredentials(value)} className={`rounded-lg border px-4 py-2 text-xs font-semibold transition ${settings?.cookie_credentials === value ? "border-[#ff6c37] bg-[#ff6c37]/10 text-[#ff7a47]" : "border-[#404040] bg-[#242424] text-zinc-400 hover:bg-[#2a2a2a]"}`}>
                    {value === "same-origin" ? "Same origin" : value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-7 pb-5">
            <form
              className="flex shrink-0 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addDomain();
              }}
            >
              <input
                value={domainInput}
                onChange={(event) => setDomainInput(event.target.value)}
                placeholder="Type a domain name"
                spellCheck={false}
                className="h-10 min-w-0 flex-1 rounded-lg border border-[#4a4a4a] bg-[#202020] px-4 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
              />
              <button type="submit" disabled={busy || !domainInput.trim()} className="h-10 shrink-0 rounded-lg bg-[#383838] px-4 text-sm font-medium text-zinc-100 hover:bg-[#444] disabled:cursor-not-allowed disabled:opacity-40">Add domain</button>
            </form>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {domains.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[#383838] text-xs text-zinc-600">
                  Add a domain to create your first cookie.
                </div>
              ) : (
                <div className="space-y-3">
                  {domains.map(([domain, cookies]) => (
                    <section key={domain} className="rounded-xl border border-[#373737] bg-[#202020] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-baseline gap-3">
                          <h3 className="truncate text-sm font-bold text-zinc-100">{domain}</h3>
                          <span className="shrink-0 text-xs text-zinc-500">{cookies.length} {cookies.length === 1 ? "cookie" : "cookies"}</span>
                        </div>
                        <button type="button" disabled={busy} onClick={() => removeDomain(domain, cookies)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-2xl font-light leading-none text-zinc-500 hover:bg-[#303030] hover:text-zinc-200 disabled:opacity-40" aria-label={`Remove ${domain}`}>×</button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {cookies.map((cookie) => {
                          const selected = previousKey && cookieKey(previousKey) === cookieKey(cookie);
                          return (
                            <button
                              key={cookieKey(cookie)}
                              type="button"
                              disabled={busy}
                              onClick={() => beginEdit(cookie)}
                              className={`group flex h-8 max-w-64 items-center gap-2 rounded-lg border px-3 font-mono text-xs transition-colors ${selected ? "border-zinc-500 bg-[#303030] text-zinc-100" : "border-[#424242] bg-[#242424] text-zinc-300 hover:border-zinc-500"} ${cookie.enabled ? "" : "opacity-50"}`}
                              title={serializeCookie(cookie)}
                            >
                              <span className="truncate">{cookie.name}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label={`Delete ${cookie.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (selected) cancelDraft();
                                  void run(() => deleteCookie(cookie));
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  if (selected) cancelDraft();
                                  void run(() => deleteCookie(cookie));
                                }}
                                className="text-lg font-light leading-none text-zinc-600 hover:text-zinc-200"
                              >×</span>
                            </button>
                          );
                        })}
                        <button type="button" disabled={busy} onClick={() => beginAddCookie(domain)} className="flex h-8 items-center gap-1 rounded-lg border border-[#424242] px-3 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"><span className="text-lg font-light">＋</span>Add cookie</button>
                      </div>

                      {draft && editorDomain === domain && (
                        <div className="mt-3 border-t border-[#343434] pt-3">
                          <textarea
                            autoFocus
                            value={rawDraft}
                            onChange={(event) => {
                              setRawDraft(event.target.value);
                              setDraftError(null);
                            }}
                            placeholder="cookieName=cookieValue; Path=/; Secure; HttpOnly; SameSite=Lax;"
                            spellCheck={false}
                            className="h-36 w-full resize-y rounded-lg border border-[#444] bg-[#202020] p-3 font-mono text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                          />
                          <div className="mt-2 flex min-h-8 items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <SettingsToggle checked={draft.enabled} disabled={busy} label="Cookie enabled" onChange={() => setDraft({ ...draft, enabled: !draft.enabled })} />
                              <span className="text-xs text-zinc-500">Enabled</span>
                              {draftError && <span className="text-xs text-red-400">{draftError}</span>}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button type="button" disabled={busy} onClick={cancelDraft} className="rounded-lg bg-[#363636] px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-[#414141]">Cancel</button>
                              <button type="button" disabled={busy || !rawDraft.trim()} onClick={submitDraft} className="rounded-lg bg-[#ff6c37] px-4 py-2 text-xs font-bold text-white hover:bg-[#ff7a47] disabled:opacity-40">Save</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between pt-4">
              <span className="rounded-lg bg-[#333333] px-3 py-2 text-xs text-zinc-300">Workspace cookie jar</span>
              <button
                type="button"
                disabled={busy || snapshot.cookies.length === 0}
                onClick={() => window.confirm("Workspace cookie jar tamamen temizlensin mi?") && void run(async () => {
                  await clearCookies();
                  cancelDraft();
                  setAddedDomains([]);
                  return { mode: "workspace", cookies: [] };
                })}
                className="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear all cookies
              </button>
            </div>
          </div>
        )}

        {error && <p className="mx-7 mb-4 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}
