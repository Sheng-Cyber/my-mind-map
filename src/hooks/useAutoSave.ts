import { useEffect } from "react";
import { putMap } from "../db/mindMapDb";
import { useMindMapStore } from "../store/mindMapStore";

const AUTOSAVE_DELAY_MS = 650;

export function useAutoSave() {
  const activeMapId = useMindMapStore((state) => state.activeMapId);
  const isHydrated = useMindMapStore((state) => state.isHydrated);
  const dirtyRevision = useMindMapStore((state) => state.dirtyRevision);
  const savedRevision = useMindMapStore((state) => state.savedRevision);
  const markSaving = useMindMapStore((state) => state.markSaving);
  const markSaved = useMindMapStore((state) => state.markSaved);
  const markSaveError = useMindMapStore((state) => state.markSaveError);
  const toRecord = useMindMapStore((state) => state.toRecord);

  useEffect(() => {
    if (!isHydrated || !activeMapId) return;
    if (dirtyRevision === savedRevision) return;

    const timeoutId = window.setTimeout(async () => {
      const record = toRecord();
      if (!record) return;

      markSaving(dirtyRevision);
      try {
        await putMap(record);
        markSaved(dirtyRevision);
      } catch (error) {
        markSaveError();
        console.error("Autosave failed", error);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeMapId,
    dirtyRevision,
    isHydrated,
    markSaving,
    markSaved,
    markSaveError,
    savedRevision,
    toRecord,
  ]);
}
