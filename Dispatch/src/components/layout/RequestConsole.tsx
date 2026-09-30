import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getMethodHexColor } from "../../constants/httpConstants";
import type {
  ConsoleEvent,
  ConsoleEventLevel,
  ConsoleEventType,
  NetworkConsoleEvent,
  ScriptConsoleEvent,
} from "../../types/console";
import type { ApiRequest } from "../../types/request";
import type { ApiResponse } from "../../types/response";
import { getStatusStyle, prettyJson } from "../../utils/responseUtils";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import { StructuredConsoleValue } from "../console/StructuredConsoleValue";

export type ConsoleTypeFilter = readonly ConsoleEventType[];
export type ConsoleLevelFilter = readonly ConsoleEventLevel[];

interface RequestConsoleProps {
  events: ConsoleEvent[];
  typeFilter?: ConsoleTypeFilter;
  levelFilter?: ConsoleLevelFilter;
  showTimestamps?: boolean;
}

const timeLabel = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const phaseLabel = (phase: ConsoleEvent["phase"]) => {
  if (phase === "pre-request") return "PRE";
  if (phase === "post-response") return "POST";
  return null;
};

const PropertyRows: React.FC<{
  entries: Array<[string, string]>;
  emptyText: string;
}> = ({ entries, emptyText }) =>
  entries.length > 0 ? (
    <div className="pl-5">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-px">
          <span className="truncate text-zinc-300">{key}:</span>
          <span className="break-all text-[#8fb3e8]">{JSON.stringify(value)}</span>
        </div>
      ))}
    </div>
  ) : (
    <p className="pl-5 text-zinc-600">{emptyText}</p>
  );

const DetailSection: React.FC<{
  title: string;
  children: React.ReactNode;
  open?: boolean;
}> = ({ title, children, open = true }) => (
  <details open={open} className="group/section">
    <summary className="cursor-pointer list-none py-px text-zinc-500 marker:hidden">
      <span className="mr-2 inline-block text-[8px] transition-transform group-open/section:rotate-90">▶</span>
      {title}
    </summary>
    {children}
  </details>
);

function networkEntries(request: ApiRequest, response: ApiResponse | null) {
  try {
    const url = new URL(request.url);
    return [
      ["transport", response?.network?.transport === "browser" ? "Browser fetch" : "Desktop HTTP client"],
      ["protocol", url.protocol.replace(":", "").toUpperCase()],
      ["host", url.hostname],
      ["port", url.port || (url.protocol === "https:" ? "443" : "80")],
      ["path", `${url.pathname}${url.search}`],
      ["HTTP version", response?.network?.http_version || "Browser managed / unavailable"],
      ["remote address", response?.network?.remote_address || "Unavailable"],
      ["TLS", url.protocol === "https:" ? "Enabled" : "Not used"],
    ] satisfies Array<[string, string]>;
  } catch {
    return [["URL", request.url]] satisfies Array<[string, string]>;
  }
}

function requestBody(request: ApiRequest): string | null {
  if (request.body_type === "form-data") {
    return JSON.stringify(
      Object.fromEntries(request.form_fields.map(({ key, value }) => [key, value])),
      null,
      2,
    );
  }
  if (request.body_type === "binary") {
    return request.binary
      ? `${request.binary.name} (${request.binary.mime_type || "application/octet-stream"})`
      : "Binary body";
  }
  return request.body ? prettyJson(request.body).value : null;
}

