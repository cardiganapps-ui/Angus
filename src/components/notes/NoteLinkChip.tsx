import type { Note } from "../../types";
import type { NoteLinks } from "../../hooks/useNotes";
import { describeNoteLinks, useNoteLinkLookup } from "../../hooks/useNoteLinkLookup";
import { Icon } from "../Icon";
import { Sheet } from "../Sheet";
import { NoteLinkFields } from "./NoteLinkFields";

/* ── NoteLinkChip ──
   One pill at the top of the editor body that says where the note
   lives. Tapping opens the link sheet; the parent owns `open` so the
   overflow menu can open the same sheet. */
export function NoteLinkChip({
  note,
  open,
  onOpen,
  onClose,
  onChange,
  readOnly
}: {
  note: Note;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (links: NoteLinks) => void;
  readOnly?: boolean;
}) {
  const lookup = useNoteLinkLookup();
  const parts = describeNoteLinks(note, lookup);
  const isLinked = parts.length > 0;

  return (
    <>
      <button
        type="button"
        className={"mde-context-chip" + (isLinked ? " is-linked" : "")}
        onClick={() => !readOnly && onOpen()}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={readOnly}
      >
        <span className="mde-context-icon">
          <Icon name="link" size={13} strokeWidth={2.2} />
        </span>
        <span className="mde-context-label">{isLinked ? parts.join(" · ") : "Sin vincular"}</span>
        {!readOnly && (
          <span className="mde-context-chevron">
            <Icon name="chevron-down" size={14} />
          </span>
        )}
      </button>

      {open && (
        <Sheet
          title="Vincular nota"
          onClose={onClose}
          footer={
            <div className="sheet-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Listo
              </button>
            </div>
          }
        >
          <NoteLinkFields value={note} onChange={onChange} />
        </Sheet>
      )}
    </>
  );
}
