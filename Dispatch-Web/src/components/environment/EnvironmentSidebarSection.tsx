import { useState } from "react";
import type { Environment } from "../../types/environment";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import { EnvironmentContextMenu } from "./EnvironmentContextMenu";

interface EnvironmentSidebarSectionProps {
  environments: Environment[];
  activeEnvironmentId: string | null;
  searchQuery: string;
  onCreate: (
    name: string,
    variables: Record<string, string>
  ) => Promise<Environment>;
  onOpen: (environment: Environment) => void;
  onRename: (id: string, name: string, variables: Record<string, string>) => void;
  onDelete: (id: string) => Promise<void>;
}

export const EnvironmentSidebarSection: React.FC<
  EnvironmentSidebarSectionProps
> = ({
  environments,
  activeEnvironmentId,
  searchQuery,
  onCreate,
  onOpen,
  onRename,
  onDelete,
}) => {
    const [open, setOpen] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

    const filteredEnvironments = environments.filter(
      (environment) =>
        !searchQuery ||
        environment.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const createEnvironment = async () => {
      if (creating) return;
      setCreating(true);
      if (!open) setOpen(true);
      try {
        const environment = await onCreate("New Environment", {});
        onOpen(environment);
      } finally {
        setCreating(false);
      }
    };

    const startRenaming = (environment: Environment) => {
      setEditingId(environment.id);
      setEditingName(environment.name);
    };

    const finishRenaming = (environment: Environment) => {
      const name = editingName.trim();
      if (name && name !== environment.name) {
        onRename(environment.id, name, environment.variables);
      }
      setEditingId(null);
    };

    return (
      <section
        className="flex shrink-0 flex-col overflow-hidden border-t border-[#363636] bg-[#242424]"
        style={{
          height: open ? "34%" : "32px",
          minHeight: open ? "220px" : "32px",
          transition: "height 180ms ease, min-height 180ms ease",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between text-[11px] font-bold tracking-wider text-zinc-300"
          style={{
            paddingLeft: "8px",
            paddingRight: "8px",
            paddingTop: "8px",
            paddingBottom: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex items-center gap-2.5 hover:text-white"
            aria-expanded={open}
          >
            <svg
              className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-90" : ""
                }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span>ENVIRONMENTS</span>
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => {
              void createEnvironment();
            }}
            className="rounded px-2 py-1 text-xs font-medium normal-case tracking-normal text-zinc-400 transition-colors hover:bg-[#252525] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "+ Create"}
          </button>
        </div>

        {open && (
          <OverlayScrollArea containerClassName="flex-1" axis="vertical" className="overflow-y-auto py-1">
            <ul className="flex flex-col">
              {filteredEnvironments.map((environment) => {
                const active = activeEnvironmentId === environment.id;
                return (
                  <div
                    key={environment.id}
                    onClick={() => onOpen(environment)}
                    onDoubleClick={() => startRenaming(environment)}
                    className={`group flex min-h-[28px] items-center gap-1.5 rounded-md text-left transition-colors cursor-pointer ${active
                      ? "bg-[#333333] text-white"
                      : "text-zinc-300 hover:bg-[#252525] hover:text-zinc-100"
                      }`}
                    style={{ marginLeft: '16px', marginRight: '16px', paddingLeft: '8px', paddingRight: '4px' }}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-600"
                        }`}
                    />
                    {editingId === environment.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setEditingName(event.target.value)}
                        onBlur={() => finishRenaming(environment)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 border-b border-[#637083] bg-transparent py-0.5 text-xs text-zinc-100 outline-none"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-sans text-xs">
                        {environment.name}
                      </span>
                    )}
                    {editingId !== environment.id && (
                      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            setContextMenu({ id: environment.id, x: rect.left, y: rect.bottom + 4 });
                          }}
                          className="rounded p-1 text-zinc-500 transition-colors hover:bg-[#303030] hover:text-zinc-100"
                          title="Environment options"
                          aria-label={`Options for ${environment.name}`}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredEnvironments.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-zinc-600">
                  No environments.
                </p>
              )}
            </ul>
          </OverlayScrollArea>
        )}
        {contextMenu && (() => {
          const environment = environments.find((item) => item.id === contextMenu.id);
          if (!environment) return null;
          return (
            <EnvironmentContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={() => setContextMenu(null)}
              onRename={() => startRenaming(environment)}
              onDelete={() => void onDelete(environment.id)}
            />
          );
        })()}
      </section>
    );
  };
