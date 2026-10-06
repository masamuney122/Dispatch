import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PlatformCapabilities } from "../../../types/workspace";

export const platformCapabilities: PlatformCapabilities = {
  desktop: true,
  nativeWindow: true,
  workspaceArchive: true,
  advancedHttpSettings: true,
};

export async function initializePlatform(): Promise<void> {
  const window = getCurrentWindow();
  await Promise.allSettled([window.center(), window.maximize()]);
}

export async function startWindowDrag(): Promise<void> {
  await getCurrentWindow().startDragging();
}

export function registerPlatformServiceWorker(): void {
  // Desktop assets are served by Tauri and do not use a browser service worker.
}
