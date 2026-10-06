import { useEffect, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_MARGIN = 8;

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

export function ContextMenu({
  x,
  y,
  onClose,
  width = 170,
  children,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
    setPosition({
      x: Math.max(
        VIEWPORT_MARGIN,
        Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN),
      ),
      y: Math.max(
        VIEWPORT_MARGIN,
        Math.min(y, window.innerHeight - menuHeight - VIEWPORT_MARGIN),
      ),
    });
  }, [width, x, y, children]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] rounded-lg border border-[#383838] bg-[#242424] py-1 shadow-2xl"
      style={{ left: position.x, top: position.y, width }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function ContextMenuItem({
  onClick,
  danger = false,
  trailing,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-1 py-px">
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-zinc-800 ${danger ? "text-red-400" : "text-zinc-200"}`}
      >
        <span>{children}</span>
        {trailing && (
          <span className="flex items-center font-sans tracking-wide text-[#888888]">
            {trailing}
          </span>
        )}
      </button>
    </div>
  );
}

export function ContextMenuDivider() {
  return <div className="mx-2.5 my-1 border-t border-zinc-700" />;
}
