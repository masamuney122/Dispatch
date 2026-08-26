import { useState, type FormEvent, type ReactNode } from "react";
import {
  chooseImportDestination as pickImportDestination,
  chooseWorkspaceArchive,
  chooseWorkspaceDirectory as pickWorkspaceDirectory,
  inspectWorkspaceArchive,
  supportsWorkspaceArchive,
} from "../../services/workspaceService";
import type { ArchivePreview, RecentWorkspace } from "../../types/workspace";

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
      onError("Workspace klasörünü seçmelisin.");
      return;
    }
    if (mode === "create" && !name.trim()) {
      onError("Yeni workspace için bir ad yazmalısın.");
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
      onError("Önce geçerli bir .dispatch dosyası seçmelisin.");
      return;
    }
    if (!destinationToken) {
      onError("Workspace'in oluşturulacağı klasörü seçmelisin.");
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
              Dispatch&apos;e hoş geldin
            </h1>
            <p className="mx-auto mt-2 max-w-[620px] text-sm leading-5 text-zinc-400">
              İsteklerini, collection&apos;larını ve environment&apos;larını tek bir taşınabilir klasörde düzenle.
            </p>
          </header>

          <nav className="flex items-end justify-center gap-8 border-b border-[#383838] px-8">
            <ModeButton
              active={mode === "open"}
              onClick={() => selectMode("open")}
            >
              Mevcut workspace
            </ModeButton>
            <ModeButton
              active={mode === "create"}
              onClick={() => selectMode("create")}
            >
              Yeni workspace
            </ModeButton>
            {supportsWorkspaceArchive && (
              <ModeButton
                active={mode === "import"}
                onClick={() => selectMode("import")}
              >
                .dispatch içe aktar
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
            Workspace verileri seçtiğin klasörde yerel olarak saklanır.
          </footer>
        </section>
      </div>
    </main>
  );
}

interface OpenWorkspacePanelProps {
  path: string;
  submitting: boolean;
  recentWorkspaces: RecentWorkspace[];
  onPathChange: (path: string) => void;
  onChooseDirectory: () => Promise<void>;
  onSubmit: (event: FormEvent) => Promise<void>;
  onOpenRecent: (recent: RecentWorkspace) => Promise<void>;
}

function OpenWorkspacePanel({
  path,
  submitting,
  recentWorkspaces,
  onPathChange,
  onChooseDirectory,
  onSubmit,
  onOpenRecent,
}: OpenWorkspacePanelProps) {
  return (
    <div className="mx-auto max-w-[760px]">
      <PanelHeading
        title="Kaldığın yerden devam et"
        description="Daha önce oluşturduğun Dispatch workspace klasörünü seç."
      />

      <form className="mt-4" onSubmit={onSubmit}>
        <PathField
          label="Workspace klasörü"
          value={path}
          placeholder="Workspace klasörünün tam yolu"
          onChange={onPathChange}
          onBrowse={onChooseDirectory}
          action={
            <PrimaryButton disabled={submitting}>
              {submitting ? "Açılıyor…" : "Workspace'i aç"}
            </PrimaryButton>
          }
        />
      </form>

      {recentWorkspaces.length > 0 && (
        <section className="mt-7 border-t border-[#383838] pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Son kullanılanlar
            </h3>
            <span className="text-[11px] text-zinc-600">
              {recentWorkspaces.length} workspace
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentWorkspaces.map((recent) => (
              <button
                type="button"
                key={`${recent.id}:${recent.path}`}
                disabled={submitting}
                onClick={() => void onOpenRecent(recent)}
                className="group flex h-9 min-w-0 items-center gap-2.5 rounded-lg border border-[#3a3a3a] bg-[#202020] px-3 text-left transition hover:border-[#ff6c37]/45 hover:bg-[#292929] disabled:opacity-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#3d3d3d] bg-[#292929] text-zinc-500 transition group-hover:text-[#ff7a47]">
                  <FolderIcon className="h-3.5 w-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="max-w-[150px] shrink-0 truncate text-xs font-semibold text-zinc-200">
                    {recent.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-600">
                    {recent.path}
                  </span>
                </span>
                <ArrowIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-[#ff7a47]" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface CreateWorkspacePanelProps {
  name: string;
  path: string;
  submitting: boolean;
  onNameChange: (name: string) => void;
  onPathChange: (path: string) => void;
  onChooseDirectory: () => Promise<void>;
  onSubmit: (event: FormEvent) => Promise<void>;
}

function CreateWorkspacePanel({
  name,
  path,
  submitting,
  onNameChange,
  onPathChange,
  onChooseDirectory,
  onSubmit,
}: CreateWorkspacePanelProps) {
  return (
    <form className="mx-auto max-w-[760px]" onSubmit={onSubmit}>
      <PanelHeading
        title="Yeni bir workspace oluştur"
        description="Collection ve environment dosyaların seçtiğin boş klasörde oluşturulur."
      />

      <div className="mt-6 space-y-5">
        <FieldLabel
          label="Workspace adı"
          description="Uygulama içinde ve son kullanılanlar listesinde görünecek ad."
        >
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Örneğin Payment API"
            className={inputClassName}
          />
        </FieldLabel>

        <PathField
          label="Workspace klasörü"
          description="Mevcut değilse oluşturulur; mevcutsa klasörün boş olması gerekir."
          value={path}
          placeholder="Boş bir klasör seç"
          onChange={onPathChange}
          onBrowse={onChooseDirectory}
          action={
            <PrimaryButton disabled={submitting}>
              {submitting ? "Oluşturuluyor…" : "Oluştur ve aç"}
            </PrimaryButton>
          }
        />
      </div>
    </form>
  );
}

interface ImportWorkspacePanelProps {
  archivePath: string;
  destinationParent: string;
  preview: ArchivePreview | null;
  submitting: boolean;
  onChooseArchive: () => Promise<void>;
  onChooseDestination: () => Promise<void>;
  onImport: () => Promise<void>;
}

function ImportWorkspacePanel({
  archivePath,
  destinationParent,
  preview,
  submitting,
  onChooseArchive,
  onChooseDestination,
  onImport,
}: ImportWorkspacePanelProps) {
  return (
    <div className="mx-auto max-w-[760px]">
      <PanelHeading
        title="Dispatch arşivini içe aktar"
        description="Bir .dispatch yedeğini doğrula ve yeni, bağımsız bir workspace olarak aç."
      />

      <div className="mt-6 space-y-5">
        <FilePickerField
          label="Dispatch arşivi"
          value={archivePath}
          placeholder="Henüz bir .dispatch dosyası seçilmedi"
          buttonLabel="Arşiv seç"
          onBrowse={onChooseArchive}
        />

        {preview && (
          <div className="grid overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#202020] sm:grid-cols-[1fr_auto_auto]">
            <div className="flex min-w-0 items-center gap-3 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ff6c37]/10 text-[#ff7a47]">
                <ArchiveIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-zinc-100">
                  {preview.workspace_name}
                </span>
                <span className="mt-1 block text-[11px] text-zinc-500">
                  {preview.mode === "safe_share" ? "Safe Share" : "Tam yedek"}
                </span>
              </span>
            </div>
            <PreviewMetric label="Collections" value={preview.collection_count} />
            <PreviewMetric label="Environments" value={preview.environment_count} />
          </div>
        )}

        <FilePickerField
          label="Hedef klasör"
          description="Workspace, seçtiğin klasörün altında kendi adıyla oluşturulur."
          value={destinationParent}
          placeholder="Workspace'in oluşturulacağı üst klasörü seç"
          buttonLabel="Klasör seç"
          onBrowse={onChooseDestination}
          action={
            <PrimaryButton
              type="button"
              disabled={submitting || !preview || !destinationParent}
              onClick={() => void onImport()}
            >
              {submitting ? "Aktarılıyor…" : "İçe aktar ve aç"}
            </PrimaryButton>
          }
        />
      </div>
    </div>
  );
}

function PanelHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-[560px] text-xs leading-5 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function FieldLabel({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-semibold text-zinc-300">{label}</span>
        {description && (
          <span className="text-right text-[11px] text-zinc-600">{description}</span>
        )}
      </span>
      <span className="mt-2.5 block">{children}</span>
    </label>
  );
}

function PathField({
  label,
  description,
  value,
  placeholder,
  onChange,
  onBrowse,
  action,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBrowse: () => Promise<void>;
  action?: ReactNode;
}) {
  return (
    <FieldLabel label={label} description={description}>
      <span className="flex flex-col gap-3 sm:flex-row">
        <span className="relative min-w-0 flex-1">
          <FolderIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={`${inputClassName} pl-10 font-mono text-xs`}
          />
        </span>
        <SecondaryButton type="button" onClick={() => void onBrowse()}>
          Klasör seç
        </SecondaryButton>
        {action}
      </span>
    </FieldLabel>
  );
}

function FilePickerField({
  label,
  description,
  value,
  placeholder,
  buttonLabel,
  onBrowse,
  action,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  buttonLabel: string;
  onBrowse: () => Promise<void>;
  action?: ReactNode;
}) {
  return (
    <FieldLabel label={label} description={description}>
      <span className="flex flex-col gap-3 sm:flex-row">
        <span className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg border border-[#404040] bg-[#202020] px-3">
          <ArchiveIcon className="h-4 w-4 shrink-0 text-zinc-600" />
          <span
            className={`truncate font-mono text-xs ${
              value ? "text-zinc-300" : "text-zinc-600"
            }`}
          >
            {value || placeholder}
          </span>
        </span>
        <SecondaryButton type="button" onClick={() => void onBrowse()}>
          {buttonLabel}
        </SecondaryButton>
        {action}
      </span>
    </FieldLabel>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[130px] flex-col justify-center border-t border-[#373737] px-5 py-4 sm:border-l sm:border-t-0">
      <span className="text-base font-semibold text-zinc-200">{value}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
        {label}
      </span>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative border-b-2 px-3 pb-2.5 pt-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[#ff6c37] font-semibold text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#ff6c37] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(255,108,55,0.1)] transition hover:bg-[#ff7a47] active:bg-[#e85b2b] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-[#464646] bg-[#2c2c2c] px-4 text-xs font-semibold text-zinc-300 transition hover:border-[#565656] hover:bg-[#333333] hover:text-white"
    >
      {children}
    </button>
  );
}

const inputClassName =
  "h-9 w-full rounded-lg border border-[#404040] bg-[#202020] px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 hover:border-[#494949] focus:border-[#ff6c37]/80 focus:ring-2 focus:ring-[#ff6c37]/10";

function FolderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3.5 6.5h6l2 2h9v9.5h-17z" />
    </svg>
  );
}

function ArchiveIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 4h14v4H5zM6.5 8v11h11V8M10 12h4" />
    </svg>
  );
}

function ArrowIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function toMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : "Workspace operation failed.";
}
