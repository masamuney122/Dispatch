import { OverlayScrollArea } from "../common/OverlayScrollArea";

export function TextResponseViewer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <OverlayScrollArea
      containerClassName="flex-1 min-h-0"
      className="flex overflow-auto bg-transparent pt-1 font-mono text-[13px] leading-[22px] select-text"
    >
      <div className="w-7 shrink-0 border-r border-[#404040]/50 pr-1.5 text-right text-[#858585] select-none">
        {lines.map((_, index) => <div key={index}>{index + 1}</div>)}
      </div>
      <div className="flex-1 whitespace-pre pb-4 pl-3 pr-12">
        {lines.map((line, index) => (
          <div key={index} className="-mx-2 rounded px-2 transition-colors hover:bg-[#2a2a2a]">{line || " "}</div>
        ))}
      </div>
    </OverlayScrollArea>
  );
}
