import { useId, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { IncomeCategory, PaymentTerms, Sale, SaleStatus } from "../types";
import { INCOME_CATEGORY, PAYMENT_TERMS, SALE_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { ChipSelect } from "./ChipSelect";
import { PickerField } from "./PickerField";
import { useQuickCreate } from "../hooks/useQuickCreate";
import { PlanBuilder, PlanPreview } from "./PlanBuilder";
import { planRows, type PlanDraft } from "../utils/plan";
import { domId, makeId } from "../utils/id";
import { addMonths, formatShort, todayISO } from "../utils/dates";
import { paidForSale, planMismatch, rebuildPlan } from "../utils/accounting";
import { formatMXN, toCents } from "../utils/money";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

type PlanChoice = "rebuild" | "keep";
const PLAN_CHOICE_ITEMS = [
  { k: "rebuild", l: "Ajustar cuotas" },
  { k: "keep", l: "Dejar el plan" }
];

const STATUS_ITEMS = SALE_STATUS.map((s) => ({ k: s.value, l: s.label }));
const TERMS_ITEMS = PAYMENT_TERMS.map((t) => ({ k: t.value, l: t.short }));

const TERMS_HELP: Record<PaymentTerms, string> = {
  single: "Un solo pago por el total.",
  deposit_balance: "Un anticipo al confirmar y el resto al entregar.",
  installments: "Varias cuotas iguales en fechas fijas."
};

export function SaleSheet({
  sale,
  initialEventId,
  onClose,
  onDeleted
}: {
  sale: Sale | null;
  /** Pre-link a new sale to an expo. */
  initialEventId?: string;
  onClose: () => void;
  /** Called instead of onClose after a delete, so a detail sheet
      stacked underneath can close itself too. */
  onDeleted?: () => void;
}) {
  const {
    addSale,
    updateSale,
    removeSale,
    addInstallments,
    updateInstallment,
    removeInstallments,
    installments,
    payments,
    projects,
    contacts,
    events,
    settings
  } = useApp();
  const { showSuccess, showToast } = useToast();
  const [title, setTitle] = useState(sale?.title ?? "");
  const [amount, setAmount] = useState(sale?.amount?.toString() ?? "");
  const [date, setDate] = useState(sale?.date ?? todayISO());
  const [status, setStatus] = useState<SaleStatus>(sale?.status ?? "confirmed");
  const [category, setCategory] = useState<IncomeCategory>(sale?.category ?? "piece");
  const [terms, setTerms] = useState<PaymentTerms>(sale?.paymentTerms ?? "single");
  const [plan, setPlan] = useState<PlanDraft>({
    depositPercent: settings.defaultDepositPercent,
    balanceDate: addMonths(sale?.date ?? todayISO(), 1),
    count: "3",
    firstDue: addMonths(sale?.date ?? todayISO(), 1),
    frequency: settings.defaultInstallmentFrequency
  });
  const [projectId, setProjectId] = useState(sale?.projectId ?? "");
  const [contactId, setContactId] = useState(sale?.contactId ?? "");
  const [eventId, setEventId] = useState(sale?.eventId ?? initialEventId ?? "");
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [planChoice, setPlanChoice] = useState<PlanChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /* A client, piece or expo she hasn't saved yet is created from the
     picker itself, with only the name — see hooks/useQuickCreate.ts. */
  const quick = useQuickCreate();
  const uid = domId(useId());

  const safeClose = submitting ? null : onClose;
  const parsedAmount = Number(amount);
  // An existing plan is edited from the detail sheet; here we only
  // build one for a NEW sale (or a sale that has none yet).
  const hasPlan = !!sale && installments.some((i) => i.saleId === sale.id);
  const buildsPlan = terms !== "single" && !hasPlan;
  const rows = buildsPlan ? planRows(terms, parsedAmount, date, plan) : null;

  /* Changing the amount of a sale that already has cuotas used to write
     `amount` alone: the plan stopped summing to the sale, forecast.ts
     projected income that wasn't owed and Hoy showed phantom overdue
     cuotas — all of it silent. Now she has to say which she meant, and
     "dejar el plan" is a choice she makes on purpose, not one the app
     makes for her. */
  const amountEdited =
    !!sale && amount.trim().length > 0 && parsedAmount > 0 && toCents(parsedAmount) !== toCents(sale.amount);
  const pendingMismatch =
    sale && hasPlan && amountEdited ? planMismatch({ ...sale, amount: parsedAmount }, installments) : null;
  const rebuild =
    sale && pendingMismatch ? rebuildPlan(sale.id, parsedAmount, installments, payments, todayISO()) : null;

  const canSave =
    title.trim().length > 0 &&
    amount.trim().length > 0 &&
    parsedAmount > 0 &&
    date.length > 0 &&
    (!buildsPlan || rows !== null) &&
    (!pendingMismatch || planChoice !== null);

  const projectOptions = [...projects]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ value: p.id, label: p.title }));
  const contactOptions = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  // Only expos — attributing a sale to a class or a deadline is meaningless.
  const expoOptions = events
    .filter((e) => e.kind === "expo")
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({ value: e.id, label: `${e.title} · ${formatShort(e.date)}`, name: e.title }));

  /* Flipping a paid sale to "cancelada" used to drop that cash out of
     every total with no warning at all. It is now a liability rather
     than a disappearance (see utils/accounting.ts), but she should still
     be told before she does it, not after. */
  const alreadyPaid = sale ? paidForSale(payments, sale.id) : 0;
  const cancellingWithMoney = !!sale && status === "cancelled" && sale.status !== "cancelled" && alreadyPaid > 0;

  async function handleSave() {
    if (!canSave || submitting) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      amount: parsedAmount,
      date,
      status,
      category,
      paymentTerms: terms,
      projectId: projectId || null,
      contactId: contactId || null,
      eventId: eventId || null,
      notes: notes.trim()
    };
    const id = sale?.id ?? makeId();
    const cuotas = rows
      ? rows.map((row) => ({
          id: makeId(),
          saleId: id,
          amount: row.amount,
          dueDate: row.dueDate,
          notes: "",
          createdAt: todayISO()
        }))
      : null;
    /* The sale has to land before its cuotas: they carry its id as an
       FK. Awaited either way now — an "Ingreso y plan de pagos registrados"
       toast over a rejected insert tells her a commitment exists that
       the server never recorded. */
    const ok = sale
      ? await updateSale(sale.id, patch)
      : await addSale({
          id,
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
    /* The sale landed; the plan is a separate write. If it is refused, say
       so precisely — telling her the plan was created when only the sale
       exists is how a payment schedule silently goes missing. */
    const planned = cuotas ? await addInstallments(cuotas) : true;
    /* Same rule for the repair: the new amount is already saved, so a
       half-written plan has to be said out loud. It is recoverable —
       the sale's detail sheet shows the mismatch until it's cuadrado. */
    const rebuilt =
      sale && pendingMismatch && planChoice === "rebuild" && rebuild && !rebuild.unchanged
        ? await applyRebuild(sale.id, rebuild)
        : true;
    haptic.success();
    if (!planned) {
      showToast("Guardamos el ingreso, pero no el plan de pagos. Ábrelo para volver a intentarlo.", "error", {
        persistent: true
      });
    } else if (!rebuilt) {
      showToast(
        "Guardamos el monto, pero no se pudieron ajustar todas las cuotas. Abre el ingreso para terminar de cuadrar el plan.",
        "error",
        { persistent: true }
      );
    } else if (pendingMismatch && planChoice === "rebuild") {
      showSuccess(`Ingreso actualizado · plan ajustado a ${formatMXN(parsedAmount)}`);
    } else if (pendingMismatch) {
      showSuccess(`Ingreso actualizado · el plan sigue en ${formatMXN(pendingMismatch.planned)}`);
    } else {
      showSuccess(sale ? "Ingreso actualizado" : rows ? "Ingreso y plan de pagos registrados" : "Ingreso registrado");
    }
    onClose();
  }

  /** Every leg of a rebuild in one round; false if any of them was refused. */
  async function applyRebuild(saleId: string, next: NonNullable<typeof rebuild>): Promise<boolean> {
    const created = todayISO();
    const done = await Promise.all([
      ...next.updates.map((u) => updateInstallment(u.id, { amount: u.amount })),
      next.removals.length ? removeInstallments(next.removals) : Promise.resolve(true),
      next.additions.length
        ? addInstallments(
            next.additions.map((a) => ({
              id: makeId(),
              saleId,
              amount: a.amount,
              dueDate: a.dueDate,
              notes: "",
              createdAt: created
            }))
          )
        : Promise.resolve(true)
    ]);
    return done.every(Boolean);
  }

  async function handleDelete() {
    if (!sale || submitting) return;
    setSubmitting(true);
    // The sale owns its payments and cuotas, so claiming a delete the
    // server refused would leave her believing money is off the books.
    if (!(await removeSale(sale.id))) {
      setSubmitting(false);
      return;
    }
    haptic.warn();
    showSuccess("Ingreso eliminado");
    (onDeleted ?? onClose)();
  }

  return (
    <Sheet
      title={sale ? "Editar ingreso" : "Nuevo ingreso"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={sale ? () => void handleDelete() : undefined}
          confirmText="¿Eliminar este ingreso? Se eliminarán también sus pagos y cuotas."
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
          placeholder="Retrato por encargo, pieza en expo, colegiatura de marzo…"
          autoFocus={sale === null && prefersAutoFocus()}
        />
      </div>

      <div className="form-row">
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
      </div>

      <div className="input-group">
        <span className="input-label">Tipo de ingreso</span>
        <ChipSelect
          options={INCOME_CATEGORY}
          value={category}
          onChange={setCategory}
          ariaLabel="Tipo de ingreso"
        />
      </div>

      <div className="input-group">
        <span className="input-label">Forma de pago</span>
        <SegmentedControl
          items={TERMS_ITEMS}
          value={terms}
          onChange={(k) => setTerms(k as PaymentTerms)}
          size="sm"
          role="radiogroup"
          ariaLabel="Forma de pago"
        />
        <div className="input-help">
          {hasPlan && terms !== "single"
            ? "El plan de pagos existente se administra desde el ingreso."
            : TERMS_HELP[terms]}
        </div>
      </div>

      {buildsPlan && (
        <PlanBuilder terms={terms} total={parsedAmount} saleDate={date} draft={plan} onChange={setPlan} />
      )}

      {pendingMismatch && (
        <div className="money-panel" style={{ marginBottom: 14 }}>
          <span className="badge badge-amber">Plan sin cuadrar</span>
          <div className="input-help" style={{ marginTop: 8 }}>
            Sus cuotas suman {formatMXN(pendingMismatch.planned)} y el nuevo monto es{" "}
            {formatMXN(parsedAmount)} — {formatMXN(Math.abs(pendingMismatch.difference))} de{" "}
            {pendingMismatch.kind === "over" ? "más" : "menos"}. Dime qué hacer con el plan.
          </div>
          <SegmentedControl
            items={PLAN_CHOICE_ITEMS}
            value={planChoice ?? ""}
            onChange={(k) => setPlanChoice(k as PlanChoice)}
            size="sm"
            role="radiogroup"
            ariaLabel="Qué hacer con el plan de pagos"
            style={{ marginTop: 10 }}
          />
          {planChoice === "rebuild" && rebuild && (
            <>
              <div className="input-help" style={{ marginTop: 10 }}>
                Lo que falta por cobrar se reparte en partes iguales entre las cuotas pendientes, en sus
                mismas fechas. Lo que ya pagaron no se vuelve a repartir.
              </div>
              {rebuild.rows.length > 0 ? (
                <PlanPreview
                  rows={rebuild.rows}
                  label={(i) => `Cuota ${i + 1}`}
                  ariaLabel="Cómo quedaría el plan"
                />
              ) : (
                <div className="money-submeta" style={{ marginTop: 8 }}>
                  El plan se elimina: no queda nada por programar.
                </div>
              )}
            </>
          )}
          {planChoice === "keep" && (
            <div className="input-help" style={{ marginTop: 10 }}>
              Las cuotas se quedan tal cual. El ingreso va a aparecer marcado como "Plan sin cuadrar"
              hasta que lo ajustes.
            </div>
          )}
        </div>
      )}

      <div className="input-group">
        <span className="input-label">Estado</span>
        <SegmentedControl
          items={STATUS_ITEMS}
          value={status}
          onChange={(k) => setStatus(k as SaleStatus)}
          size="sm"
          role="radiogroup"
          ariaLabel="Estado del ingreso"
        />
        <div className="input-help">
          {cancellingWithMoney
            ? `Ya recibiste ${formatMXN(alreadyPaid)} de este ingreso. Al cancelarlo ese dinero pasa a "Por devolver" y el ingreso deja de contar en Por cobrar. Los pagos quedan registrados.`
            : "Solo los ingresos confirmados y entregados cuentan para lo que te deben."}
        </div>
      </div>

      <div className="input-group">
        <span className="input-label" id={`${uid}-contact`}>Cliente</span>
        <PickerField
          labelId={`${uid}-contact`}
          title="Cliente"
          options={contactOptions}
          value={contactId}
          onChange={setContactId}
          onCreate={(name) => quick.contact(name, "client")}
          createLabel="Nuevo contacto"
        />
      </div>

      <div className="input-group">
        <span className="input-label" id={`${uid}-project`}>Pieza</span>
        <PickerField
          labelId={`${uid}-project`}
          title="Pieza"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          onCreate={(name) =>
            /* A piece born from an ingreso already has a story: sold and
               finished, reserved while a commission is made, or reserved
               by a quote. The price and the buyer are on screen too. */
            quick.project(name, {
              status: category === "commission" ? "in_progress" : "completed",
              availability: status === "quoted" || category === "commission" ? "reserved" : "sold",
              contactId: contactId || null,
              price: parsedAmount > 0 ? parsedAmount : null
            })
          }
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
        <div className="input-help">Para saber si la expo se pagó sola.</div>
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
