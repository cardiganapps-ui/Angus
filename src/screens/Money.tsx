import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, Expense, Payment, Sale } from "../types";
import {
  EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_BADGE,
  SALE_STATUS,
  SALE_STATUS_BADGE,
  labelFor
} from "../data/constants";
import {
  expenseBreakdown,
  profitLoss,
  saleBalance,
  saleCountsTowardRevenue,
  totals
} from "../utils/accounting";
import { formatMXN, formatMXNShort, formatMXNShortSigned, sumMoney } from "../utils/money";
import { formatMonthLong, formatShort, monthRange, todayISO } from "../utils/dates";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { EmptyState } from "../components/EmptyState";
import { SegmentedControl } from "../components/SegmentedControl";
import { Icon } from "../components/Icon";
import { SaleSheet } from "../components/SaleSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { ExpenseSheet } from "../components/ExpenseSheet";

type View = "sales" | "expenses";

/* Which half of the tab she was last on. Module scope, not localStorage:
   the tab unmounts on every navigation, but coming back within the same
   session should land where she left off. */
let lastView: View = "sales";

const VIEW_ITEMS = [
  { k: "sales", l: "Ventas" },
  { k: "expenses", l: "Gastos" }
];

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

export function Money() {
  const { sales, payments, expenses, contacts } = useApp();
  const [view, setView] = useState<View>(lastView);
  const [editingSale, setEditingSale] = useState<Sale | "new" | null>(null);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | "new" | null>(null);

  const today = todayISO();
  const month = monthRange(today);
  const owed = totals(sales, payments).owed;
  const net = profitLoss(sales, payments, expenses, month.from, month.to).net;

  function switchView(next: View) {
    lastView = next;
    setView(next);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{formatMonthLong(today)}</div>
        <h1 className="page-title">Dinero</h1>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card list-entry-stagger" style={stagger(0)}>
          <div className="kpi-label">Por cobrar</div>
          <div className="kpi-value">
            <AnimatedNumber value={owed} format={formatMXNShort} />
          </div>
        </div>
        <div className="kpi-card list-entry-stagger" style={stagger(1)}>
          <div className="kpi-label">Este mes</div>
          <div className="kpi-value" style={net < 0 ? { color: "var(--red)" } : undefined}>
            <AnimatedNumber value={net} format={formatMXNShortSigned} />
          </div>
        </div>
      </div>

      <div className="money-switch">
        <SegmentedControl
          items={VIEW_ITEMS}
          value={view}
          onChange={(k) => switchView(k as View)}
          size="md"
          ariaLabel="Ventas o gastos"
        />
      </div>

      {view === "sales" ? (
        <SalesView
          sales={sales}
          payments={payments}
          contacts={contacts}
          onSelect={setDetailSaleId}
        />
      ) : (
        <ExpensesView expenses={expenses} month={month} onSelect={setEditingExpense} />
      )}

      <button
        className="fab"
        onClick={() => (view === "sales" ? setEditingSale("new") : setEditingExpense("new"))}
        aria-label={view === "sales" ? "Nueva venta" : "Nuevo gasto"}
      >
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editingSale && (
        <SaleSheet
          sale={editingSale === "new" ? null : editingSale}
          onClose={() => setEditingSale(null)}
        />
      )}
      {detailSaleId && (
        <SaleDetailSheet saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
      )}
      {editingExpense && (
        <ExpenseSheet
          expense={editingExpense === "new" ? null : editingExpense}
          onClose={() => setEditingExpense(null)}
        />
      )}
    </div>
  );
}

