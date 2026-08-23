import { useState } from "react";

import { WorkspaceLauncher } from "./components/WorkspaceLauncher";
import { WorkspaceOverview } from "./components/WorkspaceOverview";
import type { OpenWorkspace } from "./types/workspace";

export default function App() {
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null);

  return workspace ? (
    <WorkspaceOverview
      workspace={workspace}
      onWorkspaceChange={setWorkspace}
      onClose={() => setWorkspace(null)}
    />
  ) : (
    <WorkspaceLauncher onOpen={setWorkspace} />
  );
}
