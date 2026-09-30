import {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuItem,
} from "../common/ContextMenu";

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

export function EnvironmentContextMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete,
}: EnvironmentContextMenuProps) {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <ContextMenuItem onClick={run(onRename)} trailing="⌘E">
        Rename
      </ContextMenuItem>
      <ContextMenuDivider />
      <ContextMenuItem onClick={run(onDelete)} danger trailing={<BackspaceIcon />}>
        Delete
      </ContextMenuItem>
    </ContextMenu>
  );
}
