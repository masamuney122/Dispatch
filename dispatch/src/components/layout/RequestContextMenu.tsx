import {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuItem,
} from "../common/ContextMenu";

interface RequestContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onRename?: () => void;
  onCopy: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
}

export const RequestContextMenu: React.FC<RequestContextMenuProps> = ({
  x,
  y,
  onClose,
  onRename,
  onCopy,
  onDuplicate,
  onDelete,
}) => {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <ContextMenu x={x} y={y} width={136} onClose={onClose}>
      {onRename && (
        <ContextMenuItem onClick={run(onRename)}>
          Rename
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={run(onCopy)}>
        Copy
      </ContextMenuItem>
      {onDuplicate && (
        <ContextMenuItem onClick={run(onDuplicate)}>
          Duplicate
        </ContextMenuItem>
      )}

      <ContextMenuDivider />

      <ContextMenuItem onClick={run(onDelete)} danger>
        Delete
      </ContextMenuItem>
    </ContextMenu>
  );
};
