import { useState } from "react";
import { useApp } from "../context/AppContext";
import { SALE_STATUS, SALE_STATUS_BADGE, labelFor } from "../data/constants";
import { saleBalance, saleCountsTowardRevenue, totals } from "../utils/accounting";
import { formatMXN, formatMXNShort } from "../utils/money";
import { formatShort } from "../utils/dates";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { SaleDetailSheet } from "./SaleDetailSheet";

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
  const clientSales = sales
    .filter((s) => s.contactId === contactId && saleCountsTowardRevenue(s))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const t = totals(clientSales, payments);

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
                    {balance.owed > 0 ? (
                      <>
                        <span className="row-amount amount-owe">{formatMXN(balance.owed)}</span>
                        <span className="money-submeta">
                          {formatMXNShort(balance.paid)} de {formatMXNShort(sale.amount)}
                        </span>
                      </>
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
