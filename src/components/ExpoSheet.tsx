import { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Expense, Sale } from "../types";
import { EXPENSE_CATEGORY, SALE_STATUS, SALE_STATUS_BADGE, labelFor } from "../data/constants";
import { expoReport, expoVerdict } from "../utils/expo";
import { periodSummary } from "../utils/insights";
import { saleBalance } from "../utils/accounting";
import { formatMXN, formatMXNShort, formatMXNShortSigned } from "../utils/money";
import { addMonths, formatShort, formatWithWeekday, todayISO } from "../utils/dates";
import { Sheet } from "./Sheet";
import { EventSheet } from "./EventSheet";
import { SaleSheet } from "./SaleSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { ExpenseSheet } from "./ExpenseSheet";
import { SettingsFieldSheet } from "./SettingsFieldSheet";
import { haptic } from "../lib/haptics";

/* ── ExpoSheet ──
   One expo's economics: budget vs spent, sold vs collected, break-even
   in pieces, the verdict, and its sales and expenses (with quick-add
   pre-linked to the expo). */
export function ExpoSheet({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { events, sales, payments, expenses, updateEvent } = useApp();
  const { showSuccess } = useToast();
  const [editing, setEditing] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newSale, setNewSale] = useState(false);
  const [newExpense, setNewExpense] = useState(false);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [expense, setExpense] = useState<Expense | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const today = todayISO();

  const live = events.find((e) => e.id === eventId) ?? null;
  const last = useRef(live);
  if (live) last.current = live;
  const event = live ?? last.current;

  const avgPrice = useMemo(() => periodSummary(sales, payments, expenses, addMonths(today, -12), today).avgPiecePrice, [sales, payments, expenses, today]);
  const report = useMemo(() => (event ? expoReport(event.id, event.budget, sales, payments, expenses, avgPrice) : null), [event, sales, payments, expenses, avgPrice]);
  const expoSales = useMemo(() => sales.filter((s) => s.eventId === eventId).sort((a, b) => b.date.localeCompare(a.date)), [sales, eventId]);
  const expoExpenses = useMemo(() => expenses.filter((e) => e.eventId === eventId).sort((a, b) => b.date.localeCompare(a.date)), [expenses, eventId]);

  if (!event || !report) return null;
  const upcoming = event.date >= today;

  return (
    <>
      <Sheet
        title={event.title}
        onClose={onClose}
        closeRef={closeRef}
        footer={
          <div className="sheet-actions">
            <div className="sheet-actions-state">
              <button type="button" className="btn btn-primary" onClick={() => setNewSale(true)}>
                Registrar ingreso aquí
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setNewExpense(true)}>
                Registrar gasto
              </button>
            </div>
          </div>
        }
      >
        <div className="money-submeta" style={{ marginBottom: 12 }}>
          {formatWithWeekday(event.date)}
          {event.location ? ` · ${event.location}` : ""}
          {" · "}
          <button type="button" className="see-all btn-tap" onClick={() => setEditing(true)} style={{ padding: 0 }}>
            Editar evento
          </button>
        </div>

        <div className={`expo-verdict expo-verdict--${report.signal}`}>
          <span className={`expo-signal expo-signal--${report.signal}`} style={{ marginTop: 5 }} aria-hidden="true" />
          <span>
            {upcoming && report.revenue === 0 && report.spent === 0
              ? report.budget
                ? report.breakEvenPieces
                  ? `Con presupuesto de ${formatMXN(report.budget)} necesitas vender ~${report.breakEvenPieces} ${report.breakEvenPieces === 1 ? "pieza" : "piezas"} al precio promedio (${formatMXNShort(avgPrice ?? 0)}) para cubrirla.`
                  : `Presupuesto ${formatMXN(report.budget)}. Registra ventas para saber tu punto de equilibrio.`
                : "Ponle un presupuesto para saber cuántas piezas necesitas vender."
              : expoVerdict(report, formatMXN)}
            {!upcoming && report.piecesToGo !== null && report.piecesToGo > 0 && ` Faltarían ~${report.piecesToGo} ${report.piecesToGo === 1 ? "pieza" : "piezas"} al precio promedio.`}
          </span>
        </div>

        <div className="money-panel">
          <div className="money-stats">
            <div>
              <div className="money-stat-label">Vendido</div>
              <div className="money-stat-value">{formatMXNShort(report.revenue)}</div>
            </div>
            <div>
              <div className="money-stat-label">Cobrado</div>
              <div className="money-stat-value money-stat-value--paid">{formatMXNShort(report.collected)}</div>
            </div>
            <div>
              <div className="money-stat-label">Gastado</div>
              <div className="money-stat-value">{formatMXNShort(report.spent)}</div>
            </div>
          </div>
          <div className="money-stats" style={{ marginTop: 10 }}>
            <div>
              <div className="money-stat-label">Margen</div>
              <div className={`money-stat-value ${report.margin < 0 ? "money-margin-neg" : report.margin > 0 ? "money-margin-pos" : ""}`}>
                {formatMXNShortSigned(report.margin)}
              </div>
            </div>
            <div>
              <div className="money-stat-label">En mano</div>
              <div className={`money-stat-value ${report.cash < 0 ? "money-margin-neg" : report.cash > 0 ? "money-margin-pos" : ""}`}>
                {formatMXNShortSigned(report.cash)}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Presupuesto</div>
              <button type="button" className="money-stat-value btn-tap" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent-dark)", font: "inherit", fontWeight: 800 }} onClick={() => setBudgetOpen(true)}>
                {report.budget ? formatMXNShort(report.budget) : "Definir"}
              </button>
            </div>
          </div>
          {report.budget && (
            <>
              <div className="money-progress" style={{ marginTop: 10 }}>
                <span
                  className="money-progress-fill"
                  style={{ width: `${(report.budgetRatio ?? 0) * 100}%`, background: report.overBudget > 0 ? "var(--red)" : undefined }}
                />
              </div>
              <div className="money-submeta" style={{ marginTop: 6 }}>
                {report.overBudget > 0
                  ? `Te pasaste del presupuesto por ${formatMXN(report.overBudget)}.`
                  : `Gastado ${formatMXNShort(report.spent)} de ${formatMXNShort(report.budget)}.`}
              </div>
            </>
          )}
        </div>

        <div className="money-sheet-section">
          <span className="money-sheet-section-title">Ingresos en esta expo</span>
        </div>
        <div className="money-list">
          {expoSales.length === 0 ? (
            <div className="money-list-empty">Ningún ingreso ligado todavía.</div>
          ) : (
            expoSales.map((s: Sale) => {
              const b = saleBalance(s, payments);
              return (
                <button key={s.id} type="button" className="row-item" onClick={() => setSaleId(s.id)}>
                  <div className="row-content">
                    <div className="row-title">{s.title}</div>
                    <div className="row-sub">{formatShort(s.date)}{b.owed > 0 ? ` · faltan ${formatMXNShort(b.owed)}` : ""}</div>
                  </div>
                  <div className="money-row-right">
                    <span className={`badge ${SALE_STATUS_BADGE[s.status]}`}>{labelFor(SALE_STATUS, s.status)}</span>
                    <span className="row-amount">{formatMXN(s.amount)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="money-sheet-section">
          <span className="money-sheet-section-title">Gastos de esta expo</span>
        </div>
        <div className="money-list">
          {expoExpenses.length === 0 ? (
            <div className="money-list-empty">Ningún gasto ligado todavía. Stand, transporte, impresiones…</div>
          ) : (
            expoExpenses.map((e) => (
              <button key={e.id} type="button" className="row-item" onClick={() => setExpense(e)}>
                <div className="row-content">
                  <div className="row-title">{e.title}</div>
                  <div className="row-sub">{formatShort(e.date)} · {labelFor(EXPENSE_CATEGORY, e.category)}</div>
                </div>
                <span className="row-amount">{formatMXN(e.amount)}</span>
              </button>
            ))
          )}
        </div>
      </Sheet>

      {budgetOpen && (
        <SettingsFieldSheet
          title="Presupuesto de la expo"
          label="Cuánto planeas gastar (MXN)"
          kind="money"
          value={event.budget ? String(event.budget) : ""}
          help="Stand, transporte, impresiones, comida. Déjalo vacío para quitarlo."
          onSave={(v) => {
            void updateEvent(event.id, { budget: v ? Number(v) : null });
            haptic.success();
            showSuccess("Presupuesto guardado");
          }}
          onClose={() => setBudgetOpen(false)}
        />
      )}
      {editing && (
        <EventSheet
          event={event}
          onClose={() => setEditing(false)}
        />
      )}
      {newSale && <SaleSheet sale={null} initialEventId={event.id} onClose={() => setNewSale(false)} />}
      {newExpense && <ExpenseSheet expense={null} initialEventId={event.id} onClose={() => setNewExpense(false)} />}
      {saleId && <SaleDetailSheet saleId={saleId} onClose={() => setSaleId(null)} />}
      {expense && <ExpenseSheet expense={expense} onClose={() => setExpense(null)} />}
    </>
  );
}
