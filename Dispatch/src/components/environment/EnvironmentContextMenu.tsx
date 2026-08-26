import { useEffect, useRef } from "react";

interface EnvironmentContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

const BackspaceIcon = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9l4 4m0-4l-4 4m-4-6h11a2 2 0 012 2v8a2 2 0 01-2 2H8l-5-6 5-6z" />
  </svg>
);

const MenuItem = ({
  children,
  danger = false,
  shortcut,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  shortcut?: React.ReactNode;
  onClick: () => void;
}) => (
  <div className="px-1.5 py-0.5">
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-zinc-800 ${danger ? "text-red-400" : "text-zinc-200"}`}
    >
      <span>{children}</span>
      {shortcut && <span className="flex items-center font-sans tracking-wide text-[#888888]">{shortcut}</span>}
    </button>
  </div>
);

export function EnvironmentContextMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete,
}: EnvironmentContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
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

  const menuWidth = 170;
  const menuHeight = 104;
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] w-[170px] rounded-lg border border-[#383838] bg-[#242424] py-1.5 shadow-2xl"
      style={{ left: clampedX, top: clampedY }}
    >
      <MenuItem onClick={run(onRename)} shortcut="⌘E">Rename</MenuItem>
      <div className="mx-4 my-1.5 border-t border-zinc-700" />
      <MenuItem onClick={run(onDelete)} danger shortcut={<BackspaceIcon />}>Delete</MenuItem>
    </div>
  );
}
