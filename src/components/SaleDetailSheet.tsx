import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { InstallmentState } from "../utils/accounting";
import type { Payment, PaymentTerms } from "../types";
import {
  INCOME_CATEGORY,
  INCOME_CATEGORY_BADGE,
  PAYMENT_METHOD,
  PAYMENT_TERMS,
  SALE_STATUS,
  SALE_STATUS_BADGE,
  labelFor
} from "../data/constants";
import { PlanBuilder } from "./PlanBuilder";
import { planRows, type PlanDraft } from "../utils/plan";
import { Icon } from "./Icon";
import { installmentPlan, paymentsForSale, saleBalance } from "../utils/accounting";
import { formatMXN } from "../utils/money";
import { addMonths, formatShort, todayISO } from "../utils/dates";
import { makeId } from "../utils/id";
import { haptic } from "../lib/haptics";
import { Sheet } from "./Sheet";
import { SegmentedControl } from "./SegmentedControl";
import { PaymentSheet } from "./PaymentSheet";
import { SaleSheet } from "./SaleSheet";

const STATE_BADGE: Record<InstallmentState, string> = {
  paid: "badge-green",
  partial: "badge-amber",
  pending: "badge-gray",
  overdue: "badge-red"
};

const PLAN_TERMS_ITEMS = PAYMENT_TERMS.filter((t) => t.value !== "single").map((t) => ({
  k: t.value,
  l: t.label
}));

const STATE_LABEL: Record<InstallmentState, string> = {
  paid: "Pagada",
  partial: "Parcial",
  pending: "Pendiente",
  overdue: "Vencida"
};

/* A form or a confirm revealed at the very bottom of the sheet opens
   UNDER the sticky footer. Scroll the panel to its end so the buttons
   are never a dead end the user has to go looking for. */
function revealBottom(el: HTMLElement | null) {
  const panel = el?.closest(".sheet-panel");
  if (!panel) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  panel.scrollTo({ top: panel.scrollHeight, behavior: reduced ? "auto" : "smooth" });
}

