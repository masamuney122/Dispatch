

import { OverlayScrollArea } from "../common/OverlayScrollArea";

interface JsonPreviewTableProps {
  body: string;
  contentType?: string;
}

/**
 * Renders the response body as a key-value table (for JSON objects),
 * an HTML iframe (for HTML content), or plain text as a fallback.
 */
export const JsonPreviewTable: React.FC<JsonPreviewTableProps> = ({ body, contentType }) => {
  if (contentType?.toLowerCase().includes("text/html")) {
    return <iframe title="Response preview" sandbox="" srcDoc={body} className="flex-1 w-full bg-white border-0" />;
  }

  let parsed: unknown = null;
  let isJson = false;

  try {
    parsed = JSON.parse(body);
    isJson = true;
  } catch {
    // fallback to plain text
  }

  if (isJson) {
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      // Array of objects -> Multi-column table
      const columns = Array.from(new Set(parsed.flatMap((obj: Record<string, unknown>) => Object.keys(obj || {}))));
      return (
        <OverlayScrollArea containerClassName="flex-1 min-h-0" className="overflow-auto bg-transparent" style={{ padding: "20px 47px 24px" }}>
          <table className="w-full overflow-hidden border-separate border-spacing-0 border border-[#343434] bg-[#202020] text-left font-mono text-[14.5px]">
            <thead className="sticky top-0 z-10 bg-[#242424] text-[#969696]">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border-b border-r border-[#343434] font-medium whitespace-nowrap last:border-r-0"
                    style={{ paddingLeft: "24px", paddingRight: "24px" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {parsed.map((row: Record<string, unknown>, idx: number) => (
                <tr key={idx} className="hover:bg-[#252525]">
                  {columns.map((col) => {
                    const val = row?.[col];
                    return (
                      <td
                        key={col}
                        className="border-b border-r border-[#343434] select-text break-all last:border-r-0"
                        style={{ paddingLeft: "24px", paddingRight: "24px" }}
                      >
                        {val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </OverlayScrollArea>
      );
    }

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      // Single object -> Key/Value table
      const entries = Object.entries(parsed as Record<string, unknown>);
      return (
        <OverlayScrollArea containerClassName="flex-1 min-h-0" className="overflow-auto bg-transparent" style={{ padding: "20px 47px 24px" }}>
          <table className="w-full overflow-hidden border-separate border-spacing-0 border border-[#343434] bg-[#202020] text-left font-mono text-[14.5px]">
            <tbody className="text-zinc-300">
              {entries.map(([key, val]) => (
                <tr key={key} className="hover:bg-[#252525]">
                  <td
                    className="w-1/2 border-b border-[#343434] text-zinc-200 break-all select-text"
                    style={{ paddingLeft: "24px", paddingRight: "24px" }}
                  >
                    {key}
                  </td>
                  <td
                    className="border-b border-l border-[#343434] select-text break-all leading-[24px]"
                    style={{ paddingLeft: "24px", paddingRight: "24px" }}
                  >
                    {val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </OverlayScrollArea>
      );
    }
  }

  return (
    <OverlayScrollArea
      containerClassName="flex-1 min-h-0"
      className="p-8 font-mono text-[14.5px] text-zinc-300 overflow-auto bg-transparent whitespace-pre-wrap select-text leading-[28px]"
    >
      {body}
    </OverlayScrollArea>
  );
};
