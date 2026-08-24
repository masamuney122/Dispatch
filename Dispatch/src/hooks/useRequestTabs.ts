import { useState } from "react";
import type { RequestTabState, WorkspaceTab } from "../types/tab";
import { createDefaultTab } from "../types/tab";
import type { TabInfo } from "../components/layout/RequestTabsBar";
import type { RequestHttpSettings } from "../types/httpSettings";

/**
 * Manages the collection of open request tabs:
 * adding, closing, switching, and updating tab state.
 */
export function useRequestTabs() {
  const [initialRequest] = useState(() => createDefaultTab(1));
  const [tabs, setTabs] = useState<RequestTabState[]>([initialRequest]);
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>([
    { id: initialRequest.id, kind: "request", requestId: initialRequest.id },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(initialRequest.id);

  const activeWorkspaceTab =
    workspaceTabs.find((tab) => tab.id === activeTabId) || workspaceTabs[0];
  const activeTab =
    activeWorkspaceTab?.kind === "request"
      ? tabs.find((tab) => tab.id === activeWorkspaceTab.requestId) || tabs[0]
      : tabs[tabs.length - 1] || initialRequest;
  const activeEnvironmentId =
    activeWorkspaceTab?.kind === "environment"
      ? activeWorkspaceTab.environmentId
      : null;

  const updateActiveTab = (updates: Partial<RequestTabState>) => {
    if (!activeTab) return;
    const editableKeys: Array<keyof RequestTabState> = [
      "title",
      "method",
      "url",
      "queryParams",
      "headers",
      "body",
      "bodyType",
      "formFields",
      "binary",
      "auth",
      "settings",
    ];
    const marksDirty = editableKeys.some((key) => key in updates);
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              ...updates,
              isDirty: updates.isDirty ?? (marksDirty ? true : tab.isDirty),
            }
          : tab
      )
    );
  };

  const clearHttpSettingOverrides = (keys: Array<keyof RequestHttpSettings>) => {
    if (keys.length === 0) return;
    setTabs((current) =>
      current.map((tab) => {
        const settings = { ...tab.settings };
        keys.forEach((key) => delete settings[key]);
        return { ...tab, settings };
      })
    );
  };

  const handleAddTab = () => {
    const newTab = createDefaultTab(tabs.length + 1);
    setTabs((prev) => [...prev, newTab]);
    setWorkspaceTabs((prev) => [
      ...prev,
      { id: newTab.id, kind: "request", requestId: newTab.id },
    ]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (idToClose: string) => {
    const tabToClose = workspaceTabs.find((tab) => tab.id === idToClose);
    if (!tabToClose) return;

    if (workspaceTabs.length === 1) {
      const freshTab = createDefaultTab(1);
      setTabs([freshTab]);
      setWorkspaceTabs([
        { id: freshTab.id, kind: "request", requestId: freshTab.id },
      ]);
      setActiveTabId(freshTab.id);
      return;
    }

    if (tabToClose.kind === "request" && tabs.length === 1) {
      const freshTab = createDefaultTab(1);
      setTabs([freshTab]);
      setWorkspaceTabs((current) =>
        current.map((tab) =>
          tab.id === idToClose
            ? { id: freshTab.id, kind: "request", requestId: freshTab.id }
            : tab
        )
      );
      if (activeTabId === idToClose) setActiveTabId(freshTab.id);
      return;
    }

    const closingIndex = workspaceTabs.findIndex((tab) => tab.id === idToClose);
    const nextWorkspaceTabs = workspaceTabs.filter(
      (tab) => tab.id !== idToClose
    );
    setWorkspaceTabs(nextWorkspaceTabs);

    if (tabToClose.kind === "request") {
      setTabs((current) =>
        current.filter((tab) => tab.id !== tabToClose.requestId)
      );
    }

    if (activeTabId === idToClose) {
      const nextIndex = Math.min(closingIndex, nextWorkspaceTabs.length - 1);
      setActiveTabId(nextWorkspaceTabs[nextIndex].id);
    }
  };

  const openEnvironmentTab = (environmentId: string) => {
    const environmentTab: WorkspaceTab = {
      id: `environment:${environmentId}`,
      kind: "environment",
      environmentId,
    };
    setWorkspaceTabs((current) =>
      current.some(
        (tab) =>
          tab.kind === "environment" &&
          tab.environmentId === environmentId
      )
        ? current
        : [...current, environmentTab]
    );
    setActiveTabId(environmentTab.id);
  };

  const closeEnvironmentTab = (environmentId: string) => {
    const environmentTab = workspaceTabs.find(
      (tab) =>
        tab.kind === "environment" && tab.environmentId === environmentId
    );
    if (environmentTab) handleCloseTab(environmentTab.id);
  };

  const activateRequestTab = () => {
    if (activeWorkspaceTab?.kind === "request") return;
    const requestWorkspaceTab = [...workspaceTabs]
      .reverse()
      .find((tab) => tab.kind === "request");
    if (requestWorkspaceTab) setActiveTabId(requestWorkspaceTab.id);
  };

  const handleReorderTab = (
    draggedTabId: string,
    targetTabId: string,
    position: "before" | "after"
  ) => {
    if (draggedTabId === targetTabId) return;

    setWorkspaceTabs((current) => {
      const draggedTab = current.find((tab) => tab.id === draggedTabId);
      if (!draggedTab) return current;

      const withoutDragged = current.filter((tab) => tab.id !== draggedTabId);
      const targetIndex = withoutDragged.findIndex(
        (tab) => tab.id === targetTabId
      );
      if (targetIndex === -1) return current;

      const insertIndex =
        position === "after" ? targetIndex + 1 : targetIndex;
      const reordered = [...withoutDragged];
      reordered.splice(insertIndex, 0, draggedTab);
      return reordered.every((tab, index) => tab.id === current[index].id)
        ? current
        : reordered;
    });
  };

  const tabsInfoList: TabInfo[] = workspaceTabs.map((workspaceTab) => {
    if (workspaceTab.kind === "environment") {
      return {
        id: workspaceTab.id,
        kind: "environment",
        environmentId: workspaceTab.environmentId,
      };
    }

    const requestTab = tabs.find(
      (tab) => tab.id === workspaceTab.requestId
    );
    return {
      id: workspaceTab.id,
      kind: "request",
      title: requestTab?.title || "Untitled Request",
      method: requestTab?.method || "GET",
      url: requestTab?.url || "",
      dirty: requestTab?.isDirty || false,
    };
  });

  return {
    tabs,
    activeTabId,
    activeTab,
    activeEnvironmentId,
    tabsInfoList,
    setActiveTabId,
    updateActiveTab,
    clearHttpSettingOverrides,
    handleAddTab,
    handleCloseTab,
    openEnvironmentTab,
    closeEnvironmentTab,
    activateRequestTab,
    handleReorderTab,
  };
}
