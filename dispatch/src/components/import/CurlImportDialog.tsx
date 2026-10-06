import { useMemo, useState } from "react";

import type { Collection } from "../../types/collection";
import {
  parseCurlCommand,
  type CurlImportResult,
} from "../../utils/curlImport";
import {
  DialogFrame,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
} from "../openapi/DialogPrimitives";

interface CurlImportDialogProps {
  collections: Collection[];
  onClose: () => void;
  onImport: (request: CurlImportResult, collectionId: string) => Promise<void>;
}

const example = `curl 'https://api.example.com/users' \\
  -H 'Accept: application/json' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{"name":"Ada"}'`;

export function CurlImportDialog({
  collections,
  onClose,
  onImport,
}: CurlImportDialogProps) {
  const [command, setCommand] = useState("");
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const parsed = useMemo(() => {
    if (!command.trim()) return { request: null, error: null };
    try {
      return { request: parseCurlCommand(command), error: null };
    } catch (reason) {
      return {
        request: null,
        error: reason instanceof Error ? reason.message : String(reason),
      };
    }
  }, [command]);

  return (
    <DialogFrame title="Import cURL" onClose={onClose} wide>
      <p className="mb-3 text-xs leading-5 text-zinc-400">
        Paste a cURL command copied from Chrome DevTools or another client. The
        command is not executed; it is safely converted into a Dispatch request.
      </p>

      <textarea
        autoFocus
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        spellCheck={false}
        placeholder={example}
        className="h-52 w-full select-text resize-y rounded-lg border border-[#404040] bg-[#1d1d1d] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none transition selection:bg-[#ff6c37]/30 focus:border-[#ff6c37]/80"
      />

      <div className="mt-4">
        <Field label="Collection">
          <select
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
            disabled={importing || collections.length === 0}
            className={inputClass}
          >
            {collections.length === 0 ? (
              <option value="">Create a collection first</option>
            ) : (
              collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))
            )}
          </select>
        </Field>
      </div>

      {parsed.request && parsed.request.warnings.length > 0 && (
        <div className="mt-3 max-h-28 overflow-y-auto rounded-lg border border-amber-900/60 bg-amber-950/15 p-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
            {parsed.request.warnings.length} warnings
          </p>
          <ul className="space-y-1 text-[11px] leading-4 text-amber-200/70">
            {parsed.request.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {parsed.error && (
        <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/20 p-3 font-mono text-xs leading-5 text-red-300">
          {parsed.error}
        </p>
      )}

      {importError && (
        <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs leading-5 text-red-300">
          {importError}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={importing}>Cancel</SecondaryButton>
        <PrimaryButton
          disabled={!parsed.request || !collectionId || importing}
          onClick={async () => {
            if (!parsed.request || !collectionId) return;
            setImporting(true);
            setImportError(null);
            try {
              await onImport(parsed.request, collectionId);
            } catch (reason) {
              setImportError(reason instanceof Error ? reason.message : String(reason));
              setImporting(false);
            }
          }}
        >
          {importing ? "Importing..." : "Import request"}
        </PrimaryButton>
      </div>
    </DialogFrame>
  );
}
