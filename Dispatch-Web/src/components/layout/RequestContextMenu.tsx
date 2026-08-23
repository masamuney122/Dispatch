import { useEffect, useRef } from "react";

interface RequestContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onRename?: () => void;
  onCopy: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
}

const BackspaceIcon = () => (
  <svg style={{ width: "16px", height: "16px" }} className="shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9l4 4m0-4l-4 4m-4-6h11a2 2 0 012 2v8a2 2 0 01-2 2H8l-5-6 5-6z" />
  </svg>
);

const MenuItem = ({
  onClick,
  danger,
  shortcutText,
  shortcutIcon,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  shortcutText?: string;
  shortcutIcon?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div style={{ padding: "2px 6px" }}>
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md text-left transition-colors hover:bg-zinc-800"
      style={{
        fontSize: "13px",
        padding: "6px 12px",
        color: danger ? "#f87171" : "#e4e4e4",
      }}
    >
      <span>{children}</span>
      {(shortcutText || shortcutIcon) && (
        <span
          className="flex items-center"
          style={{ color: "#888888", fontFamily: "sans-serif", letterSpacing: "0.025em" }}
        >
          {shortcutText}
          {shortcutIcon}
        </span>
      )}
    </button>
  </div>
);

const Divider = () => (
  <div className="border-t border-zinc-700" style={{ margin: "6px 16px" }} />
);

export const RequestContextMenu: React.FC<RequestContextMenuProps> = ({
  x,
  y,
  onClose,
  onRename,
  onCopy,
  onDuplicate,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const menuWidth = 240;
  const menuHeight = onRename || onDuplicate ? 210 : 132;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] rounded-lg shadow-2xl"
      style={{
        left: clampedX,
        top: clampedY,
        width: "170px",
        padding: "6px 0",
        backgroundColor: "#242424",
        border: "1px solid #383838",
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onRename && (
        <MenuItem onClick={run(onRename)} shortcutText="⌘E">
          Rename
        </MenuItem>
      )}
      <MenuItem onClick={run(onCopy)} shortcutText="⌘C">
        Copy
      </MenuItem>
      {onDuplicate && (
        <MenuItem onClick={run(onDuplicate)} shortcutText="⌘D">
          Duplicate
        </MenuItem>
      )}

      <Divider />

      <MenuItem onClick={run(onDelete)} danger shortcutIcon={<BackspaceIcon />}>
        Delete
      </MenuItem>
    </div>
  );
};
