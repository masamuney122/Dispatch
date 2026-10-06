import { useState } from "react";
import type { ScriptConsoleValue } from "../../types/script";

interface StructuredConsoleValueProps {
  value: ScriptConsoleValue;
  depth?: number;
}

const primitiveText = (value: ScriptConsoleValue): string | null => {
  switch (value.kind) {
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "boolean":
    case "number":
      return String(value.value);
    case "string":
      return JSON.stringify(value.value) + (value.truncated ? "…" : "");
    case "special":
      return value.label;
    default:
      return null;
  }
};

export function StructuredConsoleValue({
  value,
  depth = 0,
}: StructuredConsoleValueProps) {
  const [open, setOpen] = useState(depth < 1);
  if (value.kind !== "array" && value.kind !== "object") {
    const primitive = primitiveText(value) ?? "";
    const tone =
      value.kind === "string"
        ? "text-[#e6cf62]"
        : value.kind === "number" || value.kind === "boolean"
          ? "text-[#8fb3e8]"
          : "text-zinc-500";
    return <span className={tone}>{primitive}</span>;
  }

  const isArray = value.kind === "array";
  const count = isArray ? value.items.length : value.entries.length;
  const opening = isArray ? "[" : "{";
  const closing = isArray ? "]" : "}";

  return (
    <span className="inline-flex min-w-0 flex-col align-top">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1 text-left text-zinc-300 hover:text-white"
      >
        <span className={`text-[8px] text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
        <span>{opening}{open ? "" : `…${closing}`}</span>
        {!open && <span className="text-zinc-600">{count} item{count === 1 ? "" : "s"}</span>}
      </button>
      {open && (
        <span className="ml-3 border-l border-[#3a3a3a] pl-3">
          {isArray
            ? value.items.map((item, index) => (
                <span key={index} className="flex gap-2 py-0.5">
                  <span className="text-zinc-600">{index}:</span>
                  <StructuredConsoleValue value={item} depth={depth + 1} />
                </span>
              ))
            : value.entries.map((entry) => (
                <span key={entry.key} className="flex gap-2 py-0.5">
                  <span className="text-zinc-400">{entry.key}:</span>
                  <StructuredConsoleValue value={entry.value} depth={depth + 1} />
                </span>
              ))}
          {value.truncated && <span className="block text-zinc-600">… truncated</span>}
          <span className="block text-zinc-400">{closing}</span>
        </span>
      )}
    </span>
  );
}
