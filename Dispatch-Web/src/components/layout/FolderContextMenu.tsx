import { useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FolderContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddRequest: () => void;
  onAddFolder: () => void;
  onRename: () => void;
  onDuplicate?: () => void;
  onExportOpenApi?: () => void;
  onDelete: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackspaceIcon = () => (
  <svg style={{ width: '16px', height: '16px' }} className="shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9l4 4m0-4l-4 4m-4-6h11a2 2 0 012 2v8a2 2 0 01-2 2H8l-5-6 5-6z" />
  </svg>
);

// ── Sub-components ────────────────────────────────────────────────────────────

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
  <div style={{ padding: '2px 6px' }}>
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between text-left rounded-md transition-colors hover:bg-zinc-800`}
      style={{
        fontSize: '13px',
        padding: '6px 12px',
        color: danger ? '#f87171' : '#e4e4e4',
      }}
    >
      <span>{children}</span>
      {(shortcutText || shortcutIcon) && (
        <span style={{ color: '#888888', fontFamily: 'sans-serif', letterSpacing: '0.025em' }} className="flex items-center">
          {shortcutText}
          {shortcutIcon}
        </span>
      )}
    </button>
  </div>
);

const Divider = () => <div className="border-t border-zinc-700" style={{ margin: '6px 16px' }} />;

// ── Component ─────────────────────────────────────────────────────────────────

export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  x,
  y,
  onClose,
  onAddRequest,
  onAddFolder,
  onRename,
  onDuplicate,
  onExportOpenApi,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp position to viewport
  const menuWidth = 240;
  const menuHeight = 240;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const handle = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] rounded-lg shadow-2xl"
      style={{ 
        left: clampedX, 
        top: clampedY,
        width: '170px',
        padding: '6px 0',
        backgroundColor: '#242424',
        border: '1px solid #383838'
      }}
    >
      <MenuItem onClick={handle(onAddRequest)}>
        Add request
      </MenuItem>
      <MenuItem onClick={handle(onAddFolder)}>
        Add folder
      </MenuItem>

      <Divider />

      <MenuItem onClick={handle(onRename)} shortcutText="⌘E">
        Rename
      </MenuItem>
      {onDuplicate && (
        <MenuItem onClick={handle(onDuplicate)} shortcutText="⌘D">
          Duplicate
        </MenuItem>
      )}
      {onExportOpenApi && <MenuItem onClick={handle(onExportOpenApi)}>Export as OpenAPI</MenuItem>}

      <Divider />

      <MenuItem onClick={handle(onDelete)} danger shortcutIcon={<BackspaceIcon />}>
        Delete
      </MenuItem>
    </div>
  );
};
