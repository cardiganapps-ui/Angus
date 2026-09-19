import { useMemo, useState, type CSSProperties } from "react";
import type { Contact, Expense, Payment, Project, Sale, ScheduleEvent } from "../types";
import {
  clientBalances,
  expoMargins,
  projectMargins,
  type EconomicsRow
} from "../utils/accounting";
import { formatMXN, formatMXNShort, formatMXNShortSigned, toCents } from "../utils/money";
import { formatShort } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ClientBalanceSheet } from "../components/ClientBalanceSheet";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/** How many pieces show before "Ver todas" — enough to read at a glance. */
const PIECE_PREVIEW = 8;

const marginClass = (margin: number) =>
  margin < 0 ? "money-margin-neg" : margin > 0 ? "money-margin-pos" : "";

/* Money she owes OUT is not money owed IN, so it can't borrow
   `.amount-owe` (red) — red already means "this client owes me" one row
   above, and two opposite directions in the same colour, in the same
   column, is a misread waiting to happen. Amber is the reserved
   pending/warning hue and it always ships with the words "Por devolver",
   the term Dinero already uses for the same pesos. Colour never carries
   it alone. */
const REFUND_AMOUNT: CSSProperties = { color: "var(--amber)" };

/* ── Balance ──
   The third money question: was it worth it? Per client, per piece, per
   expo. Everything here is derived by utils/accounting — this file only
   decides what to show and in which order. */
export function BalanceView({
  sales,
  payments,
  expenses,
  contacts,
  projects,
  events
}: {
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  contacts: Contact[];
  projects: Project[];
  events: ScheduleEvent[];
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [allPieces, setAllPieces] = useState(false);

  /* projectMargins and expoMargins walk every sale, payment and expense
     once per project and once per expo. Unmemoized they re-ran on every
     render of this screen, including one caused by tapping "ver todas". */
  const clients = useMemo(() => clientBalances(sales, payments), [sales, payments]);

  const pieces = useMemo(
    () => projectMargins(projects.map((p) => p.id), sales, payments, expenses),
    [projects, sales, payments, expenses]
  );
  const piecesById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const expoEvents = useMemo(
    () =>
      events
        .filter((e) => e.kind === "expo")
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [events]
  );
  const expos = useMemo(
    () => expoMargins(expoEvents.map((e) => e.id), sales, payments, expenses),
    [expoEvents, sales, payments, expenses]
  );
  const exposById = useMemo(() => new Map(expoEvents.map((e) => [e.id, e])), [expoEvents]);

  if (clients.length === 0 && pieces.length === 0 && expos.length === 0) {
    return (
      <div className="section">
        <div className="card">
          <EmptyState
            icon="banknote"
            title="Todavía no hay nada que comparar"
            body="Registra ingresos y gastos, y enlázalos a una pieza o a una expo: aquí verás quién te debe y qué tanto te dejó cada cosa."
          />
        </div>
      </div>
    );
  }

  const shownPieces = allPieces ? pieces : pieces.slice(0, PIECE_PREVIEW);

  return (
    <>
      {clients.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Clientes con saldo</span>
          </div>
          <div className="card">
            {clients.map((client, i) => {
              const contact = contacts.find((c) => c.id === client.contactId);
              /* Three states, not two. `clientBalances` keeps a client whose
                 only sale was cancelled precisely because she owes them a
                 deposit back; branching on `owed` alone sent that row into
                 the "Al corriente" branch and told her there was nothing to
                 do. Only a client with neither side pending is settled. */
              const owes = toCents(client.owed) > 0;
              const refund = toCents(client.refundable) > 0;
              return (
                <button
                  key={client.contactId}
                  type="button"
                  className="row-item list-entry-stagger"
                  style={stagger(i)}
                  onClick={() => setClientId(client.contactId)}
                >
                  <div className="row-content">
                    <div className="row-title">{contact?.name ?? "Cliente sin nombre"}</div>
                    <div className="row-sub">
                      {client.saleCount === 0
                        ? "Sin ingresos activos · su ingreso se canceló"
                        : `${client.saleCount} ${client.saleCount === 1 ? "ingreso" : "ingresos"} · ${formatMXNShort(client.committed)}`}
                    </div>
                  </div>
                  <div className="money-row-right">
                    {owes && (
                      <>
                        <span className="row-amount amount-owe">{formatMXN(client.owed)}</span>
                        <span className="money-submeta">
                          {formatMXNShort(client.collected)} de {formatMXNShort(client.committed)}
                        </span>
                      </>
                    )}
                    {refund && (
                      <>
                        <span className="row-amount" style={REFUND_AMOUNT}>
                          {formatMXN(client.refundable)}
                        </span>
                        <span className="badge badge-amber">Por devolver</span>
                      </>
                    )}
                    {!owes && !refund && (
                      <span className="badge badge-green money-settled">
                        <Icon name="check" size={12} strokeWidth={2.6} />
                        Al corriente
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pieces.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Margen por pieza</span>
            {pieces.length > PIECE_PREVIEW && (
              <button type="button" className="see-all" onClick={() => setAllPieces(!allPieces)}>
                {allPieces ? "Ver menos" : `Ver todas (${pieces.length})`}
              </button>
            )}
          </div>
          <div className="card">
            {shownPieces.map((row, i) => (
              <EconomicsRowItem
                key={row.id}
                row={row}
                index={i}
                title={piecesById.get(row.id)?.title ?? "Pieza"}
                spentLabel="Invertido"
              />
            ))}
          </div>
        </div>
      )}

      {expos.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Expos</span>
          </div>
          <div className="card">
            {expos.map((row, i) => {
              const event = exposById.get(row.id);
              return (
                <EconomicsRowItem
                  key={row.id}
                  row={row}
                  index={i}
                  title={event?.title ?? "Expo"}
                  meta={event ? formatShort(event.date) : undefined}
                  spentLabel="Costó"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Every row here is read-only data, so the floating FAB would sit
          right on top of the last margin figure. */}
      <div className="money-balance-tail" aria-hidden="true" />

      {clientId && (
        <ClientBalanceSheet contactId={clientId} onClose={() => setClientId(null)} />
      )}
    </>
  );
}

function EconomicsRowItem({
  row,
  index,
  title,
  meta,
  spentLabel
}: {
  row: EconomicsRow;
  index: number;
  title: string;
  meta?: string;
  spentLabel: string;
}) {
  const { margin, revenue, spent } = row.economics;
  return (
    <div className="row-item money-econ-row list-entry-stagger" style={stagger(index)}>
      <div className="row-content">
        <div className="row-title">{title}</div>
        <div className="row-sub money-econ-sub">
          {meta ? `${meta} · ` : ""}
          Vendido {formatMXNShort(revenue)} · {spentLabel} {formatMXNShort(spent)}
        </div>
      </div>
      <div className="money-row-right">
        <span className={`row-amount ${marginClass(margin)}`}>
          {formatMXNShortSigned(margin)}
        </span>
        <span className="money-submeta">Margen</span>
      </div>
    </div>
  );
}
