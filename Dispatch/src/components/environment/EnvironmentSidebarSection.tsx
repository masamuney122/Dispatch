import { useState } from "react";
import type { Environment } from "../../types/environment";
import { OverlayScrollArea } from "../common/OverlayScrollArea";

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
                    style={{ marginLeft: '16px', marginRight: '16px', paddingLeft: '8px', paddingRight: '16px' }}
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
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            startRenaming(environment);
                          }}
                          className="rounded-md p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-[#303030] hover:text-zinc-100 group-hover:opacity-100"
                          title="Rename environment"
                          aria-label={`Rename ${environment.name}`}
                        >
                          <svg
                            className="h-[18px] w-[18px]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.8}
                              d="M15.232 5.232l3.536 3.536M9 11l6.768-6.768a2.5 2.5 0 013.536 3.536L12.536 14.536 8 16l1-5z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onDelete(environment.id);
                          }}
                          className="rounded-md p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-[#303030] hover:text-red-400 group-hover:opacity-100"
                          title="Delete environment"
                          aria-label={`Delete ${environment.name}`}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.8}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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
      </section>
    );
  };
