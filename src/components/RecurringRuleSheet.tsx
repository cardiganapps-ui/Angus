import { useId, useState } from "react";
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
import { domId, makeId } from "../utils/id";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { formatShort, todayISO } from "../utils/dates";
import { formatMXN } from "../utils/money";
import { monthlyEquivalent, nextOccurrence, periodKeyFamily } from "../utils/recurrence";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

const KIND_ITEMS = RECURRENCE_KIND.map((k) => ({ k: k.value, l: k.label }));
const CADENCE_OPTIONS = RECURRENCE_CADENCE.map((c) => ({ value: c.value, label: c.label }));

/* Editing a rule never touches the rows it already generated — that is
   deliberate for an amount change ("solo afecta los siguientes"), but
   three edits corrupt money rather than just drifting:

     - cadence across period-key families: the same September, keyed
       "2026-09" and again as Mondays, cannot collide on the unique
       index, so it is billed twice;
     - an earlier start date, or a smaller interval: both back-fill
       periods that already closed, rewriting months she has read.

   Until the reconciliation pass lands (a "solo los próximos / regenerar"
   scope choice, like EventSheet's), the sheet simply doesn't offer them.
   Slowing a rule down, ending it, pausing it and changing its amount all
   stay available, which is every edit she actually makes. */

export function RecurringRuleSheet({
  rule,
  initialKind = "expense",
  onClose
}: {
  rule: RecurringRule | null;
  initialKind?: RecurrenceKind;
  onClose: () => void;
}) {
  const { addRule, updateRule, removeRule, contacts, projects, courses } = useApp();
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
  const [courseId, setCourseId] = useState(rule?.courseId ?? "");
  const [notes, setNotes] = useState(rule?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const uid = domId(useId());
  const dirty = useDirtyGuard({
    kind, title, amount, category, cadence, interval, startDate, endDate,
    contactId, projectId, courseId, notes
  });

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
    parsedInterval >= (rule ? rule.interval : 1) &&
    parsedInterval <= 12 &&
    startDate.length > 0 &&
    (!rule || startDate >= rule.startDate) &&
    (!endDate || endDate >= startDate) &&
    validCategory;

  // Editing: the already-generated rows pin what may still change.
  const locked = rule !== null;
  const cadenceOptions = locked
    ? CADENCE_OPTIONS.filter((o) => periodKeyFamily(o.value) === periodKeyFamily(rule.cadence))
    : CADENCE_OPTIONS;
  const minInterval = locked ? rule.interval : 1;
  const minStartDate = locked ? rule.startDate : undefined;

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

  /* Awaits the write. It used to fire-and-forget, then unconditionally
     buzz, toast "Regla actualizada" and close — so a rejected save
     announced itself as a success and the sheet was already gone by the
     time the error toast arrived. The store resolves a boolean for
     exactly this. */
  async function handleSave() {
    if (!canSave || submitting) return;
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
      courseId: kind === "expense" ? courseId || null : null,
      notes: notes.trim()
    };
    const ok = rule
      ? await updateRule(rule.id, patch)
      : await addRule({ id: makeId(), createdAt: todayISO(), active: true, groupId: null, ...patch });
    if (!ok) {
      // The store already reverted and surfaced why; stay open so her
      // typing isn't lost and she can retry.
      setSubmitting(false);
      return;
    }
    haptic.success();
    showSuccess(rule ? "Regla actualizada" : kind === "income" ? "Ingreso fijo creado" : "Gasto fijo creado");
    onClose();
  }

  async function handleDelete() {
    if (!rule || submitting) return;
    setSubmitting(true);
    await removeRule(rule.id);
    haptic.warn();
    showSuccess("Regla eliminada");
    onClose();
  }

  return (
    <Sheet
      title={rule ? "Editar regla" : kind === "income" ? "Nuevo ingreso fijo" : "Nuevo gasto fijo"}
      onClose={safeClose}
      dirty={dirty}
      discardText={
        rule
          ? "¿Descartar los cambios? La regla se queda como estaba."
          : "¿Descartar? Esta regla no se guarda y no generará movimientos."
      }
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={rule ? () => void handleDelete() : undefined}
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
          autoFocus={rule === null && prefersAutoFocus()}
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
            min={minInterval}
            max={12}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </div>
      </div>

      <div className="input-group">
        <span className="input-label">Frecuencia</span>
        <ChipSelect
          options={cadenceOptions}
          value={cadence}
          onChange={setCadence}
          ariaLabel="Frecuencia"
        />
        {next && (
          <div className="input-help">
            Próximo: {formatShort(next)} · equivale a {formatMXN(perMonth)} al mes.
          </div>
        )}
        {locked && cadenceOptions.length < CADENCE_OPTIONS.length && (
          <div className="input-help">
            Para cambiar entre semanas y meses, crea una regla nueva y termina esta: los movimientos
            ya registrados se contarían dos veces.
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
            min={minStartDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {locked && (
            <div className="input-help">Solo hacia adelante: mover la fecha atrás recalcularía meses ya cerrados.</div>
          )}
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
        <span className="input-label" id={`${uid}-contact`}>{kind === "income" ? "Quién paga" : "A quién le pagas"}</span>
        <PickerField
          labelId={`${uid}-contact`}
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
        <span className="input-label" id={`${uid}-project`}>Pieza relacionada</span>
        <PickerField labelId={`${uid}-project`} title="Pieza relacionada" options={projectOptions} value={projectId} onChange={setProjectId} />
      </div>

      {kind === "expense" && courses.length > 0 && (
        <div className="input-group">
          <span className="input-label" id={`${uid}-course`}>Curso que tomas</span>
          <PickerField
            labelId={`${uid}-course`}
            title="Curso"
            options={courses
              .filter((c) => c.status === "active" || c.status === "upcoming" || c.id === courseId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => ({ value: c.id, label: c.name }))}
            value={courseId}
            onChange={setCourseId}
          />
        </div>
      )}

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
