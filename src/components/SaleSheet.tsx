import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Sale, SaleStatus } from "../types";
import { SALE_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { PickerField } from "./PickerField";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

const STATUS_ITEMS = SALE_STATUS.map((s) => ({ k: s.value, l: s.label }));

export function SaleSheet({
  sale,
  onClose,
  onDeleted
}: {
  sale: Sale | null;
  onClose: () => void;
  /** Called instead of onClose after a delete, so a detail sheet
      stacked underneath can close itself too. */
  onDeleted?: () => void;
}) {
  const { addSale, updateSale, removeSale, projects, contacts } = useApp();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(sale?.title ?? "");
  const [amount, setAmount] = useState(sale?.amount?.toString() ?? "");
  const [date, setDate] = useState(sale?.date ?? todayISO());
  const [status, setStatus] = useState<SaleStatus>(sale?.status ?? "confirmed");
  const [projectId, setProjectId] = useState(sale?.projectId ?? "");
  const [contactId, setContactId] = useState(sale?.contactId ?? "");
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const safeClose = submitting ? null : onClose;
  const parsedAmount = Number(amount);
  const canSave =
    title.trim().length > 0 && amount.trim().length > 0 && parsedAmount > 0 && date.length > 0;

  const projectOptions = [...projects]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ value: p.id, label: p.title }));
  const contactOptions = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      amount: parsedAmount,
      date,
      status,
      projectId: projectId || null,
      contactId: contactId || null,
      notes: notes.trim()
    };
    if (sale) {
      void updateSale(sale.id, patch);
    } else {
      void addSale({ id: makeId(), createdAt: todayISO(), ...patch });
    }
    haptic.success();
    showSuccess(sale ? "Venta actualizada" : "Venta creada");
    onClose();
  }

  function handleDelete() {
    if (!sale) return;
    void removeSale(sale.id);
    haptic.warn();
    showSuccess("Venta eliminada");
    (onDeleted ?? onClose)();
  }

  return (
    <Sheet
      title={sale ? "Editar venta" : "Nueva venta"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={handleSave}
          onDelete={sale ? handleDelete : undefined}
          confirmText="¿Eliminar esta venta? Se eliminarán también sus pagos y cuotas."
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="sale-title">Título</label>
        <input
          id="sale-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Retrato por encargo, pieza en expo..."
          autoFocus={sale === null}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="sale-amount">Monto (MXN)</label>
        <div className="money-input-wrap">
          <span className="money-input-symbol">$</span>
          <input
            id="sale-amount"
            className="input money-input"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="sale-date">Fecha</label>
        <input
          id="sale-date"
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="input-group">
        <span className="input-label">Estado</span>
        <SegmentedControl
          items={STATUS_ITEMS}
          value={status}
          onChange={(k) => setStatus(k as SaleStatus)}
          size="sm"
          role="radiogroup"
          ariaLabel="Estado de la venta"
        />
        <div className="input-help">
          Solo las ventas confirmadas y entregadas cuentan para lo que te deben.
        </div>
      </div>

      <div className="input-group">
        <span className="input-label">Proyecto</span>
        <PickerField
          title="Proyecto"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
        />
      </div>

      <div className="input-group">
        <span className="input-label">Cliente</span>
        <PickerField
          title="Cliente"
          options={contactOptions}
          value={contactId}
          onChange={setContactId}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="sale-notes">Notas</label>
        <textarea
          id="sale-notes"
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
