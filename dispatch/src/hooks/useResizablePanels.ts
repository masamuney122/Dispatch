import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const RESPONSE_PANEL_MIN_HEIGHT = 220;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 560;

const RESPONSE_PANEL_DEFAULT_HEIGHT = 320;
const REQUEST_PANEL_MIN_HEIGHT = 240;
const RESPONSE_PANEL_MAX_RATIO = 0.72;
const SIDEBAR_DEFAULT_WIDTH = 320;
const MAIN_PANEL_MIN_WIDTH = 560;

interface ResizeSession {
  pointerId: number;
  startPosition: number;
  startSize: number;
}

interface BodyInteraction {
  cursor: string;
  userSelect: string;
}

function sidebarMaximumWidth(): number {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - MAIN_PANEL_MIN_WIDTH - 12),
  );
}

function beginBodyInteraction(cursor: string): BodyInteraction {
  const previous = {
    cursor: document.body.style.cursor,
    userSelect: document.body.style.userSelect,
  };
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  return previous;
}

function restoreBodyInteraction(previous: BodyInteraction | null): void {
  if (!previous) return;
  document.body.style.cursor = previous.cursor;
  document.body.style.userSelect = previous.userSelect;
}

export function useResizablePanels(responseBoundsKey: string | undefined) {
  const requestWorkspaceRef = useRef<HTMLDivElement>(null);
  const responseSessionRef = useRef<ResizeSession | null>(null);
  const sidebarSessionRef = useRef<ResizeSession | null>(null);
  const responseBodyInteractionRef = useRef<BodyInteraction | null>(null);
  const sidebarBodyInteractionRef = useRef<BodyInteraction | null>(null);
  const [responsePanelHeight, setResponsePanelHeight] = useState(
    RESPONSE_PANEL_DEFAULT_HEIGHT,
  );
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingResponse, setIsResizingResponse] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const responsePanelBounds = () => {
    const workspaceHeight = requestWorkspaceRef.current?.clientHeight ?? 0;
    const maximumHeight = Math.max(
      RESPONSE_PANEL_MIN_HEIGHT,
      Math.min(
        Math.floor(workspaceHeight * RESPONSE_PANEL_MAX_RATIO),
        workspaceHeight - REQUEST_PANEL_MIN_HEIGHT,
      ),
    );
    return { minimumHeight: RESPONSE_PANEL_MIN_HEIGHT, maximumHeight };
  };

  const handleResponseResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    responseSessionRef.current = {
      pointerId: event.pointerId,
      startPosition: event.clientY,
      startSize: responsePanelHeight,
    };
    responseBodyInteractionRef.current = beginBodyInteraction("row-resize");
    setIsResizingResponse(true);
  };

  const handleResponseResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = responseSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    const requestedHeight =
      session.startSize + session.startPosition - event.clientY;
    const { minimumHeight, maximumHeight } = responsePanelBounds();
    setResponsePanelHeight(
      Math.min(maximumHeight, Math.max(minimumHeight, requestedHeight)),
    );
  };

  const handleResponseResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = responseSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    responseSessionRef.current = null;
    setIsResizingResponse(false);
    restoreBodyInteraction(responseBodyInteractionRef.current);
    responseBodyInteractionRef.current = null;
  };

  const handleSidebarResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarSessionRef.current = {
      pointerId: event.pointerId,
      startPosition: event.clientX,
      startSize: sidebarWidth,
    };
    sidebarBodyInteractionRef.current = beginBodyInteraction("col-resize");
    setIsResizingSidebar(true);
  };

  const handleSidebarResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sidebarSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    const requestedWidth =
      session.startSize + event.clientX - session.startPosition;
    setSidebarWidth(
      Math.min(sidebarMaximumWidth(), Math.max(SIDEBAR_MIN_WIDTH, requestedWidth)),
    );
  };

  const handleSidebarResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sidebarSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    sidebarSessionRef.current = null;
    setIsResizingSidebar(false);
    restoreBodyInteraction(sidebarBodyInteractionRef.current);
    sidebarBodyInteractionRef.current = null;
  };

  useEffect(() => {
    const workspace = requestWorkspaceRef.current;
    if (!workspace || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const maximumHeight = Math.max(
        RESPONSE_PANEL_MIN_HEIGHT,
        Math.min(
          Math.floor(entry.contentRect.height * RESPONSE_PANEL_MAX_RATIO),
          entry.contentRect.height - REQUEST_PANEL_MIN_HEIGHT,
        ),
      );
      setResponsePanelHeight((current) => Math.min(current, maximumHeight));
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [responseBoundsKey]);

  useEffect(() => {
    const handleWindowResize = () => {
      setSidebarWidth((current) => Math.min(current, sidebarMaximumWidth()));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useEffect(
    () => () => {
      restoreBodyInteraction(responseBodyInteractionRef.current);
      restoreBodyInteraction(sidebarBodyInteractionRef.current);
    },
    [],
  );

  return {
    requestWorkspaceRef,
    responsePanelHeight,
    sidebarWidth,
    isResizingResponse,
    isResizingSidebar,
    handleResponseResizeStart,
    handleResponseResizeMove,
    handleResponseResizeEnd,
    handleSidebarResizeStart,
    handleSidebarResizeMove,
    handleSidebarResizeEnd,
  };
}
