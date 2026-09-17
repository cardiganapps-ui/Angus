import { useState } from "react";
import { Icon } from "./Icon";
import { useEscape } from "../hooks/useEscape";
import { useApp } from "../context/AppContext";
import type { FabPrimary } from "../context/FabContext";
import { QUICK_ACTION } from "../data/constants";
import type { Note, QuickAction } from "../types";
import { haptic } from "../lib/haptics";
import { SaleSheet } from "./SaleSheet";
import { ExpenseSheet } from "./ExpenseSheet";
import { EventSheet } from "./EventSheet";
import { ProjectSheet } from "./ProjectSheet";
import { ContactSheet } from "./ContactSheet";
import { AssignmentSheet } from "./AssignmentSheet";
import { QuickCaptureSheet } from "./notes/QuickCaptureSheet";
import { NoteEditor } from "./NoteEditor";

/* ── QuickAddFab ──
   The app's one + button. A tap rotates it and fans out what she can
   create: the screen's own primary action nearest her thumb (Agenda
   offers the selected day, Dinero offers a gasto when she is looking at
   gastos), then the quick actions from settings.quickActions. Mirrors
   Cardigan's QuickActions: one FAB for the whole app, owning the
   generic create sheets, so "new anything" is two taps from anywhere
   instead of menu → screen → +.

   Uses the speed-dial vocabulary in components.css (.fab-overlay /
   .fab-menu / .fab-action); the FAB and its menu are hidden by the
   body:has(.sheet-overlay) rule while any sheet is open. */

type OpenSheet =
  | { kind: "sale" }
  | { kind: "expense" }
  | { kind: "event" }
  | { kind: "project" }
  | { kind: "contact" }
  | { kind: "assignment" }
  | { kind: "quickNote" }
  | { kind: "note"; note: Note }
  | null;

export function QuickAddFab({ primary, hidden }: { primary: FabPrimary | null; hidden: boolean }) {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  useEscape(open ? () => setOpen(false) : null);

  const quick = settings.quickActions
    .map((value) => QUICK_ACTION.find((a) => a.value === value))
    .filter((a): a is (typeof QUICK_ACTION)[number] => !!a)
    .filter((a) => a.value !== primary?.key);

  function pickQuick(action: QuickAction) {
    haptic.tap();
    setOpen(false);
    setSheet(action === "note" ? { kind: "quickNote" } : { kind: action });
  }

  function pickPrimary() {
    haptic.tap();
    setOpen(false);
    primary?.onPick();
  }

  // DOM order is top → bottom; the last item sits nearest the FAB, so
  // the primary goes last and the quick actions are reversed above it,
  // keeping her configured order reading downward toward her thumb.
  const items: { key: string; label: string; icon: (typeof QUICK_ACTION)[number]["icon"]; onPick: () => void }[] = [
    ...[...quick].reverse().map((a) => ({ key: a.value, label: a.label, icon: a.icon, onPick: () => pickQuick(a.value) })),
    ...(primary ? [{ key: primary.key, label: primary.label, icon: primary.icon, onPick: pickPrimary }] : [])
  ];

  return (
    <>
      {!hidden && open && (
        <>
          <div className="fab-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fab-menu" role="menu" aria-label="Crear">
            {items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="fab-action"
                style={{ animationDelay: `${(items.length - 1 - i) * 35}ms` }}
                onClick={item.onPick}
              >
                <span className="fab-action-label">{item.label}</span>
                <span className="fab-action-icon">
                  <Icon name={item.icon} size={18} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {!hidden && (
        <button
          type="button"
          className={`fab ${open ? "fab-open" : ""}`}
          aria-label={open ? "Cerrar" : "Crear"}
          aria-expanded={open}
          onClick={() => {
            haptic.tap();
            setOpen((v) => !v);
          }}
        >
          <Icon name="plus" size={24} strokeWidth={2.2} />
        </button>
      )}

      {sheet?.kind === "sale" && <SaleSheet sale={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "expense" && <ExpenseSheet expense={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "event" && <EventSheet event={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "project" && <ProjectSheet project={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "contact" && <ContactSheet contact={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "assignment" && <AssignmentSheet assignment={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "quickNote" && (
        <QuickCaptureSheet
          onClose={() => setSheet((s) => (s?.kind === "quickNote" ? null : s))}
          onSaved={(note, { openInEditor }) => {
            if (openInEditor) setSheet({ kind: "note", note });
          }}
        />
      )}
      {sheet?.kind === "note" && <NoteEditor key={sheet.note.id} note={sheet.note} onClose={() => setSheet(null)} />}
    </>
  );
}
