import { useState } from "react";

import { WorkspaceLauncher } from "./components/workspace/WorkspaceLauncher";
import { ApiClientLayout } from "./components/ApiClientLayout";
import { setActiveWorkspace } from "./services/workspaceRuntime";
import type { OpenWorkspace } from "./types/workspace";

export default function App() {
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null);

  const openWorkspace = (nextWorkspace: OpenWorkspace) => {
    setActiveWorkspace(nextWorkspace);
    setWorkspace(nextWorkspace);
  };

  const closeWorkspace = async () => {
    setActiveWorkspace(null);
    setWorkspace(null);
  };

  return workspace ? (
    <ApiClientLayout
      workspaceName={workspace.bundle.manifest.name}
      onChangeWorkspace={closeWorkspace}
    />
  ) : (
    <WorkspaceLauncher onOpen={openWorkspace} />
  );
}
