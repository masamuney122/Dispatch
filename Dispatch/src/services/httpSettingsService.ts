import { invoke } from "@tauri-apps/api/core";
import type { GlobalHttpSettings } from "../types/httpSettings";

export async function loadGlobalHttpSettings(): Promise<GlobalHttpSettings> {
  return invoke<GlobalHttpSettings>("get_http_settings");
}

export async function saveGlobalHttpSettings(
  settings: GlobalHttpSettings,
): Promise<GlobalHttpSettings> {
  return invoke<GlobalHttpSettings>("update_http_settings", { settings });
}
