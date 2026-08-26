import { useState } from "react";
import { chooseOpenApiFile } from "../../services/openApiService";
import type {
  OpenApiFolderOrganization,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiRequestNaming,
  OpenApiSource,
} from "../../types/openapi";

interface OpenApiImportDialogProps {
  submitting: boolean;
  error: string | null;
  onInspect: (source: OpenApiSource) => Promise<OpenApiImportPreview>;
  onResetError: () => void;
  onClose: () => void;
  onConfirm: (source: OpenApiSource, options: OpenApiImportOptions) => Promise<void>;
}

export function OpenApiImportDialog({
  submitting,
  error,
  onInspect,
  onResetError,
  onClose,
  onConfirm,
}: OpenApiImportDialogProps) {
  const [sourceMode, setSourceMode] = useState<"file" | "text">("file");
  const [fileSource, setFileSource] = useState<OpenApiSource | null>(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<OpenApiImportPreview | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [selectedServer, setSelectedServer] = useState("");
  const [createEnvironment, setCreateEnvironment] = useState(false);
  const [environmentName, setEnvironmentName] = useState("");
  const [requestNaming, setRequestNaming] = useState<OpenApiRequestNaming>("fallback");
  const [folderOrganization, setFolderOrganization] =
    useState<OpenApiFolderOrganization>("tags");

  const invalidatePreview = () => {
    setPreview(null);
    setInspectError(null);
    onResetError();
  };

  const sourceForCurrentMode = (): OpenApiSource | null => {
    if (sourceMode === "file") {
      return fileSource;
    }
    return content.trim() ? { kind: "text", content } : null;
  };

  const handleChooseFile = async () => {
    const selected = await chooseOpenApiFile();
    if (!selected) return;
    setFileSource(selected);
    invalidatePreview();
  };

  const handleInspect = async () => {
    const source = sourceForCurrentMode();
    if (!source) {
      setInspectError(
        sourceMode === "file" ? "Önce bir OpenAPI dosyası seç." : "OpenAPI YAML veya JSON kodunu gir."
      );
      return;
    }
    setInspecting(true);
    setInspectError(null);
    try {
      const result = await onInspect(source);
      setPreview(result);
      setCollectionName(result.title);
      setSelectedServer(result.servers[0] || "");
      setCreateEnvironment(result.servers.length > 0);
      setEnvironmentName(`${result.title} Environment`);
    } catch (inspectFailure) {
      setPreview(null);
      setInspectError(inspectFailure instanceof Error ? inspectFailure.message : String(inspectFailure));
    } finally {
      setInspecting(false);
    }
  };

  const folderCount = preview
    ? folderOrganization === "tags"
      ? preview.tag_folder_count
      : preview.path_folder_count
    : 0;
  const source = sourceForCurrentMode();
  const disabled = submitting || inspecting;

  return (
    <DialogFrame title="OpenAPI içe aktar" onClose={onClose} disabled={disabled} wide>
      <div className="mb-4 flex border-b border-[#3a3a3a]">
        <SourceTab
          active={sourceMode === "file"}
          onClick={() => {
            setSourceMode("file");
            invalidatePreview();
          }}
        >
          Dosyadan
        </SourceTab>
        <SourceTab
          active={sourceMode === "text"}
          onClick={() => {
            setSourceMode("text");
            invalidatePreview();
          }}
        >
          Metin
        </SourceTab>
      </div>

      <div className="space-y-3">
        {sourceMode === "file" ? (
          <div className="flex gap-2">
            <div className={`${inputClass} flex min-w-0 flex-1 items-center font-mono text-zinc-400`}>
              <span className="truncate">
                {fileSource?.kind === "file" ? fileSource.name : "Henüz bir OpenAPI dosyası seçilmedi"}
              </span>
            </div>
            <SecondaryButton onClick={() => void handleChooseFile()} disabled={disabled}>
              Dosya seç
            </SecondaryButton>
          </div>
        ) : (
          <Field label="OpenAPI YAML veya JSON">
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                invalidatePreview();
              }}
              spellCheck={false}
              placeholder={`openapi: 3.1.0\ninfo:\n  title: Örnek API\n  version: 1.0.0\npaths:\n  /health:\n    get:\n      summary: Health check`}
              className="h-56 w-full select-text resize-y rounded-lg border border-[#404040] bg-[#1d1d1d] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none transition selection:bg-[#ff6c37]/30 focus:border-[#ff6c37]/80"
            />
          </Field>
        )}

        <div className="flex justify-end">
          <SecondaryButton onClick={() => void handleInspect()} disabled={disabled || !source}>
            {inspecting ? "Analiz ediliyor..." : preview ? "Yeniden analiz et" : "Analiz et"}
          </SecondaryButton>
        </div>
      </div>

      {preview && (
        <div className="mt-4 space-y-4 border-t border-[#393939] pt-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#3a3a3a] bg-[#202020] p-3 text-xs">
            <Metric label="Endpoint" value={preview.endpoint_count} />
            <Metric label="Klasör" value={folderCount} />
            <Metric label="Auth scheme" value={preview.security_schemes.length} />
          </div>

          <div className="space-y-3">
            <ReadOnlyRow label="OpenAPI" value={preview.specification_version} />
            <Field label="Collection adı">
              <input
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Request isimlendirme">
                <select
                  value={requestNaming}
                  onChange={(event) => setRequestNaming(event.target.value as OpenApiRequestNaming)}
                  className={inputClass}
                >
                  <option value="fallback">Fallback</option>
                  <option value="path">Path</option>
                  <option value="url">URL</option>
                </select>
              </Field>
              <Field label="Klasör düzeni">
                <select
                  value={folderOrganization}
                  onChange={(event) =>
                    setFolderOrganization(event.target.value as OpenApiFolderOrganization)
                  }
                  className={inputClass}
                >
                  <option value="tags">Tags</option>
                  <option value="path">Path</option>
                </select>
              </Field>
            </div>
            <Field label="Server">
              {preview.servers.length > 0 ? (
                <select
                  value={selectedServer}
                  onChange={(event) => setSelectedServer(event.target.value)}
                  className={inputClass}
                >
                  {preview.servers.map((server) => <option key={server}>{server}</option>)}
                </select>
              ) : (
                <input
                  value={selectedServer}
                  onChange={(event) => setSelectedServer(event.target.value)}
                  placeholder="https://api.example.com (opsiyonel)"
                  className={inputClass}
                />
              )}
            </Field>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={createEnvironment}
                onChange={(event) => setCreateEnvironment(event.target.checked)}
                className="accent-[#ff6c37]"
              />
              baseUrl ve path değişkenleri için environment oluştur
            </label>
            {createEnvironment && (
              <Field label="Environment adı">
                <input
                  value={environmentName}
                  onChange={(event) => setEnvironmentName(event.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        </div>
      )}

      {preview && preview.warnings.length > 0 && (
        <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-amber-900/60 bg-amber-950/15 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400">
            {preview.warnings.length} uyarı
          </p>
          <ul className="space-y-1.5 text-[11px] leading-4 text-amber-200/70">
            {preview.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>• {warning.message}{warning.location ? ` (${warning.location})` : ""}</li>
            ))}
          </ul>
        </div>
      )}

      {(inspectError || error) && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/20 p-3 font-mono text-xs leading-5 text-red-300">
          {inspectError || error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={disabled}>İptal</SecondaryButton>
        <PrimaryButton
          disabled={disabled || !preview || !source || !collectionName.trim()}
          onClick={() => {
            if (!source) return;
            void onConfirm(source, {
              collection_name: collectionName.trim(),
              selected_server: selectedServer.trim() || null,
              create_environment: createEnvironment,
              environment_name: createEnvironment ? environmentName.trim() || null : null,
              request_naming: requestNaming,
              folder_organization: folderOrganization,
            });
          }}
        >
          {submitting ? "İçe aktarılıyor..." : "İçe aktar"}
        </PrimaryButton>
      </div>
    </DialogFrame>
  );
}

const SourceTab = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-b-2 px-5 py-2 text-xs font-semibold transition ${
      active
        ? "border-[#ff6c37] text-zinc-100"
        : "border-transparent text-zinc-500 hover:text-zinc-300"
    }`}
  >
    {children}
  </button>
);

export const DialogFrame: React.FC<{
  title: string;
  onClose: () => void;
  disabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, disabled, wide, children }) => (
  <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-6" onMouseDown={() => !disabled && onClose()}>
    <div
      className={`max-h-[92vh] w-full overflow-y-auto rounded-xl border border-[#414141] bg-[#242424] p-6 shadow-2xl ${wide ? "max-w-[760px]" : "max-w-[560px]"}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-zinc-100">{title}</h2>
        <button disabled={disabled} onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-[#333] hover:text-white disabled:opacity-40">×</button>
      </div>
      {children}
    </div>
  </div>
);

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div className="text-center"><div className="text-lg font-bold text-zinc-100">{value}</div><div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div></div>
);

const ReadOnlyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 text-xs"><span className="text-zinc-500">{label}</span><span className="min-w-0 truncate font-mono text-zinc-300">{value}</span></div>
);

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-zinc-400">{label}</span>{children}</label>
);

export const inputClass = "h-9 w-full rounded-lg border border-[#404040] bg-[#202020] px-3 text-xs text-zinc-100 outline-none transition focus:border-[#ff6c37]/80";

export const PrimaryButton = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...props} className="h-9 rounded-lg bg-[#ff6c37] px-5 text-xs font-bold text-white transition hover:bg-[#ff7a47] disabled:cursor-not-allowed disabled:opacity-45">{children}</button>
);

export const SecondaryButton = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...props} className="h-9 rounded-lg border border-[#464646] bg-[#2c2c2c] px-4 text-xs font-semibold text-zinc-300 transition hover:bg-[#333] disabled:opacity-45">{children}</button>
);
