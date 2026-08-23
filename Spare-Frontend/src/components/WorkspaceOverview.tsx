import { useEffect, useMemo, useRef, useState } from "react";

import { openWorkspaceDirectory, saveCollectionsDocument, saveEnvironmentsDocument } from "../adapters/fileSystem/workspaceFileSystem";
import { sendBrowserRequest } from "../adapters/http/browserHttpClient";
import { addHistoryEntry, listHistoryEntries } from "../adapters/indexedDb/history";
import { getActiveEnvironment, setActiveEnvironment } from "../adapters/indexedDb/preferences";
import { resolveRequestVariables } from "../services/requestVariables";
import type { ApiRequest, ApiResponse, AuthConfig, HeaderRow, HistoryEntry, HttpMethod, RequestBodyType } from "../types/api";
import { EMPTY_REQUEST } from "../types/api";
import type { Collection, Environment, OpenWorkspace, SavedRequest } from "../types/workspace";
import { CollectionIcon, FolderIcon, GlobeIcon } from "./icons";

interface WorkspaceOverviewProps {
  workspace: OpenWorkspace;
  onWorkspaceChange(workspace: OpenWorkspace): void;
  onClose(): void;
}

type RequestTab = "headers" | "body" | "auth";
type ResponseTab = "body" | "headers";
interface VariableRow { id: string; key: string; value: string }

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function makeId() { return crypto.randomUUID(); }
function rowsFromHeaders(headers: Record<string, string>): HeaderRow[] {
  const rows = Object.entries(headers).map(([key, value]) => ({ id: makeId(), key, value, enabled: true }));
  return [...rows, { id: makeId(), key: "", value: "", enabled: true }];
}
function headersFromRows(rows: HeaderRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value]));
}
function normalizeAuth(value: unknown): AuthConfig {
  if (!value || typeof value !== "object" || !("type" in value)) return { type: "None" };
  const auth = value as Record<string, unknown>;
  if (auth.type === "Bearer") return { type: "Bearer", token: String(auth.token ?? "") };
  if (auth.type === "Basic") return { type: "Basic", username: String(auth.username ?? ""), password: String(auth.password ?? "") };
  if (auth.type === "ApiKey") return {
    type: "ApiKey", key: String(auth.key ?? ""), value: String(auth.value ?? ""),
    add_to: auth.add_to === "QueryParam" ? "QueryParam" : "Header",
  };
  return { type: "None" };
}
function normalizeRequest(value: Record<string, unknown>): ApiRequest {
  const method = typeof value.method === "string" && METHODS.includes(value.method as HttpMethod)
    ? value.method as HttpMethod : "GET";
  const bodyType = ["none", "json", "text", "xml", "form-data", "x-www-form-urlencoded", "binary"].includes(String(value.body_type))
    ? value.body_type as RequestBodyType : "none";
  return {
    ...EMPTY_REQUEST,
    method,
    url: typeof value.url === "string" ? value.url : "",
    body: typeof value.body === "string" ? value.body : "",
    body_type: bodyType,
    headers: value.headers && typeof value.headers === "object" ? value.headers as Record<string, string> : {},
    form_fields: Array.isArray(value.form_fields) ? value.form_fields as Array<{ key: string; value: string }> : [],
    binary: value.binary && typeof value.binary === "object"
      ? value.binary as { name: string; mime_type: string; data_base64: string }
      : undefined,
    auth: normalizeAuth(value.auth),
  };
}
function prettyBody(response: ApiResponse | null): string {
  if (!response) return "";
  try { return JSON.stringify(JSON.parse(response.body), null, 2); } catch { return response.body; }
}
function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request iptal edildi.";
  return error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
}

