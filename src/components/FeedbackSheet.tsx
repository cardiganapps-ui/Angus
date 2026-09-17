import { useState } from "react";
import { Sheet } from "./Sheet";
import { SegmentedControl } from "./SegmentedControl";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { FEEDBACK_KINDS, type FeedbackKind } from "../data/constants";
import { apiFetch, isOffline } from "../lib/api";
import { readEvents } from "../lib/diagnostics";
import { readBreadcrumbs } from "../lib/breadcrumbs";
import { haptic } from "../lib/haptics";
import { firstName } from "../utils/settings";
import { prefersAutoFocus } from "../lib/device";

/* ── Cuéntale a Diego ──
   The one channel from her to whoever maintains this. A kind, a
   message, send. What travels with it is only what helps reproduce:
   the screen she was on, the app version, the viewport, whether she
   was online, and the last few local diagnostics — messages, never
   rows (lib/diagnostics.ts). It says so on the sheet.

   The row lands in `feedback` through api/feedback.ts and the mail
   goes out from there; the toast promises only what the server
   confirmed. A failure keeps her text in the box. */

const MIN_LENGTH = 3;

const PLACEHOLDER: Record<FeedbackKind, string> = {
  bug: "Qué pasó, en qué pantalla, y qué esperabas que pasara.",
  idea: "Qué te gustaría que Angus hiciera, o hiciera distinto.",
  question: "Lo que quieras preguntar — te contesto por correo."
};

type Tables = { table: string; loaded: number; total: number | null; truncated: boolean; readError: string | null }[];

/* Everything that helps someone reproduce what she saw, nothing that
   is hers: no rows, no titles, no amounts. */
function context(route: string | undefined, tables: Tables) {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const win = typeof window !== "undefined" ? window : null;
  const conn = nav ? (nav as Navigator & { connection?: { effectiveType?: string } }).connection : undefined;
  return {
    route: route ?? (win ? win.location.hash.replace(/^#\/?/, "") || "home" : "unknown"),
    version: __APP_VERSION__,
    build: __BUILD_SHA__,
    at: new Date().toISOString(),
    lang: nav?.language ?? null,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    connection: conn?.effectiveType ?? null,
    online: nav ? nav.onLine : null,
    standalone: win ? win.matchMedia("(display-mode: standalone)").matches : null,
    viewport: win ? `${win.innerWidth}×${win.innerHeight}` : null,
    ua: nav ? nav.userAgent.slice(0, 200) : null,
    recent: readEvents()
      .slice(0, 5)
      .map((e) => ({ at: e.lastAt ?? e.at, kind: e.kind, scope: e.scope, message: e.message, count: e.count })),
    // Her last 40 steps: screens visited and anything the page complained about.
    trail: readBreadcrumbs(),
    // How much of each table the app was holding — "the total is wrong"
    // is usually "the store was truncated".
    tables
  };
}

export function FeedbackSheet({ route, onClose }: { route?: string; onClose: () => void }) {
  const { workspaceId, settings, loadReports } = useApp();
  const { showSuccess, showToast } = useToast();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSend = message.trim().length >= MIN_LENGTH && !submitting;

  async function send() {
    if (!canSend) return;
    if (isOffline()) {
      haptic.warn();
      showToast("Sin conexión. Tu mensaje sigue aquí — mándalo cuando vuelva la señal.", "warning");
      return;
    }
    setSubmitting(true);
    const result = await apiFetch<{ id: string; notified: boolean }>("/api/feedback", {
      workspaceId,
      kind,
      message: message.trim(),
      context: context(
        route,
        loadReports.map(({ table, report: r }) => ({ table, loaded: r.loaded, total: r.total, truncated: r.truncated, readError: r.readError }))
      )
    });
    setSubmitting(false);
    if (!result.ok) {
      haptic.warn();
      showToast(
        result.error.code === "network"
          ? "No se pudo conectar. Tu mensaje sigue aquí — inténtalo otra vez."
          : "No se pudo enviar. Tu mensaje sigue aquí — inténtalo en un momento.",
        "error"
      );
      return;
    }
    haptic.success();
    const name = firstName(settings.artistName);
    showSuccess(name ? `Recibido — gracias, ${name}. Le llega a Diego.` : "Recibido — le llega a Diego.");
    onClose();
  }

  return (
    <Sheet
      title="Cuéntale a Diego"
      onClose={submitting ? null : onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={!canSend}>
            {submitting ? "Enviando…" : "Enviar"}
          </button>
        </div>
      }
    >
      <SegmentedControl
        items={FEEDBACK_KINDS.map((k) => ({ k: k.value, l: k.label }))}
        value={kind}
        onChange={(k) => {
          haptic.tap();
          setKind(k as FeedbackKind);
        }}
        size="sm"
        ariaLabel="Tipo de mensaje"
        style={{ marginBottom: 16 }}
      />

      <div className="input-group">
        <label className="input-label" htmlFor="feedback-message">
          {kind === "bug" ? "Qué falló" : kind === "idea" ? "Tu idea" : "Tu pregunta"}
        </label>
        <textarea
          id="feedback-message"
          className="input"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={PLACEHOLDER[kind]}
          maxLength={4000}
          autoFocus={prefersAutoFocus()}
          disabled={submitting}
        />
        <div className="input-help">
          Se manda con la pantalla donde estás, las últimas que abriste, la versión de Angus y los
          últimos avisos — nunca tus registros.
        </div>
      </div>
    </Sheet>
  );
}
