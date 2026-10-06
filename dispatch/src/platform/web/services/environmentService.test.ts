import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyEnvironmentMutationCore,
  getActiveWorkspace,
  readActiveEnvironment,
  saveEnvironmentsDocument,
  storeActiveEnvironment,
  updateActiveWorkspace,
} = vi.hoisted(() => ({
  applyEnvironmentMutationCore: vi.fn(),
  getActiveWorkspace: vi.fn(),
  readActiveEnvironment: vi.fn(),
  saveEnvironmentsDocument: vi.fn(),
  storeActiveEnvironment: vi.fn(),
  updateActiveWorkspace: vi.fn(),
}));

vi.mock("./wasmClient", () => ({ applyEnvironmentMutationCore }));
vi.mock("./workspaceRuntime", () => ({ getActiveWorkspace, updateActiveWorkspace }));
vi.mock("../adapters/fileSystem/workspaceFileSystem", () => ({ saveEnvironmentsDocument }));
vi.mock("../adapters/indexedDb/preferences", () => ({
  getActiveEnvironment: readActiveEnvironment,
  setActiveEnvironment: storeActiveEnvironment,
}));

import {
  createEnvironment,
  deleteEnvironment,
  setActiveEnvironment,
  updateEnvironment,
} from "./environmentService";

describe("web environment adapter", () => {
  const workspace = {
    bundle: {
      manifest: { id: "workspace-1" },
      environments: { revision: 0, environments: [] },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getActiveWorkspace.mockReturnValue(workspace);
    readActiveEnvironment.mockResolvedValue("");
    saveEnvironmentsDocument.mockResolvedValue(workspace);
  });

  it("delegates creation to core and persists the returned document", async () => {
    const environment = { id: "environment-1", name: "Local", variables: {} };
    const environments = [environment];
    applyEnvironmentMutationCore.mockResolvedValue({
      environments,
      active_environment_id: null,
      environment,
    });

    await expect(createEnvironment("Local", {})).resolves.toBe(environment);
    expect(applyEnvironmentMutationCore.mock.calls[0][2]).toEqual({
      action: "create",
      name: "Local",
      variables: {},
    });
    expect(saveEnvironmentsDocument.mock.calls[0][1].environments).toBe(environments);
    expect(updateActiveWorkspace).toHaveBeenCalledWith(workspace);
  });

  it("clears persisted selection when core deletes the active environment", async () => {
    readActiveEnvironment.mockResolvedValue("environment-1");
    applyEnvironmentMutationCore.mockResolvedValue({
      environments: [],
      active_environment_id: null,
      environment: null,
    });
    await deleteEnvironment("environment-1");
    expect(storeActiveEnvironment).toHaveBeenCalledWith("workspace-1", "");
  });

  it("validates active selection through core without rewriting the document", async () => {
    applyEnvironmentMutationCore.mockResolvedValue({
      environments: [],
      active_environment_id: "environment-1",
      environment: null,
    });
    await setActiveEnvironment("environment-1");
    expect(saveEnvironmentsDocument).not.toHaveBeenCalled();
    expect(storeActiveEnvironment).toHaveBeenCalledWith("workspace-1", "environment-1");
  });

  it("serializes concurrent document mutations", async () => {
    const environment = { id: "environment-1", name: "Local", variables: {} };
    applyEnvironmentMutationCore.mockResolvedValue({
      environments: [environment],
      active_environment_id: null,
      environment,
    });

    let releaseFirstSave!: () => void;
    let firstSaveStarted!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      firstSaveStarted = resolve;
    });
    const firstSave = new Promise<typeof workspace>((resolve) => {
      releaseFirstSave = () => resolve(workspace);
    });
    saveEnvironmentsDocument
      .mockImplementationOnce(() => {
        firstSaveStarted();
        return firstSave;
      })
      .mockResolvedValue(workspace);

    const first = updateEnvironment("environment-1", "First", {});
    await saveStarted;
    const second = updateEnvironment("environment-1", "Second", {});

    await Promise.resolve();
    expect(applyEnvironmentMutationCore).toHaveBeenCalledTimes(1);

    releaseFirstSave();
    await Promise.all([first, second]);
    expect(applyEnvironmentMutationCore).toHaveBeenCalledTimes(2);
    expect(saveEnvironmentsDocument).toHaveBeenCalledTimes(2);
  });
});
