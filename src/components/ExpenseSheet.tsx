import { useId, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Expense, ExpenseCategory, PaymentMethod } from "../types";
import { EXPENSE_CATEGORY, EXPENSE_GROUPS, PAYMENT_METHOD } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { PickerField } from "./PickerField";
import { useQuickCreate } from "../hooks/useQuickCreate";
import { domId, makeId } from "../utils/id";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

export function ExpenseSheet({
  expense,
  initialEventId,
  initialCourseId,
  initialTitle,
  initialAmount,
  onClose
}: {
  expense: Expense | null;
  /** Pre-link a new expense to an expo. */
  initialEventId?: string;
  /** Pre-link a new expense to a course she takes (category defaults to Cursos). */
  initialCourseId?: string;
  initialTitle?: string;
  initialAmount?: number | null;
  onClose: () => void;
}) {
  const { addExpense, updateExpense, removeExpense, projects, events, rules, courses, settings } = useApp();
  const quick = useQuickCreate();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(expense?.title ?? initialTitle ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? (initialAmount ? String(initialAmount) : ""));
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? (initialCourseId ? "courses" : "materials"));
  const [courseId, setCourseId] = useState(expense?.courseId ?? initialCourseId ?? "");
  const [method, setMethod] = useState<PaymentMethod | "">(expense?.method ?? "");
  const rule = expense?.recurringRuleId ? rules.find((r) => r.id === expense.recurringRuleId) : null;
  const [projectId, setProjectId] = useState(expense?.projectId ?? "");
  const [eventId, setEventId] = useState(expense?.eventId ?? initialEventId ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const uid = domId(useId());
  const dirty = useDirtyGuard({ title, amount, date, category, courseId, method, projectId, eventId, notes });

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
  const courseOptions = courses
    .filter((c) => c.status === "active" || c.status === "upcoming" || c.id === courseId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));

  async function handleSave() {
    if (!canSave || submitting) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      amount: parsedAmount,
      date,
      category,
      method: method || null,
      projectId: projectId || null,
      eventId: eventId || null,
      courseId: courseId || null,
      notes: notes.trim()
    };
    const ok = expense
      ? await updateExpense(expense.id, patch)
      : await addExpense({
          id: makeId(),
          createdAt: todayISO(),
          recurringRuleId: null,
          periodKey: null,
          ...patch
        });
    if (!ok) {
      // The store reverted and reported why; keep her input on screen.
      setSubmitting(false);
      return;
    }
    haptic.success();
    showSuccess(expense ? "Gasto actualizado" : "Gasto registrado");
    onClose();
  }

  async function handleDelete() {
    if (!expense || submitting) return;
    setSubmitting(true);
    if (!(await removeExpense(expense.id))) {
      // The store reverted and reported why; nothing was removed.
      setSubmitting(false);
      return;
    }
    haptic.warn();
    showSuccess("Gasto eliminado");
    onClose();
  }

  return (
    <Sheet
      title={expense ? "Editar gasto" : "Nuevo gasto"}
      onClose={safeClose}
      dirty={dirty}
      discardText={
        expense
          ? "¿Descartar los cambios? El gasto se queda como estaba."
          : "¿Descartar? Este gasto no queda registrado."
      }
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={expense ? () => void handleDelete() : undefined}
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
          placeholder="Bastidores, renta del taller…"
          autoFocus={expense === null && prefersAutoFocus()}
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
        <span className="input-label" id={`${uid}-project`}>Proyecto</span>
        <PickerField
          labelId={`${uid}-project`}
          title="Proyecto"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          onCreate={(name) => quick.project(name, { status: "in_progress", courseId: courseId || null })}
          createLabel="Nueva pieza"
        />
      </div>

      <div className="input-group">
        <span className="input-label" id={`${uid}-expo`}>Expo</span>
        <PickerField
          labelId={`${uid}-expo`}
          title="Expo"
          options={expoOptions}
          value={eventId}
          onChange={setEventId}
          onCreate={(name) => quick.expo(name, date)}
          createLabel="Nueva expo"
        />
      </div>

      {(settings.practice.includes("studies") || courses.length > 0) && (
        <div className="input-group">
          <span className="input-label" id={`${uid}-course`}>Curso que tomas</span>
          <PickerField
            labelId={`${uid}-course`}
            title="Curso"
            options={courseOptions}
            value={courseId}
            onChange={setCourseId}
            onCreate={(name) => quick.course(name)}
            createLabel="Nuevo curso"
          />
        </div>
      )}

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
