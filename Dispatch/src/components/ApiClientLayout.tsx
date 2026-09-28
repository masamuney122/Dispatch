import { useEffect, useState } from "react";
import { TopNavbar } from "./layout/TopNavbar";
import { ExplorerSidebar } from "./layout/ExplorerSidebar";
import { RequestTabsBar } from "./layout/RequestTabsBar";
import { UrlActionBar } from "./layout/UrlActionBar";
import { RequestSectionTabs } from "./layout/RequestSectionTabs";
import { QueryParamsTable } from "./layout/QueryParamsTable";
import { HeadersEditor } from "./layout/HeadersEditor";
import { BodyEditor } from "./layout/BodyEditor";
import { AuthEditor } from "./layout/AuthEditor";
import { ResponsePlaceholder } from "./layout/ResponsePlaceholder";
import { SaveRequestDialog } from "./layout/SaveRequestDialog";
import { OpenApiImportDialog } from "./openapi/OpenApiImportDialog";
import { OpenApiExportDialog } from "./openapi/OpenApiExportDialog";
import { EnvironmentEditor } from "./environment/EnvironmentEditor";
import { OverlayScrollArea } from "./common/OverlayScrollArea";
import { RequestHttpSettingsEditor } from "./settings/HttpSettingsEditor";
import { GlobalSettingsDialog } from "./settings/GlobalSettingsDialog";
import { CookieManagerDialog } from "./cookies/CookieManagerDialog";
import { ScriptsEditor } from "./scripts/ScriptsEditor";

import { useRequestTabs } from "../hooks/useRequestTabs";
import { useAppData } from "../hooks/useAppData";
import { useRequestExecution } from "../hooks/useRequestExecution";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useResizablePanels,
} from "../hooks/useResizablePanels";

import { saveRequestToCollection, createCollection, updateRequestInCollection } from "../services/collectionService";

import type { HistoryItem } from "../types/history";
import type { QueryParamItem } from "../types/tab";
import type { Collection, SavedRequest } from "../types/collection";
import type { ArchiveMode } from "../types/workspace";
import type { OpenApiExportOptions, OpenApiImportOptions, OpenApiSource } from "../types/openapi";
import { exportWorkspaceArchive } from "../services/workspaceService";
import { flushWorkspaceChanges } from "../services/workspaceLifecycle";
import { exportCollectionOpenApi, importOpenApi, inspectOpenApi } from "../services/openApiService";
import { loadGlobalHttpSettings, saveGlobalHttpSettings } from "../services/httpSettingsService";
import { platformCapabilities } from "../services/platformService";
import { DEFAULT_HTTP_SETTINGS, type GlobalHttpSettings, type RequestHttpSettings } from "../types/httpSettings";
import { EMPTY_REQUEST_SCRIPTS } from "../types/script";
import {
  createRequestPayload,
  requestDisplayName,
} from "../utils/requestDraft";

interface ApiClientLayoutProps {
  workspaceName: string;
  onChangeWorkspace: () => Promise<void>;
}

