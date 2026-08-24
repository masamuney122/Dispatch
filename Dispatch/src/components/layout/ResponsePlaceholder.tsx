import { useMemo, useState } from "react";
import type { ApiResponse } from "../../types/response";
import { ResponseBodyView, type ResponseBodyMode } from "../response/ResponseBodyView";
import { STATUS_TEXT, formatSize, getHeader, getResponseBodyKind, getStatusStyle, responseKindLabel } from "../../utils/responseUtils";
import { OverlayScrollArea } from "../common/OverlayScrollArea";

interface ResponsePlaceholderProps {
  response: ApiResponse | null;
  loading: boolean;
  error: string | null;
}

type ResponseSection = "body" | "cookies" | "headers";
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

export const ResponsePlaceholder: React.FC<ResponsePlaceholderProps> = ({ response, loading, error }) => {
  const [section, setSection] = useState<ResponseSection>("body");
  const [bodyMode, setBodyMode] = useState<ResponseBodyMode>("pretty");

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

  const sectionTabs: { key: ResponseSection; label: string; suffix?: React.ReactNode }[] = [
    { key: "body", label: "Body" },
    { key: "cookies", label: "Cookies" },
    { key: "headers", label: "Headers", suffix: <span className="ml-0.5 font-mono text-[10px] text-zinc-500">{responseData?.headers.length || 0}</span> },

  ];

  return (
    <div className="flex-1 flex flex-col font-sans select-none min-h-0 overflow-hidden bg-[#222222] border-x border-[#3a3a3a] rounded-none h-full text-[14.5px]">
      {/* 1. Top Section Bar */}
      <div
        className="flex items-center justify-between shrink-0 border-b border-[#2e2e2e] text-xs"
        style={{
          minHeight: "30px",
          padding: "4px 48px",
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

        {response && responseData && (
          <div className="flex items-center gap-5 text-[13.5px] font-mono">
            <span className={`font-semibold ${getStatusStyle(response.status)}`}>
              {response.status} {STATUS_TEXT[response.status] || "OK"}
            </span>
            <span className="text-[#969696]">
              {response.response_time_ms} ms
            </span>
            <span className="text-[#969696]">
              {formatSize(responseData.size)}
            </span>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-[3px] border-[#2a2a2a]" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-sky-500 animate-spin" />
          </div>
          <span className="text-[15px] font-medium text-[#969696]">Sending Request...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
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
      {!loading && !error && response && responseData && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {section === "body" && (
            <>
              {/* 2. Sub-toolbar Row */}
              <div
                className="flex items-center gap-4 shrink-0"
                style={{
                  paddingLeft: "48px",
                  paddingRight: "48px",
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
            <div className="flex-1 p-8 text-center text-[#969696] font-mono text-[14.5px] flex items-center justify-center">
              No cookies received in response.
            </div>
          )}

          {section === "headers" && (
            <OverlayScrollArea
              containerClassName="flex-1 min-h-0"
              className="overflow-auto bg-transparent"
              style={{ padding: "20px 48px 24px" }}
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

      {/* No response yet */}
      {!loading && !error && !response && (
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
