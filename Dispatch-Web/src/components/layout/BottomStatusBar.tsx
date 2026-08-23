

export const BottomStatusBar: React.FC = () => {
  return (
    <footer className="h-7 border-t border-[#343434] bg-[#202020] px-3 flex items-center justify-between shrink-0 text-[11px] text-zinc-400 select-none font-sans">
      {/* Sol: Connect Git, Console, Terminal, Uyarı ve Bildirimler */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer transition-colors">
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Connect Git</span>
        </div>

        <div className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer transition-colors">
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Console</span>
        </div>

        <div className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer transition-colors">
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Terminal</span>
        </div>

        <div className="flex items-center gap-2 ml-1 text-zinc-500 font-mono">
          <div className="flex items-center gap-0.5 hover:text-zinc-300 cursor-pointer">
            <span>!</span>
            <span>0</span>
          </div>
          <div className="flex items-center gap-0.5 hover:text-zinc-300 cursor-pointer">
            <span>Δ</span>
            <span>0</span>
          </div>
        </div>
      </div>

      {/* Sağ: Globals, Vault, Tools ve Panel Görünüm Simgeleri */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 text-zinc-400 font-medium">
          <span className="hover:text-zinc-200 cursor-pointer transition-colors">Globals</span>
          <span className="hover:text-zinc-200 cursor-pointer transition-colors">Vault</span>
          <span className="hover:text-zinc-200 cursor-pointer transition-colors">Tools</span>
        </div>

        <div className="h-3 w-[1px] bg-[#333333]"></div>

        <div className="flex items-center gap-1 text-zinc-500">
          <button className="p-0.5 hover:text-zinc-200 rounded transition-colors" title="Sidebar">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <button className="p-0.5 hover:text-zinc-200 rounded transition-colors" title="Bottom panel">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
          <button className="p-0.5 hover:text-zinc-200 rounded transition-colors" title="Right panel">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16m-7 6h7M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </footer>
  );
};
