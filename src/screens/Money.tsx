import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, Expense, Payment, Sale } from "../types";
import {
  EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_BADGE,
  INCOME_CATEGORY,
  INCOME_CATEGORY_BADGE,
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
import { monthlyEquivalent } from "../utils/recurrence";
import { PeriodPicker } from "../components/PeriodPicker";
import { currentPeriod, periodRange, type Period } from "../utils/period";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { EmptyState } from "../components/EmptyState";
import { SegmentedControl } from "../components/SegmentedControl";
import { TrendChart } from "../components/TrendChart";
import { Icon } from "../components/Icon";
import { SaleSheet } from "../components/SaleSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { ExpenseSheet } from "../components/ExpenseSheet";
import { BalanceView } from "./MoneyBalance";
import { useFab } from "../context/FabContext";
import type { Route } from "../hooks/useNavigation";

type View = "sales" | "expenses" | "balance";

/* Which half of the tab she was last on. Module scope, not localStorage:
   the tab unmounts on every navigation, but coming back within the same
   session should land where she left off. */
let lastView: View = "sales";

const VIEW_ITEMS = [
  { k: "sales", l: "Ventas" },
  { k: "expenses", l: "Gastos" },
  { k: "balance", l: "Balance" }
];

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

const MONEY_LINKS: { route: Route; label: string }[] = [
  { route: "recurring", label: "Recurrentes" },
  { route: "budgets", label: "Presupuestos" },
  { route: "forecast", label: "Pronóstico" },
  { route: "reports", label: "Reportes" }
];

export function Money({ navigate }: { navigate: (r: Route) => void }) {
  const { sales, payments, expenses, contacts, projects, events, rules } = useApp();
  const [view, setView] = useState<View>(lastView);
  const [period, setPeriod] = useState<Period>(() => currentPeriod("month", todayISO()));
  const [editingSale, setEditingSale] = useState<Sale | "new" | null>(null);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | "new" | null>(null);
  useFab(
    view === "expenses"
      ? { key: "expense", label: "Nuevo gasto", icon: "receipt", onPick: () => setEditingExpense("new") }
      : { key: "sale", label: "Nueva venta", icon: "banknote", onPick: () => setEditingSale("new") }
  );

  const today = todayISO();
  const month = monthRange(today);
  const { owed, refundable } = useMemo(() => totals(sales, payments), [sales, payments]);
  const net = useMemo(
    () => profitLoss(payments, expenses, month.from, month.to).net,
    [payments, expenses, month.from, month.to]
  );
  const fixedOut = useMemo(
    () => sumMoney(rules.filter((r) => r.kind === "expense" && r.active).map(monthlyEquivalent)),
    [rules]
  );

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
        {refundable > 0 && (
          <div className="kpi-card list-entry-stagger" style={stagger(2)}>
            <div className="kpi-label">Por devolver</div>
            {/* Amber, not red: one row down in Balance, red in the money
                column means a client owes HER. The same hue for money she
                owes out would point the debt in two directions at once. */}
            <div className="kpi-value" style={{ color: "var(--amber)" }}>
              <AnimatedNumber value={refundable} format={formatMXNShort} />
            </div>
          </div>
        )}
        {fixedOut > 0 && (
          <div className="kpi-card list-entry-stagger" style={stagger(refundable > 0 ? 3 : 2)}>
            <div className="kpi-label">Fijos al mes</div>
            <div className="kpi-value">
              <AnimatedNumber value={fixedOut} format={formatMXNShort} />
            </div>
          </div>
        )}
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
      ) : view === "expenses" ? (
        <ExpensesView
          expenses={expenses}
          period={period}
          onPeriodChange={setPeriod}
          onSelect={setEditingExpense}
        />
      ) : (
        <>
        <TrendChart payments={payments} expenses={expenses} today={today} />
        <BalanceView
          sales={sales}
          payments={payments}
          expenses={expenses}
          contacts={contacts}
          projects={projects}
          events={events}
        />
        </>
      )}

      {/* The four finance screens live in the drawer; from here they were
          menu → item. One row of chips makes them a single tap. */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">Más de tu dinero</span>
        </div>
        <div className="chip-row">
          {MONEY_LINKS.map((l) => (
            <button key={l.route} type="button" className="chip" onClick={() => navigate(l.route)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>


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
                  {sale.paymentTerms === "installments"
                    ? " · en cuotas"
                    : sale.paymentTerms === "deposit_balance"
                      ? " · anticipo"
                      : ""}
                  {sale.recurringRuleId ? " · fijo" : ""}
                </div>
              </div>
              <div className="money-row-right">
                <span className="money-badges">
                  <span className={`badge ${INCOME_CATEGORY_BADGE[sale.category]}`}>
                    {labelFor(INCOME_CATEGORY, sale.category)}
                  </span>
                  <span className={`badge ${SALE_STATUS_BADGE[sale.status]}`}>
                    {labelFor(SALE_STATUS, sale.status)}
                  </span>
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
  period,
  onPeriodChange,
  onSelect
}: {
  expenses: Expense[];
  period: Period;
  onPeriodChange: (p: Period) => void;
  onSelect: (expense: Expense) => void;
}) {
  const range = periodRange(period);
  const sorted = [...expenses]
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const breakdown = expenseBreakdown(expenses, range.from, range.to);
  const monthTotal = sumMoney(breakdown.map((c) => c.amount));

  const months = groupByMonth(sorted);

  return (
    <>
      <PeriodPicker value={period} onChange={onPeriodChange} ariaLabel="Periodo de gastos" />
      {sorted.length === 0 && expenses.length === 0 && (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="receipt"
              title="Sin gastos todavía"
              body="Anota materiales, taller, transporte o cursos para saber cuánto te cuesta trabajar."
            />
          </div>
        </div>
      )}
      <div className="section">
        <div className="card money-summary">
          <div className="money-summary-head">
            <span className="eyebrow">Gasto · {range.label}</span>
            <span className="money-summary-total">{formatMXN(monthTotal)}</span>
          </div>
          {breakdown.length === 0 ? (
            <div className="input-help" style={{ marginTop: 0 }}>
              Sin gastos en este periodo.
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
                  <div className="row-sub">
                    {formatShort(expense.date)}
                    {expense.recurringRuleId ? " · fijo" : ""}
                    {expense.courseId ? " · curso" : ""}
                  </div>
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
