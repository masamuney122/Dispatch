import { useState } from "react";
import type { OpenApiImportOptions, OpenApiImportPreview } from "../../types/openapi";

interface OpenApiImportDialogProps {
  fileName: string;
  preview: OpenApiImportPreview;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (options: OpenApiImportOptions) => Promise<void>;
}

export function OpenApiImportDialog({
  fileName,
  preview,
  submitting,
  error,
  onClose,
  onConfirm,
}: OpenApiImportDialogProps) {
  const [collectionName, setCollectionName] = useState(preview.title);
  const [selectedServer, setSelectedServer] = useState(preview.servers[0] || "");
  const [createEnvironment, setCreateEnvironment] = useState(preview.servers.length > 0);
  const [environmentName, setEnvironmentName] = useState(`${preview.title} Environment`);

  return (
    <DialogFrame title="OpenAPI içe aktar" onClose={onClose} disabled={submitting}>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#3a3a3a] bg-[#202020] p-3 text-xs">
        <Metric label="Endpoint" value={preview.endpoint_count} />
        <Metric label="Klasör" value={preview.folder_count} />
        <Metric label="Auth scheme" value={preview.security_schemes.length} />
      </div>

      <div className="mt-4 space-y-3">
        <ReadOnlyRow label="Dosya" value={fileName} />
        <ReadOnlyRow label="OpenAPI" value={preview.specification_version} />
        <Field label="Collection adı">
          <input
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
            className={inputClass}
          />
        </Field>
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

      {preview.warnings.length > 0 && (
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

      {error && <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={submitting}>İptal</SecondaryButton>
        <PrimaryButton
          disabled={submitting || !collectionName.trim()}
          onClick={() => void onConfirm({
            collection_name: collectionName.trim(),
            selected_server: selectedServer.trim() || null,
            create_environment: createEnvironment,
            environment_name: createEnvironment ? environmentName.trim() || null : null,
          })}
        >
          {submitting ? "İçe aktarılıyor..." : "İçe aktar"}
        </PrimaryButton>
      </div>
    </DialogFrame>
  );
}

export const DialogFrame: React.FC<{
  title: string;
  onClose: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, disabled, children }) => (
  <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-6" onMouseDown={() => !disabled && onClose()}>
    <div
      className="w-full max-w-[560px] rounded-xl border border-[#414141] bg-[#242424] p-6 shadow-2xl"
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