export function WorkspaceOverview({ workspace, onWorkspaceChange, onClose }: WorkspaceOverviewProps) {
  const collections = workspace.bundle.collections.collections;
  const environments = workspace.bundle.environments.environments;
  const [request, setRequest] = useState<ApiRequest>({ ...EMPTY_REQUEST });
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => rowsFromHeaders({}));
  const [requestTab, setRequestTab] = useState<RequestTab>("headers");
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"collections" | "history">("collections");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [syncNotice, setSyncNotice] = useState("");
  const [saveCollectionId, setSaveCollectionId] = useState(collections[0]?.id ?? "");
  const [savedRequestName, setSavedRequestName] = useState("");
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  const [showEnvironmentEditor, setShowEnvironmentEditor] = useState(false);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [environmentName, setEnvironmentName] = useState("");
  const [variableRows, setVariableRows] = useState<VariableRow[]>([{ id: makeId(), key: "", value: "" }]);
  const abortController = useRef<AbortController | null>(null);

  const activeEnvironment = environments.find((item) => item.id === selectedEnvironmentId);
  const requestCount = useMemo(
    () => collections.reduce((total, collection) => total + collection.requests.length, 0),
    [collections],
  );

  useEffect(() => {
    getActiveEnvironment(workspace.bundle.manifest.id).then((id) => {
      if (id && environments.some((item) => item.id === id)) setSelectedEnvironmentId(id);
    }).catch(() => undefined);
  }, [environments, workspace.bundle.manifest.id]);

  useEffect(() => {
    listHistoryEntries(workspace.bundle.manifest.id).then(setHistory).catch(() => setHistory([]));
  }, [workspace.bundle.manifest.id]);

  useEffect(() => {
    async function checkDiskRevision() {
      try {
        const latest = await openWorkspaceDirectory(workspace.directory);
        const collectionsChanged = latest.bundle.collections.revision !== workspace.bundle.collections.revision;
        const environmentsChanged = latest.bundle.environments.revision !== workspace.bundle.environments.revision;
        if (collectionsChanged || environmentsChanged) {
          onWorkspaceChange(latest);
          setSyncNotice("Desktop veya başka bir sekmedeki değişiklikler workspace'ten yeniden yüklendi.");
        }
      } catch {
        // İzin ve bozuk dosya hataları bir sonraki açık kayıt işleminde ayrıntılı gösterilir.
      }
    }
    window.addEventListener("focus", checkDiskRevision);
    return () => window.removeEventListener("focus", checkDiskRevision);
  }, [onWorkspaceChange, workspace]);

  async function chooseEnvironment(id: string) {
    setSelectedEnvironmentId(id);
    await setActiveEnvironment(workspace.bundle.manifest.id, id).catch(() => undefined);
  }

  function updateHeader(id: string, field: keyof HeaderRow, value: string | boolean) {
    setHeaderRows((rows) => {
      const next = rows.map((row) => row.id === id ? { ...row, [field]: value } : row);
      const last = next.at(-1);
      return last?.key || last?.value ? [...next, { id: makeId(), key: "", value: "", enabled: true }] : next;
    });
  }

  function updateFormField(index: number, field: "key" | "value", value: string) {
    setRequest((current) => {
      const fields = current.form_fields.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item);
      const last = fields.at(-1);
      if (last?.key || last?.value) fields.push({ key: "", value: "" });
      return { ...current, form_fields: fields };
    });
  }

  async function chooseBinary(file: File | undefined) {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 32_768;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    setRequest((current) => ({
      ...current,
      binary: { name: file.name, mime_type: file.type || "application/octet-stream", data_base64: btoa(binary) },
    }));
  }

  async function sendRequest() {
    if (!request.url.trim()) { setError("Önce bir request URL'i gir."); return; }
    const controller = new AbortController();
    abortController.current = controller;
    setSending(true); setError(""); setResponse(null);
    const source = { ...request, headers: headersFromRows(headerRows) };
    try {
      const resolved = await resolveRequestVariables(source, activeEnvironment?.variables ?? {});
      const result = await sendBrowserRequest(resolved, controller.signal);
      setResponse(result);
      const entry: HistoryEntry = {
        id: makeId(), workspaceId: workspace.bundle.manifest.id, sentAt: new Date().toISOString(),
        request: source, response: result,
      };
      await addHistoryEntry(entry); setHistory((current) => [entry, ...current].slice(0, 50));
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      const entry: HistoryEntry = {
        id: makeId(), workspaceId: workspace.bundle.manifest.id, sentAt: new Date().toISOString(),
        request: source, error: message,
      };
      await addHistoryEntry(entry).then(() => setHistory((current) => [entry, ...current].slice(0, 50))).catch(() => undefined);
    } finally {
      setSending(false); abortController.current = null;
    }
  }

  async function addCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const collection: Collection = { id: makeId(), name, folders: [], requests: [], created_at: now, updated_at: now };
    try {
      const updated = await saveCollectionsDocument(workspace, {
        ...workspace.bundle.collections,
        collections: [...collections, collection],
      });
      onWorkspaceChange(updated); setNewCollectionName(""); setSaveCollectionId(collection.id); setError("");
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function saveRequest() {
    if (!saveCollectionId) { setError("Request'i kaydetmek için önce bir collection oluştur."); return; }
    if (!savedRequestName.trim()) { setError("Kaydedilecek request için bir ad gir."); return; }
    const now = new Date().toISOString();
    const saved: SavedRequest = {
      id: editingSavedId ?? makeId(), name: savedRequestName.trim(),
      request: { ...request, headers: headersFromRows(headerRows) } as unknown as Record<string, unknown>,
      folder_id: null, order: 0, created_at: now, updated_at: now,
    };
    const nextCollections = collections.map((collection) => {
      if (collection.id !== saveCollectionId) return collection;
      const existing = collection.requests.find((item) => item.id === saved.id);
      return {
        ...collection,
        requests: existing
          ? collection.requests.map((item) => item.id === saved.id ? { ...saved, created_at: item.created_at } : item)
          : [...collection.requests, { ...saved, order: collection.requests.length }],
        updated_at: now,
      };
    });
    try {
      const updated = await saveCollectionsDocument(workspace, { ...workspace.bundle.collections, collections: nextCollections });
      onWorkspaceChange(updated); setEditingSavedId(saved.id); setError("");
    } catch (caught) { setError(errorMessage(caught)); }
  }

  function loadSavedRequest(saved: SavedRequest, collectionId: string) {
    const loaded = normalizeRequest(saved.request);
    setRequest(loaded); setHeaderRows(rowsFromHeaders(loaded.headers)); setEditingSavedId(saved.id);
    setSavedRequestName(saved.name); setSaveCollectionId(collectionId); setResponse(null); setError("");
  }

  function loadHistoryEntry(entry: HistoryEntry) {
    setRequest(entry.request); setHeaderRows(rowsFromHeaders(entry.request.headers)); setEditingSavedId(null);
    setSavedRequestName(""); setResponse(entry.response ?? null); setError(entry.error ?? "");
  }

  function newRequest() {
    setRequest({ ...EMPTY_REQUEST }); setHeaderRows(rowsFromHeaders({})); setEditingSavedId(null);
    setSavedRequestName(""); setResponse(null); setError("");
  }

  function editEnvironment(environment?: Environment) {
    setEnvironmentId(environment?.id ?? null); setEnvironmentName(environment?.name ?? "");
    const rows = Object.entries(environment?.variables ?? {}).map(([key, value]) => ({ id: makeId(), key, value }));
    setVariableRows([...rows, { id: makeId(), key: "", value: "" }]); setShowEnvironmentEditor(true);
  }

  function updateVariable(id: string, field: "key" | "value", value: string) {
    setVariableRows((rows) => {
      const next = rows.map((row) => row.id === id ? { ...row, [field]: value } : row);
      const last = next.at(-1);
      return last?.key || last?.value ? [...next, { id: makeId(), key: "", value: "" }] : next;
    });
  }

  async function saveEnvironment() {
    if (!environmentName.trim()) { setError("Environment adı boş olamaz."); return; }
    const variables: Record<string, string> = {};
    for (const row of variableRows) {
      const key = row.key.trim();
      if (!key) continue;
      if (Object.hasOwn(variables, key)) { setError(`Environment değişkeni birden fazla kullanılmış: ${key}`); return; }
      variables[key] = row.value;
    }
    const now = new Date().toISOString();
    const id = environmentId ?? makeId();
    const existing = environments.find((item) => item.id === id);
    const environment: Environment = {
      id, name: environmentName.trim(), variables, workspace_id: workspace.bundle.manifest.id,
      created_at: existing?.created_at ?? now, updated_at: now,
    };
    const next = existing
      ? environments.map((item) => item.id === id ? environment : item)
      : [...environments, environment];
    try {
      const updated = await saveEnvironmentsDocument(workspace, { ...workspace.bundle.environments, environments: next });
      onWorkspaceChange(updated); await chooseEnvironment(id); setShowEnvironmentEditor(false); setError("");
    } catch (caught) { setError(errorMessage(caught)); }
  }

  const auth = request.auth ?? { type: "None" };
  return (
    <main className="client-shell">
      <aside className="client-sidebar">
        <div className="sidebar-brand">
          <span className="mini-logo"><FolderIcon /></span>
          <div><strong>DISPATCH</strong><small>WEB</small></div>
        </div>
        <div className="workspace-chip">
          <span>{workspace.bundle.manifest.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{workspace.bundle.manifest.name}</strong><small>{workspace.directory.name}</small></div>
        </div>
        <nav className="sidebar-modes"><button className={sidebarMode === "collections" ? "active" : ""} onClick={() => setSidebarMode("collections")}>Collections</button><button className={sidebarMode === "history" ? "active" : ""} onClick={() => setSidebarMode("history")}>History</button></nav>
        <div className="sidebar-title"><span>{sidebarMode === "collections" ? "COLLECTIONS" : "LOCAL HISTORY"}</span><span>{sidebarMode === "collections" ? `${requestCount} request` : history.length}</span></div>
        <div className="collection-tree">
          {sidebarMode === "collections" && collections.map((collection) => (
            <div key={collection.id} className="collection-group">
              <div className="collection-name"><CollectionIcon /><span>{collection.name}</span><small>{collection.requests.length}</small></div>
              {collection.requests.map((saved) => (
                <button className={editingSavedId === saved.id ? "saved-request active" : "saved-request"} key={saved.id} onClick={() => loadSavedRequest(saved, collection.id)}>
                  <b className={`method-${String((saved.request.method ?? "GET")).toLowerCase()}`}>{String(saved.request.method ?? "GET")}</b>
                  <span>{saved.name}</span>
                </button>
              ))}
            </div>
          ))}
          {sidebarMode === "collections" && collections.length === 0 && <p className="sidebar-empty">İlk collection'ını aşağıdan oluştur.</p>}
          {sidebarMode === "history" && history.map((entry) => <button className="history-row" key={entry.id} onClick={() => loadHistoryEntry(entry)}><b className={`method-${entry.request.method.toLowerCase()}`}>{entry.request.method}</b><span>{entry.request.url || "İsimsiz request"}</span><small>{new Date(entry.sentAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small></button>)}
          {sidebarMode === "history" && history.length === 0 && <p className="sidebar-empty">Gönderdiğin request'ler yalnızca bu tarayıcıda burada görünecek.</p>}
        </div>
        {sidebarMode === "collections" && <div className="new-collection-row">
          <input value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addCollection(); }} placeholder="Yeni collection" />
          <button onClick={addCollection} title="Collection ekle">+</button>
        </div>}
        <button className="switch-workspace" onClick={onClose}>Workspace değiştir</button>
      </aside>

      <section className="client-main">
        <header className="client-topbar">
          <button className="new-request-button" onClick={newRequest}>+ Yeni request</button>
          <div className="environment-controls">
            <GlobeIcon />
            <select value={selectedEnvironmentId} onChange={(event) => void chooseEnvironment(event.target.value)}>
              <option value="">Environment yok</option>
              {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
            </select>
            <button onClick={() => editEnvironment(activeEnvironment)}>Yönet</button>
            <button className="environment-add" onClick={() => editEnvironment()}>+</button>
          </div>
        </header>

        <div className="request-bar">
          <select className={`method-select method-${request.method.toLowerCase()}`} value={request.method} onChange={(event) => setRequest({ ...request, method: event.target.value as HttpMethod })}>
            {METHODS.map((method) => <option key={method}>{method}</option>)}
          </select>
          <input value={request.url} onChange={(event) => setRequest({ ...request, url: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !sending) void sendRequest(); }} placeholder="https://api.example.com/users/{{userId}}" />
          <button className={sending ? "send-button stop" : "send-button"} onClick={sending ? () => abortController.current?.abort() : sendRequest}>{sending ? "Durdur" : "Send"}</button>
        </div>

        <div className="save-request-bar">
          <input value={savedRequestName} onChange={(event) => setSavedRequestName(event.target.value)} placeholder="Request adı" />
          <select value={saveCollectionId} onChange={(event) => setSaveCollectionId(event.target.value)}>
            <option value="">Collection seç</option>
            {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
          <button onClick={saveRequest}>{editingSavedId ? "Değişiklikleri kaydet" : "Collection'a kaydet"}</button>
        </div>

        {error && <div className="client-error" role="alert">{error}</div>}
        {syncNotice && <button className="sync-notice" onClick={() => setSyncNotice("")}>{syncNotice} <span>×</span></button>}

        <div className="editor-grid">
          <section className="request-editor panel">
            <nav className="panel-tabs">
              <button className={requestTab === "headers" ? "active" : ""} onClick={() => setRequestTab("headers")}>Headers <span>{headerRows.filter((row) => row.key).length}</span></button>
              <button className={requestTab === "body" ? "active" : ""} onClick={() => setRequestTab("body")}>Body</button>
              <button className={requestTab === "auth" ? "active" : ""} onClick={() => setRequestTab("auth")}>Authorization</button>
            </nav>
            <div className="panel-content">
              {requestTab === "headers" && (
                <div className="key-value-editor">
                  <div className="key-value-heading"><span /> <span>KEY</span><span>VALUE</span></div>
                  {headerRows.map((row) => (
                    <div className="key-value-row" key={row.id}>
                      <input type="checkbox" checked={row.enabled} onChange={(event) => updateHeader(row.id, "enabled", event.target.checked)} />
                      <input value={row.key} onChange={(event) => updateHeader(row.id, "key", event.target.value)} placeholder="Header name" />
                      <input value={row.value} onChange={(event) => updateHeader(row.id, "value", event.target.value)} placeholder="Header value" />
                    </div>
                  ))}
                </div>
              )}
              {requestTab === "body" && (
                <div className="body-editor">
                  <div className="body-types">
                    {(["none", "json", "text", "xml", "form-data", "x-www-form-urlencoded", "binary"] as RequestBodyType[]).map((type) => <button className={request.body_type === type ? "active" : ""} key={type} onClick={() => setRequest({ ...request, body_type: type, form_fields: request.form_fields.length ? request.form_fields : [{ key: "", value: "" }] })}>{type}</button>)}
                  </div>
                  {request.body_type === "none" ? (
                    <div className="empty-editor">Bu request'in body içeriği yok.</div>
                  ) : ["form-data", "x-www-form-urlencoded"].includes(request.body_type) ? (
                    <div className="form-field-editor">
                      <div className="form-field-heading"><span>KEY</span><span>VALUE</span></div>
                      {request.form_fields.map((field, index) => <div className="form-field-row" key={index}><input value={field.key} onChange={(event) => updateFormField(index, "key", event.target.value)} placeholder="key" /><input value={field.value} onChange={(event) => updateFormField(index, "value", event.target.value)} placeholder="value" /></div>)}
                    </div>
                  ) : request.body_type === "binary" ? (
                    <label className="binary-picker"><input type="file" onChange={(event) => void chooseBinary(event.target.files?.[0])} /><span>{request.binary ? `${request.binary.name} · ${request.binary.mime_type}` : "Gönderilecek dosyayı seç"}</span></label>
                  ) : (
                    <textarea value={request.body} onChange={(event) => setRequest({ ...request, body: event.target.value })} spellCheck={false} placeholder={request.body_type === "json" ? '{\n  "name": "Dispatch"\n}' : "Request body"} />
                  )}
                </div>
              )}
              {requestTab === "auth" && (
                <div className="auth-editor">
                  <label>Auth Type<select value={auth.type} onChange={(event) => {
                    const type = event.target.value;
                    const next: AuthConfig = type === "Bearer" ? { type, token: "" } : type === "Basic" ? { type, username: "", password: "" } : type === "ApiKey" ? { type, key: "", value: "", add_to: "Header" } : { type: "None" };
                    setRequest({ ...request, auth: next });
                  }}><option>None</option><option>Bearer</option><option>Basic</option><option>ApiKey</option></select></label>
                  {auth.type === "Bearer" && <label>Token<input value={auth.token} onChange={(event) => setRequest({ ...request, auth: { ...auth, token: event.target.value } })} placeholder="{{accessToken}}" /></label>}
                  {auth.type === "Basic" && <><label>Username<input value={auth.username} onChange={(event) => setRequest({ ...request, auth: { ...auth, username: event.target.value } })} /></label><label>Password<input type="password" value={auth.password} onChange={(event) => setRequest({ ...request, auth: { ...auth, password: event.target.value } })} /></label></>}
                  {auth.type === "ApiKey" && <><label>Key<input value={auth.key} onChange={(event) => setRequest({ ...request, auth: { ...auth, key: event.target.value } })} /></label><label>Value<input value={auth.value} onChange={(event) => setRequest({ ...request, auth: { ...auth, value: event.target.value } })} /></label><label>Add to<select value={auth.add_to} onChange={(event) => setRequest({ ...request, auth: { ...auth, add_to: event.target.value as "Header" | "QueryParam" } })}><option value="Header">Header</option><option value="QueryParam">Query parameter</option></select></label></>}
                  <p>OAuth 2.0 web sürümünün ilk kapsamına dahil değildir.</p>
                </div>
              )}
            </div>
          </section>

          <section className="response-panel panel">
            <div className="response-heading">
              <nav className="panel-tabs"><button className={responseTab === "body" ? "active" : ""} onClick={() => setResponseTab("body")}>Response</button><button className={responseTab === "headers" ? "active" : ""} onClick={() => setResponseTab("headers")}>Headers</button></nav>
              {response && <div className="response-meta"><span className={response.status < 400 ? "success" : "failure"}>{response.status} {response.statusText}</span><span>{response.responseTimeMs} ms</span><span>{response.sizeBytes} B</span></div>}
            </div>
            <div className="response-content">
              {!response ? <div className="response-empty"><span>→</span><strong>Bir request gönder</strong><p>Yanıtın body, header, süre ve boyut bilgileri burada gösterilecek.</p></div> : responseTab === "body" ? <pre>{prettyBody(response)}</pre> : <div className="response-headers">{Object.entries(response.headers).map(([key, value]) => <div key={key}><b>{key}</b><span>{value}</span></div>)}</div>}
            </div>
          </section>
        </div>
      </section>

      {showEnvironmentEditor && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowEnvironmentEditor(false); }}>
          <section className="environment-modal">
            <header><div><p>ENVIRONMENT</p><h2>{environmentId ? "Environment'ı düzenle" : "Yeni environment"}</h2></div><button onClick={() => setShowEnvironmentEditor(false)}>×</button></header>
            <label>Environment adı<input value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} placeholder="Development" /></label>
            <div className="variable-heading"><span>VARIABLE</span><span>VALUE</span></div>
            <div className="variable-list">{variableRows.map((row) => <div key={row.id}><input value={row.key} onChange={(event) => updateVariable(row.id, "key", event.target.value)} placeholder="baseUrl" /><input value={row.value} onChange={(event) => updateVariable(row.id, "value", event.target.value)} placeholder="https://api.example.com" /></div>)}</div>
            <footer><button className="secondary-button" onClick={() => setShowEnvironmentEditor(false)}>Vazgeç</button><button className="primary-button" onClick={saveEnvironment}>Kaydet</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}
