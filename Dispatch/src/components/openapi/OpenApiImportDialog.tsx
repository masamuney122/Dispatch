import { useState } from "react";
import { chooseOpenApiFile } from "../../services/openApiService";
import type {
  OpenApiFolderOrganization,
  OpenApiImportOptions,
  OpenApiImportPreview,
  OpenApiRequestNaming,
  OpenApiSource,
} from "../../types/openapi";
import {
  DialogFrame,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
} from "./DialogPrimitives";

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
        sourceMode === "file"
          ? "Select an OpenAPI file first."
          : "Enter OpenAPI YAML or JSON."
      );
      return;
    }
    setInspecting(true);
    setInspectError(null);
    try {
      const result = await onInspect(source);
      setPreview(result);
      setCollectionName(result.title);
      const singleStaticServer =
        result.servers.length === 1 && !result.servers[0].includes("{")
          ? result.servers[0]
          : "";
      setSelectedServer(singleStaticServer);
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
    <DialogFrame title="Import OpenAPI" onClose={onClose} disabled={disabled} wide>
      <div className="mb-4 flex border-b border-[#3a3a3a]">
        <SourceTab
          active={sourceMode === "file"}
          onClick={() => {
            setSourceMode("file");
            invalidatePreview();
          }}
        >
          File
        </SourceTab>
        <SourceTab
          active={sourceMode === "text"}
          onClick={() => {
            setSourceMode("text");
            invalidatePreview();
          }}
        >
          Text
        </SourceTab>
      </div>

      <div className="space-y-3">
        {sourceMode === "file" ? (
          <div className="flex gap-2">
            <div className={`${inputClass} flex min-w-0 flex-1 items-center font-mono text-zinc-400`}>
              <span className="truncate">
                {fileSource?.kind === "file" ? fileSource.name : "No OpenAPI file selected"}
              </span>
            </div>
            <SecondaryButton onClick={() => void handleChooseFile()} disabled={disabled}>
              Select file
            </SecondaryButton>
          </div>
        ) : (
          <Field label="OpenAPI YAML or JSON">
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                invalidatePreview();
              }}
              spellCheck={false}
              placeholder={`openapi: 3.1.0\ninfo:\n  title: Example API\n  version: 1.0.0\npaths:\n  /health:\n    get:\n      summary: Health check`}
              className="h-56 w-full select-text resize-y rounded-lg border border-[#404040] bg-[#1d1d1d] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none transition selection:bg-[#ff6c37]/30 focus:border-[#ff6c37]/80"
            />
          </Field>
        )}

        <div className="flex justify-end">
          <SecondaryButton onClick={() => void handleInspect()} disabled={disabled || !source}>
            {inspecting ? "Analyzing..." : preview ? "Analyze again" : "Analyze"}
          </SecondaryButton>
        </div>
      </div>

      {preview && (
        <div className="mt-4 space-y-4 border-t border-[#393939] pt-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#3a3a3a] bg-[#202020] p-3 text-xs">
            <Metric label="Endpoint" value={preview.endpoint_count} />
            <Metric label="Folders" value={folderCount} />
            <Metric label="Auth scheme" value={preview.security_schemes.length} />
          </div>

          <div className="space-y-3">
            <ReadOnlyRow label="OpenAPI" value={preview.specification_version} />
            <Field label="Collection name">
              <input
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Request naming">
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
              <Field label="Folder organization">
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
                  <option value="">Preserve server scopes from the document (recommended)</option>
                  {preview.servers.map((server) => <option key={server}>{server}</option>)}
                </select>
              ) : (
                <input
                  value={selectedServer}
                  onChange={(event) => setSelectedServer(event.target.value)}
                  placeholder="https://api.example.com (optional)"
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
              Create an environment for baseUrl and path variables
            </label>
            {createEnvironment && (
              <Field label="Environment name">
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

      {(inspectError || error) && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/20 p-3 font-mono text-xs leading-5 text-red-300">
          {inspectError || error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={disabled}>Cancel</SecondaryButton>
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
          {submitting ? "Importing..." : "Import"}
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

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div className="text-center"><div className="text-lg font-bold text-zinc-100">{value}</div><div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div></div>
);

const ReadOnlyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 text-xs"><span className="text-zinc-500">{label}</span><span className="min-w-0 truncate font-mono text-zinc-300">{value}</span></div>
);
