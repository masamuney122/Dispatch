import { useMemo, useState } from "react";
import type { ApiResponse } from "../../types/response";
import type { ScriptExecutionReport } from "../../types/script";
import { ResponseBodyView, type ResponseBodyMode } from "../response/ResponseBodyView";
import { STATUS_TEXT, formatSize, getHeader, getResponseBodyKind, getStatusStyle, responseKindLabel } from "../../utils/responseUtils";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import type { ConsoleEvent, ConsoleEventLevel, ConsoleEventType } from "../../types/console";
import { ConsoleMultiSelect } from "../console/ConsoleMultiSelect";
import {
  RequestConsole,
  type ConsoleLevelFilter,
  type ConsoleTypeFilter,
} from "./RequestConsole";

interface ResponsePlaceholderProps {
  response: ApiResponse | null;
  loading: boolean;
  error: string | null;
  scriptReports: ScriptExecutionReport[];
  consoleEvents: ConsoleEvent[];
  onClearConsole: () => void;
}

type ResponseSection = "body" | "cookies" | "headers" | "tests" | "console";
const CONSOLE_TYPE_OPTIONS = [
  { value: "network", label: "Network" },
  { value: "script", label: "Script" },
  { value: "test", label: "Tests" },
  { value: "cookie", label: "Cookies" },
  { value: "error", label: "Errors" },
] as const satisfies ReadonlyArray<{ value: ConsoleEventType; label: string }>;
const CONSOLE_LEVEL_OPTIONS = [
  { value: "debug", label: "Debug" },
  { value: "log", label: "Log" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
] as const satisfies ReadonlyArray<{ value: ConsoleEventLevel; label: string }>;

const getErrorHelpText = (error: string) => {
  const normalized = error.toLowerCase();
  if (normalized.includes("refused") || normalized.includes("error sending request")) {
    return "Check that the target server is running and accepting connections at this address.";
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "The server took too long to respond. Check the connection or try again.";
  }
  if (normalized.includes("invalid url") || normalized.includes("builder error")) {
    return "Review the request URL and make sure it includes a valid protocol and host.";
  }
  if (normalized.includes("variable")) {
    return "Check the active environment and make sure every referenced variable has a value.";
  }
  return "Review the request details and try sending it again.";
};

export const ResponsePlaceholder: React.FC<ResponsePlaceholderProps> = ({ response, loading, error, scriptReports, consoleEvents, onClearConsole }) => {
  const [section, setSection] = useState<ResponseSection>("body");
  const [bodyMode, setBodyMode] = useState<ResponseBodyMode>("pretty");
  const [consoleType, setConsoleType] = useState<ConsoleTypeFilter>(() => CONSOLE_TYPE_OPTIONS.map((option) => option.value));
  const [consoleLevel, setConsoleLevel] = useState<ConsoleLevelFilter>(() => CONSOLE_LEVEL_OPTIONS.map((option) => option.value));
  const [showConsoleTimestamps, setShowConsoleTimestamps] = useState(true);

  const responseData = useMemo(() => {
    if (!response) return null;
    const contentType = getHeader(response.headers, "content-type");
    const kind = getResponseBodyKind(contentType, response.body, response.body_base64);
    return {
      contentType,
      kind,
      size: response.body_size ?? new TextEncoder().encode(response.body).byteLength,
      headers: Object.entries(response.headers).sort(([left], [right]) => left.localeCompare(right)),
    };
  }, [response]);

  const bodyModes = useMemo<Array<{ key: ResponseBodyMode; label: string }>>(() => {
    if (!responseData || responseData.kind === "empty") return [];
    if (["image", "audio", "video", "pdf", "binary"].includes(responseData.kind)) {
      return [{ key: "pretty", label: "Preview" }, { key: "raw", label: "Raw" }];
    }
    return [
      { key: "pretty", label: responseKindLabel(responseData.kind) },
      { key: "raw", label: "Raw" },
      { key: "preview", label: "Preview" },
    ];
  }, [responseData]);
  const effectiveBodyMode = bodyModes.some((item) => item.key === bodyMode)
    ? bodyMode
    : bodyModes[0]?.key || "pretty";

  const scriptTests = useMemo(
    () => scriptReports.flatMap((report) =>
      report.tests.map((test) => ({ ...test, phase: report.phase }))
    ),
    [scriptReports]
  );
  const scriptFailures = scriptReports.filter((report) => report.status === "failed");

  const sectionTabs: { key: ResponseSection; label: string; suffix?: React.ReactNode }[] = [
    { key: "body", label: "Body" },
    { key: "cookies", label: "Cookies", suffix: response?.cookies?.length ? <span className="ml-0.5 font-mono text-[10px] text-zinc-500">{response.cookies.length}</span> : undefined },
    { key: "headers", label: "Headers", suffix: <span className="ml-0.5 font-mono text-[10px] text-zinc-500">{responseData?.headers.length || 0}</span> },
    { key: "tests", label: "Tests", suffix: scriptTests.length ? <span className="ml-0.5 font-mono text-[10px] text-zinc-500">{scriptTests.length}</span> : undefined },
    { key: "console", label: "Console", suffix: consoleEvents.length ? <span className="ml-0.5 font-mono text-[10px] text-zinc-500">{consoleEvents.length}</span> : undefined },
  ];

  return (
    <div className="flex-1 flex flex-col font-sans select-none min-h-0 overflow-hidden bg-[#222222] border-x border-[#3a3a3a] rounded-none h-full text-[14.5px]">
      {/* 1. Top Section Bar */}
      <div
        className="flex items-center justify-between shrink-0 border-b border-[#2e2e2e] text-xs"
        style={{
          minHeight: "30px",
          padding: "4px 36px",
        }}
      >
        <div className="relative top-[3px] flex items-center gap-4">
          {sectionTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              className={`flex items-center justify-center gap-1.5 border-b-2 px-3 py-1.5 font-medium leading-none transition-colors ${section === tab.key ? "border-[#ff6c37] text-white font-bold" : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
            >
              {tab.label}{tab.suffix}
            </button>
          ))}

        </div>

        {(section === "console" || (response && responseData)) && (
          <div className="flex items-center gap-3 text-[13.5px] font-mono">
            {section === "console" && (
              <>
                <ConsoleMultiSelect
                  allLabel="All events"
                  groupLabel="Event types"
                  options={CONSOLE_TYPE_OPTIONS}
                  selected={consoleType}
                  onChange={setConsoleType}
                />
                <ConsoleMultiSelect
                  allLabel="All levels"
                  groupLabel="Log levels"
                  options={CONSOLE_LEVEL_OPTIONS}
                  selected={consoleLevel}
                  onChange={setConsoleLevel}
                />
                <label className="flex h-6 cursor-pointer items-center gap-1.5 font-sans text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={showConsoleTimestamps}
                    onChange={(event) => setShowConsoleTimestamps(event.target.checked)}
                    className="h-3.5 w-3.5 accent-[#ff6c37]"
                  />
                  Timestamp
                </label>
                <button type="button" disabled={consoleEvents.length === 0} onClick={onClearConsole} className="rounded-md bg-[#353535] px-4 py-1 font-sans text-xs font-semibold text-zinc-200 transition-colors hover:bg-[#414141] disabled:cursor-default disabled:opacity-40">Clear</button>
              </>
            )}
            {response && responseData && (
              <>
                <span className={`font-semibold ${getStatusStyle(response.status)}`}>
                  {response.status} {STATUS_TEXT[response.status] || "OK"}
                </span>
                <span className="text-[#969696]">
                  {response.response_time_ms} ms
                </span>
                <span className="text-[#969696]">
                  {formatSize(responseData.size)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && section !== "console" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-[3px] border-[#2a2a2a]" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-sky-500 animate-spin" />
          </div>
          <span className="text-[15px] font-medium text-[#969696]">Sending Request...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && !["tests", "console"].includes(section) && (
        <OverlayScrollArea
          containerClassName="flex-1 min-h-0"
          axis="vertical"
          className="overflow-y-auto"
        >
          <div
            className="flex min-h-full w-full items-center justify-center"
            style={{ padding: "36px 64px 44px" }}
          >
            <div
              className="flex w-full flex-col items-center text-center"
              style={{ maxWidth: "720px" }}
            >
              <h3
                className="text-[18px] font-semibold text-zinc-100"
              >
                Could not send request
              </h3>
              <p
                className="text-[13px] leading-5 text-zinc-500"
                style={{ marginTop: "8px", maxWidth: "560px" }}
              >
                {getErrorHelpText(error)}
              </p>

              <div
                className="w-full rounded-xl border border-[#4a3132] bg-[#292122] text-left"
                style={{
                  marginTop: "28px",
                  padding: "22px 24px 24px",
                  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.14)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="shrink-0 rounded-full bg-rose-400"
                    style={{ width: "6px", height: "6px" }}
                  />
                  <span className="text-[13px] font-semibold text-rose-300">
                    Request failed
                  </span>
                </div>

                <div
                  className="border border-[#3d2b2c] bg-[#201a1b]"
                  style={{
                    marginTop: "15px",
                    padding: "14px 16px",
                    borderRadius: "8px",
                  }}
                >
                  <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-rose-100/65 select-text">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </OverlayScrollArea>
      )}

      {/* Loaded Response Content */}
      {!loading && response && responseData && !["tests", "console"].includes(section) && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {section === "body" && (
            <>
              {/* 2. Sub-toolbar Row */}
              <div
                className="flex items-center gap-4 shrink-0"
                style={{
                  paddingLeft: "36px",
                  paddingRight: "36px",
                  paddingTop: "8px",
                  paddingBottom: "6px",
                }}
              >
                {bodyModes.map((mode) => (
                  <button
                    key={mode.key}
                    onClick={() => setBodyMode(mode.key)}
                    className={`flex items-center border-b-2 px-3 pb-0.5 pt-0 text-xs leading-none transition-colors ${effectiveBodyMode === mode.key
                      ? "border-[#ff6c37] text-white font-bold"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    {mode.key === "pretty" && responseData.kind === "json" && <span className="mr-1 font-mono text-xs">{`{}`}</span>}
                    <span>{mode.label}</span>
                  </button>
                ))}

              </div>

              {/* View Content */}
              <div
                className="flex flex-1 min-h-0 overflow-hidden"
                style={effectiveBodyMode !== "preview" ? { paddingLeft: "16px" } : undefined}
              >
                <ResponseBodyView
                  mode={effectiveBodyMode}
                  kind={responseData.kind}
                  body={response.body}
                  bodyBase64={response.body_base64}
                  contentType={responseData.contentType}
                  size={responseData.size}
                />
              </div>
            </>
          )}

          {section === "cookies" && (
            response?.cookie_handling === "browser" ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div><p className="text-sm font-semibold text-zinc-300">Browser managed cookies</p><p className="mt-2 max-w-lg text-xs leading-5 text-zinc-500">Tarayıcı Set-Cookie header'ını JavaScript'e göstermediği için response cookie listesi web sürümünde okunamaz.</p></div>
              </div>
            ) : response?.cookies?.length ? (
              <OverlayScrollArea containerClassName="flex-1 min-h-0" className="overflow-auto" style={{ padding: "20px 36px 24px" }}>
                <table className="w-full table-fixed overflow-hidden border-separate border-spacing-0 border border-[#343434] bg-[#202020] text-left font-mono text-xs">
                  <thead className="sticky top-0 z-10 bg-[#242424] text-[#969696]"><tr className="h-8"><th className="w-[18%] border-b border-[#343434] px-3 font-medium">Name</th><th className="w-[28%] border-b border-l border-[#343434] px-3 font-medium">Value</th><th className="w-[20%] border-b border-l border-[#343434] px-3 font-medium">Domain</th><th className="w-[12%] border-b border-l border-[#343434] px-3 font-medium">Path</th><th className="border-b border-l border-[#343434] px-3 font-medium">Attributes</th></tr></thead>
                  <tbody>{response.cookies.map((cookie) => <tr key={`${cookie.domain}:${cookie.path}:${cookie.name}`} className="h-8 text-zinc-300"><td className="truncate border-b border-[#2e2e2e] px-3">{cookie.name}</td><td className="truncate border-b border-l border-[#2e2e2e] px-3 text-zinc-400">{cookie.value}</td><td className="truncate border-b border-l border-[#2e2e2e] px-3 text-zinc-400">{cookie.domain}</td><td className="truncate border-b border-l border-[#2e2e2e] px-3 text-zinc-400">{cookie.path}</td><td className="truncate border-b border-l border-[#2e2e2e] px-3 text-[10px] text-zinc-500">{[cookie.secure && "Secure", cookie.http_only && "HttpOnly", cookie.same_site && `SameSite=${cookie.same_site}`, cookie.expires_at ? new Date(cookie.expires_at * 1000).toLocaleString() : "Session"].filter(Boolean).join(" · ")}</td></tr>)}</tbody>
                </table>
              </OverlayScrollArea>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center font-mono text-[14.5px] text-[#969696]">No cookies received in response.</div>
            )
          )}

          {section === "headers" && (
            <OverlayScrollArea
              containerClassName="flex-1 min-h-0"
              className="overflow-auto bg-transparent"
              style={{ padding: "20px 36px 24px" }}
            >
              <table className="w-full table-fixed overflow-hidden border-separate border-spacing-0 border border-[#343434] bg-[#202020] text-left font-mono text-xs">
                <thead className="sticky top-0 bg-[#242424] text-[#969696] z-10">
                  <tr className="h-8">
                    <th className="w-1/2 border-b border-[#343434] px-4 py-0 font-medium">Key</th>
                    <th className="border-b border-l border-[#343434] px-4 py-0 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {responseData.headers.map(([key, value]) => (
                    <tr key={key} className="h-8 hover:bg-[#252525]">
                      <td className="border-b border-[#343434] px-4 py-0 text-zinc-200">
                        <span className="block truncate" title={key}>{key}</span>
                      </td>
                      <td className="border-b border-l border-[#343434] px-4 py-0 select-text">
                        <span className="block truncate" title={value}>{value}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </OverlayScrollArea>
          )}


        </div>
      )}

      {!loading && section === "tests" && (
        <OverlayScrollArea containerClassName="flex-1 min-h-0" axis="vertical" className="overflow-y-auto">
          <div className="space-y-2 px-9 py-4 text-xs">
            {scriptFailures.map((report) => (
              <div key={`${report.phase}:${report.error}`} className="rounded-lg border border-rose-900/60 bg-rose-950/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-rose-300">{report.phase === "pre-request" ? "Pre-request" : "Post-response"} script failed</span>
                  <span className="font-mono text-[10px] text-zinc-600">{report.duration_ms} ms</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-rose-200/70 select-text">{report.error}</p>
              </div>
            ))}
            {scriptTests.map((test, index) => (
              <div key={`${test.phase}:${test.name}:${index}`} className="flex items-start gap-3 rounded-md border border-[#343434] bg-[#202020] px-3 py-2.5">
                <span className={`mt-0.5 font-bold ${test.passed ? "text-emerald-400" : "text-rose-400"}`}>{test.passed ? "✓" : "×"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-300">{test.name}</span>
                    <span className="rounded bg-[#2c2c2c] px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{test.phase}</span>
                  </div>
                  {test.error && <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-rose-300/70 select-text">{test.error}</p>}
                </div>
              </div>
            ))}
            {scriptFailures.length === 0 && scriptTests.length === 0 && (
              <div className="flex h-28 items-center justify-center text-zinc-500">No script tests were recorded.</div>
            )}
          </div>
        </OverlayScrollArea>
      )}

      {section === "console" && (
        <RequestConsole
          events={consoleEvents}
          typeFilter={consoleType}
          levelFilter={consoleLevel}
          showTimestamps={showConsoleTimestamps}
        />
      )}

      {/* No response yet */}
      {!loading && !error && !response && !["tests", "console"].includes(section) && (
        <OverlayScrollArea
          containerClassName="flex-1 min-h-0"
          axis="vertical"
          className="overflow-y-auto flex items-center justify-center text-[#969696] font-medium text-[15px]"
        >
          Send a request to view its response.
        </OverlayScrollArea>
      )}
    </div>
  );
};