const NetworkDetails: React.FC<{ event: NetworkConsoleEvent }> = ({ event }) => {
  const [raw, setRaw] = useState(false);
  const { request, response, requestStages, capabilities } = event.payload;
  const requestHeaders = Object.entries(request.headers).sort(([left], [right]) => left.localeCompare(right));
  const responseHeaders = Object.entries(response?.headers || {}).sort(([left], [right]) => left.localeCompare(right));
  const body = requestBody(request);
  const responseBody = response?.body
    ? prettyJson(response.body).value
    : response?.body_base64
      ? `[Binary response: ${response.body_size ?? 0} bytes]`
      : "[Empty response body]";

  if (raw) {
    return (
      <div className="relative border-b border-[#303030] bg-[#202020] px-9 py-2">
        <button type="button" onClick={() => setRaw(false)} className="absolute right-7 top-2 text-[11px] text-sky-400 hover:text-sky-300">Show structured log</button>
        <pre className="overflow-auto whitespace-pre-wrap break-words pr-36 font-mono text-[11px] leading-4 text-zinc-300">{JSON.stringify(event.payload, null, 2)}</pre>
      </div>
    );
  }

  const requestChanged = JSON.stringify(requestStages.input) !== JSON.stringify(request);
  return (
    <div className="relative border-b border-[#303030] bg-[#202020] px-9 py-1.5 font-mono text-[11px] leading-4">
      <button type="button" onClick={() => setRaw(true)} className="absolute right-7 top-2 text-[11px] text-sky-400 hover:text-sky-300">Show raw log</button>
      <DetailSection title="Network"><PropertyRows entries={networkEntries(request, response)} emptyText="No network metadata." /></DetailSection>
      <DetailSection title="Request Headers"><PropertyRows entries={requestHeaders} emptyText="No request headers." /></DetailSection>
      {body && <DetailSection title="Request Body"><pre className="my-0.5 ml-5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-[#272727] px-3 py-1.5 text-zinc-300">{body}</pre></DetailSection>}
      {requestChanged && (
        <DetailSection title="Request mutations" open={false}>
          <pre className="my-0.5 ml-5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-[#272727] px-3 py-1.5 text-zinc-400">{JSON.stringify(requestStages, null, 2)}</pre>
        </DetailSection>
      )}
      <DetailSection title="Response Headers"><PropertyRows entries={responseHeaders} emptyText="No response headers." /></DetailSection>
      <DetailSection title="Response Body"><pre className="my-0.5 ml-5 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-[#272727] px-3 py-1.5 text-zinc-300">{responseBody}</pre></DetailSection>
      {(!capabilities.exactRequestHeaders || !capabilities.redirectChain) && (
        <p className="ml-5 mt-1 text-[10px] text-zinc-600">Some transport-level headers or redirect details are unavailable on this platform.</p>
      )}
    </div>
  );
};

const ScriptEventRow: React.FC<{ event: ScriptConsoleEvent; showTimestamp: boolean }> = ({ event, showTimestamp }) => {
  if (event.payload.operation === "clear") return null;
  const tone = event.level === "error" ? "text-rose-300" : event.level === "warning" ? "text-amber-300" : event.level === "info" ? "text-sky-300" : "text-zinc-200";
  const phase = phaseLabel(event.phase);
  return (
    <div className={`grid min-h-8 items-start border-b border-[#303030] px-9 py-1.5 font-mono text-xs leading-5 ${showTimestamp ? "grid-cols-[70px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]"}`}>
      {showTimestamp && <span className="pt-px text-[10px] text-zinc-600">{timeLabel(event.timestamp)}</span>}
      <div className={`min-w-0 ${tone}`}>
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          {phase && <span className="mt-0.5 rounded bg-[#303030] px-1.5 text-[9px] leading-4 text-zinc-500">{phase}</span>}
          {event.payload.values.length > 0
            ? event.payload.values.map((value, index) => <StructuredConsoleValue key={index} value={value} />)
            : <span className="whitespace-pre-wrap break-words">{event.payload.message}</span>}
        </div>
      </div>
    </div>
  );
};

const NetworkEventRow: React.FC<{ event: NetworkConsoleEvent; showTimestamp: boolean }> = ({ event, showTimestamp }) => {
  const [expanded, setExpanded] = useState(false);
  const { request, response } = event.payload;
  return (
    <>
      <button type="button" onClick={() => setExpanded((current) => !current)} className={`grid min-h-8 w-full items-center border-b border-[#303030] px-9 py-1.5 text-left font-mono text-xs leading-5 hover:bg-[#262626] ${showTimestamp ? "grid-cols-[70px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]"}`}>
        {showTimestamp && <span className="text-[10px] text-zinc-600">{timeLabel(event.timestamp)}</span>}
        <span className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 text-[8px] text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
          <span className="shrink-0 font-semibold" style={{ color: getMethodHexColor(request.method) }}>{request.method}</span>
          <span className="min-w-0 flex-1 truncate text-zinc-200" title={request.url}>{request.url}</span>
          {response ? (
            <>
              <span className={`shrink-0 ${getStatusStyle(response.status)}`}>{response.status}</span>
              <span className="shrink-0 text-zinc-700">|</span>
              <span className="shrink-0 text-emerald-300">{response.response_time_ms} ms</span>
              <span className="shrink-0 text-zinc-600">{response.body_size == null ? "" : `${response.body_size} B`}</span>
            </>
          ) : <span className="shrink-0 text-rose-300">Error</span>}
        </span>
      </button>
      {expanded && <NetworkDetails event={event} />}
    </>
  );
};

