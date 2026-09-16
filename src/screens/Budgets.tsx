import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { ExpenseCategory } from "../types";
import { EXPENSE_CATEGORY, EXPENSE_CATEGORY_BADGE, labelFor } from "../data/constants";
import { budgetProgress, expensesByCategory } from "../utils/accounting";
import { formatMXN, formatMXNShort, subtractMoney, sumMoney } from "../utils/money";
import { todayISO } from "../utils/dates";
import { PeriodPicker } from "../components/PeriodPicker";
import { currentPeriod, periodRange, type Period } from "../utils/period";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { SettingsFieldSheet } from "../components/SettingsFieldSheet";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Presupuestos ──
   A monthly limit per category, stored in workspace settings, against
   what the period actually spent. Quarter / year views scale the limit
   by the number of months so the bar still means "of what I allowed". */
export function Budgets() {
  const { expenses, settings, updateSettings } = useApp();
  const { showSuccess } = useToast();
  const [period, setPeriod] = useState<Period>(() => currentPeriod("month", todayISO()));
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const range = periodRange(period);
  const months = period.span === "year" ? 12 : period.span === "quarter" ? 3 : 1;

  const scaled = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(settings.budgets).map(([k, v]) => [k, (v ?? 0) * months])
      ) as Partial<Record<ExpenseCategory, number>>,
    [settings.budgets, months]
  );
  const rows = useMemo(
    () => budgetProgress(expenses, scaled, range.from, range.to),
    [expenses, scaled, range.from, range.to]
  );
  const budgeted = useMemo(() => new Set(rows.map((r) => r.category)), [rows]);
  const unbudgeted = useMemo(
    () =>
      expensesByCategory(expenses, range.from, range.to).filter(
        (c) => !budgeted.has(c.category as ExpenseCategory)
      ),
    [expenses, range.from, range.to, budgeted]
  );
  const totalLimit = sumMoney(rows.map((r) => r.limit));
  const totalSpent = sumMoney(rows.map((r) => r.spent));
  const neverBudgeted = EXPENSE_CATEGORY.filter((c) => !budgeted.has(c.value));

  function saveLimit(category: ExpenseCategory, value: string) {
    const next = { ...settings.budgets };
    const n = Number(value);
    if (!value || !(n > 0)) delete next[category];
    else next[category] = n;
    void updateSettings({ budgets: next });
    showSuccess(value && n > 0 ? "Presupuesto guardado" : "Presupuesto quitado");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{range.label}</div>
        <h1 className="page-title">Presupuestos</h1>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} />

      {rows.length > 0 && (
        <div className="section">
          <div className="card money-summary">
            <div className="money-summary-head">
              <span className="eyebrow">Presupuestado · {range.label}</span>
              <span className="money-summary-total">{formatMXN(totalLimit)}</span>
            </div>
            <div className="money-submeta">
              Gastado {formatMXN(totalSpent)} ·{" "}
              {totalSpent <= totalLimit
                ? `te quedan ${formatMXN(subtractMoney(totalLimit, totalSpent))}`
                : `te pasaste por ${formatMXN(totalSpent - totalLimit)}`}
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Por categoría</span>
        </div>
        <div className="card">
          {rows.length === 0 ? (
            <EmptyState
              icon="target"
              title="Sin presupuestos todavía"
              body="Ponle un límite mensual a materiales, renta o transporte y Angus te avisa cuando te acerques."
            />
          ) : (
            rows.map((row, i) => (
              <button
                key={row.category}
                type="button"
                className="budget-row list-entry-stagger"
                style={stagger(i)}
                onClick={() => setEditing(row.category)}
              >
                <div className="budget-row-head">
                  <span className="budget-row-title">
                    <span className={`badge ${EXPENSE_CATEGORY_BADGE[row.category]}`}>
                      {labelFor(EXPENSE_CATEGORY, row.category)}
                    </span>
                  </span>
                  <span className="budget-row-figures">
                    <strong>{formatMXNShort(row.spent)}</strong> de {formatMXNShort(row.limit)}
                  </span>
                </div>
                <span className="budget-bar" aria-hidden="true">
                  <span
                    className={`budget-bar-fill budget-bar-fill--${row.state}`}
                    style={{ width: `${row.ratio * 100}%` }}
                  />
                </span>
                <span className={`budget-row-remaining ${row.state === "over" ? "budget-row-remaining--over" : ""}`}>
                  {row.state === "over"
                    ? `Te pasaste por ${formatMXN(subtractMoney(row.spent, row.limit))}`
                    : row.state === "near"
                      ? `Quedan ${formatMXN(row.remaining)} · ya vas en ${Math.round(row.ratio * 100)}%`
                      : `Quedan ${formatMXN(row.remaining)}`}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {unbudgeted.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Sin presupuesto</span>
            <span className="eyebrow">Toca para ponerle límite</span>
          </div>
          <div className="card">
            {unbudgeted.map((c, i) => (
              <button
                key={c.category}
                type="button"
                className="row-item list-entry-stagger"
                style={stagger(i)}
                onClick={() => setEditing(c.category as ExpenseCategory)}
              >
                <div className="row-content">
                  <div className="row-title">{labelFor(EXPENSE_CATEGORY, c.category)}</div>
                  <div className="row-sub">Gastado en {range.label.toLowerCase()}</div>
                </div>
                <span className="row-amount">{formatMXN(c.amount)}</span>
                <span className="row-chevron" aria-hidden="true">
                  <Icon name="chevron-right" size={16} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {neverBudgeted.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Agregar límite</span>
          </div>
          <div className="chip-row" style={{ padding: "0 2px" }}>
            {neverBudgeted
              .filter((c) => !unbudgeted.some((u) => u.category === c.value))
              .map((c) => (
                <button key={c.value} type="button" className="chip" onClick={() => setEditing(c.value)}>
                  + {c.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {editing && (
        <SettingsFieldSheet
          title={`Presupuesto · ${labelFor(EXPENSE_CATEGORY, editing)}`}
          label="Límite mensual (MXN)"
          kind="money"
          value={settings.budgets[editing] ? String(settings.budgets[editing]) : ""}
          help="Déjalo vacío para quitar el límite."
          onSave={(v) => saveLimit(editing, v)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
