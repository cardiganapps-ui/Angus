import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { SALE_STATUS, SALE_STATUS_BADGE, labelFor } from "../data/constants";
import { saleBalance, saleCountsTowardRevenue, totals } from "../utils/accounting";
import { formatMXN, formatMXNShort, toCents } from "../utils/money";
import { formatShort } from "../utils/dates";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { SaleDetailSheet } from "./SaleDetailSheet";

/* Money she owes OUT reads amber ("pending"), never the red this screen
   uses for money owed IN, and never without the words "Por devolver". */
const REFUND_TEXT: CSSProperties = { color: "var(--amber)" };
const REFUND_BAND: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid var(--border-lt)"
};

/* One client's sales and what each one still owes. Opened from the
   Balance view; every row leads to the same SaleDetailSheet the Ventas
   list uses, so there is only one place a sale is managed. */
export function ClientBalanceSheet({
  contactId,
  onClose
}: {
  contactId: string;
  onClose: () => void;
}) {
  const { contacts, sales, payments } = useApp();
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  const contact = contacts.find((c) => c.id === contactId);
  /* Mirrors `clientBalances`: counting sales AND cancelled ones. Filtering
     to counting sales here is what made a client she owes a refund open to
     $0 / $0 / $0 and "sin ventas" — the row exists in the list precisely
     because of the cancelled sale it was hiding. `totals` partitions the
     two sides, so committed / paid / owed are unaffected. */
  const clientSales = sales
    .filter(
      (s) =>
        s.contactId === contactId && (saleCountsTowardRevenue(s) || s.status === "cancelled")
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const t = totals(clientSales, payments);
  const refund = toCents(t.refundable) > 0;

  return (
    <>
      <Sheet title={contact?.name ?? "Cliente"} onClose={onClose}>
        <div className="money-panel">
          <div className="money-stats" style={{ marginBottom: 0 }}>
            <div>
              <div className="money-stat-label">Vendido</div>
              <div className="money-stat-value">{formatMXN(t.committed)}</div>
            </div>
            <div>
              <div className="money-stat-label">Pagado</div>
              <div className="money-stat-value money-stat-value--paid">{formatMXN(t.paid)}</div>
            </div>
            <div>
              <div className="money-stat-label">Debe</div>
              <div className={`money-stat-value ${t.owed > 0 ? "money-stat-value--owed" : ""}`}>
                {formatMXN(t.owed)}
              </div>
            </div>
          </div>
          {/* The other direction: money of theirs that she is holding.
              Its own line, under a divider, so it can never be read as
              part of the trio above it. */}
          {refund && (
            <div style={REFUND_BAND}>
              <div>
                <div className="money-stat-label">Por devolver</div>
                <div className="money-submeta">Pagos de una venta cancelada</div>
              </div>
              <div className="money-stat-value" style={REFUND_TEXT}>
                {formatMXN(t.refundable)}
              </div>
            </div>
          )}
        </div>

        <div className="money-sheet-section">
          <span className="money-sheet-section-title">Ventas</span>
        </div>
        <div className="money-list">
          {clientSales.length === 0 ? (
            <div className="money-list-empty">
              Sin ventas confirmadas todavía. Confirma una venta para verla aquí.
            </div>
          ) : (
            clientSales.map((sale) => {
              const balance = saleBalance(sale, payments);
              const owes = toCents(balance.owed) > 0;
              const owedBack = toCents(balance.refundable) > 0;
              return (
                <button
                  key={sale.id}
                  type="button"
                  className="row-item"
                  onClick={() => setDetailSaleId(sale.id)}
                >
                  <div className="row-content">
                    <div className="row-title">{sale.title}</div>
                    <div className="row-sub">{formatShort(sale.date)}</div>
                  </div>
                  <div className="money-row-right">
                    <span className={`badge ${SALE_STATUS_BADGE[sale.status]}`}>
                      {labelFor(SALE_STATUS, sale.status)}
                    </span>
                    {/* A cancelled sale that took a deposit shows what she
                        owes back, not a green "cobrada" tick on money that
                        is no longer a sale. */}
                    {owedBack ? (
                      <>
                        <span className="row-amount" style={REFUND_TEXT}>
                          {formatMXN(balance.refundable)}
                        </span>
                        <span className="money-submeta">Por devolver</span>
                      </>
                    ) : owes ? (
                      <>
                        <span className="row-amount amount-owe">{formatMXN(balance.owed)}</span>
                        <span className="money-submeta">
                          {formatMXNShort(balance.paid)} de {formatMXNShort(sale.amount)}
                        </span>
                      </>
                    ) : sale.status === "cancelled" ? (
                      <span className="row-amount amount-clear">{formatMXN(sale.amount)}</span>
                    ) : (
                      <span className="row-amount amount-paid money-amount-mark">
                        <Icon name="check" size={14} strokeWidth={2.4} />
                        {formatMXN(sale.amount)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Sheet>

      {detailSaleId && (
        <SaleDetailSheet saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
      )}
    </>
  );
}
