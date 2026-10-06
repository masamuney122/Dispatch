

import React from "react";
import { OverlayScrollArea } from "../common/OverlayScrollArea";

interface JsonHighlighterProps {
  code: string;
}

/**
 * Syntax-highlighted JSON viewer with line numbers.
 * Renders keys, string values, numbers, booleans, and null
 * in distinct colors matching a VS Code–style dark theme.
 */
export const JsonHighlighter: React.FC<JsonHighlighterProps> = ({ code }) => {
  const lines = code.split("\n");

  const highlightLine = (line: string) => {
    const parts = line.split(/("(?:[^"\\]|\\.)*":?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?|[{}[\],])/g);
    return parts.map((part, i) => {
      if (!part) return null;
      if (part.startsWith('"') && part.endsWith('":')) {
        const key = part.slice(0, -1);
        return (
          <React.Fragment key={i}>
            <span className="text-[#8cdcfe]">{key}</span>
            <span className="text-zinc-400">:</span>
          </React.Fragment>
        );
      }
      if (part.startsWith('"') && part.endsWith('"')) {
        return <span key={i} className="text-[#ce9178]">{part}</span>;
      }
      if (/^-?\d+(?:\.\d+)?$/.test(part)) {
        const hasDecimals = part.includes(".");
        return (
          <span key={i} className={`text-[#b5cea8] ${hasDecimals ? 'bg-[#3a3a3a] px-1.5 py-0.5 rounded-md' : ''}`}>
            {part}
          </span>
        );
      }
      if (part === "true" || part === "false") {
        return <span key={i} className="text-[#569cd6]">{part}</span>;
      }
      if (part === "null") {
        return <span key={i} className="text-[#569cd6]">{part}</span>;
      }
      return <span key={i} className="text-zinc-300">{part}</span>;
    });
  };

  return (
    <OverlayScrollArea
      containerClassName="flex-1 min-h-0"
      className="flex overflow-auto bg-transparent pt-1 font-mono text-[13px] leading-[22px] select-text"
    >
      {/* Line Numbers Column */}
      <div
        className="w-7 shrink-0 border-r border-[#404040]/50 text-right text-[#858585] select-none"
        style={{ paddingRight: "6px" }}
      >
        {lines.map((_, idx) => (
          <div key={idx}>{idx + 1}</div>
        ))}
      </div>

      {/* Code Column */}
      <div className="flex-1 whitespace-pre pb-4 pl-3 pr-12">
        {lines.map((line, idx) => (
          <div key={idx} className="hover:bg-[#2a2a2a] px-2 -mx-2 rounded transition-colors">{highlightLine(line)}</div>
        ))}
      </div>
    </OverlayScrollArea>
  );
};
