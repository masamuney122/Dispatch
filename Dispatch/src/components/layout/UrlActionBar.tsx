import React, { useEffect, useRef, useState } from "react";
import { getMethodHexColor } from "../../constants/httpConstants";
import { EnvironmentUrlEditor } from "./EnvironmentUrlEditor";

interface UrlActionBarProps {
  method: string;
  title: string;
  breadcrumbItems?: string[];
  onChangeTitle?: (title: string) => void;
  onChangeMethod: (method: string) => void;
  url: string;
  environmentVariables: Record<string, string>;
  onChangeUrl: (url: string) => void;
  onSend: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  loading: boolean;
}



export const UrlActionBar: React.FC<UrlActionBarProps> = ({
  method,
  title,
  breadcrumbItems = [],
  onChangeTitle,
  onChangeMethod,
  url,
  environmentVariables,
  onChangeUrl,
  onSend,
  onSave,
  onSaveAs,
  loading,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!saveMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!saveMenuRef.current?.contains(event.target as Node)) {
        setSaveMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSaveMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [saveMenuOpen]);

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
      setEditTitle(title);
    }
  };

  const commitTitleChange = () => {
    setIsEditingTitle(false);
    if (editTitle.trim() !== title && onChangeTitle) {
      onChangeTitle(editTitle.trim());
    }
  };

  return (
    <div className="flex flex-col gap-2 font-sans select-none shrink-0">
      {/* Top row: title and Save action */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-zinc-100 font-bold">
          {breadcrumbItems.map((item, index) => (
            <React.Fragment key={`${item}-${index}`}>
              <span
                className="max-w-[180px] truncate text-xs font-semibold tracking-wide text-zinc-400"
                title={item}
              >
                {item}
              </span>
              <svg className="mx-0.5 h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </React.Fragment>
          ))}
          {isEditingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={commitTitleChange}
              onKeyDown={handleTitleKeyDown}
              className="max-w-[320px] border-b border-[#637083] bg-transparent px-1 py-0.5 text-xs font-semibold tracking-wide text-zinc-100 outline-none"
            />
          ) : (
            <span
              onClick={() => {
                if (onChangeTitle) {
                  setEditTitle(title);
                  setIsEditingTitle(true);
                }
              }}
              className={`max-w-[320px] truncate text-xs font-semibold tracking-wide text-zinc-100 ${onChangeTitle ? 'cursor-text hover:bg-[#2a2a2a] px-1 rounded transition-colors' : ''}`}
              title={onChangeTitle ? "Click to rename" : ""}
            >
              {title}
            </span>
          )}
        </div>

        <div ref={saveMenuRef} className="relative flex items-center">
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-l-md px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:bg-[#2a2a2a] hover:text-zinc-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span>Save</span>
          </button>
          <button
            type="button"
            aria-label="Open save options"
            aria-expanded={saveMenuOpen}
            onClick={() => setSaveMenuOpen((open) => !open)}
            className="flex self-stretch items-center rounded-r-md border-l border-[#393939] px-1.5 text-zinc-500 transition-colors hover:bg-[#2a2a2a] hover:text-zinc-100"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {saveMenuOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 min-w-[132px] rounded-md border border-[#414141] bg-[#282828] p-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setSaveMenuOpen(false);
                  onSaveAs();
                }}
                className="flex w-full items-center rounded px-3 py-2 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-[#363636]"
              >
                Save As...
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: method, URL bar, and Send button */}
      <div className="flex h-[34px] min-w-0 items-stretch gap-3">
        {/* Method and URL input */}
        <div className="relative z-10 flex min-w-0 flex-1 items-stretch overflow-visible rounded-lg border border-[#555555] bg-[#242424] transition-all focus-within:border-[#7aa2f7]">
          {/* Method selector */}
          <div className="relative flex shrink-0 items-center overflow-hidden rounded-l-[7px] border-r border-[#333333] bg-[#222222]">
            <select
              value={method}
              onChange={(e) => onChangeMethod(e.target.value)}
              style={{ paddingLeft: '16px', paddingRight: '24px', color: getMethodHexColor(method) }}
              className="appearance-none bg-transparent font-bold text-sm focus:outline-none cursor-pointer tracking-wider"
            >
              <option value="GET" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("GET") }}>GET</option>
              <option value="POST" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("POST") }}>POST</option>
              <option value="PUT" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("PUT") }}>PUT</option>
              <option value="PATCH" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("PATCH") }}>PATCH</option>
              <option value="DELETE" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("DELETE") }}>DELETE</option>
              <option value="HEAD" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("HEAD") }}>HEAD</option>
              <option value="OPTIONS" className="bg-[#242424] font-bold" style={{ color: getMethodHexColor("OPTIONS") }}>OPTIONS</option>
            </select>
            <svg className="w-3 h-3 absolute right-2.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <EnvironmentUrlEditor
            value={url}
            variables={environmentVariables}
            loading={loading}
            onChange={onChangeUrl}
            onSend={onSend}
          />
        </div>

        {/* Blue Send button group */}
        <div className="flex items-stretch shadow-sm select-none">
          <button
            onClick={onSend}
            disabled={loading}
            style={{ paddingLeft: '24px', paddingRight: '24px' }}
            className="bg-[#3467d6] hover:bg-[#4076e6] active:bg-[#2958bf] disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};
