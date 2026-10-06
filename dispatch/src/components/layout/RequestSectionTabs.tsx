

interface RequestSectionTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCookies: () => void;
  headersCount?: number;
}

export const RequestSectionTabs: React.FC<RequestSectionTabsProps> = ({
  activeTab,
  onTabChange,
  onOpenCookies,
  headersCount = 6,
}) => {
  const tabs = ["Params", "Authorization", "Headers", "Body", "Scripts", "Settings"];

  return (
    <div className="border-b border-[#2e2e2e] flex items-center justify-between shrink-0 select-none text-xs font-sans">
      {/* Request section tabs */}
      <div className="flex items-center gap-4 -mb-[1px]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? "border-[#ff6c37] text-white font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span>{tab}</span>
            {tab === "Headers" && (
              <span className="text-[10px] text-zinc-500 font-mono ml-0.5">{headersCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Right: Cookies */}
      <div className="py-1">
        <button onClick={onOpenCookies} className="text-sky-400 hover:underline font-semibold text-xs transition-colors">
          Cookies
        </button>
      </div>
    </div>
  );
};
