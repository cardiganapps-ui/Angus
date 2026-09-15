import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { RecurrenceKind, RecurringRule } from "../types";
import {
  EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_BADGE,
  INCOME_CATEGORY,
  INCOME_CATEGORY_BADGE,
  labelFor
} from "../data/constants";
import { describeCadence, monthlyEquivalent, nextOccurrence } from "../utils/recurrence";
import { formatMXN, formatMXNShort, formatMXNShortSigned, subtractMoney, sumMoney } from "../utils/money";
import { formatShort, todayISO } from "../utils/dates";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { RecurringRuleSheet } from "../components/RecurringRuleSheet";
import { haptic } from "../lib/haptics";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Recurrentes ──
   Her fixed income and fixed costs, each with what it's worth per month
   and when it next fires. Pausing a rule stops materialization without
   losing it; deleting keeps every row it already generated. */
export function Recurring() {
  const { rules, updateRule } = useApp();
  const { showSuccess } = useToast();
  const [editing, setEditing] = useState<RecurringRule | { kind: RecurrenceKind } | null>(null);
  const today = todayISO();

  const income = rules.filter((r) => r.kind === "income");
  const expense = rules.filter((r) => r.kind === "expense");
  const activeMonthly = (list: RecurringRule[]) =>
    sumMoney(list.filter((r) => r.active).map(monthlyEquivalent));
  const inPerMonth = activeMonthly(income);
  const outPerMonth = activeMonthly(expense);

  function togglePause(rule: RecurringRule) {
    haptic.tap();
    void updateRule(rule.id, { active: !rule.active });
    showSuccess(rule.active ? "Regla en pausa" : "Regla reactivada");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{rules.length} {rules.length === 1 ? "regla" : "reglas"}</div>
        <h1 className="page-title">Recurrentes</h1>
      </div>

      <div className="section">
        <div className="card recur-band">
          <div>
            <div className="recur-band-label">Entra al mes</div>
            <div className="recur-band-value recur-band-value--in">
              <AnimatedNumber value={inPerMonth} format={formatMXNShort} />
            </div>
          </div>
          <div>
            <div className="recur-band-label">Sale al mes</div>
            <div className="recur-band-value recur-band-value--out">
              <AnimatedNumber value={outPerMonth} format={formatMXNShort} />
            </div>
          </div>
          <div>
            <div className="recur-band-label">Fijo neto</div>
            <div className="recur-band-value recur-band-value--net">
              <AnimatedNumber value={subtractMoney(inPerMonth, outPerMonth)} format={formatMXNShortSigned} />
            </div>
          </div>
        </div>
      </div>

      <RuleSection
        title="Ingresos fijos"
        kind="income"
        rules={income}
        today={today}
        onEdit={setEditing}
        onToggle={togglePause}
        onAdd={() => setEditing({ kind: "income" })}
        emptyBody="Colegiaturas, retainers, rentas de obra. Angus genera la venta cada periodo y tú marcas cuando te pagan."
      />
      <RuleSection
        title="Gastos fijos"
        kind="expense"
        rules={expense}
        today={today}
        onEdit={setEditing}
        onToggle={togglePause}
        onAdd={() => setEditing({ kind: "expense" })}
        emptyBody="Renta, apps, seguro, transporte. Se registran solos cada periodo y entran al pronóstico."
      />

      <button className="fab" onClick={() => setEditing({ kind: "expense" })} aria-label="Nueva regla">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editing && (
        <RecurringRuleSheet
          rule={"id" in editing ? editing : null}
          initialKind={"id" in editing ? editing.kind : editing.kind}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RuleSection({
  title,
  kind,
  rules,
  today,
  onEdit,
  onToggle,
  onAdd,
  emptyBody
}: {
  title: string;
  kind: RecurrenceKind;
  rules: RecurringRule[];
  today: string;
  onEdit: (r: RecurringRule) => void;
  onToggle: (r: RecurringRule) => void;
  onAdd: () => void;
  emptyBody: string;
}) {
  const { contacts, courses } = useApp();
  const sorted = [...rules].sort(
    (a, b) => Number(b.active) - Number(a.active) || b.amount - a.amount || a.title.localeCompare(b.title)
  );
  const contactName = (id: string | null) => (id ? (contacts.find((c) => c.id === id)?.name ?? null) : null);
  const courseName = (id: string | null) => (id ? (courses.find((c) => c.id === id)?.name ?? null) : null);
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">{title}</span>
        <button type="button" className="see-all btn-tap" onClick={onAdd}>
          + Agregar
        </button>
      </div>
      <div className="card">
        {sorted.length === 0 ? (
          <EmptyState
            icon="repeat"
            title={kind === "income" ? "Sin ingresos fijos" : "Sin gastos fijos"}
            body={emptyBody}
          />
        ) : (
          sorted.map((rule, i) => {
            const next = nextOccurrence(rule, today);
            const badge =
              kind === "income"
                ? INCOME_CATEGORY_BADGE[rule.category as keyof typeof INCOME_CATEGORY_BADGE] ?? "badge-gray"
                : EXPENSE_CATEGORY_BADGE[rule.category as keyof typeof EXPENSE_CATEGORY_BADGE] ?? "badge-gray";
            const label =
              kind === "income"
                ? labelFor(INCOME_CATEGORY, rule.category)
                : labelFor(EXPENSE_CATEGORY, rule.category);
            return (
              <div
                key={rule.id}
                className={`row-item list-entry-stagger ${rule.active ? "" : "row-item--paused"}`}
                style={{ ...stagger(i), cursor: "default" }}
              >
                <button
                  type="button"
                  className="row-content btn-tap"
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                  onClick={() => onEdit(rule)}
                  aria-label={`Editar ${rule.title}`}
                >
                  <div className="row-title">{rule.title}</div>
                  <div className="row-sub">
                    {contactName(rule.contactId) ? `${contactName(rule.contactId)} · ` : ""}
                    {courseName(rule.courseId) ? `${courseName(rule.courseId)} · ` : ""}
                    {describeCadence(rule)}
                    {rule.active && next ? ` · próximo ${formatShort(next)}` : rule.active ? " · terminó" : " · en pausa"}
                  </div>
                </button>
                <div className="money-row-right">
                  <span className={`badge ${badge}`}>{label}</span>
                  <span className={`row-amount ${kind === "income" ? "amount-paid" : ""}`}>{formatMXN(rule.amount)}</span>
                </div>
                <button
                  type="button"
                  className="row-icon-btn btn-tap"
                  aria-label={rule.active ? `Pausar ${rule.title}` : `Reactivar ${rule.title}`}
                  onClick={() => onToggle(rule)}
                >
                  <Icon name={rule.active ? "pause" : "play"} size={16} strokeWidth={2.2} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
