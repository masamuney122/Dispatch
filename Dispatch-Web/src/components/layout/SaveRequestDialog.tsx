import { useState } from "react";
import type { Collection } from "../../types/collection";

interface SaveRequestDialogProps {
  collections: Collection[];
  onSave: (collectionId: string, collectionName: string | null) => Promise<void>;
  onClose: () => void;
}

export const SaveRequestDialog: React.FC<SaveRequestDialogProps> = ({
  collections,
  onSave,
  onClose,
}) => {
  const [saveTarget, setSaveTarget] = useState(collections[0]?.id || "new");
  const [newCollectionName, setNewCollectionName] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saveTarget === "new" && !newCollectionName.trim()) return;
    await onSave(
      saveTarget,
      saveTarget === "new" ? newCollectionName.trim() : null
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-xl border border-[#414141] bg-[#242424] shadow-2xl" style={{ padding: '32px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
          <h2 className="text-lg font-bold text-zinc-100">Save Request</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-col" style={{ gap: '16px' }}>
          <div className="flex flex-col" style={{ gap: '8px' }}>
            <label className="text-xs font-semibold text-zinc-400 tracking-wide uppercase">Select Collection</label>
            <select value={saveTarget} onChange={(event) => setSaveTarget(event.target.value)} className="w-full bg-[#292929] border border-[#404040] hover:border-[#555] focus:border-blue-500 rounded-lg text-sm text-zinc-100 focus:outline-none transition-colors appearance-none cursor-pointer" style={{ padding: '12px 16px' }}>
              <option value="new">+ Create New Collection</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {saveTarget === "new" && (
            <div className="flex flex-col" style={{ gap: '8px' }}>
              <label className="text-xs font-semibold text-zinc-400 tracking-wide uppercase">Collection Name</label>
              <input autoFocus value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="e.g. Authentication API" className="w-full bg-[#292929] border border-[#404040] focus:border-blue-500 rounded-lg text-sm text-zinc-100 focus:outline-none transition-colors" style={{ padding: '12px 16px' }} />
            </div>
          )}
        </div>

        <div className="flex justify-end" style={{ marginTop: '32px', gap: '12px' }}>
          <button type="button" onClick={onClose} className="rounded-lg text-sm font-semibold text-zinc-300 hover:text-white hover:bg-[#2a2a2a] transition-colors" style={{ padding: '10px 20px' }}>Cancel</button>
          <button className="rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white shadow-lg transition-colors" style={{ padding: '10px 24px' }}>Save Request</button>
        </div>
      </form>
    </div>
  );
};
