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
import { formatMXNShort, formatMXNShortSigned, subtractMoney, sumMoney } from "../utils/money";
import { formatShort, todayISO } from "../utils/dates";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { SwipeRow } from "../components/SwipeRow";
import { RecurringRuleSheet } from "../components/RecurringRuleSheet";
import { haptic } from "../lib/haptics";
import { useFab } from "../context/FabContext";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Recurrentes ──
   Her fixed income and fixed costs, each with what it's worth per month
   and when it next fires. Pausing a rule stops materialization without
   losing it; deleting keeps every row it already generated. */
export function Recurring() {
  const { rules, updateRule, removeRule } = useApp();
  const { showSuccess } = useToast();
  const deleteRule = async (rule: RecurringRule) => {
    const ok = await removeRule(rule.id);
    if (ok) showSuccess("Regla eliminada");
    return ok;
  };
  const [editing, setEditing] = useState<RecurringRule | { kind: RecurrenceKind } | null>(null);
  useFab({ key: "rule", label: "Nueva regla", icon: "repeat", onPick: () => setEditing({ kind: "expense" }) });
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
        onDelete={deleteRule}
        onToggle={togglePause}
        onAdd={() => setEditing({ kind: "income" })}
        emptyBody="Colegiaturas, retainers, rentas de obra. Angus genera el ingreso cada periodo y tú marcas cuando te pagan."
      />
      <RuleSection
        title="Gastos fijos"
        kind="expense"
        rules={expense}
        today={today}
        onEdit={setEditing}
        onDelete={deleteRule}
        onToggle={togglePause}
        onAdd={() => setEditing({ kind: "expense" })}
        emptyBody="Renta, apps, seguro, transporte. Se registran solos cada periodo y entran al pronóstico."
      />


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
  onDelete,
  onToggle,
  onAdd,
  emptyBody
}: {
  title: string;
  kind: RecurrenceKind;
  rules: RecurringRule[];
  today: string;
  onEdit: (r: RecurringRule) => void;
  onDelete: (r: RecurringRule) => Promise<boolean>;
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
            actionLabel={kind === "income" ? "Agregar ingreso fijo" : "Agregar gasto fijo"}
            onAction={onAdd}
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
              <SwipeRow
                key={rule.id}
                label={rule.title}
                question={`¿Eliminar la regla “${rule.title}”? Los movimientos ya registrados se conservan.`}
                onDelete={() => onDelete(rule)}
                trashInset={112}
              >
              <div
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
                  {rule.active ? (
                    <span className={`badge ${badge}`}>{label}</span>
                  ) : (
                    <span className="badge badge-amber">En pausa</span>
                  )}
                  <span className={`row-amount ${kind === "income" ? "amount-paid" : ""}`}>{formatMXNShort(rule.amount)}</span>
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
              </SwipeRow>
            );
          })
        )}
      </div>
    </div>
  );
}
