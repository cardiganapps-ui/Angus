import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { IncomeCategory, PaymentTerms, Sale, SaleStatus } from "../types";
import { INCOME_CATEGORY, PAYMENT_TERMS, SALE_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { ChipSelect } from "./ChipSelect";
import { PickerField } from "./PickerField";
import { PlanBuilder } from "./PlanBuilder";
import { planRows, type PlanDraft } from "../utils/plan";
import { makeId } from "../utils/id";
import { addMonths, formatShort, todayISO } from "../utils/dates";
import { paidForSale } from "../utils/accounting";
import { formatMXN } from "../utils/money";
import { haptic } from "../lib/haptics";

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
  const [submitting, setSubmitting] = useState(false);

  const safeClose = submitting ? null : onClose;
  const parsedAmount = Number(amount);
  // An existing plan is edited from the detail sheet; here we only
  // build one for a NEW sale (or a sale that has none yet).
  const hasPlan = !!sale && installments.some((i) => i.saleId === sale.id);
  const buildsPlan = terms !== "single" && !hasPlan;
  const rows = buildsPlan ? planRows(terms, parsedAmount, date, plan) : null;
  const canSave =
    title.trim().length > 0 &&
    amount.trim().length > 0 &&
    parsedAmount > 0 &&
    date.length > 0 &&
    (!buildsPlan || rows !== null);

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
    .map((e) => ({ value: e.id, label: `${e.title} · ${formatShort(e.date)}` }));

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
       FK. Awaited either way now — a "Venta y plan de pagos creados"
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
    haptic.success();
    if (!planned) {
      showToast("Guardamos la venta, pero no el plan de pagos. Ábrela para volver a intentarlo.", "error", {
        persistent: true
      });
    } else {
      showSuccess(sale ? "Venta actualizada" : rows ? "Venta y plan de pagos creados" : "Venta creada");
    }
    onClose();
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
          onSave={() => void handleSave()}
          onDelete={sale ? () => void handleDelete() : undefined}
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
          placeholder="Retrato por encargo, pieza en expo…"
          autoFocus={sale === null}
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
            ? "El plan de pagos existente se administra desde la venta."
            : TERMS_HELP[terms]}
        </div>
      </div>

      {buildsPlan && (
        <PlanBuilder terms={terms} total={parsedAmount} saleDate={date} draft={plan} onChange={setPlan} />
      )}

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
          {cancellingWithMoney
            ? `Ya recibiste ${formatMXN(alreadyPaid)} de esta venta. Al cancelarla ese dinero pasa a "Por devolver" y la venta deja de contar en Por cobrar. Los pagos quedan registrados.`
            : "Solo las ventas confirmadas y entregadas cuentan para lo que te deben."}
        </div>
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
        <span className="input-label">Pieza</span>
        <PickerField
          title="Pieza"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
        />
      </div>

      {expoOptions.length > 0 && (
        <div className="input-group">
          <span className="input-label">Expo</span>
          <PickerField title="Expo" options={expoOptions} value={eventId} onChange={setEventId} />
          <div className="input-help">Para saber si la expo se pagó sola.</div>
        </div>
      )}

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
