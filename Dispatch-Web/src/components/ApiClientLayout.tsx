import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { BottomStatusBar } from "./layout/BottomStatusBar";
import { SaveRequestDialog } from "./layout/SaveRequestDialog";
import { OpenApiImportDialog } from "./openapi/OpenApiImportDialog";
import { OpenApiExportDialog } from "./openapi/OpenApiExportDialog";
import { EnvironmentEditor } from "./environment/EnvironmentEditor";
import { OverlayScrollArea } from "./common/OverlayScrollArea";
import { RequestHttpSettingsEditor } from "./settings/HttpSettingsEditor";
import { GlobalSettingsDialog } from "./settings/GlobalSettingsDialog";

import { useRequestTabs } from "../hooks/useRequestTabs";
import { useAppData } from "../hooks/useAppData";

import { sendRequest } from "../services/api";
import { saveHistory, loadHistory } from "../services/historyService";
import { saveRequestToCollection, createCollection, updateRequestInCollection } from "../services/collectionService";
import {
  resolveRequestVariables,
  VariableResolutionError,
} from "../services/environmentVariableResolver";

import type { ApiRequest } from "../types/request";
import type { HistoryItem } from "../types/history";
import type { QueryParamItem } from "../types/tab";
import type { Collection, SavedRequest } from "../types/collection";
import type { ArchiveMode } from "../types/workspace";
import type { OpenApiExportOptions, OpenApiImportOptions, OpenApiSource } from "../types/openapi";
import { flushWorkspaceChanges } from "../services/workspaceLifecycle";
import {
  downloadOpenApi,
  exportCollectionOpenApi,
  importOpenApi,
  inspectOpenApi,
} from "../services/openApiService";
import { loadGlobalHttpSettings, saveGlobalHttpSettings } from "../services/httpSettingsService";
import { DEFAULT_HTTP_SETTINGS, type GlobalHttpSettings, type RequestHttpSettings } from "../types/httpSettings";

