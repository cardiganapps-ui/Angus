import { createContext, useContext, useEffect, useRef } from "react";
import type { IconName } from "../components/Icon";

/* ── The one FAB ──
   There is a single + button for the whole app (components/QuickAddFab,
   mounted once in App.tsx). Every screen may hand it ONE primary action —
   what "+" most obviously means here: a piece on Obra, an event on the
   selected day in Agenda, a gasto when Dinero is on Gastos — and that
   action sits nearest her thumb, above the quick actions from settings.
   A screen with nothing to add (Ajustes) hides it. */

export interface FabPrimary {
  /** Dedupes against the quick actions: "sale" on Dinero replaces the generic "Nueva venta". */
  key: string;
  label: string;
  icon: IconName;
  onPick: () => void;
}

export interface FabControl {
  setPrimary: (primary: FabPrimary | null) => void;
  setHidden: (hidden: boolean) => void;
}

const FabContext = createContext<FabControl | null>(null);
export const FabProvider = FabContext.Provider;

/** Register this screen's primary action (and whether the FAB should hide) for as long as it is mounted. */
// eslint-disable-next-line react-refresh/only-export-components
export function useFab(primary: Omit<FabPrimary, "onPick"> & { onPick: () => void } | null, hidden = false): void {
  const ctx = useContext(FabContext);
  // The handler closes over screen state that changes every render
  // (the selected day, the current view); keep the latest one behind a
  // stable reference so the registration itself only re-runs when what
  // the menu SHOWS changes.
  const onPickRef = useRef(primary?.onPick);
  onPickRef.current = primary?.onPick;
  const key = primary?.key ?? null;
  const label = primary?.label ?? null;
  const icon = primary?.icon ?? null;

  useEffect(() => {
    if (!ctx) return;
    ctx.setPrimary(
      key && label && icon ? { key, label, icon, onPick: () => onPickRef.current?.() } : null
    );
    return () => ctx.setPrimary(null);
  }, [ctx, key, label, icon]);

  useEffect(() => {
    if (!ctx) return;
    ctx.setHidden(hidden);
    return () => ctx.setHidden(false);
  }, [ctx, hidden]);
}
