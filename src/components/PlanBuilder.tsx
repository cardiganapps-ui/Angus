import { useMemo } from "react";
import type { PaymentTerms } from "../types";
import type { InstallmentFrequency } from "../utils/accounting";
import { planRows, type PlanDraft } from "../utils/plan";
import { formatMXN } from "../utils/money";
import { formatShort } from "../utils/dates";
import { DEPOSIT_PERCENT_OPTIONS, INSTALLMENT_FREQUENCY } from "../data/constants";
import { SegmentedControl } from "./SegmentedControl";

/* ── PlanBuilder ──
   The controls for "how will this be paid" plus a live preview of the
   resulting cuotas. Shared by SaleSheet (at creation) and SaleDetailSheet
   (adding a plan later). It owns no state: the parent holds the draft so
   it can persist the plan with the sale in one go.

   deposit_balance → two cuotas: the anticipo (a % of the total, due on
   the sale date) and the balance due on `balanceDate`.
   installments   → N equal cuotas from `firstDue` at `frequency`. */

const FREQ_ITEMS = INSTALLMENT_FREQUENCY.map((o) => ({ k: o.value, l: o.label }));
const DEPOSIT_ITEMS = DEPOSIT_PERCENT_OPTIONS.map((p) => ({ k: String(p), l: `${p}%` }));

export interface PlanPreviewRow {
  amount: number;
  dueDate: string;
  /** Already covered by payments — shown so she can see what won't move. */
  paid?: boolean;
}

/* The cuota list itself, shared by the builder below and by the two
   sheets that repair an existing plan. Six rows then a tail line: a
   36-cuota plan would otherwise push the sheet's buttons off screen. */
export function PlanPreview({
  rows,
  label,
  ariaLabel = "Vista previa del plan"
}: {
  rows: PlanPreviewRow[];
  label: (index: number) => string;
  ariaLabel?: string;
}) {
  return (
    <div className="plan-preview" aria-label={ariaLabel}>
      {rows.slice(0, 6).map((row, i) => (
        <div className="plan-preview-row" key={i}>
          <span className="plan-preview-label">
            {label(i)}
            <span className="plan-preview-date">
              {" · "}
              {formatShort(row.dueDate)}
              {row.paid ? " · pagada" : ""}
            </span>
          </span>
          <span className="plan-preview-amount">{formatMXN(row.amount)}</span>
        </div>
      ))}
      {rows.length > 6 && (
        <div className="plan-preview-more">
          … y {rows.length - 6} más, hasta {formatShort(rows[rows.length - 1].dueDate)}
        </div>
      )}
    </div>
  );
}

export function PlanBuilder({
  terms,
  total,
  saleDate,
  draft,
  onChange
}: {
  terms: PaymentTerms;
  total: number;
  saleDate: string;
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
}) {
  const rows = useMemo(() => planRows(terms, total, saleDate, draft), [terms, total, saleDate, draft]);
  const set = (patch: Partial<PlanDraft>) => onChange({ ...draft, ...patch });

  if (terms === "single") return null;

  return (
    <div className="money-panel plan-builder">
      {terms === "deposit_balance" ? (
        <>
          <div className="input-group">
            <span className="input-label">Anticipo</span>
            <SegmentedControl
              items={DEPOSIT_ITEMS}
              value={String(draft.depositPercent)}
              onChange={(k) => set({ depositPercent: Number(k) })}
              size="sm"
              role="radiogroup"
              ariaLabel="Porcentaje de anticipo"
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="plan-balance-date">Liquidación</label>
            <input
              id="plan-balance-date"
              className="input"
              type="date"
              value={draft.balanceDate}
              min={saleDate}
              onChange={(e) => set({ balanceDate: e.target.value })}
            />
            <div className="input-help">Normalmente, al entregar la pieza.</div>
          </div>
        </>
      ) : (
        <>
          <div className="form-row">
            <div className="input-group">
              <label className="input-label" htmlFor="plan-count">Cuotas</label>
              <input
                id="plan-count"
                className="input"
                type="number"
                inputMode="numeric"
                min={2}
                max={36}
                value={draft.count}
                onChange={(e) => set({ count: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="plan-first">Primera</label>
              <input
                id="plan-first"
                className="input"
                type="date"
                value={draft.firstDue}
                onChange={(e) => set({ firstDue: e.target.value })}
              />
            </div>
          </div>
          <div className="input-group">
            <span className="input-label">Frecuencia</span>
            <SegmentedControl
              items={FREQ_ITEMS}
              value={draft.frequency}
              onChange={(k) => set({ frequency: k as InstallmentFrequency })}
              size="sm"
              role="radiogroup"
              ariaLabel="Frecuencia de las cuotas"
            />
          </div>
        </>
      )}

      {rows ? (
        <PlanPreview
          rows={rows}
          label={(i) =>
            terms === "deposit_balance" ? (i === 0 ? "Anticipo" : "Liquidación") : `Cuota ${i + 1}`
          }
        />
      ) : (
        <div className="money-submeta">
          {terms === "installments" ? "Elige entre 2 y 36 cuotas y la fecha de la primera." : "Elige la fecha de liquidación."}
        </div>
      )}
    </div>
  );
}
