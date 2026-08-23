import { useEffect, useState } from "react";

import {
  chooseWorkspaceDirectory,
  createWorkspaceDirectory,
  openWorkspaceDirectory,
  supportsFileSystemAccess,
} from "../adapters/fileSystem/workspaceFileSystem";
import {
  listRecentWorkspaces,
  saveRecentWorkspace,
} from "../adapters/indexedDb/recentWorkspaces";
import type { OpenWorkspace, RecentWorkspaceRecord } from "../types/workspace";
import { FolderIcon } from "./icons";

interface WorkspaceLauncherProps {
  onOpen(workspace: OpenWorkspace): void;
}

type LauncherMode = "open" | "create";

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  return error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
}

export function WorkspaceLauncher({ onOpen }: WorkspaceLauncherProps) {
  const [mode, setMode] = useState<LauncherMode>("open");
  const [workspaceName, setWorkspaceName] = useState("");
  const [recent, setRecent] = useState<RecentWorkspaceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = supportsFileSystemAccess();

  useEffect(() => {
    listRecentWorkspaces().then(setRecent).catch(() => setRecent([]));
  }, []);

  async function finish(workspace: OpenWorkspace) {
    await saveRecentWorkspace(workspace.directory, workspace.bundle);
    onOpen(workspace);
  }

  async function run(action: () => Promise<OpenWorkspace>) {
    setBusy(true);
    setError("");
    try {
      await finish(await action());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const selectAndOpen = () => run(async () => openWorkspaceDirectory(await chooseWorkspaceDirectory()));
  const selectAndCreate = () =>
    run(async () => createWorkspaceDirectory(await chooseWorkspaceDirectory(), workspaceName));
  const openRecent = (item: RecentWorkspaceRecord) => run(() => openWorkspaceDirectory(item.handle));

  return (
    <main className="launcher-shell">
      <section className="launcher-card">
        <header className="launcher-header">
          <div className="brand-icon"><FolderIcon className="size-9" /></div>
          <p className="brand-word">DISPATCH WEB</p>
          <h1>Workspace’ine hoş geldin</h1>
          <p className="launcher-subtitle">
            Desktop ile aynı collection ve environment dosyalarını tarayıcında kullan.
          </p>
        </header>

        <nav className="launcher-tabs" aria-label="Workspace işlemi">
          <button className={mode === "open" ? "active" : ""} onClick={() => setMode("open")}>Mevcut workspace</button>
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Yeni workspace</button>
        </nav>

        <div className="launcher-content">
          {!supported && (
            <div className="browser-warning">
              Bu özellik güncel Chrome, Edge veya Brave üzerinde HTTPS bağlantısında çalışır.
            </div>
          )}

          {mode === "open" ? (
            <section className="action-section">
              <h2>Kaldığın yerden devam et</h2>
              <p>İçinde Dispatch workspace dosyaları bulunan klasörü seç.</p>
              <div className="picker-row">
                <div className="path-preview"><FolderIcon /> Workspace klasörünü seç</div>
                <button className="primary-button" disabled={busy || !supported} onClick={selectAndOpen}>
                  {busy ? "Açılıyor…" : "Klasör seç ve aç"}
                </button>
              </div>
            </section>
          ) : (
            <section className="action-section">
              <h2>Yeni workspace oluştur</h2>
              <p>Boş bir klasör seç; gerekli JSON dosyalarını Dispatch Web oluştursun.</p>
              <label className="field-label" htmlFor="workspace-name">Workspace adı</label>
              <div className="picker-row">
                <input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Örn. Payment API"
                />
                <button
                  className="primary-button"
                  disabled={busy || !supported || !workspaceName.trim()}
                  onClick={selectAndCreate}
                >
                  {busy ? "Oluşturuluyor…" : "Klasör seç ve oluştur"}
                </button>
              </div>
            </section>
          )}

          {error && <div className="error-message" role="alert">{error}</div>}

          {recent.length > 0 && (
            <section className="recent-section">
              <div className="section-heading">
                <span>SON KULLANILANLAR</span>
                <span>{recent.length} workspace</span>
              </div>
              <div className="recent-list">
                {recent.map((item) => (
                  <button key={item.id} className="recent-item" disabled={busy} onClick={() => openRecent(item)}>
                    <span className="recent-icon"><FolderIcon /></span>
                    <span className="recent-copy">
                      <strong>{item.name}</strong>
                      <small>{item.directoryName}</small>
                    </span>
                    <span className="recent-arrow">›</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer><span /> Workspace verileri yalnızca seçtiğin yerel klasörde saklanır.</footer>
      </section>
    </main>
  );
}

