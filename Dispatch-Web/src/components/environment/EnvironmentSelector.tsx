import { useEffect, useRef, useState } from "react";
import type { Environment } from "../../types/environment";
import { OverlayScrollArea } from "../common/OverlayScrollArea";

interface EnvironmentSelectorProps {
  environments: Environment[];
  activeEnvironmentId: string | null;
  onSelect: (id: string | null) => void | Promise<void>;
}

export const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  environments,
  activeEnvironmentId,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeEnvironment = environments.find(
    (environment) => environment.id === activeEnvironmentId
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const selectEnvironment = (id: string | null) => {
    void onSelect(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{ paddingLeft: "18px", paddingRight: "10px" }}
        className={`flex h-8 w-[190px] items-center justify-between gap-2 text-[13px] font-medium transition-colors ${
          open
            ? "bg-[#303030] text-zinc-100"
            : "bg-transparent text-zinc-400 hover:bg-[#292929] hover:text-zinc-200"
        }`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {activeEnvironment?.name || "No environment"}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 w-[190px] overflow-hidden rounded-b-lg border border-[#414141] bg-[#282828] shadow-2xl">
          <button
            type="button"
            onClick={() => selectEnvironment(null)}
            style={{ paddingLeft: "18px", paddingRight: "12px" }}
            className={`flex h-8 w-full items-center justify-between text-left text-xs transition-colors hover:bg-[#2a2a2a] ${
              !activeEnvironmentId ? "text-white" : "text-zinc-400"
            }`}
          >
            <span>No environment</span>
            {!activeEnvironmentId && <span className="text-emerald-400">✓</span>}
          </button>
          <div className="border-t border-[#303030]" />
          <OverlayScrollArea
            containerClassName="max-h-72"
            axis="vertical"
            className="max-h-72 overflow-y-auto"
          >
            {environments.map((environment) => (
              <button
                type="button"
                key={environment.id}
                onClick={() => selectEnvironment(environment.id)}
                style={{ paddingLeft: "18px", paddingRight: "12px" }}
                className={`flex h-8 w-full items-center justify-between gap-2 text-left text-xs transition-colors hover:bg-[#2a2a2a] ${
                  activeEnvironmentId === environment.id
                    ? "bg-[#272727] text-white"
                    : "text-zinc-400"
                }`}
              >
                <span className="truncate">{environment.name}</span>
                {activeEnvironmentId === environment.id && (
                  <span className="text-emerald-400">✓</span>
                )}
              </button>
            ))}
            {environments.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-600">
                No saved environments
              </p>
            )}
          </OverlayScrollArea>
        </div>
      )}
    </div>
  );
};
