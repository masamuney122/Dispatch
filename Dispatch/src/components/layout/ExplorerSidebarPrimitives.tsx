import { MethodBadge } from "../common/MethodBadge";

export function DeleteFolderConfirm({
  folderName,
  onConfirm,
  onCancel,
}: {
  folderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#414141] bg-[#242424] p-7 shadow-2xl">
        <h2 className="mb-3 text-base font-bold text-zinc-100">Delete Folder</h2>
        <p className="mb-6 text-sm text-zinc-400">
          <span className="font-medium text-zinc-200">&quot;{folderName}&quot;</span>{" "}
          contains requests or subfolders. All contents will be permanently
          removed. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-[#2a2a2a] hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-lg transition-colors hover:bg-red-500"
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  );
}

export function DragPreview({
  label,
  isFolder,
  method,
}: {
  label: string;
  isFolder: boolean;
  method?: string;
}) {
  return (
    <div className="flex max-w-[220px] items-center gap-2 rounded-md border border-[#444] bg-[#2a2a2a] px-3 py-2 text-xs text-zinc-200 opacity-90 shadow-xl">
      {isFolder ? (
        <svg
          className="h-3.5 w-3.5 shrink-0 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
      ) : (
        method && <MethodBadge method={method} />
      )}
      <span className="truncate font-medium">{label}</span>
    </div>
  );
}
