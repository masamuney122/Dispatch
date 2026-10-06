import {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuItem,
} from "../common/ContextMenu";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FolderContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddRequest: () => void;
  onAddFolder: () => void;
  onRun?: () => void;
  runLabel?: string;
  onRename: () => void;
  onDuplicate?: () => void;
  onMove?: () => void;
  onExportOpenApi?: () => void;
  onDelete: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackspaceIcon = () => (
  <svg style={{ width: '16px', height: '16px' }} className="shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9l4 4m0-4l-4 4m-4-6h11a2 2 0 012 2v8a2 2 0 01-2 2H8l-5-6 5-6z" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  x,
  y,
  onClose,
  onAddRequest,
  onAddFolder,
  onRun,
  runLabel = "Run collection",
  onRename,
  onDuplicate,
  onMove,
  onExportOpenApi,
  onDelete,
}) => {
  const handle = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <ContextMenuItem onClick={handle(onAddRequest)}>
        Add request
      </ContextMenuItem>
      <ContextMenuItem onClick={handle(onAddFolder)}>
        Add folder
      </ContextMenuItem>
      {onRun && (
        <ContextMenuItem onClick={handle(onRun)}>
          {runLabel}
        </ContextMenuItem>
      )}

      <ContextMenuDivider />

      <ContextMenuItem onClick={handle(onRename)} trailing="⌘E">
        Rename
      </ContextMenuItem>
      {onDuplicate && (
        <ContextMenuItem onClick={handle(onDuplicate)} trailing="⌘D">
          Duplicate
        </ContextMenuItem>
      )}
      {onMove && (
        <ContextMenuItem onClick={handle(onMove)}>
          Move
        </ContextMenuItem>
      )}
      {onExportOpenApi && (
        <ContextMenuItem onClick={handle(onExportOpenApi)}>
          Export as OpenAPI
        </ContextMenuItem>
      )}

      <ContextMenuDivider />

      <ContextMenuItem onClick={handle(onDelete)} danger trailing={<BackspaceIcon />}>
        Delete
      </ContextMenuItem>
    </ContextMenu>
  );
};
