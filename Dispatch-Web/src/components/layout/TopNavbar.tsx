

import { useState } from "react";
import type { ArchiveMode } from "../../types/workspace";

interface TopNavbarProps {
  workspaceName: string;
  onChangeWorkspace: () => Promise<void>;
  onExportWorkspace: (mode: ArchiveMode) => Promise<void>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearHistory: () => void;
  historyCount: number;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  workspaceName,
  onChangeWorkspace,
  onExportWorkspace,
  searchQuery,
  onSearchChange,
  onClearHistory,
  historyCount,
}) => {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  return (
    <header
      className="relative h-[32px] bg-[#252525] border-b border-[#363636] flex items-center justify-between shrink-0 gap-4 select-none text-sm font-sans"
      style={{ paddingLeft: "8px", paddingRight: "16px" }}
    >
      <div className="relative flex min-w-0 items-center gap-2">
        <button
          onClick={() => setWorkspaceMenuOpen((open) => !open)}
          className="flex max-w-[220px] items-center gap-1.5 truncate rounded px-2 py-0.5 text-xs font-medium text-zinc-400 transition hover:bg-[#333] hover:text-zinc-100"
          title="Workspace değiştir"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 7.5h6l2 2h10v9H3z" />
            <path d="M3 7.5V5h7l2 2.5" />
          </svg>
          <span className="truncate">{workspaceName}</span>
          <span className="text-zinc-600">⌄</span>
        </button>
        {workspaceMenuOpen && (
          <div className="absolute left-2 top-[28px] z-50 w-52 rounded-lg border border-[#444] bg-[#292929] p-1.5 shadow-xl">
            <button
              onClick={() => void onExportWorkspace("backup").finally(() => setWorkspaceMenuOpen(false))}
              className="w-full rounded px-3 py-2 text-left text-xs text-zinc-300 hover:bg-[#383838]"
            >
              Backup olarak dışa aktar
            </button>
            <button
              onClick={() => void onExportWorkspace("safe_share").finally(() => setWorkspaceMenuOpen(false))}
              className="w-full rounded px-3 py-2 text-left text-xs text-zinc-300 hover:bg-[#383838]"
            >
              Safe Share olarak dışa aktar
            </button>
            <div className="my-1 border-t border-[#414141]" />
            <button
              onClick={() =>
                void onChangeWorkspace()
                  .catch((error: unknown) =>
                    window.alert(error instanceof Error ? error.message : String(error))
                  )
                  .finally(() => setWorkspaceMenuOpen(false))
              }
              className="w-full rounded px-3 py-2 text-left text-xs text-zinc-300 hover:bg-[#383838]"
            >
              Workspace değiştir
            </button>
          </div>
        )}
      </div>

      {/* Orta: Arama Çubuğu (Arama Simgesi SAĞDA) */}
      <div className="absolute left-1/2 top-1/2 flex w-[320px] -translate-x-1/2 -translate-y-1/2 justify-center">
        <div className="relative flex w-full items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            className="w-full bg-[#292929] border border-[#3a3a3a] rounded-lg text-left text-xs text-zinc-200 placeholder:text-center placeholder:text-zinc-500 focus:placeholder-transparent focus:outline-none focus:border-[#5b8def] transition-colors font-medium"
            style={{ height: "22px", paddingLeft: "5px", paddingRight: "32px" }}
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 text-zinc-400 hover:text-white"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <svg className="w-4 h-4 absolute right-2.5 text-zinc-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {/* Sağ: Clear History ve Ayarlar */}
      <div className="flex items-center gap-3 shrink-0">
        {historyCount > 0 && (
          <button
            onClick={onClearHistory}
            className="text-zinc-400 hover:text-red-400 font-medium text-xs transition-colors"
            title="Clear History"
          >
            Clear History ({historyCount})
          </button>
        )}

        <button className="p-1 hover:text-zinc-200 text-zinc-400" title="Notifications">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        <button className="p-1 hover:text-zinc-200 text-zinc-400" title="Settings">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </header>
  );
};
