import { useState } from "react";
import type { Collection } from "../../types/collection";
import type { OpenApiExportOptions } from "../../types/openapi";
import { DialogFrame, Field, inputClass, PrimaryButton, SecondaryButton } from "./DialogPrimitives";

interface OpenApiExportDialogProps {
  collection: Collection;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (options: OpenApiExportOptions) => Promise<void>;
}

export function OpenApiExportDialog({ collection, submitting, error, onClose, onConfirm }: OpenApiExportDialogProps) {
  const [title, setTitle] = useState(collection.name);
  const [apiVersion, setApiVersion] = useState("1.0.0");
  const [format, setFormat] = useState<"json" | "yaml">("yaml");
  const [serverUrl, setServerUrl] = useState("");

  return (
    <DialogFrame title="Export as OpenAPI" onClose={onClose} disabled={submitting}>
      <div className="space-y-3">
        <Field label="API title"><input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></Field>
        <Field label="API version"><input value={apiVersion} onChange={(event) => setApiVersion(event.target.value)} className={inputClass} /></Field>
        <Field label="Format">
          <select value={format} onChange={(event) => setFormat(event.target.value as "json" | "yaml")} className={inputClass}>
            <option value="yaml">YAML</option>
            <option value="json">JSON</option>
          </select>
        </Field>
        <Field label="Server URL override"><input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="Automatically detected from request URLs when empty" className={inputClass} /></Field>
      </div>
      <p className="mt-4 text-[11px] leading-4 text-zinc-500">
        Domains are detected per operation from request URLs. Requests using the same method and path are grouped and reported as OpenAPI examples. Scripts are preserved only in Dispatch metadata because OpenAPI has no standard script field. Operations without a response schema use a default 200 response.
      </p>
      {error && <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={submitting}>Cancel</SecondaryButton>
        <PrimaryButton
          disabled={submitting || !title.trim() || !apiVersion.trim()}
          onClick={() => void onConfirm({ title: title.trim(), api_version: apiVersion.trim(), format, server_url: serverUrl.trim() || null })}
        >
          {submitting ? "Exporting..." : "Export"}
        </PrimaryButton>
      </div>
    </DialogFrame>
  );
}