const SimpleEventRow: React.FC<{ event: Exclude<ConsoleEvent, NetworkConsoleEvent | ScriptConsoleEvent>; showTimestamp: boolean }> = ({ event, showTimestamp }) => {
  const tone = event.type === "error" || (event.type === "test" && event.payload.status === "failed") ? "text-rose-300" : event.type === "test" && event.payload.status === "passed" ? "text-emerald-300" : "text-zinc-300";
  const message = event.type === "test"
    ? `${event.payload.status === "passed" ? "✓" : event.payload.status === "skipped" ? "–" : "×"} ${event.payload.name}${event.payload.error ? ` — ${event.payload.error}` : ""}`
    : event.type === "cookie"
      ? event.payload.action === "browser-managed"
        ? event.payload.reason || "Browser managed cookies"
        : event.payload.action === "request-attached"
          ? `Cookie attached: ${event.payload.name} — ${event.payload.reason || "value redacted"}`
          : `Cookie updated: ${event.payload.name} (${event.payload.domain}${event.payload.path || "/"})`
      : event.payload.message;
  return (
    <div className={`grid min-h-8 items-start border-b border-[#303030] px-9 py-1.5 font-mono text-xs leading-5 ${showTimestamp ? "grid-cols-[70px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]"}`}>
      {showTimestamp && <span className="pt-px text-[10px] text-zinc-600">{timeLabel(event.timestamp)}</span>}
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 rounded bg-[#303030] px-1.5 text-[9px] uppercase leading-4 text-zinc-500">{event.type}</span>
        <span className={`min-w-0 whitespace-pre-wrap break-words ${tone}`}>
          {message}
          {event.type === "error" && event.payload.stack && (
            <details className="mt-1 text-[10px] text-zinc-500">
              <summary className="cursor-pointer">Stack trace</summary>
              <pre className="mt-1 whitespace-pre-wrap break-words">{event.payload.stack}</pre>
            </details>
          )}
        </span>
      </div>
    </div>
  );
};

export const RequestConsole: React.FC<RequestConsoleProps> = ({ events, typeFilter, levelFilter, showTimestamps = true }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const pinnedToBottomRef = useRef(true);
  const visibleEvents = useMemo(
    () => events.filter((event) =>
      (!typeFilter || typeFilter.includes(event.type)) &&
      (!levelFilter || levelFilter.includes(event.level))),
    [events, levelFilter, typeFilter],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (pinnedToBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    } else {
      const maximumScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = Math.min(scrollTopRef.current, maximumScrollTop);
    }
    scrollTopRef.current = viewport.scrollTop;
  }, [visibleEvents]);

  return (
    <OverlayScrollArea
      ref={viewportRef}
      containerClassName="flex-1 min-h-0"
      axis="vertical"
      className="overflow-y-auto select-text"
      onScroll={(event) => {
        const viewport = event.currentTarget;
        scrollTopRef.current = viewport.scrollTop;
        pinnedToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 8;
      }}
    >
      {visibleEvents.map((event) => event.type === "network"
        ? <NetworkEventRow key={event.id} event={event} showTimestamp={showTimestamps} />
        : event.type === "script"
          ? <ScriptEventRow key={event.id} event={event} showTimestamp={showTimestamps} />
          : <SimpleEventRow key={event.id} event={event} showTimestamp={showTimestamps} />)}
      {visibleEvents.length === 0 && (
        <div className="flex h-28 items-center justify-center font-sans text-xs text-zinc-500">{events.length === 0 ? "No console output." : "No console events match the current filters."}</div>
      )}
    </OverlayScrollArea>
  );
};
