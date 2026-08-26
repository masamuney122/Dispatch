import type { PlatformCapabilities } from "../../../types/workspace";

export const platformCapabilities: PlatformCapabilities = {
  desktop: false,
  nativeWindow: false,
  workspaceArchive: false,
  advancedHttpSettings: false,
};

export async function initializePlatform(): Promise<void> {
  // Browser windows are managed by the browser/PWA shell.
}

export async function startWindowDrag(): Promise<void> {
  // Browser chrome cannot be dragged by the application.
}

export function registerPlatformServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(serviceWorkerUrl);
  });
}