export const ApiClientLayout: React.FC<ApiClientLayoutProps> = ({
  workspaceName,
  onChangeWorkspace,
}) => {
  // ── Tab Management ──
  const {
    activeTab,
    tabsInfoList,
    activeTabId,
    activeEnvironmentId: activeEnvironmentTabId,
    setActiveTabId,
    updateActiveTab,
    clearHttpSettingOverrides,
    handleAddTab,
    handleCloseTab,
    openEnvironmentTab,
    closeEnvironmentTab,
    activateRequestTab,
    handleReorderTab,
  } = useRequestTabs();

  // ── Application Data (History, Collections, Environments) ──
  const {
    history,
    setHistory,
    collections,
    setCollections,
    environments,
    activeEnvironmentId,
    environmentError,
    handleClearHistory: clearHistoryData,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    refreshCollections,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleDuplicateFolder,
    handleCreateRequest,
    handleRenameRequest,
    handleDuplicateRequest,
    handleDeleteRequest,
    handleReorderItems,
    handleCreateEnvironment,
    refreshEnvironments,
    handleUpdateEnvironment,
    handleCommitEnvironment,
    handleDeleteEnvironment,
    handleSelectEnvironment,
  } = useAppData();

  // ── Local UI State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"collections" | "history">("collections");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [openApiImportDialogOpen, setOpenApiImportDialogOpen] = useState(false);
  const [openApiExportCollection, setOpenApiExportCollection] = useState<Collection | null>(null);
  const [openApiSubmitting, setOpenApiSubmitting] = useState(false);
  const [openApiError, setOpenApiError] = useState<string | null>(null);
  const [globalHttpSettings, setGlobalHttpSettings] = useState<GlobalHttpSettings>(DEFAULT_HTTP_SETTINGS);
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  const [cookieManagerOpen, setCookieManagerOpen] = useState(false);
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);
  const [globalSettingsError, setGlobalSettingsError] = useState<string | null>(null);

  useEffect(() => {
    void loadGlobalHttpSettings()
      .then(setGlobalHttpSettings)
      .catch((error) => console.error("Global HTTP settings could not be loaded", error));
  }, []);

  // ── Event Handlers ──

  const handleSendRequest = useRequestExecution({
    activeTab,
    environments,
    activeEnvironmentId,
    updateActiveTab,
    commitEnvironment: handleCommitEnvironment,
    setHistory,
  });

  const handleSelectHistory = (item: HistoryItem) => {
    let parsedParams: QueryParamItem[] = [];
    try {
      if (item.url.includes("?")) {
        const [, search] = item.url.split("?");
        const p = new URLSearchParams(search);
        p.forEach((val, key) => {
          parsedParams.push({ key, value: val });
        });
      }
    } catch {
      parsedParams = [];
    }

    updateActiveTab({
      method: item.method as import("../types/request").HttpMethod,
      url: item.url,
      body: item.body || "",
      queryParams: parsedParams,
      auth: item.auth || { type: "None" },
      settings: {},
      scripts: { ...EMPTY_REQUEST_SCRIPTS },
      scriptReports: [],
      selectedHistoryId: item.id,
      selectedSavedRequestId: null,
      isDirty: false,
    });
    activateRequestTab();
  };

  const handleSelectSavedRequest = (item: SavedRequest) => {
    updateActiveTab({
      title: item.name,
      method: item.request.method,
      url: item.request.url,
      body: item.request.body,
      bodyType: item.request.body_type,
      formFields: item.request.form_fields,
      binary: item.request.binary,
      queryParams: [],
      headers: Object.entries(item.request.headers).map(([key, value]) => ({ key, value })),
      auth: item.request.auth || { type: "None" },
      settings: item.request.settings || {},
      scripts: { ...EMPTY_REQUEST_SCRIPTS, ...(item.request.scripts || {}) },
      scriptReports: [],
      response: null,
      error: null,
      selectedHistoryId: null,
      selectedSavedRequestId: item.id,
      isDirty: false,
    });
    activateRequestTab();
  };

  const handleClearHistory = async () => {
    await clearHistoryData();
    updateActiveTab({ selectedHistoryId: null });
  };

  const handleSaveGlobalSettings = async (settings: GlobalHttpSettings) => {
    setGlobalSettingsSaving(true);
    setGlobalSettingsError(null);
    try {
      const changedKeys = (Object.keys(settings) as Array<keyof GlobalHttpSettings>)
        .filter((key) => settings[key] !== globalHttpSettings[key]) as Array<keyof RequestHttpSettings>;
      const saved = await saveGlobalHttpSettings(settings);
      setGlobalHttpSettings(saved);
      clearHttpSettingOverrides(changedKeys);
      for (const collection of collections) {
        for (const savedRequest of collection.requests) {
          if (!changedKeys.some((key) => savedRequest.request.settings?.[key] != null)) continue;
          const requestSettings = { ...(savedRequest.request.settings || {}) };
          changedKeys.forEach((key) => delete requestSettings[key]);
          await updateRequestInCollection(collection.id, savedRequest.id, savedRequest.name, {
            ...savedRequest.request,
            settings: requestSettings,
          });
        }
      }
      if (changedKeys.length > 0) {
        await refreshCollections();
      }
      setGlobalSettingsOpen(false);
    } catch (error) {
      setGlobalSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setGlobalSettingsSaving(false);
    }
  };

  const handleDeleteCollectionWithCleanup = async (id: string) => {
    await handleDeleteCollection(id);
    if (activeTab.selectedSavedRequestId) {
      updateActiveTab({ selectedSavedRequestId: null });
    }
  };

  const handleOpenEnvironment = async (
    environment: (typeof environments)[number]
  ) => {
    await handleSelectEnvironment(environment.id);
    openEnvironmentTab(environment.id);
  };

  const handleDeleteEnvironmentWithCleanup = async (id: string) => {
    await handleDeleteEnvironment(id);
    closeEnvironmentTab(id);
  };

  const handleSaveRequest = async () => {
    if (activeTab.selectedSavedRequestId) {
      const collectionId = getActiveCollection()?.id;
      if (collectionId) {
        try {
          const updated = await updateRequestInCollection(
            collectionId,
            activeTab.selectedSavedRequestId,
            requestDisplayName(activeTab),
            createRequestPayload(activeTab)
          );
          await refreshCollections();
          updateActiveTab({ title: updated.name, isDirty: false });
          return;
        } catch (err) {
          console.error("Failed to update saved request", err);
        }
      }
    }
    setSaveDialogOpen(true);
  };

  const handleConfirmSave = async (collectionId: string, newCollectionName: string | null) => {
    let targetId = collectionId;
    if (collectionId === "new" && newCollectionName) {
      const collection = await createCollection(newCollectionName);
      setCollections((current) => [...current, collection]);
      targetId = collection.id;
    }
    const saved = await saveRequestToCollection(
      targetId,
      requestDisplayName(activeTab),
      createRequestPayload(activeTab),
    );
    await refreshCollections();
    updateActiveTab({
      selectedSavedRequestId: saved.id,
      selectedHistoryId: null,
      isDirty: false,
    });
    setSidebarMode("collections");
    setSaveDialogOpen(false);
  };

  const environmentEditorEnvironment = environments.find(
    (environment) => environment.id === activeEnvironmentTabId
  );
  const {
    requestWorkspaceRef,
    responsePanelHeight,
    sidebarWidth,
    isResizingResponse,
    isResizingSidebar,
    handleResponseResizeStart,
    handleResponseResizeMove,
    handleResponseResizeEnd,
    handleSidebarResizeStart,
    handleSidebarResizeMove,
    handleSidebarResizeEnd,
  } = useResizablePanels(environmentEditorEnvironment?.id);

  const getActiveCollection = () => {
    if (!activeTab.selectedSavedRequestId) return null;
    // All requests (root + folder) live in c.requests flat array
    return (
      collections.find((c) =>
        c.requests.some((r) => r.id === activeTab.selectedSavedRequestId)
      ) || null
    );
  };

  const activeCollection = getActiveCollection();
  const activeRequestBreadcrumb = (() => {
    if (!activeCollection || !activeTab.selectedSavedRequestId) return [];

    const savedRequest = activeCollection.requests.find(
      (request) => request.id === activeTab.selectedSavedRequestId
    );
    if (!savedRequest) return [activeCollection.name];

    const foldersById = new Map(
      activeCollection.folders.map((folder) => [folder.id, folder])
    );
    const folderNames: string[] = [];
    const visitedFolderIds = new Set<string>();
    let folderId = savedRequest.folder_id ?? null;

    while (folderId && !visitedFolderIds.has(folderId)) {
      visitedFolderIds.add(folderId);
      const folder = foldersById.get(folderId);
      if (!folder) break;
      folderNames.unshift(folder.name);
      folderId = folder.parent_folder_id ?? null;
    }

    return [activeCollection.name, ...folderNames];
  })();

  const handleExportWorkspace = async (mode: ArchiveMode) => {
    try {
      await flushWorkspaceChanges();
      await exportWorkspaceArchive(mode, workspaceName);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleChooseOpenApi = async () => {
    setOpenApiError(null);
    setOpenApiImportDialogOpen(true);
  };

  const handleConfirmOpenApiImport = async (
    source: OpenApiSource,
    options: OpenApiImportOptions
  ) => {
    setOpenApiSubmitting(true);
    setOpenApiError(null);
    try {
      await flushWorkspaceChanges();
      const result = await importOpenApi(source, options);
      await Promise.all([refreshCollections(), refreshEnvironments()]);
      setSidebarMode("collections");
      setOpenApiImportDialogOpen(false);
      if (result.warnings.length > 0) {
        window.alert(`OpenAPI içe aktarıldı. ${result.warnings.length} özellik uyarıyla işlendi.`);
      }
    } catch (error) {
      setOpenApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenApiSubmitting(false);
    }
  };

  const handleConfirmOpenApiExport = async (options: OpenApiExportOptions) => {
    if (!openApiExportCollection) return;
    setOpenApiSubmitting(true);
    setOpenApiError(null);
    try {
      await flushWorkspaceChanges();
      const result = await exportCollectionOpenApi(openApiExportCollection, options);
      if (result.cancelled) return;
      setOpenApiExportCollection(null);
      const grouped = result.grouped_request_count > 0
        ? `\n${result.grouped_request_count} request aynı method/path altında örnek olarak gruplandı.`
        : "";
      const otherWarnings = result.warnings.filter(
        (warning) => warning.code !== "duplicate-operation-grouped"
      );
      const warningSummary = otherWarnings.length > 0
        ? `\n\nUyarılar:\n${otherWarnings
            .slice(0, 5)
            .map((warning) => `• ${warning.message}${warning.location ? ` (${warning.location})` : ""}`)
            .join("\n")}${otherWarnings.length > 5 ? `\n• +${otherWarnings.length - 5} uyarı` : ""}`
        : "";
      window.alert(
        `OpenAPI dışa aktarıldı: ${result.request_count} request, ${result.endpoint_count} operation.${grouped}${warningSummary}`
      );
    } catch (error) {
      setOpenApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenApiSubmitting(false);
    }
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-screen w-screen bg-[#202020] text-zinc-300 font-sans overflow-hidden select-none">
      {/* 1. Top Navigation Bar */}
      <TopNavbar
        workspaceName={workspaceName}
        onChangeWorkspace={onChangeWorkspace}
        onImportOpenApi={handleChooseOpenApi}
        onExportWorkspace={handleExportWorkspace}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSettings={() => { setGlobalSettingsError(null); setGlobalSettingsOpen(true); }}
      />

      {/* Main Workspace */}
      <div className="relative flex-1 flex min-h-0">
        {/* 2. Left Sidebar */}
        <ExplorerSidebar
          width={sidebarWidth}
          mode={sidebarMode}
          onSelectMode={setSidebarMode}
          collections={collections}
          onCreateCollection={handleCreateCollection}
          onRenameCollection={handleRenameCollection}
          onDeleteCollection={handleDeleteCollectionWithCleanup}
          onExportCollectionOpenApi={(collection) => {
            setOpenApiError(null);
            setOpenApiExportCollection(collection);
          }}
          onSelectSavedRequest={handleSelectSavedRequest}
          selectedSavedRequestId={activeTab.selectedSavedRequestId}
          history={history}
          onSelectHistory={handleSelectHistory}
          onClearHistory={() => void handleClearHistory()}
          selectedHistoryId={activeTab.selectedHistoryId}
          environments={environments}
          activeEnvironmentId={activeEnvironmentId}
          onOpenEnvironment={(environment) => {
            void handleOpenEnvironment(environment);
          }}
          onCreateEnvironment={handleCreateEnvironment}
          onUpdateEnvironment={handleUpdateEnvironment}
          onDeleteEnvironment={handleDeleteEnvironmentWithCleanup}
          searchQuery={searchQuery}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onDuplicateFolder={handleDuplicateFolder}
          onCreateRequest={handleCreateRequest}
          onRenameRequest={handleRenameRequest}
          onDuplicateRequest={handleDuplicateRequest}
          onDeleteRequest={handleDeleteRequest}
          onReorderItems={handleReorderItems}
        />

        <div
          role="separator"
          aria-label="Resize collections sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={Math.round(sidebarWidth)}
          onPointerDown={handleSidebarResizeStart}
          onPointerMove={handleSidebarResizeMove}
          onPointerUp={handleSidebarResizeEnd}
          onPointerCancel={handleSidebarResizeEnd}
          className="group absolute inset-y-0 z-30 w-2 -translate-x-1/2 cursor-col-resize touch-none"
          style={{ left: sidebarWidth }}
        >
          <div
            className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
              isResizingSidebar
                ? "bg-sky-500"
                : "bg-transparent group-hover:bg-sky-500/60"
            }`}
          />
        </div>

        {/* 3. Main API Client Panel */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#222222]">
          <RequestTabsBar
            tabs={tabsInfoList}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseTab}
            onReorderTab={handleReorderTab}
            onAddTab={handleAddTab}
            environments={environments}
            activeEnvironmentId={activeEnvironmentId}
            onSelectEnvironment={handleSelectEnvironment}
          />

          {/* Work Container */}
          <div className="flex-1 min-h-0 overflow-hidden bg-[#222222]">
            {environmentEditorEnvironment ? (
              <OverlayScrollArea containerClassName="h-full" axis="vertical" className="overflow-y-auto">
                <EnvironmentEditor
                  key={environmentEditorEnvironment.id}
                  environment={environmentEditorEnvironment}
                  saveError={environmentError}
                  onChange={handleUpdateEnvironment}
                />
              </OverlayScrollArea>
            ) : (
              <div
                ref={requestWorkspaceRef}
                className={`flex h-full min-h-0 w-full flex-col ${isResizingResponse ? "select-none" : ""}`}
              >
                <OverlayScrollArea
                  containerClassName="flex-1 min-h-0"
                  axis="vertical"
                  className="overflow-y-auto"
                  style={{ padding: "10px 36px 28px" }}
                >
                  <div className="w-full flex flex-col gap-2">
                  {/* URL Bar */}
                  <UrlActionBar
                    method={activeTab.method}
                    title={requestDisplayName(activeTab)}
                    breadcrumbItems={activeRequestBreadcrumb}
                    onChangeTitle={(t) => updateActiveTab({ title: t })}
                    onChangeMethod={(m) => updateActiveTab({ method: m as import("../types/request").HttpMethod })}
                    url={activeTab.url}
                    onChangeUrl={(u) => updateActiveTab({ url: u })}
                    onSend={handleSendRequest}
                    onSave={handleSaveRequest}
                    loading={activeTab.loading}
                  />

                  {/* Request Section Tabs */}
                  <RequestSectionTabs
                    activeTab={activeTab.activeSectionTab}
                    onOpenCookies={() => setCookieManagerOpen(true)}
                    onTabChange={(tab) =>
                      updateActiveTab({ activeSectionTab: tab as import("../types/request").RequestSectionTab })
                    }
                    headersCount={
                      activeTab.headers.filter((h) => h.key.trim()).length
                    }
                    />

                  {/* Request Section Content */}
                  <div className="min-h-[250px]">
                    {activeTab.activeSectionTab === "Params" && (
                      <QueryParamsTable
                        params={activeTab.queryParams}
                        onChange={(p) => updateActiveTab({ queryParams: p })}
                        auth={activeTab.auth}
                      />
                    )}
                    {activeTab.activeSectionTab === "Authorization" && (
                      <AuthEditor
                        auth={activeTab.auth}
                        onChange={(a) => updateActiveTab({ auth: a })}
                      />
                    )}
                    {activeTab.activeSectionTab === "Headers" && (
                      <HeadersEditor
                        headers={activeTab.headers}
                        onChange={(h) => updateActiveTab({ headers: h })}
                        bodyType={activeTab.bodyType}
                        auth={activeTab.auth}
                      />
                    )}
                    {activeTab.activeSectionTab === "Body" && (
                      <BodyEditor
                        body={activeTab.body}
                        bodyType={activeTab.bodyType}
                        formFields={activeTab.formFields}
                        binary={activeTab.binary}
                        onChangeBody={(body) => updateActiveTab({ body })}
                        onChangeBodyType={(bodyType) =>
                          updateActiveTab({ bodyType })
                        }
                        onChangeFormFields={(formFields) =>
                          updateActiveTab({ formFields })
                        }
                        onChangeBinary={(binary) =>
                          updateActiveTab({ binary })
                        }
                        method={activeTab.method}
                      />
                    )}
                    {activeTab.activeSectionTab === "Scripts" && (
                      <ScriptsEditor
                        value={activeTab.scripts}
                        onChange={(scripts) => updateActiveTab({ scripts })}
                      />
                    )}
                    {activeTab.activeSectionTab === "Settings" && (
                      <RequestHttpSettingsEditor
                        value={activeTab.settings}
                        globalSettings={globalHttpSettings}
                        platform={platformCapabilities.advancedHttpSettings ? "desktop" : "web"}
                        onChange={(settings) => updateActiveTab({ settings })}
                      />
                    )}
                  </div>

                  </div>
                </OverlayScrollArea>

                {/* Fixed, resizable Response Panel */}
                <div
                  className="relative flex min-h-0 shrink-0 overflow-visible"
                  style={{ height: responsePanelHeight }}
                >
                  <div
                    role="separator"
                    aria-label="Resize response panel"
                    aria-orientation="horizontal"
                    onPointerDown={handleResponseResizeStart}
                    onPointerMove={handleResponseResizeMove}
                    onPointerUp={handleResponseResizeEnd}
                    onPointerCancel={handleResponseResizeEnd}
                    className="absolute inset-x-0 -top-1.5 z-20 h-3 cursor-row-resize touch-none"
                  >
                    <div
                      className={`absolute inset-x-0 top-1.5 h-px transition-colors ${
                        isResizingResponse ? "bg-sky-500/80" : "bg-[#343434]"
                      }`}
                    />
                  </div>

                  <div className="flex h-full min-h-0 w-full overflow-hidden">
                    <ResponsePlaceholder
                      response={activeTab.response}
                      loading={activeTab.loading}
                      error={activeTab.error}
                      scriptReports={activeTab.scriptReports}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Save Request Dialog */}
      {saveDialogOpen && (
        <SaveRequestDialog
          collections={collections}
          onSave={handleConfirmSave}
          onClose={() => setSaveDialogOpen(false)}
        />
      )}

      {openApiImportDialogOpen && (
        <OpenApiImportDialog
          submitting={openApiSubmitting}
          error={openApiError}
          onInspect={inspectOpenApi}
          onResetError={() => setOpenApiError(null)}
          onClose={() => !openApiSubmitting && setOpenApiImportDialogOpen(false)}
          onConfirm={handleConfirmOpenApiImport}
        />
      )}

      {openApiExportCollection && (
        <OpenApiExportDialog
          collection={openApiExportCollection}
          submitting={openApiSubmitting}
          error={openApiError}
          onClose={() => !openApiSubmitting && setOpenApiExportCollection(null)}
          onConfirm={handleConfirmOpenApiExport}
        />
      )}

      {globalSettingsOpen && (
        <GlobalSettingsDialog
          settings={globalHttpSettings}
          platform={platformCapabilities.advancedHttpSettings ? "desktop" : "web"}
          saving={globalSettingsSaving}
          error={globalSettingsError}
          onClose={() => !globalSettingsSaving && setGlobalSettingsOpen(false)}
          onSave={handleSaveGlobalSettings}
        />
      )}

      {cookieManagerOpen && (
        <CookieManagerDialog
          requestUrl={activeTab.url}
          onClose={() => setCookieManagerOpen(false)}
        />
      )}
    </div>
  );
};
