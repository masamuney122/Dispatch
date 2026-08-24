import { useState } from "react";
import type { GlobalHttpSettings } from "../../types/httpSettings";
import { GlobalHttpSettingsEditor } from "./HttpSettingsEditor";

interface Props {
  settings: GlobalHttpSettings;
  platform: "desktop" | "web";
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (settings: GlobalHttpSettings) => Promise<void>;
}

export function GlobalSettingsDialog({ settings, platform, saving, error, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/65 p-6" onMouseDown={() => !saving && onClose()}>
      <div className="max-h-[90vh] w-full max-w-[780px] overflow-y-auto rounded-xl border border-[#414141] bg-[#242424] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#393939] px-6 py-4">
          <div><h2 className="text-base font-bold text-zinc-100">Global Settings</h2><p className="mt-1 text-xs text-zinc-500">Yeni ve override edilmeyen requestler için HTTP varsayılanları.</p></div>
          <button type="button" disabled={saving} onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-[#333] hover:text-white">×</button>
        </div>
        <div className="px-6"><GlobalHttpSettingsEditor value={draft} onChange={setDraft} platform={platform} /></div>
        {error && <p className="mx-6 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-[#393939] px-6 py-4">
          <button type="button" disabled={saving} onClick={onClose} className="h-9 rounded-lg border border-[#464646] bg-[#2c2c2c] px-4 text-xs font-semibold text-zinc-300 hover:bg-[#333] disabled:opacity-40">İptal</button>
          <button type="button" disabled={saving} onClick={() => void onSave(draft)} className="h-9 rounded-lg bg-[#ff6c37] px-5 text-xs font-bold text-white hover:bg-[#ff7a47] disabled:opacity-40">{saving ? "Kaydediliyor..." : "Kaydet"}</button>
        </div>
      </div>
    </div>
  );
}
