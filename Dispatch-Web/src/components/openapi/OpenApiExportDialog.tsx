import { useState } from "react";
import type { Collection } from "../../types/collection";
import type { OpenApiExportOptions } from "../../types/openapi";
import { DialogFrame, Field, inputClass, PrimaryButton, SecondaryButton } from "./OpenApiImportDialog";

interface Props {
  collection: Collection;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (options: OpenApiExportOptions) => Promise<void>;
}

export function OpenApiExportDialog({ collection, submitting, error, onClose, onConfirm }: Props) {
  const [title, setTitle] = useState(collection.name);
  const [apiVersion, setApiVersion] = useState("1.0.0");
  const [format, setFormat] = useState<"json" | "yaml">("yaml");
  const [serverUrl, setServerUrl] = useState("");
  return (
    <DialogFrame title="OpenAPI olarak dışa aktar" onClose={onClose} disabled={submitting}>
      <div className="space-y-3">
        <Field label="API title"><input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></Field>
        <Field label="API version"><input value={apiVersion} onChange={(event) => setApiVersion(event.target.value)} className={inputClass} /></Field>
        <Field label="Format"><select value={format} onChange={(event) => setFormat(event.target.value as "json" | "yaml")} className={inputClass}><option value="yaml">YAML</option><option value="json">JSON</option></select></Field>
        <Field label="Server URL"><input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="https://api.example.com (opsiyonel)" className={inputClass} /></Field>
      </div>
      <p className="mt-4 text-[11px] leading-4 text-zinc-500">Secret değerler dışa aktarılmaz. Response şemaları bulunmadığı için her operation varsayılan bir 200 response içerir.</p>
      {error && <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={submitting}>İptal</SecondaryButton>
        <PrimaryButton disabled={submitting || !title.trim() || !apiVersion.trim()} onClick={() => void onConfirm({ title: title.trim(), api_version: apiVersion.trim(), format, server_url: serverUrl.trim() || null })}>{submitting ? "Dışa aktarılıyor..." : "Dışa aktar"}</PrimaryButton>
      </div>
    </DialogFrame>
  );
}
