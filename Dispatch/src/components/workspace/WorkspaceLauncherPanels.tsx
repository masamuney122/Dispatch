import type { FormEvent } from "react";
import type { ArchivePreview, RecentWorkspace } from "../../types/workspace";
import {
  ArchiveIcon,
  ArrowIcon,
  FieldLabel,
  FilePickerField,
  PanelHeading,
  PathField,
  PreviewMetric,
  PrimaryButton,
  workspaceInputClassName,
} from "./WorkspaceLauncherControls";

interface OpenWorkspacePanelProps {
  path: string;
  submitting: boolean;
  recentWorkspaces: RecentWorkspace[];
  onPathChange: (path: string) => void;
  onChooseDirectory: () => Promise<void>;
  onSubmit: (event: FormEvent) => Promise<void>;
  onOpenRecent: (recent: RecentWorkspace) => Promise<void>;
}

export function OpenWorkspacePanel({
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

export function CreateWorkspacePanel({
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
            className={workspaceInputClassName}
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

export function ImportWorkspacePanel({
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

function FolderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3.5 6.5h6l2 2h9v9.5h-17z" />
    </svg>
  );
}
