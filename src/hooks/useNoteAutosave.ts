import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "../lib/haptics";

/* ── Note autosave ──
   The debounced save lifecycle of the note editor:

     • an 800 ms debounce + the "saved | saving | dirty" indicator
     • scheduleSave(title, content) — the per-keystroke debounced write;
       a failure re-arms the pending args and reports, so the indicator
       stays "dirty" instead of lying
     • an unmount flush — persists the last typed text if the editor is
       torn down mid-debounce, so a note switch never drops her words
     • cancelPending() — for paths that persist explicitly (close,
       version restore) and must not let the flush double-write

   onSave / readOnly are read through a ref at fire time, so
   scheduleSave and cancelPending stay referentially stable. */

export interface AutosaveData {
  title: string;
  content: string;
}

export type SaveState = "saved" | "saving" | "dirty";

export interface NoteAutosaveOptions {
  onSave: (data: AutosaveData) => Promise<unknown> | unknown;
  readOnly?: boolean;
  onSaveFailed?: () => void;
}

export function useNoteAutosave(opts: NoteAutosaveOptions) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveArgs = useRef<AutosaveData | null>(null);

  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  const scheduleSave = useCallback((title: string, content: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSaveArgs.current = { title, content };
    setSaveState("dirty");
    saveTimer.current = setTimeout(async () => {
      pendingSaveArgs.current = null;
      setSaveState("saving");
      try {
        await latest.current.onSave({ title, content });
        setSaveState("saved");
      } catch {
        pendingSaveArgs.current = { title, content };
        setSaveState("dirty");
        haptic.warn();
        latest.current.onSaveFailed?.();
      }
    }, 800);
  }, []);

  const cancelPending = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSaveArgs.current = null;
  }, []);

  /* Put a rejected save back in the queue. `cancelPending` disarms the
     unmount flush, which is correct for a path that is about to persist
     explicitly — but only if that persist SUCCEEDS. When it does not, the
     text she typed exists nowhere except the editor's React state, and
     whatever was going to unmount it is about to destroy it. Re-arming
     restores the last-ditch flush and lets the next keystroke retry. */
  const armPending = useCallback((args: { title: string; content: string }) => {
    pendingSaveArgs.current = args;
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const pending = pendingSaveArgs.current;
      if (pending && !latest.current.readOnly) {
        pendingSaveArgs.current = null;
        try {
          Promise.resolve(latest.current.onSave(pending)).catch(() => {});
        } catch {
          /* the dirty indicator + next mount cover it */
        }
      }
    },
    []
  );

  return { saveState, setSaveState, scheduleSave, cancelPending, armPending };
}
