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

const MenuItem = ({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) => (
  <div style={{ padding: "1px 4px" }}>
    <button
      onClick={onClick}
      className={`flex w-full items-center rounded-md text-left transition-colors hover:bg-zinc-800 ${danger ? "text-red-400" : "text-zinc-200"}`}
      style={{
        fontSize: "13px",
        padding: "5px 10px",
      }}
    >
      {children}
    </button>
  </div>
);

const Divider = () => (
  <div className="border-t border-zinc-700" style={{ margin: "4px 10px" }} />
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
  const menuWidth = 136;
  const menuHeight = onRename || onDuplicate ? 132 : 76;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] rounded-lg border border-[#383838] bg-[#242424] shadow-2xl"
      style={{
        left: clampedX,
        top: clampedY,
        width: `${menuWidth}px`,
        padding: "4px 0",
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onRename && (
        <MenuItem onClick={run(onRename)}>
          Rename
        </MenuItem>
      )}
      <MenuItem onClick={run(onCopy)}>
        Copy
      </MenuItem>
      {onDuplicate && (
        <MenuItem onClick={run(onDuplicate)}>
          Duplicate
        </MenuItem>
      )}

      <Divider />

      <MenuItem onClick={run(onDelete)} danger>
        Delete
      </MenuItem>
    </div>
  );
};