const RESPONSE_PANEL_DEFAULT_HEIGHT = 320;
const RESPONSE_PANEL_MIN_HEIGHT = 220;
const REQUEST_PANEL_MIN_HEIGHT = 240;
const RESPONSE_PANEL_MAX_RATIO = 0.72;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 560;
const MAIN_PANEL_MIN_WIDTH = 560;

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
    refreshEnvironments,
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
    handleUpdateEnvironment,
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
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);
  const [globalSettingsError, setGlobalSettingsError] = useState<string | null>(null);
  const [responsePanelHeight, setResponsePanelHeight] = useState(RESPONSE_PANEL_DEFAULT_HEIGHT);
  const [isResizingResponse, setIsResizingResponse] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const requestWorkspaceRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const sidebarResizeSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const previousBodyStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null);
  const previousSidebarBodyStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null);

  useEffect(() => {
    void loadGlobalHttpSettings()
      .then(setGlobalHttpSettings)
      .catch((error) => console.error("Global HTTP settings could not be loaded", error));
  }, []);

  // ── Derived Helpers ──

  const buildFinalUrl = (targetUrl: string, params: QueryParamItem[]) => {
    const validParams = params.filter((q) => q.key.trim());
    if (validParams.length === 0) return targetUrl;
    try {
      const [base, existingSearch] = targetUrl.split("?");
      const searchParams = new URLSearchParams(existingSearch || "");
      validParams.forEach((q) => {
        searchParams.set(q.key.trim(), q.value);
      });
      return `${base}?${searchParams.toString()}`;
    } catch {
      return targetUrl;
    }
  };

  const createRequestTemplate = () => {
    const headersRecord: Record<string, string> = {};
    activeTab.headers.forEach((h) => {
      // Treat undefined as enabled for backwards compatibility
      const isEnabled = h.enabled !== false;
      const key = (h.key || "").trim();
      if (isEnabled && key) {
        headersRecord[key] = h.value || "";
      }
    });

    return {
      request: {
        method: activeTab.method,
        url: activeTab.url,
        body: activeTab.body,
        body_type: activeTab.bodyType,
        form_fields: activeTab.formFields,
        binary: activeTab.binary,
        headers: headersRecord,
        auth: activeTab.auth,
        settings: activeTab.settings,
      } satisfies ApiRequest,
      queryParams: activeTab.queryParams.map(({ key, value }) => ({
        key,
        value,
      })),
    };
  };

  const createRequestPayload = (): ApiRequest => {
    const template = createRequestTemplate();
    return {
      ...template.request,
      url: buildFinalUrl(template.request.url, template.queryParams),
    };
  };

  const getRequestName = () => {
    if (activeTab.title && activeTab.title !== "Untitled Request") return activeTab.title;
    try {
      const parsed = new URL(activeTab.url);
      return `${activeTab.method} ${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    } catch {
      return activeTab.title || "Untitled Request";
    }
  };

  // ── Event Handlers ──

  const handleSendRequest = async () => {
    updateActiveTab({ loading: true, error: null, selectedSavedRequestId: null });
    const originalRequest = createRequestPayload();

    try {
      const activeEnvironment = environments.find(
        (environment) => environment.id === activeEnvironmentId
      );
      const resolvedTemplate = resolveRequestVariables(
        createRequestTemplate(),
        activeEnvironment?.variables || {}
      );
      const resolvedRequest: ApiRequest = {
        ...resolvedTemplate.request,
        url: buildFinalUrl(
          resolvedTemplate.request.url,
          resolvedTemplate.queryParams
        ),
      };
      const res = await sendRequest(resolvedRequest);
      updateActiveTab({ response: res, loading: false });

      const newItem: HistoryItem = {
        id: crypto.randomUUID(),
        method: activeTab.method,
        url: originalRequest.url,
        body: originalRequest.body,
        status: res.status,
        response_time_ms: res.response_time_ms,
        timestamp: new Date().toISOString(),
        error: null,
        auth: originalRequest.auth,
      };
      await saveHistory(newItem);
      const updatedHist = await loadHistory();
      setHistory(updatedHist || []);
      updateActiveTab({ selectedHistoryId: newItem.id });
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);

      updateActiveTab({ error: errMsg, response: null, loading: false });

      if (err instanceof VariableResolutionError) return;

      const errItem: HistoryItem = {
        id: crypto.randomUUID(),
        method: activeTab.method,
        url: originalRequest.url,
        body: originalRequest.body,
        status: null,
        response_time_ms: null,
        timestamp: new Date().toISOString(),
        error: errMsg,
        auth: originalRequest.auth,
      };
      await saveHistory(errItem);
      const updatedHist = await loadHistory();
      setHistory(updatedHist || []);
      updateActiveTab({ selectedHistoryId: errItem.id });
    }
  };

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
            getRequestName(),
            createRequestPayload()
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
    const saved = await saveRequestToCollection(targetId, getRequestName(), createRequestPayload());
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

  const getResponsePanelBounds = () => {
    const workspaceHeight = requestWorkspaceRef.current?.clientHeight ?? 0;
    const maximumHeight = Math.max(
      RESPONSE_PANEL_MIN_HEIGHT,
      Math.min(
        Math.floor(workspaceHeight * RESPONSE_PANEL_MAX_RATIO),
        workspaceHeight - REQUEST_PANEL_MIN_HEIGHT
      )
    );

    return { minimumHeight: RESPONSE_PANEL_MIN_HEIGHT, maximumHeight };
  };

  const restoreResizeBodyStyles = () => {
    const previousStyles = previousBodyStyleRef.current;
    if (!previousStyles) return;
    document.body.style.cursor = previousStyles.cursor;
    document.body.style.userSelect = previousStyles.userSelect;
    previousBodyStyleRef.current = null;
  };

  const handleResponseResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: responsePanelHeight,
    };
    previousBodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    setIsResizingResponse(true);
  };

  const handleResponseResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    event.preventDefault();
    const requestedHeight = session.startHeight + session.startY - event.clientY;
    const { minimumHeight, maximumHeight } = getResponsePanelBounds();
    setResponsePanelHeight(
      Math.min(maximumHeight, Math.max(minimumHeight, requestedHeight))
    );
  };

  const handleResponseResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = null;
    setIsResizingResponse(false);
    restoreResizeBodyStyles();
  };

  const restoreSidebarResizeBodyStyles = () => {
    const previousStyles = previousSidebarBodyStyleRef.current;
    if (!previousStyles) return;
    document.body.style.cursor = previousStyles.cursor;
    document.body.style.userSelect = previousStyles.userSelect;
    previousSidebarBodyStyleRef.current = null;
  };

  const getSidebarMaximumWidth = () =>
    Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - MAIN_PANEL_MIN_WIDTH - 12)
    );

  const handleSidebarResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarResizeSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    previousSidebarBodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizingSidebar(true);
  };

  const handleSidebarResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sidebarResizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    event.preventDefault();
    const requestedWidth = session.startWidth + event.clientX - session.startX;
    setSidebarWidth(
      Math.min(getSidebarMaximumWidth(), Math.max(SIDEBAR_MIN_WIDTH, requestedWidth))
    );
  };

  const handleSidebarResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sidebarResizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    sidebarResizeSessionRef.current = null;
    setIsResizingSidebar(false);
    restoreSidebarResizeBodyStyles();
  };

  useEffect(() => {
    const workspace = requestWorkspaceRef.current;
    if (!workspace || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      const workspaceHeight = entry.contentRect.height;
      const maximumHeight = Math.max(
        RESPONSE_PANEL_MIN_HEIGHT,
        Math.min(
          Math.floor(workspaceHeight * RESPONSE_PANEL_MAX_RATIO),
          workspaceHeight - REQUEST_PANEL_MIN_HEIGHT
        )
      );
      setResponsePanelHeight((currentHeight) => Math.min(currentHeight, maximumHeight));
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [environmentEditorEnvironment?.id]);

  useEffect(
    () => () => {
      const previousStyles = previousBodyStyleRef.current;
      if (previousStyles) {
        document.body.style.cursor = previousStyles.cursor;
        document.body.style.userSelect = previousStyles.userSelect;
      }

      const previousSidebarStyles = previousSidebarBodyStyleRef.current;
      if (previousSidebarStyles) {
        document.body.style.cursor = previousSidebarStyles.cursor;
        document.body.style.userSelect = previousSidebarStyles.userSelect;
      }
    },
    []
  );

  useEffect(() => {
    const handleWindowResize = () => {
      setSidebarWidth((currentWidth) =>
        Math.min(currentWidth, getSidebarMaximumWidth())
      );
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const getActiveCollection = () => {
    if (!activeTab.selectedSavedRequestId) return null;
    // All requests (root + folder) live in c.requests flat array
    return (
      collections.find((c) =>
        c.requests.some((r) => r.id === activeTab.selectedSavedRequestId)
      ) || null
    );
  };

  const activeCollectionName = getActiveCollection()?.name;

  const handleExportWorkspace = async (mode: ArchiveMode) => {
    await flushWorkspaceChanges();
    window.alert(
      `${mode === "safe_share" ? "Safe Share" : "Backup"} dışa aktarma web sürümünün sonraki fazında etkinleştirilecek.`
    );
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
    } catch (importError) {
      setOpenApiError(importError instanceof Error ? importError.message : String(importError));
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
      downloadOpenApi(result, openApiExportCollection.name);
      setOpenApiExportCollection(null);
      if (result.warnings.length > 0) {
        window.alert(`OpenAPI dışa aktarıldı. ${result.warnings.length} request uyarıyla işlendi.`);
      }
    } catch (exportError) {
      setOpenApiError(exportError instanceof Error ? exportError.message : String(exportError));
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
        onClearHistory={handleClearHistory}
        historyCount={history.length}
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
                  style={{ padding: "16px 48px 32px" }}
                >
                  <div className="w-full flex flex-col gap-3">
                  {/* URL Bar */}
                  <UrlActionBar
                    method={activeTab.method}
                    title={getRequestName()}
                    collectionName={activeCollectionName}
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
                    {activeTab.activeSectionTab === "Settings" && (
                      <RequestHttpSettingsEditor
                        value={activeTab.settings}
                        globalSettings={globalHttpSettings}
                        platform="web"
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
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <BottomStatusBar />

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
          platform="web"
          saving={globalSettingsSaving}
          error={globalSettingsError}
          onClose={() => !globalSettingsSaving && setGlobalSettingsOpen(false)}
          onSave={handleSaveGlobalSettings}
        />
      )}
    </div>
  );
};
