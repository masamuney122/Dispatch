import { useState } from "react";
import { TopNavbar } from "./layout/TopNavbar";
import { ExplorerSidebar } from "./layout/ExplorerSidebar";
import { RequestTabsBar } from "./layout/RequestTabsBar";
import { RequestWorkspacePanel } from "./layout/RequestWorkspacePanel";
import { SaveRequestDialog } from "./layout/SaveRequestDialog";
import { OpenApiImportDialog } from "./openapi/OpenApiImportDialog";
import { OpenApiExportDialog } from "./openapi/OpenApiExportDialog";
import { EnvironmentEditor } from "./environment/EnvironmentEditor";
import { OverlayScrollArea } from "./common/OverlayScrollArea";
import { GlobalSettingsDialog } from "./settings/GlobalSettingsDialog";
import { CookieManagerDialog } from "./cookies/CookieManagerDialog";
import { CollectionRunnerPanel } from "./runner/CollectionRunnerPanel";
import { CurlImportDialog } from "./import/CurlImportDialog";

import { useRequestTabs } from "../hooks/useRequestTabs";
import { useAppData } from "../hooks/useAppData";
import { useRequestExecution } from "../hooks/useRequestExecution";
import { useGlobalHttpSettings } from "../hooks/useGlobalHttpSettings";
import { useOpenApiWorkflow } from "../hooks/useOpenApiWorkflow";
import { useCollectionRunner } from "../hooks/useCollectionRunner";
import { useConsoleStore } from "../hooks/useConsoleStore";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useResizablePanels,
} from "../hooks/useResizablePanels";

import { saveRequestToCollection, createCollection, updateRequestInCollection } from "../services/collectionService";

