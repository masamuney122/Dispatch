import type {
  PointerEventHandler,
  RefObject,
} from "react";
import type { GlobalHttpSettings } from "../../types/httpSettings";
import type { HttpMethod, RequestSectionTab } from "../../types/request";
import type { RequestTabState } from "../../types/tab";
import type { ConsoleEvent } from "../../types/console";
import { platformCapabilities } from "../../services/platformService";
import { requestDisplayName } from "../../utils/requestDraft";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import { ScriptsEditor } from "../scripts/ScriptsEditor";
import { RequestHttpSettingsEditor } from "../settings/HttpSettingsEditor";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { HeadersEditor } from "./HeadersEditor";
import { QueryParamsTable } from "./QueryParamsTable";
import { RequestSectionTabs } from "./RequestSectionTabs";
import { ResponsePlaceholder } from "./ResponsePlaceholder";
import { UrlActionBar } from "./UrlActionBar";

interface RequestWorkspacePanelProps {
  activeTab: RequestTabState;
  breadcrumbItems: string[];
  globalHttpSettings: GlobalHttpSettings;
  environmentVariables: Record<string, string>;
  requestWorkspaceRef: RefObject<HTMLDivElement | null>;
  responsePanelHeight: number;
  isResizingResponse: boolean;
  onUpdateTab: (updates: Partial<RequestTabState>) => void;
  onSend: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  consoleEvents: ConsoleEvent[];
  onClearConsole: () => void;
  onOpenCookies: () => void;
  onResponseResizeStart: PointerEventHandler<HTMLDivElement>;
  onResponseResizeMove: PointerEventHandler<HTMLDivElement>;
  onResponseResizeEnd: PointerEventHandler<HTMLDivElement>;
}

export function RequestWorkspacePanel({
  activeTab,
  breadcrumbItems,
  globalHttpSettings,
  environmentVariables,
  requestWorkspaceRef,
  responsePanelHeight,
  isResizingResponse,
  onUpdateTab,
  onSend,
  onSave,
  onSaveAs,
  consoleEvents,
  onClearConsole,
  onOpenCookies,
  onResponseResizeStart,
  onResponseResizeMove,
  onResponseResizeEnd,
}: RequestWorkspacePanelProps) {
  return (
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
        <div className="flex w-full flex-col gap-2">
          <UrlActionBar
            method={activeTab.method}
            title={requestDisplayName(activeTab)}
            breadcrumbItems={breadcrumbItems}
            onChangeTitle={(title) => onUpdateTab({ title })}
            onChangeMethod={(method) =>
              onUpdateTab({ method: method as HttpMethod })
            }
            url={activeTab.url}
            environmentVariables={environmentVariables}
            onChangeUrl={(url) => onUpdateTab({ url })}
            onSend={onSend}
            onSave={onSave}
            onSaveAs={onSaveAs}
            loading={activeTab.loading}
          />

          <RequestSectionTabs
            activeTab={activeTab.activeSectionTab}
            onOpenCookies={onOpenCookies}
            onTabChange={(activeSectionTab) =>
              onUpdateTab({
                activeSectionTab: activeSectionTab as RequestSectionTab,
              })
            }
            headersCount={
              activeTab.headers.filter((header) => header.key.trim()).length
            }
          />

          <div className="min-h-[250px]">
            {activeTab.activeSectionTab === "Params" && (
              <QueryParamsTable
                params={activeTab.queryParams}
                onChange={(queryParams) => onUpdateTab({ queryParams })}
                auth={activeTab.auth}
                environmentVariables={environmentVariables}
              />
            )}
            {activeTab.activeSectionTab === "Authorization" && (
              <AuthEditor
                auth={activeTab.auth}
                environmentVariables={environmentVariables}
                onChange={(auth) => onUpdateTab({ auth })}
              />
            )}
            {activeTab.activeSectionTab === "Headers" && (
              <HeadersEditor
                headers={activeTab.headers}
                onChange={(headers) => onUpdateTab({ headers })}
                bodyType={activeTab.bodyType}
                auth={activeTab.auth}
                environmentVariables={environmentVariables}
              />
            )}
            {activeTab.activeSectionTab === "Body" && (
              <BodyEditor
                body={activeTab.body}
                bodyType={activeTab.bodyType}
                formFields={activeTab.formFields}
                binary={activeTab.binary}
                onChangeBody={(body) => onUpdateTab({ body })}
                onChangeBodyType={(bodyType) => onUpdateTab({ bodyType })}
                onChangeFormFields={(formFields) =>
                  onUpdateTab({ formFields })
                }
                onChangeBinary={(binary) => onUpdateTab({ binary })}
                method={activeTab.method}
                environmentVariables={environmentVariables}
              />
            )}
            {activeTab.activeSectionTab === "Scripts" && (
              <ScriptsEditor
                value={activeTab.scripts}
                onChange={(scripts) => onUpdateTab({ scripts })}
              />
            )}
            {activeTab.activeSectionTab === "Settings" && (
              <RequestHttpSettingsEditor
                value={activeTab.settings}
                globalSettings={globalHttpSettings}
                platform={
                  platformCapabilities.advancedHttpSettings ? "desktop" : "web"
                }
                onChange={(settings) => onUpdateTab({ settings })}
              />
            )}
          </div>
        </div>
      </OverlayScrollArea>

      <div
        className="relative flex min-h-0 shrink-0 overflow-visible"
        style={{ height: responsePanelHeight }}
      >
        <div
          role="separator"
          aria-label="Resize response panel"
          aria-orientation="horizontal"
          onPointerDown={onResponseResizeStart}
          onPointerMove={onResponseResizeMove}
          onPointerUp={onResponseResizeEnd}
          onPointerCancel={onResponseResizeEnd}
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
            consoleEvents={consoleEvents}
            onClearConsole={onClearConsole}
          />
        </div>
      </div>
    </div>
  );
}
