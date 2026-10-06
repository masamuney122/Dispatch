import { useEffect, useRef, useState } from "react";
import type { Environment } from "../../types/environment";
import { getMethodHexColor } from "../../constants/httpConstants";
import { EnvironmentSelector } from "../environment/EnvironmentSelector";
import { OverlayScrollArea } from "../common/OverlayScrollArea";
import type { CollectionRunnerState } from "../../types/runner";

interface RequestTabInfo {
  id: string;
  kind: "request";
  title: string;
  method: string;
  url: string;
  dirty: boolean;
}

interface EnvironmentTabInfo {
  id: string;
  kind: "environment";
  environmentId: string;
}

interface RunnerTabInfo {
  id: string;
  kind: "runner";
  runnerId: string;
}

export type TabInfo = RequestTabInfo | EnvironmentTabInfo | RunnerTabInfo;

interface RequestTabsBarProps {
  tabs: TabInfo[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTab: (
    draggedTabId: string,
    targetTabId: string,
    position: "before" | "after"
  ) => void;
  onAddTab: () => void;
  runners: CollectionRunnerState[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
}



export const RequestTabsBar: React.FC<RequestTabsBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTab,
  onAddTab,
  runners,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
}) => {
  const tabsScrollerRef = useRef<HTMLDivElement>(null);
  const tabElementsRef = useRef(new Map<string, HTMLDivElement>());
  const draggedTabIdRef = useRef<string | null>(null);
  const lastReorderRef = useRef<string | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  useEffect(() => {
    tabElementsRef.current.get(activeTabId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId, tabs.length]);

  useEffect(
    () => () => {
      pointerCleanupRef.current?.();
    },
    []
  );

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    if (
      scroller.scrollWidth <= scroller.clientWidth ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    ) {
      return;
    }
    scroller.scrollLeft += event.deltaY;
    event.preventDefault();
  };

  const clearDragState = () => {
    draggedTabIdRef.current = null;
    lastReorderRef.current = null;
    setDraggedTabId(null);
    setDropTarget(null);
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    tabId: string
  ) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button")
    ) {
      return;
    }

    pointerCleanupRef.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let hasMoved = false;

    draggedTabIdRef.current = tabId;
    lastReorderRef.current = null;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const distance = Math.hypot(
        pointerEvent.clientX - startX,
        pointerEvent.clientY - startY
      );
      if (!hasMoved && distance < 6) return;

      if (!hasMoved) {
        hasMoved = true;
        setDraggedTabId(tabId);
      }
      pointerEvent.preventDefault();

      const scroller = tabsScrollerRef.current;
      if (scroller) {
        const scrollerBounds = scroller.getBoundingClientRect();
        if (pointerEvent.clientX < scrollerBounds.left + 36) {
          scroller.scrollLeft -= 14;
        }
        if (pointerEvent.clientX > scrollerBounds.right - 36) {
          scroller.scrollLeft += 14;
        }
      }

      const candidates = [...tabElementsRef.current.entries()]
        .filter(([candidateId]) => candidateId !== tabId)
        .map(([candidateId, element]) => ({
          id: candidateId,
          bounds: element.getBoundingClientRect(),
        }))
        .sort((left, right) => left.bounds.left - right.bounds.left);
      if (candidates.length === 0) return;

      const nextCandidate = candidates.find(
        ({ bounds }) =>
          pointerEvent.clientX < bounds.left + bounds.width / 2
      );
      const target = nextCandidate || candidates[candidates.length - 1];
      const position = nextCandidate ? "before" : "after";
      const reorderKey = `${tabId}:${target.id}:${position}`;

      if (lastReorderRef.current !== reorderKey) {
        lastReorderRef.current = reorderKey;
        onReorderTab(tabId, target.id, position);
        setDropTarget({ id: target.id, position });
      }
    };

    const finishPointerDrag = (finishEvent: Event) => {
      if (
        finishEvent instanceof PointerEvent &&
        finishEvent.pointerId !== pointerId
      ) {
        return;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
      window.removeEventListener("blur", finishPointerDrag);
      pointerCleanupRef.current = null;
      clearDragState();
    };

    pointerCleanupRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
      window.removeEventListener("blur", finishPointerDrag);
      pointerCleanupRef.current = null;
      clearDragState();
    };
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", finishPointerDrag);
    window.addEventListener("blur", finishPointerDrag);
  };

  return (
    <div className="h-8 border-b border-[#363636] bg-[#222222] flex items-center gap-0 shrink-0 select-none text-xs font-sans">
      <div className="flex h-full min-w-0 flex-1 items-center">
        {/* Open tabs list */}
        <OverlayScrollArea
          containerClassName="h-8 min-w-0 flex-1"
          axis="horizontal"
          horizontalThumbBottom={0}
          ref={tabsScrollerRef}
          onWheel={handleWheel}
          className="flex items-center gap-0 overflow-x-auto px-2"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const environment =
              tab.kind === "environment"
                ? environments.find((item) => item.id === tab.environmentId)
                : null;
            const runner =
              tab.kind === "runner"
                ? runners.find((item) => item.id === tab.runnerId)
                : null;
            return (
              <div
                key={tab.id}
                ref={(element) => {
                  if (element) tabElementsRef.current.set(tab.id, element);
                  else tabElementsRef.current.delete(tab.id);
                }}
                onPointerDown={(event) => handlePointerDown(event, tab.id)}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative my-1 flex h-6 w-[180px] shrink-0 touch-none items-center gap-2 overflow-hidden rounded-md pr-2.5 cursor-grab active:cursor-grabbing transition-all ${
                  isActive
                    ? "bg-[#3a3a3a] text-zinc-100 font-medium"
                    : "border-r border-[#343434] text-zinc-400 hover:bg-[#292929] hover:text-zinc-200"
                } ${draggedTabId === tab.id ? "opacity-50" : ""}`}
                style={{ paddingLeft: '14px' }}
              >
              {dropTarget?.id === tab.id && draggedTabId !== tab.id && (
                <span
                  className={`pointer-events-none absolute bottom-1 top-1 w-[2px] bg-sky-500 ${
                    dropTarget.position === "before" ? "left-0" : "right-0"
                  }`}
                />
              )}
              {tab.kind === "request" ? (
                <>
                  <span
                    className="text-[11px] font-bold tracking-wide"
                    style={{ color: getMethodHexColor(tab.method) }}
                  >
                    {tab.method}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {tab.title || "Untitled Request"}
                  </span>
                  {tab.dirty && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6c37]"
                      title="Unsaved changes"
                    />
                  )}
                </>
              ) : tab.kind === "environment" ? (
                <>
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M7 7h10M7 12h10M7 17h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {environment?.name || "Environment"}
                  </span>
                </>
              ) : (
                <>
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[#ff7a45]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.7}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path
                      d="m10 8.75 5.5 3.25L10 15.25v-6.5Z"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {runner
                      ? runner.scope.type === "folder"
                        ? runner.scope.folderName
                        : runner.collectionName
                      : "Collection Runner"}
                  </span>
                  {runner?.status === "running" && (
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-400" />
                  )}
                </>
              )}
              {(tabs.length > 1 || tab.kind !== "request") && (
                <button
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 transition-all hover:text-red-400 group-hover:opacity-70 hover:!opacity-100"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              </div>
            );
          })}
        </OverlayScrollArea>

        {/* Keep the new-tab button visible while the tabs scroll. */}
        <button
          draggable={false}
          onClick={onAddTab}
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-[#303030] hover:text-zinc-100"
          title="New Request Tab"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Right corner: environment selector */}
      <div className="flex h-full shrink-0 items-center border-l border-[#363636]">
        <EnvironmentSelector
          environments={environments}
          activeEnvironmentId={activeEnvironmentId}
          onSelect={onSelectEnvironment}
        />
      </div>
    </div>
  );
};
