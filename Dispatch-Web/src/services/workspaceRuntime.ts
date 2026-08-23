import type { OpenWorkspace } from "../types/workspace";

let activeWorkspace: OpenWorkspace | null = null;

export function setActiveWorkspace(workspace: OpenWorkspace | null): void {
  activeWorkspace = workspace;
}

export function getActiveWorkspace(): OpenWorkspace {
  if (!activeWorkspace) throw new Error("Önce bir workspace açmalısın.");
  return activeWorkspace;
}

export function updateActiveWorkspace(workspace: OpenWorkspace): void {
  activeWorkspace = workspace;
}

