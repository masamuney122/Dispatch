import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem } from "../types/history";

export async function saveHistory(item: HistoryItem): Promise<void> {
    await invoke("save_history", { item });
}

export async function loadHistory(): Promise<HistoryItem[]> {
    return await invoke<HistoryItem[]>("load_history");
}

export async function clearHistory(): Promise<void> {
    await invoke("clear_history");
}

export async function deleteHistoryItem(id: string): Promise<void> {
    await invoke("delete_history_item", { id });
}
