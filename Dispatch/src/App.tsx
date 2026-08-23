import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ApiClientLayout } from "./components/ApiClientLayout";
import { WorkspaceLauncher } from "./components/workspace/WorkspaceLauncher";
import { useWorkspaceSession } from "./hooks/useWorkspaceSession";

function App() {
  const {
    workspace,
    recentWorkspaces,
    loading,
    error,
    setError,
    create,
    open,
    importArchive,
    close,
  } = useWorkspaceSession();

  useEffect(() => {
    const win = getCurrentWindow();
    win.center().catch(console.error);
    win.maximize().catch(console.error);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-[#202020] text-zinc-500">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-[#ff6c37]/25 bg-[#ff6c37]/10">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#ff6c37]/25 border-t-[#ff6c37]" />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#ff7a47]">
            Dispatch
          </p>
          <p className="mt-2 text-xs text-zinc-500">Workspace yükleniyor…</p>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <WorkspaceLauncher
        recentWorkspaces={recentWorkspaces}
        error={error}
        onError={setError}
        onCreate={create}
        onOpen={open}
        onImportArchive={importArchive}
      />
    );
  }

  return (
    <ApiClientLayout
      key={workspace.manifest.id}
      workspaceName={workspace.manifest.name}
      onChangeWorkspace={close}
    />
  );
}

export default App;
