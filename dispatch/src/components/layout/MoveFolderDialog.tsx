import { useEffect, useMemo, useState } from "react";
import type { Collection, Folder } from "../../types/collection";

interface MoveFolderDialogProps {
  collections: Collection[];
  sourceCollectionId: string;
  folderName: string;
  onMove: (
    targetCollectionId: string,
    targetParentFolderId: string | null,
  ) => Promise<void>;
  onClose: () => void;
}

interface FolderOption {
  id: string;
  label: string;
}

function folderOptions(collection: Collection | undefined): FolderOption[] {
  if (!collection) return [];
  const foldersByParent = new Map<string | null, Folder[]>();
  collection.folders.forEach((folder) => {
    const parentId = folder.parent_folder_id ?? null;
    foldersByParent.set(parentId, [...(foldersByParent.get(parentId) || []), folder]);
  });
  foldersByParent.forEach((folders) => folders.sort((left, right) => left.order - right.order));

  const result: FolderOption[] = [];
  const visit = (parentId: string | null, path: string[]) => {
    (foldersByParent.get(parentId) || []).forEach((folder) => {
      const nextPath = [...path, folder.name];
      result.push({ id: folder.id, label: nextPath.join(" › ") });
      visit(folder.id, nextPath);
    });
  };
  visit(null, []);
  return result;
}

export const MoveFolderDialog: React.FC<MoveFolderDialogProps> = ({
  collections,
  sourceCollectionId,
  folderName,
  onMove,
  onClose,
}) => {
  const targets = useMemo(
    () => collections.filter((collection) => collection.id !== sourceCollectionId),
    [collections, sourceCollectionId],
  );
  const [targetCollectionId, setTargetCollectionId] = useState(targets[0]?.id || "");
  const [targetParentFolderId, setTargetParentFolderId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetCollection = targets.find((collection) => collection.id === targetCollectionId);
  const availableFolders = useMemo(() => folderOptions(targetCollection), [targetCollection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetCollectionId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onMove(targetCollectionId, targetParentFolderId || null);
      onClose();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : String(moveError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="w-full max-w-md rounded-xl border border-[#414141] bg-[#242424] p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Move folder</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Move <span className="text-zinc-300">{folderName}</span> and its contents to another collection.
            </p>
          </div>
          <button type="button" disabled={submitting} onClick={onClose} className="text-xl leading-none text-zinc-500 hover:text-zinc-200 disabled:opacity-40" aria-label="Close move folder dialog">×</button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Collection</span>
            <select
              autoFocus
              value={targetCollectionId}
              onChange={(event) => {
                setTargetCollectionId(event.target.value);
                setTargetParentFolderId("");
              }}
              className="h-10 w-full rounded-md border border-[#444] bg-[#202020] px-3 text-sm text-zinc-200 outline-none focus:border-[#ff6c37]"
            >
              {targets.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Destination</span>
            <select
              value={targetParentFolderId}
              onChange={(event) => setTargetParentFolderId(event.target.value)}
              className="h-10 w-full rounded-md border border-[#444] bg-[#202020] px-3 text-sm text-zinc-200 outline-none focus:border-[#ff6c37]"
            >
              <option value="">Collection root</option>
              {availableFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/20 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="mt-7 flex justify-end gap-2">
          <button type="button" disabled={submitting} onClick={onClose} className="rounded-md px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-[#303030] hover:text-zinc-200 disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={!targetCollectionId || submitting} className="rounded-md bg-[#ff6c37] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff7b4d] disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? "Moving…" : "Move folder"}
          </button>
        </div>
      </form>
    </div>
  );
};
