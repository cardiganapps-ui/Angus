import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Payment, PaymentMethod } from "../types";
import { PAYMENT_METHOD } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { makeId } from "../utils/id";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { todayISO } from "../utils/dates";
import { formatMXN } from "../utils/money";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

export function PaymentSheet({
  saleId,
  payment,
  owed,
  onClose
}: {
  saleId: string;
  payment: Payment | null;
  /** What the sale still owes — shown as a hint, never auto-filled. */
  owed: number;
  onClose: () => void;
}) {
  const { addPayment, updatePayment, removePayment, settings } = useApp();
  const { showSuccess } = useToast();
  const [amount, setAmount] = useState(payment?.amount?.toString() ?? "");
  const [date, setDate] = useState(payment?.date ?? todayISO());
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? settings.defaultPaymentMethod);
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const dirty = useDirtyGuard({ amount, date, method, notes });

  const safeClose = submitting ? null : onClose;
  const parsedAmount = Number(amount);
  const canSave = amount.trim().length > 0 && parsedAmount > 0 && date.length > 0;

  /* Awaits the write. This is money arriving: "Pago registrado" over a
     rejected insert is the app telling her she has been paid when the
     server never heard about it. The store reverts and reports the
     failure itself, so the sheet just stays open with her input intact. */
  async function handleSave() {
    if (!canSave || submitting) return;
    setSubmitting(true);
    const patch = { amount: parsedAmount, date, method, notes: notes.trim() };
    const ok = payment
      ? await updatePayment(payment.id, patch)
      : await addPayment({ id: makeId(), saleId, createdAt: todayISO(), ...patch });
    if (!ok) {
      setSubmitting(false);
      return;
    }
    haptic.success();
    showSuccess(payment ? "Pago actualizado" : "Pago registrado");
    onClose();
  }

  /* Same rule as handleSave, in the other direction: "Pago eliminado"
     over a rejected delete tells her the money is gone from the books
     while the row is still there. The store reverts and reports it. */
  async function handleDelete() {
    if (!payment || submitting) return;
    setSubmitting(true);
    const ok = await removePayment(payment.id);
    if (!ok) {
      setSubmitting(false);
      haptic.warn();
      return;
    }
    haptic.warn();
    showSuccess("Pago eliminado");
    onClose();
  }

  /* Deleting a payment is the only delete in the app that silently
     rewrites a balance, so the confirm says what it actually does:
     `saleBalance` recomputes owed from the remaining payments,
     `installmentPlan` re-allocates them across the cuotas in due-date
     order, and `profitLoss` (cash basis, by payment date) loses it from
     the month it landed in — which may be a month she has already
     closed and read. */
  const deleteConfirm = payment
    ? `¿Eliminar este pago de ${formatMXN(payment.amount)}? El ingreso vuelve a deber esa cantidad, las cuotas de su plan se recalculan y el mes en que entró deja de contarlo.`
    : "¿Eliminar este pago?";

  return (
    <Sheet
      title={payment ? "Editar pago" : "Registrar pago"}
      onClose={safeClose}
      dirty={dirty}
      discardText={
        payment
          ? "¿Descartar los cambios? El pago se queda como estaba."
          : "¿Descartar? Este pago no queda registrado."
      }
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={payment ? () => void handleDelete() : undefined}
          confirmText={deleteConfirm}
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="payment-amount">Monto (MXN)</label>
        <div className="money-input-wrap">
          <span className="money-input-symbol">$</span>
          <input
            id="payment-amount"
            className="input money-input"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus={payment === null && prefersAutoFocus()}
          />
        </div>
        {owed > 0 && <div className="input-help">Falta por cubrir {formatMXN(owed)}.</div>}
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="payment-date">Fecha</label>
        <input
          id="payment-date"
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="input-group">
        <span className="input-label">Método</span>
        <ChipSelect
          options={PAYMENT_METHOD}
          value={method}
          onChange={setMethod}
          ariaLabel="Método de pago"
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="payment-notes">Notas</label>
        <textarea
          id="payment-notes"
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
