import { useState } from "react";

import {
  exportCollectionOpenApi,
  importOpenApi,
  inspectOpenApi,
} from "../services/openApiService";
import { flushWorkspaceChanges } from "../services/workspaceLifecycle";
import type { Collection } from "../types/collection";
import type {
  OpenApiExportOptions,
  OpenApiImportOptions,
  OpenApiSource,
} from "../types/openapi";

interface OpenApiWorkflowOptions {
  refreshCollections: () => Promise<void>;
  refreshEnvironments: () => Promise<void>;
  showCollections: () => void;
}

export function useOpenApiWorkflow({
  refreshCollections,
  refreshEnvironments,
  showCollections,
}: OpenApiWorkflowOptions) {
  const [importOpen, setImportOpen] = useState(false);
  const [exportCollection, setExportCollection] = useState<Collection | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openImport = () => {
    setError(null);
    setImportOpen(true);
  };

  const closeImport = () => {
    if (!submitting) setImportOpen(false);
  };

  const openExport = (collection: Collection) => {
    setError(null);
    setExportCollection(collection);
  };

  const closeExport = () => {
    if (!submitting) setExportCollection(null);
  };

  const confirmImport = async (
    source: OpenApiSource,
    options: OpenApiImportOptions,
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      await flushWorkspaceChanges();
      const result = await importOpenApi(source, options);
      await Promise.all([refreshCollections(), refreshEnvironments()]);
      showCollections();
      setImportOpen(false);
      if (result.warnings.length > 0) {
        window.alert(
          `OpenAPI imported. ${result.warnings.length} feature(s) were processed with warnings.`,
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmExport = async (options: OpenApiExportOptions) => {
    if (!exportCollection) return;
    setSubmitting(true);
    setError(null);
    try {
      await flushWorkspaceChanges();
      const result = await exportCollectionOpenApi(exportCollection, options);
      if (result.cancelled) return;
      setExportCollection(null);
      const grouped =
        result.grouped_request_count > 0
          ? `\n${result.grouped_request_count} request(s) were grouped as examples under the same method/path.`
          : "";
      const otherWarnings = result.warnings.filter(
        (warning) => warning.code !== "duplicate-operation-grouped",
      );
      const warningSummary =
        otherWarnings.length > 0
          ? `\n\nWarnings:\n${otherWarnings
              .slice(0, 5)
              .map(
                (warning) =>
                  `• ${warning.message}${warning.location ? ` (${warning.location})` : ""}`,
              )
              .join("\n")}${otherWarnings.length > 5 ? `\n• +${otherWarnings.length - 5} warnings` : ""}`
          : "";
      window.alert(
        `OpenAPI exported: ${result.request_count} request(s), ${result.endpoint_count} operation(s).${grouped}${warningSummary}`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    importOpen,
    exportCollection,
    submitting,
    error,
    inspect: inspectOpenApi,
    resetError: () => setError(null),
    openImport,
    closeImport,
    openExport,
    closeExport,
    confirmImport,
    confirmExport,
  };
}
