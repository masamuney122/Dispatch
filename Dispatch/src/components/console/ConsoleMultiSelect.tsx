import { useEffect, useMemo, useRef, useState } from "react";

export interface ConsoleFilterOption<T extends string> {
  value: T;
  label: string;
}

interface ConsoleMultiSelectProps<T extends string> {
  allLabel: string;
  groupLabel: string;
  options: readonly ConsoleFilterOption<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

const SelectionMark: React.FC<{ checked: boolean; indeterminate?: boolean }> = ({
  checked,
  indeterminate = false,
}) => (
  <span
    aria-hidden="true"
    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
      checked || indeterminate
        ? "border-[#3b82f6] bg-[#3b82f6] text-white"
        : "border-[#5a5a5a] bg-[#202020] text-transparent"
    }`}
  >
    {indeterminate ? (
      <span className="h-px w-2 rounded bg-current" />
    ) : (
      <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
        <path d="M2 6.2 4.5 8.5 10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
);

export function ConsoleMultiSelect<T extends string>({
  allLabel,
  groupLabel,
  options,
  selected,
  onChange,
}: ConsoleMultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = options.length > 0 && selected.length === options.length;
  const partiallySelected = selected.length > 0 && !allSelected;
  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);
  const buttonLabel = allSelected
    ? allLabel
    : selectedLabels.length === 0
      ? `No ${groupLabel.toLowerCase()}`
      : selectedLabels.join(", ");

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggleOption = (value: T) => {
    const next = selectedSet.has(value)
      ? selected.filter((item) => item !== value)
      : options.filter((option) => selectedSet.has(option.value) || option.value === value).map((option) => option.value);
    onChange(next);
  };

  return (
    <div ref={containerRef} className="relative font-sans text-[11px]">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={buttonLabel}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-6 w-[124px] items-center justify-between gap-2 rounded border px-2 text-left transition-colors ${
          open
            ? "border-[#555555] bg-[#282828] text-zinc-200"
            : "border-[#3a3a3a] bg-[#202020] text-zinc-400 hover:bg-[#282828] hover:text-zinc-200"
        }`}
      >
        <span className="truncate">{buttonLabel}</span>
        <svg className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="m6 9 6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" aria-label={groupLabel} className="absolute inset-x-0 top-full z-50 mt-1 w-full rounded-lg border border-[#414141] bg-[#282828] p-1.5 shadow-2xl">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={allSelected ? true : partiallySelected ? "mixed" : false}
            onClick={() => onChange(allSelected ? [] : options.map((option) => option.value))}
            className="flex h-7 w-full items-center gap-2.5 rounded px-2 text-left font-medium text-zinc-200 transition-colors hover:bg-[#333333]"
          >
            <SelectionMark checked={allSelected} indeterminate={partiallySelected} />
            <span className="whitespace-nowrap">{allLabel}</span>
          </button>

          <div className="my-1 border-t border-[#3a3a3a]" />

          {options.map((option) => {
            const checked = selectedSet.has(option.value);
            return (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                key={option.value}
                onClick={() => toggleOption(option.value)}
                className="flex h-7 w-full items-center gap-2.5 rounded px-2 text-left text-zinc-300 transition-colors hover:bg-[#333333]"
              >
                <SelectionMark checked={checked} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
