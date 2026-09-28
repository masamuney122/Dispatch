import React, { useState } from "react";
import { getMethodHexColor } from "../../constants/httpConstants";

interface UrlActionBarProps {
  method: string;
  title: string;
  breadcrumbItems?: string[];
  onChangeTitle?: (title: string) => void;
  onChangeMethod: (method: string) => void;
  url: string;
  onChangeUrl: (url: string) => void;
  onSend: () => void;
  onSave: () => void;
  loading: boolean;
}



export const UrlActionBar: React.FC<UrlActionBarProps> = ({
  method,
  title,
  breadcrumbItems = [],
  onChangeTitle,
  onChangeMethod,
  url,
  onChangeUrl,
  onSend,
  onSave,
  loading,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      onSend();
    }
  };

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
      {/* Üst Sıra: Başlık ve Save aksiyonu */}
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

        <div className="flex items-center">
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:bg-[#2a2a2a] hover:text-zinc-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Alt Sıra: Metod + URL Bar ve Send Butonu (Arasında ferah gap-4) */}
      <div className="flex h-[34px] items-stretch gap-3">
        {/* Metod + URL Giriş Kutusu */}
        <div className="flex-1 flex items-stretch border border-[#555555] bg-[#242424] rounded-lg overflow-hidden focus-within:border-[#7aa2f7] transition-all">
          {/* Metod Seçici */}
          <div className="relative flex items-center border-r border-[#333333] bg-[#222222]">
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

          <input
            type="text"
            value={url}
            onChange={(e) => onChangeUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL or paste text"
            style={{ paddingLeft: '16px', paddingRight: '16px' }}
            className="flex-1 bg-transparent text-sm text-zinc-100 font-mono focus:outline-none placeholder-zinc-500"
          />
        </div>

        {/* Gönder (Send) Mavi Buton Grubu (Ferah biçimde sağ tarafta) */}
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