function SalesView({
  sales,
  payments,
  contacts,
  onSelect
}: {
  sales: Sale[];
  payments: Payment[];
  contacts: Contact[];
  onSelect: (id: string) => void;
}) {
  const sorted = [...sales].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );

  if (sorted.length === 0) {
    return (
      <div className="section">
        <div className="card">
          <EmptyState
            icon="banknote"
            title="Sin ventas todavía"
            body="Registra una venta para llevar la cuenta de lo que ya te pagaron y lo que te deben."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="card">
        {sorted.map((sale, i) => {
          const balance = saleBalance(sale, payments);
          const contact = contacts.find((c) => c.id === sale.contactId);
          const counting = saleCountsTowardRevenue(sale);
          const owes = counting && balance.owed > 0;
          return (
            <button
              key={sale.id}
              type="button"
              className="row-item list-entry-stagger"
              style={stagger(i)}
              onClick={() => onSelect(sale.id)}
            >
              <div className="row-content">
                <div className="row-title">{sale.title}</div>
                <div className="row-sub">
                  {contact ? `${contact.name} · ` : ""}
                  {formatShort(sale.date)}
                </div>
              </div>
              <div className="money-row-right">
                <span className={`badge ${SALE_STATUS_BADGE[sale.status]}`}>
                  {labelFor(SALE_STATUS, sale.status)}
                </span>
                {owes ? (
                  <>
                    <span className="row-amount amount-owe">{formatMXN(balance.owed)}</span>
                    <span className="money-submeta">
                      {formatMXNShort(balance.paid)} de {formatMXNShort(sale.amount)}
                    </span>
                  </>
                ) : counting ? (
                  <span className="row-amount amount-paid money-amount-mark">
                    <Icon name="check" size={14} strokeWidth={2.4} />
                    {formatMXN(sale.amount)}
                  </span>
                ) : (
                  <span className="row-amount amount-clear">{formatMXN(sale.amount)}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpensesView({
  expenses,
  month,
  onSelect
}: {
  expenses: Expense[];
  month: { from: string; to: string };
  onSelect: (expense: Expense) => void;
}) {
  const sorted = [...expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );
  const breakdown = expenseBreakdown(expenses, month.from, month.to);
  const monthTotal = sumMoney(breakdown.map((c) => c.amount));

  if (sorted.length === 0) {
    return (
      <div className="section">
        <div className="card">
          <EmptyState
            icon="receipt"
            title="Sin gastos todavía"
            body="Anota materiales, taller, transporte o cursos para saber cuánto te cuesta trabajar."
          />
        </div>
      </div>
    );
  }

  const months = groupByMonth(sorted);

  return (
    <>
      <div className="section">
        <div className="card money-summary">
          <div className="money-summary-head">
            <span className="eyebrow">Gasto de {formatMonthLong(month.from)}</span>
            <span className="money-summary-total">{formatMXN(monthTotal)}</span>
          </div>
          {breakdown.length === 0 ? (
            <div className="input-help" style={{ marginTop: 0 }}>
              Este mes todavía no registras gastos.
            </div>
          ) : (
            breakdown.slice(0, 4).map((category) => (
              <div className="cat-bar-row" key={category.category}>
                <span className="cat-bar-label">
                  {labelFor(EXPENSE_CATEGORY, category.category)}
                </span>
                <span className="cat-bar-track">
                  <span className="cat-bar-fill" style={{ width: `${category.share * 100}%` }} />
                </span>
                <span className="cat-bar-value">{formatMXNShort(category.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {months.map(([key, rows]) => (
        <div className="section" key={key}>
          <div className="section-header">
            <span className="section-title">{formatMonthLong(key)}</span>
            <span className="money-section-total">
              {formatMXN(sumMoney(rows.map((e) => e.amount)))}
            </span>
          </div>
          <div className="card">
            {rows.map((expense, i) => (
              <button
                key={expense.id}
                type="button"
                className="row-item list-entry-stagger"
                style={stagger(i)}
                onClick={() => onSelect(expense)}
              >
                <div className="row-content">
                  <div className="row-title">{expense.title}</div>
                  <div className="row-sub">{formatShort(expense.date)}</div>
                </div>
                <div className="money-row-right">
                  <span className={`badge ${EXPENSE_CATEGORY_BADGE[expense.category]}`}>
                    {labelFor(EXPENSE_CATEGORY, expense.category)}
                  </span>
                  <span className="row-amount">{formatMXN(expense.amount)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** Expenses bucketed by "YYYY-MM", newest month first. */
function groupByMonth(expenses: Expense[]): [string, Expense[]][] {
  const buckets = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const key = expense.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(expense);
    else buckets.set(key, [expense]);
  }
  return [...buckets.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