import type { SavedRequest } from "../types/collection";
import type { HistoryItem } from "../types/history";
import type { ApiRequest } from "../types/request";
import type { ArchiveMode } from "../types/workspace";
import type { CurlImportResult } from "../utils/curlImport";
import { exportWorkspaceArchive } from "../services/workspaceService";
import { flushWorkspaceChanges } from "../services/workspaceLifecycle";
import { platformCapabilities } from "../services/platformService";
import {
  buildRequestUrl,
  createRequestPayload,
  historyTabUpdates,
  requestBreadcrumb,
  requestDisplayName,
  savedRequestTabUpdates,
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
    activeRunnerId,
    activeWorkspaceTab,
    setActiveTabId,
    updateActiveTab,
    openRequestTab,
    clearHttpSettingOverrides,
    handleAddTab,
    handleCloseTab,
    openEnvironmentTab,
    openRunnerTab,
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
    handleDeleteHistoryItem,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    refreshCollections,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleDuplicateFolder,
    handleMoveFolder,
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

  const consoleStore = useConsoleStore();
  const collectionRunner = useCollectionRunner({
    environments,
    activeEnvironmentId,
    commitEnvironment: handleCommitEnvironment,
    appendConsoleEvents: consoleStore.append,
  });

  // ── Local UI State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"collections" | "history">("collections");
  const [saveDialogMode, setSaveDialogMode] = useState<"save" | "saveAs" | null>(null);
  const [cookieManagerOpen, setCookieManagerOpen] = useState(false);
  const [curlImportOpen, setCurlImportOpen] = useState(false);

  const globalHttp = useGlobalHttpSettings({
    collections,
    clearTabOverrides: clearHttpSettingOverrides,
    refreshCollections,
  });
  const openApi = useOpenApiWorkflow({
    refreshCollections,
    refreshEnvironments,
    showCollections: () => setSidebarMode("collections"),
  });

  // ── Event Handlers ──

  const handleSendRequest = useRequestExecution({
    activeTab,
    environments,
    activeEnvironmentId,
    updateActiveTab,
    commitEnvironment: handleCommitEnvironment,
    setHistory,
    appendConsoleEvents: consoleStore.append,
  });

  const handleSelectHistory = (item: HistoryItem) => {
    updateActiveTab(historyTabUpdates(item));
    activateRequestTab();
  };

  const handleSelectSavedRequest = (item: SavedRequest) => {
    updateActiveTab(savedRequestTabUpdates(item));
    activateRequestTab();
  };

  const handleClearHistory = async () => {
    await clearHistoryData();
    updateActiveTab({ selectedHistoryId: null });
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

  const handleOpenCollectionRunner = (collection: (typeof collections)[number]) => {
    const runner = collectionRunner.openRunner(collection);
    openRunnerTab(runner.id);
  };

  const handleImportCurl = async (
    imported: CurlImportResult,
    collectionId: string,
  ) => {
    const request: ApiRequest = {
      method: imported.method,
      url: buildRequestUrl(imported.url, imported.queryParams),
      body: imported.body,
      body_type: imported.bodyType,
      form_fields: imported.formFields,
      headers: Object.fromEntries(
        imported.headers
          .filter((header) => header.enabled !== false && header.key.trim())
          .map((header) => [header.key.trim(), header.value]),
      ),
      auth: imported.auth,
      settings: {},
      scripts: { pre_request: "", post_response: "" },
    };
    const saved = await saveRequestToCollection(
      collectionId,
      imported.name,
      request,
    );
    await refreshCollections();
    openRequestTab({
      ...savedRequestTabUpdates(saved),
      activeSectionTab:
        imported.bodyType !== "none"
          ? "Body"
          : imported.headers.length > 0
            ? "Headers"
            : "Params",
    });
    setSidebarMode("collections");
    setCurlImportOpen(false);
  };

  const handleOpenFolderRunner = (
    collection: (typeof collections)[number],
    folderId: string,
    folderName: string,
  ) => {
    const runner = collectionRunner.openRunner(collection, {
      type: "folder",
      folderId,
      folderName,
    });
    openRunnerTab(runner.id);
  };

  const handleCloseWorkspaceTab = (id: string) => {
    const workspaceTab = tabsInfoList.find((tab) => tab.id === id);
    if (workspaceTab?.kind === "runner") {
      collectionRunner.closeRunner(workspaceTab.runnerId);
    }
    handleCloseTab(id);
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
          window.alert(err instanceof Error ? err.message : "Request could not be saved.");
          return;
        }
      }

      window.alert("The collection containing this request could not be found.");
      return;
    }
    setSaveDialogMode("save");
  };

  const handleSaveRequestAs = () => setSaveDialogMode("saveAs");

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
    setSaveDialogMode(null);
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

  const activeRequestBreadcrumb = requestBreadcrumb(
    collections,
    activeTab.selectedSavedRequestId,
  );

  const handleExportWorkspace = async (mode: ArchiveMode) => {
    try {
      await flushWorkspaceChanges();
      await exportWorkspaceArchive(mode, workspaceName);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  // ── Render ──

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#202020] font-sans text-zinc-300 select-none">
      {/* 1. Top Navigation Bar */}
      <TopNavbar
        workspaceName={workspaceName}
        onChangeWorkspace={onChangeWorkspace}
        onExportWorkspace={handleExportWorkspace}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSettings={globalHttp.openDialog}
      />

      {/* Main Workspace */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* 2. Left Sidebar */}
        <ExplorerSidebar
          width={sidebarWidth}
          mode={sidebarMode}
          onSelectMode={setSidebarMode}
          collections={collections}
          onImportCurl={() => setCurlImportOpen(true)}
          onImportOpenApi={openApi.openImport}
          onCreateCollection={handleCreateCollection}
          onRenameCollection={handleRenameCollection}
          onDeleteCollection={handleDeleteCollectionWithCleanup}
          onExportCollectionOpenApi={openApi.openExport}
          onRunCollection={handleOpenCollectionRunner}
          onRunFolder={handleOpenFolderRunner}
          onSelectSavedRequest={handleSelectSavedRequest}
          selectedSavedRequestId={activeTab.selectedSavedRequestId}
          history={history}
          onSelectHistory={handleSelectHistory}
          onClearHistory={() => void handleClearHistory()}
          onDeleteHistory={handleDeleteHistoryItem}
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
          onMoveFolder={handleMoveFolder}
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
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#222222]">
          <RequestTabsBar
            tabs={tabsInfoList}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseWorkspaceTab}
            onReorderTab={handleReorderTab}
            onAddTab={handleAddTab}
            runners={collectionRunner.runners}
            environments={environments}
            activeEnvironmentId={activeEnvironmentId}
            onSelectEnvironment={handleSelectEnvironment}
          />

          {/* Work Container */}
          <div className="flex-1 min-h-0 overflow-hidden bg-[#222222]">
            {activeWorkspaceTab?.kind === "runner" ? (
              (() => {
                const runner = collectionRunner.runners.find(
                  (item) => item.id === activeRunnerId,
                );
                return runner ? (
                  <CollectionRunnerPanel
                    runner={runner}
                    environments={environments}
                    onChangeConfiguration={(configuration) =>
                      collectionRunner.updateConfiguration(runner.id, configuration)
                    }
                    onStart={() => void collectionRunner.startRun(runner.id)}
                    onStop={() => collectionRunner.stopRun(runner.id)}
                    onNewRun={() => collectionRunner.newRun(runner.id)}
                    supportsCookiePersistence={platformCapabilities.desktop}
                    consoleEvents={consoleStore.events.filter(
                      (event) => event.source.runnerId === runner.id,
                    )}
                  />
                ) : null;
              })()
            ) : environmentEditorEnvironment ? (
              <OverlayScrollArea containerClassName="h-full" axis="vertical" className="overflow-y-auto">
                <EnvironmentEditor
                  key={environmentEditorEnvironment.id}
                  environment={environmentEditorEnvironment}
                  saveError={environmentError}
                  onChange={handleUpdateEnvironment}
                />
              </OverlayScrollArea>
            ) : (
              <RequestWorkspacePanel
                activeTab={activeTab}
                breadcrumbItems={activeRequestBreadcrumb}
                globalHttpSettings={globalHttp.settings}
                environmentVariables={
                  environments.find(
                    (environment) => environment.id === activeEnvironmentId,
                  )?.variables ?? {}
                }
                requestWorkspaceRef={requestWorkspaceRef}
                responsePanelHeight={responsePanelHeight}
                isResizingResponse={isResizingResponse}
                onUpdateTab={updateActiveTab}
                onSend={handleSendRequest}
                onSave={handleSaveRequest}
                onSaveAs={handleSaveRequestAs}
                consoleEvents={consoleStore.events}
                onClearConsole={consoleStore.clear}
                onOpenCookies={() => setCookieManagerOpen(true)}
                onResponseResizeStart={handleResponseResizeStart}
                onResponseResizeMove={handleResponseResizeMove}
                onResponseResizeEnd={handleResponseResizeEnd}
              />
            )}
          </div>
        </main>
      </div>

      {/* Save Request Dialog */}
      {saveDialogMode && (
        <SaveRequestDialog
          collections={collections}
          mode={saveDialogMode}
          onSave={handleConfirmSave}
          onClose={() => setSaveDialogMode(null)}
        />
      )}

      {openApi.importOpen && (
        <OpenApiImportDialog
          submitting={openApi.submitting}
          error={openApi.error}
          onInspect={openApi.inspect}
          onResetError={openApi.resetError}
          onClose={openApi.closeImport}
          onConfirm={openApi.confirmImport}
        />
      )}

      {curlImportOpen && (
        <CurlImportDialog
          collections={collections}
          onClose={() => setCurlImportOpen(false)}
          onImport={handleImportCurl}
        />
      )}

      {openApi.exportCollection && (
        <OpenApiExportDialog
          collection={openApi.exportCollection}
          submitting={openApi.submitting}
          error={openApi.error}
          onClose={openApi.closeExport}
          onConfirm={openApi.confirmExport}
        />
      )}

      {globalHttp.open && (
        <GlobalSettingsDialog
          settings={globalHttp.settings}
          platform={platformCapabilities.advancedHttpSettings ? "desktop" : "web"}
          saving={globalHttp.saving}
          error={globalHttp.error}
          onClose={globalHttp.closeDialog}
          onSave={globalHttp.save}
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