export function SaleDetailSheet({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const {
    sales,
    payments,
    installments,
    contacts,
    projects,
    rules,
    settings,
    addInstallments,
    removeInstallments,
    addPayment,
    updateSale
  } = useApp();
  const { showSuccess } = useToast();

  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<Payment | "new" | null>(null);
  const [planForm, setPlanForm] = useState(false);
  const [confirmingPlan, setConfirmingPlan] = useState(false);
  const [planTerms, setPlanTerms] = useState<PaymentTerms>("installments");
  const [draft, setDraft] = useState<PlanDraft>({
    depositPercent: settings.defaultDepositPercent,
    balanceDate: addMonths(todayISO(), 1),
    count: "3",
    firstDue: addMonths(todayISO(), 1),
    frequency: settings.defaultInstallmentFrequency
  });
  const [working, setWorking] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);
  const planFormRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (planForm) revealBottom(planFormRef.current);
  }, [planForm]);
  useEffect(() => {
    if (confirmingPlan) revealBottom(confirmRef.current);
  }, [confirmingPlan]);

  // Keep rendering the last known sale while the sheet plays its exit
  // animation after a delete (the row is gone from the store already).
  const live = sales.find((s) => s.id === saleId) ?? null;
  const lastSale = useRef(live);
  if (live) lastSale.current = live;
  const sale = live ?? lastSale.current;
  if (!sale) return null;

  const balance = saleBalance(sale, payments);
  const salePayments = [...paymentsForSale(payments, sale.id)].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );
  const plan = installmentPlan(sale.id, installments, payments, todayISO());
  const contact = contacts.find((c) => c.id === sale.contactId);
  const project = projects.find((p) => p.id === sale.projectId);

  const rule = sale.recurringRuleId ? rules.find((r) => r.id === sale.recurringRuleId) : null;
  const planPreview = planRows(planTerms, sale.amount, sale.date, draft);
  const canGenerate = planPreview !== null;

  async function generatePlan() {
    if (!sale || !planPreview || working) return;
    setWorking(true);
    // One request for the whole plan: either every cuota lands or none does.
    const ok = await addInstallments(
      planPreview.map((row) => ({
        id: makeId(),
        saleId: sale.id,
        amount: row.amount,
        dueDate: row.dueDate,
        notes: "",
        createdAt: todayISO()
      }))
    );
    setWorking(false);
    if (!ok) {
      haptic.warn();
      return;
    }
    if (sale.paymentTerms !== planTerms) void updateSale(sale.id, { paymentTerms: planTerms });
    haptic.success();
    showSuccess("Plan de pagos creado");
    setPlanForm(false);
  }

  /* One tap for a materialized tuition / retainer: record the remainder
     as a payment with her usual method, dated today. */
  async function markCollected() {
    if (!sale || working || balance.owed <= 0) return;
    setWorking(true);
    await addPayment({
      id: makeId(),
      saleId: sale.id,
      amount: balance.owed,
      date: todayISO(),
      method: settings.defaultPaymentMethod,
      notes: "",
      createdAt: todayISO()
    });
    haptic.success();
    showSuccess("Cobro registrado");
    setWorking(false);
  }

  async function deletePlan() {
    if (!sale || working) return;
    setWorking(true);
    await removeInstallments(plan.map((status) => status.installment.id));
    haptic.warn();
    showSuccess("Plan de pagos eliminado");
    setConfirmingPlan(false);
    setWorking(false);
  }

  return (
    <>
      <Sheet
        title={sale.title}
        onClose={working ? null : onClose}
        closeRef={closeRef}
        footer={
          <div className="sheet-actions">
            <div className="sheet-actions-state">
              {rule && balance.owed > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void markCollected()}
                  disabled={working}
                >
                  {working ? "Guardando…" : `Marcar cobrado · ${formatMXN(balance.owed)}`}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setPaying("new")}
                  disabled={working}
                >
                  Registrar pago
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(true)}
                disabled={working}
              >
                Editar venta
              </button>
            </div>
          </div>
        }
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
        >
          <span className={`badge ${SALE_STATUS_BADGE[sale.status]}`}>
            {labelFor(SALE_STATUS, sale.status)}
          </span>
          <span className={`badge ${INCOME_CATEGORY_BADGE[sale.category]}`}>
            {labelFor(INCOME_CATEGORY, sale.category)}
          </span>
          {sale.paymentTerms !== "single" && (
            <span className="money-terms money-submeta">
              <Icon name="repeat" size={12} strokeWidth={2.2} />
              {labelFor(PAYMENT_TERMS, sale.paymentTerms)}
            </span>
          )}
          {rule && (
            <span className="money-terms money-submeta">
              <Icon name="repeat" size={12} strokeWidth={2.2} />
              Ingreso fijo
            </span>
          )}
          <span className="money-submeta">
            {formatShort(sale.date)}
            {contact ? ` · ${contact.name}` : ""}
            {project ? ` · ${project.title}` : ""}
          </span>
        </div>

        <div className="money-panel">
          <div className="money-stats">
            <div>
              <div className="money-stat-label">Total</div>
              <div className="money-stat-value">{formatMXN(sale.amount)}</div>
            </div>
            <div>
              <div className="money-stat-label">Pagado</div>
              <div className="money-stat-value money-stat-value--paid">
                {formatMXN(balance.paid)}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Restante</div>
              <div
                className={`money-stat-value ${balance.owed > 0 ? "money-stat-value--owed" : ""}`}
              >
                {formatMXN(balance.owed)}
              </div>
            </div>
          </div>
          <div className="money-progress">
            <span
              className={`money-progress-fill ${balance.settled ? "money-progress-fill--settled" : ""}`}
              style={{ width: `${balance.progress * 100}%` }}
            />
          </div>
          {balance.credit > 0 && (
            <div className="money-submeta" style={{ marginTop: 8 }}>
              Pagó {formatMXN(balance.credit)} de más.
            </div>
          )}
        </div>

        {/* The sticky footer carries "Registrar pago" — a second button
            here would duplicate the primary CTA on the same screen. */}
        <div className="money-sheet-section">
          <span className="money-sheet-section-title">Pagos</span>
        </div>
        <div className="money-list">
          {salePayments.length === 0 ? (
            <div className="money-list-empty">
              Sin pagos todavía. Registra el primero cuando recibas el dinero.
            </div>
          ) : (
            salePayments.map((payment) => (
              <button
                key={payment.id}
                type="button"
                className="row-item"
                onClick={() => setPaying(payment)}
              >
                <div className="row-content">
                  <div className="row-title">{labelFor(PAYMENT_METHOD, payment.method)}</div>
                  <div className="row-sub">{formatShort(payment.date)}</div>
                </div>
                <div className="row-amount amount-paid">{formatMXN(payment.amount)}</div>
              </button>
            ))
          )}
        </div>

        <div className="money-sheet-section">
          <span className="money-sheet-section-title">Plan de pagos</span>
          {plan.length > 0 && !confirmingPlan && (
            <button
              type="button"
              className="btn btn-danger btn-mini"
              onClick={() => setConfirmingPlan(true)}
              disabled={working}
            >
              Eliminar plan
            </button>
          )}
        </div>

        {plan.length > 0 ? (
          <>
            <div className="money-list">
              {plan.map(({ installment, covered, remaining, state }) => (
                <div className="row-item" key={installment.id} style={{ cursor: "default" }}>
                  <div className="row-content">
                    <div className="row-title">{formatShort(installment.dueDate)}</div>
                    {covered > 0 && remaining > 0 && (
                      <div className="row-sub">
                        Cubierto {formatMXN(covered)} · Restan {formatMXN(remaining)}
                      </div>
                    )}
                  </div>
                  <div className="money-row-right">
                    <span className={`badge ${STATE_BADGE[state]}`}>{STATE_LABEL[state]}</span>
                    <span className="row-amount">{formatMXN(installment.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
            {confirmingPlan && (
              <div className="money-panel money-confirm" style={{ marginTop: 10 }} ref={confirmRef}>
                <div className="input-help money-confirm-question">
                  ¿Eliminar el plan? Se borran las cuotas; los pagos registrados no se tocan.
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-mini"
                  onClick={() => void deletePlan()}
                  disabled={working}
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-mini"
                  onClick={() => setConfirmingPlan(false)}
                  disabled={working}
                >
                  Cancelar
                </button>
              </div>
            )}
          </>
        ) : planForm ? (
          <div ref={planFormRef}>
            <div className="input-group">
              <span className="input-label">Forma de pago</span>
              <SegmentedControl
                items={PLAN_TERMS_ITEMS}
                value={planTerms}
                onChange={(k) => setPlanTerms(k as PaymentTerms)}
                size="sm"
                role="radiogroup"
                ariaLabel="Forma de pago"
              />
            </div>
            <PlanBuilder
              terms={planTerms}
              total={sale.amount}
              saleDate={sale.date}
              draft={draft}
              onChange={setDraft}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => void generatePlan()}
              disabled={!canGenerate || working}
            >
              {working ? "Generando…" : "Guardar plan"}
            </button>
          </div>
        ) : (
          <div className="money-list">
            <div className="money-list-empty" style={{ paddingBottom: 0 }}>
              Sin plan de pagos. Divide esta venta en cuotas para darle seguimiento.
            </div>
            <div style={{ padding: 14 }}>
              <button
                type="button"
                className="btn btn-secondary btn-mini"
                onClick={() => setPlanForm(true)}
              >
                Crear plan de pagos
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {paying && (
        <PaymentSheet
          saleId={sale.id}
          payment={paying === "new" ? null : paying}
          owed={balance.owed}
          onClose={() => setPaying(null)}
        />
      )}

      {editing && (
        <SaleSheet
          sale={sale}
          onClose={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false);
            (closeRef.current ?? onClose)();
          }}
        />
      )}
    </>
  );
}
