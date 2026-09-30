import { useEffect, useState } from "react";

import { updateRequestInCollection } from "../services/collectionService";
import {
  loadGlobalHttpSettings,
  saveGlobalHttpSettings,
} from "../services/httpSettingsService";
import type { Collection } from "../types/collection";
import {
  DEFAULT_HTTP_SETTINGS,
  REQUEST_HTTP_SETTING_KEYS,
  type GlobalHttpSettings,
  type RequestHttpSettings,
} from "../types/httpSettings";

interface GlobalHttpSettingsOptions {
  collections: Collection[];
  clearTabOverrides: (keys: Array<keyof RequestHttpSettings>) => void;
  refreshCollections: () => Promise<void>;
}

export function useGlobalHttpSettings({
  collections,
  clearTabOverrides,
  refreshCollections,
}: GlobalHttpSettingsOptions) {
  const [settings, setSettings] = useState<GlobalHttpSettings>(
    DEFAULT_HTTP_SETTINGS,
  );
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadGlobalHttpSettings()
      .then(setSettings)
      .catch((reason) =>
        console.error("Global HTTP settings could not be loaded", reason),
      );
  }, []);

  const openDialog = () => {
    setError(null);
    setOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setOpen(false);
  };

  const save = async (nextSettings: GlobalHttpSettings) => {
    setSaving(true);
    setError(null);
    try {
      const changedGlobalKeys = (
        Object.keys(nextSettings) as Array<keyof GlobalHttpSettings>
      ).filter((key) => nextSettings[key] !== settings[key]);
      const changedKeys = REQUEST_HTTP_SETTING_KEYS.filter((key) =>
        changedGlobalKeys.includes(key),
      ) as Array<keyof RequestHttpSettings>;
      const saved = await saveGlobalHttpSettings(nextSettings);
      setSettings(saved);
      clearTabOverrides(changedKeys);

      for (const collection of collections) {
        for (const savedRequest of collection.requests) {
          if (
            !changedKeys.some(
              (key) => savedRequest.request.settings?.[key] != null,
            )
          ) {
            continue;
          }
          const requestSettings = { ...(savedRequest.request.settings || {}) };
          changedKeys.forEach((key) => delete requestSettings[key]);
          await updateRequestInCollection(
            collection.id,
            savedRequest.id,
            savedRequest.name,
            { ...savedRequest.request, settings: requestSettings },
          );
        }
      }
      if (changedKeys.length > 0) await refreshCollections();
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    open,
    saving,
    error,
    openDialog,
    closeDialog,
    save,
  };
}
