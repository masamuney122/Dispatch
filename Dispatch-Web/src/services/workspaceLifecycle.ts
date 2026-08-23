type WorkspaceFlusher = () => Promise<void>;

const flushers = new Set<WorkspaceFlusher>();

export function registerWorkspaceFlusher(flusher: WorkspaceFlusher) {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export async function flushWorkspaceChanges() {
  await Promise.all([...flushers].map((flusher) => flusher()));
}
