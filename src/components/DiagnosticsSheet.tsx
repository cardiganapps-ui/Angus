import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { EmptyState } from "./EmptyState";
import { useApp } from "../context/AppContext";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";
import { isAdminEmail } from "../config/admin";
import { clearEvents, readEvents, summarize, verdict, type DiagnosticEvent } from "../lib/diagnostics";
import { clearUsage, rankRoutes, readUsage, untouched } from "../lib/usage";
import { ALL_ROUTES } from "../hooks/useNavigation";
import { downloadJson } from "../lib/exportAll";
import { haptic } from "../lib/haptics";

/* ── Diagnóstico ──
   What went wrong lately, and how much of her data the app is holding.

   Two depths. She gets a verdict and one button that puts the detail on
   her clipboard, so she can report a problem without having to read a
   Postgres error. The admin additionally gets the raw messages, the
   per-table row counts against their caps, and the route tally.

   Everything shown here was already on her device. Opening this sheet
   makes no network call, and nothing is sent anywhere unless she taps
   the button herself. */

const KIND_LABEL: Record<DiagnosticEvent["kind"], string> = {
  write: "Al guardar",
  read: "Al cargar",
  partial: "Datos incompletos",
  crash: "Se rompió"
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DiagnosticsSheet({ onClose }: { onClose: () => void }) {
  const { loadReports, workspaceId } = useApp();
  const session = useSession();
  const { showSuccess, showToast } = useToast();
  const isAdmin = isAdminEmail(session.email);

  // Read once per open: a live subscription would make the log shift
  // under her while she reads it.
  const [events, setEvents] = useState<DiagnosticEvent[]>(() => readEvents());
  const [usage, setUsage] = useState(() => readUsage());

  const summary = useMemo(() => summarize(events), [events]);
  const ranked = useMemo(() => rankRoutes(usage), [usage]);
  const never = useMemo(() => untouched(usage, ALL_ROUTES), [usage]);
  const partialTables = loadReports.filter((r) => r.report.truncated || r.report.readError);

  /** Everything a report needs, in one object she can paste or send. */
  const report = () => ({
    app: "angus",
    version: __APP_VERSION__,
    at: new Date().toISOString(),
    workspaceId,
    events,
    tables: loadReports.map(({ table, report: r }) => ({
      table,
      loaded: r.loaded,
      total: r.total,
      truncated: r.truncated,
      readError: r.readError
    })),
    usage
  });

  async function send() {
    const text = JSON.stringify(report(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      haptic.success();
      showSuccess("Copiado — pégalo en un mensaje para Diego");
    } catch {
      // No clipboard permission (or an insecure context): hand her a
      // file instead of failing.
      if (downloadJson(`angus-diagnostico-${new Date().toISOString().slice(0, 10)}.json`, report())) {
        haptic.success();
        showSuccess("Descargado — mándale el archivo a Diego");
      } else {
        haptic.warn();
        showToast("No se pudo copiar ni descargar.", "error");
      }
    }
  }

  function wipe() {
    clearEvents();
    clearUsage();
    setEvents([]);
    setUsage(readUsage());
    haptic.warn();
    showSuccess("Registro borrado");
  }

  return (
    <Sheet
      title="Diagnóstico"
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={() => void send()}>
            Enviar a Diego
          </button>
          {isAdmin && (events.length > 0 || ranked.length > 0) && (
            <button type="button" className="btn btn-secondary" onClick={wipe}>
              Borrar registro
            </button>
          )}
        </div>
      }
    >
      <div className="money-panel" style={{ marginBottom: 16 }}>
        <div className="diag-verdict">{verdict(summary)}</div>
        <div className="diag-note">
          {summary.occurrences === 0
            ? "No hubo errores ni avisos. Este registro vive solo en este teléfono."
            : "Este registro vive solo en este teléfono. Nada se envía hasta que tú lo mandes."}
        </div>
      </div>

      {partialTables.length > 0 && (
        <div className="money-panel money-panel--compact" style={{ marginBottom: 16 }}>
          <div className="input-label">Datos incompletos</div>
          <div className="diag-note">
            Angus no cargó todo: {partialTables.map((r) => r.table).join(", ")}. Algunos totales
            pueden faltar.
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <EmptyState
          icon="check"
          title="Sin avisos"
          body="Cuando algo falle, aparecerá aquí con la hora y el motivo."
        />
      ) : (
        <>
          <div className="money-sheet-section-title">Últimos avisos</div>
          {events.map((e, i) => (
            <div className="diag-event" key={`${e.at}-${i}`}>
              <div className="diag-event-head">
                <span className="row-title">{KIND_LABEL[e.kind]}</span>
                {e.count > 1 && <span className="badge badge-amber">{e.count}×</span>}
                <span className="diag-event-when">{whenLabel(e.lastAt ?? e.at)}</span>
              </div>
              {/* The raw server text is only useful to whoever can act on
                  it, and it is the one thing that can read alarmingly. */}
              {isAdmin ? (
                <div className="diag-event-msg">
                  {e.scope} · {e.message}
                </div>
              ) : (
                <div className="diag-note">{e.scope}</div>
              )}
            </div>
          ))}
        </>
      )}

      {isAdmin && (
        <>
          <div className="money-sheet-section-title" style={{ marginTop: 20 }}>
            Filas cargadas
          </div>
          {loadReports.map(({ table, report: r }) => (
            <div className="diag-table-row" key={table}>
              <span className="diag-table-name">{table}</span>
              {r.truncated && <Icon name="alert" size={12} />}
              <span className="diag-table-count">
                {r.loaded}
                {r.total !== null && r.total !== r.loaded ? ` / ${r.total}` : ""}
              </span>
            </div>
          ))}

          <div className="money-sheet-section-title" style={{ marginTop: 20 }}>
            Pantallas abiertas
          </div>
          {ranked.length === 0 ? (
            <div className="diag-note">Nada registrado todavía.</div>
          ) : (
            ranked.map(({ route, visits }) => (
              <div className="diag-table-row" key={route}>
                <span className="diag-table-name">{route}</span>
                <span className="diag-table-count">{visits}</span>
              </div>
            ))
          )}
          {never.length > 0 && (
            <div className="diag-note" style={{ marginTop: 8 }}>
              Nunca abiertas: {never.join(", ")}
            </div>
          )}

          <div className="diag-note" style={{ marginTop: 20 }}>
            Angus {__APP_VERSION__} · desde {usage.since.slice(0, 10)}
          </div>
        </>
      )}
    </Sheet>
  );
}
