import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { RecurrenceCadence, RecurrenceKind, RecurringRule } from "../types";
import {
  EXPENSE_CATEGORY,
  EXPENSE_GROUPS,
  INCOME_CATEGORY,
  RECURRENCE_CADENCE,
  RECURRENCE_KIND
} from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { ChipSelect } from "./ChipSelect";
import { PickerField } from "./PickerField";
import { makeId } from "../utils/id";
import { formatShort, todayISO } from "../utils/dates";
import { formatMXN } from "../utils/money";
import { monthlyEquivalent, nextOccurrence } from "../utils/recurrence";
import { haptic } from "../lib/haptics";

const KIND_ITEMS = RECURRENCE_KIND.map((k) => ({ k: k.value, l: k.label }));
const CADENCE_OPTIONS = RECURRENCE_CADENCE.map((c) => ({ value: c.value, label: c.label }));

export function RecurringRuleSheet({
  rule,
  initialKind = "expense",
  onClose
}: {
  rule: RecurringRule | null;
  initialKind?: RecurrenceKind;
  onClose: () => void;
}) {
  const { addRule, updateRule, removeRule, contacts, projects } = useApp();
  const { showSuccess } = useToast();
  const [kind, setKind] = useState<RecurrenceKind>(rule?.kind ?? initialKind);
  const [title, setTitle] = useState(rule?.title ?? "");
  const [amount, setAmount] = useState(rule?.amount?.toString() ?? "");
  const [category, setCategory] = useState(rule?.category ?? (initialKind === "income" ? "class" : "rent"));
  const [cadence, setCadence] = useState<RecurrenceCadence>(rule?.cadence ?? "monthly");
  const [interval, setInterval] = useState(String(rule?.interval ?? 1));
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(rule?.endDate ?? "");
  const [contactId, setContactId] = useState(rule?.contactId ?? "");
  const [projectId, setProjectId] = useState(rule?.projectId ?? "");
  const [notes, setNotes] = useState(rule?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const safeClose = submitting ? null : onClose;
  const parsedAmount = Number(amount);
  const parsedInterval = Number(interval);
  const validCategory =
    kind === "income"
      ? INCOME_CATEGORY.some((c) => c.value === category)
      : EXPENSE_CATEGORY.some((c) => c.value === category);
  const canSave =
    title.trim().length > 0 &&
    parsedAmount > 0 &&
    Number.isInteger(parsedInterval) &&
    parsedInterval >= 1 &&
    parsedInterval <= 12 &&
    startDate.length > 0 &&
    (!endDate || endDate >= startDate) &&
    validCategory;

  const draft = { cadence, interval: parsedInterval || 1, startDate, endDate: endDate || null, active: true };
  const next = canSave ? nextOccurrence(draft, todayISO()) : null;
  const perMonth = canSave ? monthlyEquivalent({ amount: parsedAmount, cadence, interval: parsedInterval }) : 0;

  const contactOptions = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  const projectOptions = [...projects]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ value: p.id, label: p.title }));

  function switchKind(next: RecurrenceKind) {
    setKind(next);
    setCategory(next === "income" ? "class" : "rent");
  }

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const patch = {
      kind,
      title: title.trim(),
      amount: parsedAmount,
      category,
      cadence,
      interval: parsedInterval,
      startDate,
      endDate: endDate || null,
      contactId: contactId || null,
      projectId: projectId || null,
      notes: notes.trim()
    };
    if (rule) {
      void updateRule(rule.id, patch);
    } else {
      void addRule({ id: makeId(), createdAt: todayISO(), active: true, groupId: null, ...patch });
    }
    haptic.success();
    showSuccess(rule ? "Regla actualizada" : kind === "income" ? "Ingreso fijo creado" : "Gasto fijo creado");
    onClose();
  }

  function handleDelete() {
    if (!rule) return;
    void removeRule(rule.id);
    haptic.warn();
    showSuccess("Regla eliminada");
    onClose();
  }

  return (
    <Sheet
      title={rule ? "Editar regla" : kind === "income" ? "Nuevo ingreso fijo" : "Nuevo gasto fijo"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={handleSave}
          onDelete={rule ? handleDelete : undefined}
          confirmText="¿Eliminar esta regla? Los movimientos ya registrados se conservan."
        />
      }
    >
      {!rule && (
        <div className="input-group">
          <span className="input-label">Tipo</span>
          <SegmentedControl
            items={KIND_ITEMS}
            value={kind}
            onChange={(k) => switchKind(k as RecurrenceKind)}
            size="sm"
            role="radiogroup"
            ariaLabel="Tipo de regla"
          />
        </div>
      )}

      <div className="input-group">
        <label className="input-label" htmlFor="rule-title">Título</label>
        <input
          id="rule-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "income" ? "Colegiatura de Sofía, retainer galería…" : "Renta del taller, Adobe, seguro…"}
          autoFocus={rule === null}
        />
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="rule-amount">Monto (MXN)</label>
          <div className="money-input-wrap">
            <span className="money-input-symbol">$</span>
            <input
              id="rule-amount"
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
          <label className="input-label" htmlFor="rule-interval">Cada</label>
          <input
            id="rule-interval"
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </div>
      </div>

      <div className="input-group">
        <span className="input-label">Frecuencia</span>
        <ChipSelect
          options={CADENCE_OPTIONS}
          value={cadence}
          onChange={setCadence}
          ariaLabel="Frecuencia"
        />
        {next && (
          <div className="input-help">
            Próximo: {formatShort(next)} · equivale a {formatMXN(perMonth)} al mes.
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="rule-start">Desde</label>
          <input
            id="rule-start"
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="rule-end">Hasta</label>
          <input
            id="rule-end"
            className="input"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="input-group">
        <span className="input-label">Categoría</span>
        {kind === "income" ? (
          <ChipSelect
            options={INCOME_CATEGORY}
            value={category as (typeof INCOME_CATEGORY)[number]["value"]}
            onChange={setCategory}
            ariaLabel="Tipo de ingreso"
          />
        ) : (
          EXPENSE_GROUPS.map((group) => (
            <div key={group} className="chip-group">
              <div className="chip-group-title">{group}</div>
              <ChipSelect
                options={EXPENSE_CATEGORY.filter((c) => c.group === group)}
                value={category as (typeof EXPENSE_CATEGORY)[number]["value"]}
                onChange={setCategory}
                ariaLabel={`Categoría · ${group}`}
              />
            </div>
          ))
        )}
      </div>

      <div className="input-group">
        <span className="input-label">{kind === "income" ? "Quién paga" : "A quién le pagas"}</span>
        <PickerField
          title={kind === "income" ? "Quién paga" : "A quién le pagas"}
          options={contactOptions}
          value={contactId}
          onChange={setContactId}
        />
        {kind === "income" && (
          <div className="input-help">Con un contacto, cada cobro pendiente aparece en su saldo.</div>
        )}
      </div>

      <div className="input-group">
        <span className="input-label">Pieza relacionada</span>
        <PickerField title="Pieza relacionada" options={projectOptions} value={projectId} onChange={setProjectId} />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="rule-notes">Notas</label>
        <textarea
          id="rule-notes"
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="input-help" style={{ marginBottom: 8 }}>
        {kind === "income"
          ? "Cada periodo Angus crea la venta por ti; tú solo marcas cuando te pagan."
          : "Cada periodo Angus registra el gasto por ti. Cambiar el monto solo afecta los siguientes."}
      </div>
    </Sheet>
  );
}
