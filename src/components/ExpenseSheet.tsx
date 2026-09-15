import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Expense, ExpenseCategory, PaymentMethod } from "../types";
import { EXPENSE_CATEGORY, EXPENSE_GROUPS, PAYMENT_METHOD } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { PickerField } from "./PickerField";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

export function ExpenseSheet({
  expense,
  onClose
}: {
  expense: Expense | null;
  onClose: () => void;
}) {
  const { addExpense, updateExpense, removeExpense, projects, events, rules } = useApp();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "materials");
  const [method, setMethod] = useState<PaymentMethod | "">(expense?.method ?? "");
  const rule = expense?.recurringRuleId ? rules.find((r) => r.id === expense.recurringRuleId) : null;
  const [projectId, setProjectId] = useState(expense?.projectId ?? "");
  const [eventId, setEventId] = useState(expense?.eventId ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const safeClose = submitting ? null : onClose;
  const parsedAmount = Number(amount);
  const canSave =
    title.trim().length > 0 && amount.trim().length > 0 && parsedAmount > 0 && date.length > 0;

  const projectOptions = [...projects]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ value: p.id, label: p.title }));
  // Only expos — a gasto is tied to the event it was spent on, and
  // clases / reuniones don't carry a budget.
  const expoOptions = events
    .filter((e) => e.kind === "expo")
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({ value: e.id, label: e.title }));

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      amount: parsedAmount,
      date,
      category,
      method: method || null,
      projectId: projectId || null,
      eventId: eventId || null,
      notes: notes.trim()
    };
    if (expense) {
      void updateExpense(expense.id, patch);
    } else {
      void addExpense({
        id: makeId(),
        createdAt: todayISO(),
        recurringRuleId: null,
        periodKey: null,
        ...patch
      });
    }
    haptic.success();
    showSuccess(expense ? "Gasto actualizado" : "Gasto registrado");
    onClose();
  }

  function handleDelete() {
    if (!expense) return;
    void removeExpense(expense.id);
    haptic.warn();
    showSuccess("Gasto eliminado");
    onClose();
  }

  return (
    <Sheet
      title={expense ? "Editar gasto" : "Nuevo gasto"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={handleSave}
          onDelete={expense ? handleDelete : undefined}
          confirmText="¿Eliminar este gasto?"
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="expense-title">Título</label>
        <input
          id="expense-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bastidores, renta del taller..."
          autoFocus={expense === null}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="expense-amount">Monto (MXN)</label>
        <div className="money-input-wrap">
          <span className="money-input-symbol">$</span>
          <input
            id="expense-amount"
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
        <label className="input-label" htmlFor="expense-date">Fecha</label>
        <input
          id="expense-date"
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {rule && (
        <div className="money-panel money-panel--compact" style={{ marginBottom: 14 }}>
          <div className="money-submeta">
            Generado por el gasto fijo «{rule.title}». Editar este registro no cambia la regla.
          </div>
        </div>
      )}

      <div className="input-group">
        <span className="input-label">Categoría</span>
        {EXPENSE_GROUPS.map((group) => (
          <div key={group} className="chip-group">
            <div className="chip-group-title">{group}</div>
            <ChipSelect
              options={EXPENSE_CATEGORY.filter((c) => c.group === group)}
              value={category}
              onChange={setCategory}
              ariaLabel={`Categoría · ${group}`}
            />
          </div>
        ))}
      </div>

      <div className="input-group">
        <span className="input-label">Cómo lo pagaste</span>
        <ChipSelect
          options={[{ value: "" as const, label: "Sin especificar" }, ...PAYMENT_METHOD]}
          value={method}
          onChange={setMethod}
          ariaLabel="Método de pago"
        />
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
        <span className="input-label">Expo</span>
        <PickerField title="Expo" options={expoOptions} value={eventId} onChange={setEventId} />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="expense-notes">Notas</label>
        <textarea
          id="expense-notes"
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
