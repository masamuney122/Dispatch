import { useState, type FormEvent } from "react";
import {
  chooseImportDestination as pickImportDestination,
  chooseWorkspaceArchive,
  chooseWorkspaceDirectory as pickWorkspaceDirectory,
  inspectWorkspaceArchive,
  supportsWorkspaceArchive,
} from "../../services/workspaceService";
import type { ArchivePreview, RecentWorkspace } from "../../types/workspace";
import {
  CreateWorkspacePanel,
  ImportWorkspacePanel,
  OpenWorkspacePanel,
} from "./WorkspaceLauncherPanels";
import { ModeButton } from "./WorkspaceLauncherControls";

type LauncherMode = "open" | "create" | "import";

interface WorkspaceLauncherProps {
  recentWorkspaces: RecentWorkspace[];
  error: string | null;
  onError: (message: string | null) => void;
  onCreate: (path: string, name: string) => Promise<void>;
  onOpen: (path: string) => Promise<void>;
  onImportArchive: (
    archivePath: string,
    destinationParent: string,
    workspaceName?: string
  ) => Promise<void>;
}

export function WorkspaceLauncher({
  recentWorkspaces,
  error,
  onError,
  onCreate,
  onOpen,
  onImportArchive,
}: WorkspaceLauncherProps) {
  const [mode, setMode] = useState<LauncherMode>("open");
  const [path, setPath] = useState("");
  const [pathToken, setPathToken] = useState("");
  const [name, setName] = useState("");
  const [archivePath, setArchivePath] = useState("");
  const [archiveToken, setArchiveToken] = useState("");
  const [archivePreview, setArchivePreview] = useState<ArchivePreview | null>(null);
  const [destinationParent, setDestinationParent] = useState("");
  const [destinationToken, setDestinationToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectMode = (nextMode: LauncherMode) => {
    setMode(nextMode);
    onError(null);
  };

  const submitWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    if (!pathToken) {
      onError("Select a workspace folder.");
      return;
    }
    if (mode === "create" && !name.trim()) {
      onError("Enter a name for the new workspace.");
      return;
    }

    setSubmitting(true);
    onError(null);
    try {
      if (mode === "create") await onCreate(pathToken, name.trim());
      else await onOpen(pathToken);
    } catch (reason) {
      onError(toMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const openRecent = async (recent: RecentWorkspace) => {
    setSubmitting(true);
    onError(null);
    try {
      await onOpen(recent.token ?? recent.path);
    } catch (reason) {
      onError(toMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const chooseWorkspaceDirectory = async () => {
    onError(null);
    try {
      const selected = await pickWorkspaceDirectory(mode === "create" ? "create" : "open");
      if (selected) {
        setPath(selected.label);
        setPathToken(selected.token);
      }
    } catch (reason) {
      onError(toMessage(reason));
    }
  };

  const chooseArchive = async () => {
    onError(null);
    try {
      const selected = await chooseWorkspaceArchive();
      if (!selected) return;

      setArchivePath(selected.label);
      setArchiveToken(selected.token);
      setArchivePreview(null);
      const preview = await inspectWorkspaceArchive(selected.token);
      setArchivePreview(preview);
    } catch (reason) {
      onError(toMessage(reason));
    }
  };

  const chooseImportDestination = async () => {
    onError(null);
    try {
      const selected = await pickImportDestination();
      if (selected) {
        setDestinationParent(selected.label);
        setDestinationToken(selected.token);
      }
    } catch (reason) {
      onError(toMessage(reason));
    }
  };

  const importArchive = async () => {
    if (!archiveToken || !archivePreview) {
      onError("Select a valid .dispatch file first.");
      return;
    }
    if (!destinationToken) {
      onError("Select the folder where the workspace will be created.");
      return;
    }

    setSubmitting(true);
    onError(null);
    try {
      await onImportArchive(
        archiveToken,
        destinationToken,
        archivePreview.workspace_name
      );
    } catch (reason) {
      onError(toMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="h-screen w-screen overflow-auto bg-[#202020] text-zinc-200">
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-20 h-8 border-b border-[#303030] bg-[#252525]"
      />

      <div className="relative flex min-h-full items-center justify-center px-8 py-10">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6c37]/[0.035] blur-3xl" />

        <section className="relative w-full max-w-[900px] overflow-hidden rounded-xl border border-[#383838] bg-[#242424] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <header className="px-12 pb-6 pt-7 text-center sm:px-16">
            <h1 className="text-[27px] font-semibold tracking-[-0.02em] text-zinc-50">
              Welcome to Dispatch
            </h1>
            <p className="mx-auto mt-2 max-w-[620px] text-sm leading-5 text-zinc-400">
              Organize your requests, collections, and environments in one portable folder.
            </p>
          </header>

          <nav className="flex items-end justify-center gap-8 border-b border-[#383838] px-8">
            <ModeButton
              active={mode === "open"}
              onClick={() => selectMode("open")}
            >
              Existing workspace
            </ModeButton>
            <ModeButton
              active={mode === "create"}
              onClick={() => selectMode("create")}
            >
              New workspace
            </ModeButton>
            {supportsWorkspaceArchive && (
              <ModeButton
                active={mode === "import"}
                onClick={() => selectMode("import")}
              >
                Import .dispatch
              </ModeButton>
            )}
          </nav>

          <div className="min-h-[330px] px-12 py-7 sm:px-16">
            {mode === "open" && (
              <OpenWorkspacePanel
                path={path}
                submitting={submitting}
                recentWorkspaces={recentWorkspaces}
                onPathChange={(value) => {
                  setPath(value);
                  setPathToken("");
                }}
                onChooseDirectory={chooseWorkspaceDirectory}
                onSubmit={submitWorkspace}
                onOpenRecent={openRecent}
              />
            )}

            {mode === "create" && (
              <CreateWorkspacePanel
                name={name}
                path={path}
                submitting={submitting}
                onNameChange={setName}
                onPathChange={(value) => {
                  setPath(value);
                  setPathToken("");
                }}
                onChooseDirectory={chooseWorkspaceDirectory}
                onSubmit={submitWorkspace}
              />
            )}

            {mode === "import" && (
              <ImportWorkspacePanel
                archivePath={archivePath}
                destinationParent={destinationParent}
                preview={archivePreview}
                submitting={submitting}
                onChooseArchive={chooseArchive}
                onChooseDestination={chooseImportDestination}
                onImport={importArchive}
              />
            )}

            {error && (
              <div className="mx-auto mt-7 flex max-w-[760px] items-start gap-3 rounded-lg border border-red-900/70 bg-red-950/25 px-4 py-3 text-xs leading-5 text-red-300">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-500/50 text-[10px] font-bold">
                  !
                </span>
                <span>{error}</span>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-center gap-2 border-t border-[#333333] bg-[#222222] px-8 py-3 text-[11px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff6c37]" />
            Workspace data is stored locally in the folder you select.
          </footer>
        </section>
      </div>
    </main>
  );
}

function toMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : "Workspace operation failed.";
}
