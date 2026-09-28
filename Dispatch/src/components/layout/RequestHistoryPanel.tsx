import { useState } from "react";

import { deleteHistoryItem } from "../../services/historyService";
import type { HistoryItem } from "../../types/history";
import { MethodBadge } from "../common/MethodBadge";
import { RequestContextMenu } from "./RequestContextMenu";

interface RequestHistoryPanelProps {
  history: HistoryItem[];
  searchQuery: string;
  selectedHistoryId: string | null;
  onSelectHistory: (item: HistoryItem) => void;
  onClearHistory: () => void;
}

function groupHistory(items: HistoryItem[]): Record<string, HistoryItem[]> {
  const groups: Record<string, HistoryItem[]> = {};
  for (const item of items) {
    let label = "Recent";
    if (item.timestamp) {
      const date = new Date(item.timestamp);
      if (!Number.isNaN(date.getTime())) {
        label = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }
    }
    (groups[label] ??= []).push(item);
  }
  return groups;
}

export function RequestHistoryPanel({
  history,
  searchQuery,
  selectedHistoryId,
  onSelectHistory,
  onClearHistory,
}: RequestHistoryPanelProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const query = searchQuery.toLowerCase();
  const filtered = history.filter(
    (item) =>
      !query ||
      [item.url, item.method].some((value) => value.toLowerCase().includes(query)),
  );
  const groups = groupHistory(filtered);

  const deleteItem = async (id: string) => {
    try {
      await deleteHistoryItem(id);
      setContextMenu(null);
      window.dispatchEvent(new Event("history-updated"));
    } catch (error) {
      console.error("Failed to delete history item:", error);
    }
  };

  const copyItem = (item: HistoryItem) => {
    void navigator.clipboard.writeText(
      JSON.stringify(
        { method: item.method, url: item.url, body: item.body, auth: item.auth },
        null,
        2,
      ),
    );
  };

  return (
    <div className="flex-1 p-1.5">
      <div className="mb-px flex items-center justify-between gap-3 select-none text-[11px] font-bold tracking-wider text-zinc-300">
        <span>REQUEST HISTORY</span>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="shrink-0 rounded p-1 text-[10px] font-semibold normal-case tracking-normal text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Clear History"
          >
            Clear History
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-500">
          <p>No requests in history.</p>
        </div>
      ) : (
        <div className="mt-0.5 pl-1">
          {Object.entries(groups).map(([label, items]) => {
            const expanded = openGroups[label] !== false;
            return (
              <div key={label} className="mb-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [label]: current[label] === undefined ? false : !current[label],
                    }))
                  }
                  className="flex min-h-[24px] w-full cursor-pointer select-none items-center gap-1 rounded-md px-1 text-xs font-medium text-zinc-300 hover:bg-[#252525] hover:text-white"
                >
                  <svg
                    className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>{label}</span>
                </button>

                {expanded && (
                  <div className="relative">
                    <div className="absolute bottom-0 left-[10px] top-0 w-px bg-[#2e2e2e]" />
                    {items.map((item) => {
                      const selected = selectedHistoryId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => onSelectHistory(item)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setContextMenu({
                              id: item.id,
                              x: event.clientX,
                              y: event.clientY,
                            });
                          }}
                          className={`group relative z-10 flex min-h-[23px] w-full cursor-pointer items-center justify-between gap-1 rounded-md text-left transition-colors ${
                            selected
                              ? "bg-[#333333] text-white"
                              : "text-zinc-300 hover:bg-[#252525]"
                          }`}
                          style={{ paddingLeft: 22, paddingRight: 6 }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <MethodBadge method={item.method} compact />
                            <span className="truncate font-sans text-[11px]">{item.url}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setContextMenu(
                                contextMenu?.id === item.id
                                  ? null
                                  : { id: item.id, x: event.clientX, y: event.clientY },
                              );
                            }}
                            className={`${selected ? "flex" : "hidden group-hover:flex"} shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-[#303030] hover:text-zinc-100`}
                            title="Options"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <RequestContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={() => {
            const item = history.find((entry) => entry.id === contextMenu.id);
            if (item) copyItem(item);
          }}
          onDelete={() => void deleteItem(contextMenu.id)}
        />
      )}
    </div>
  );
}
