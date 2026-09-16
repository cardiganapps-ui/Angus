import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icon";
import { recordEvent } from "../lib/diagnostics";

/* ── AppErrorBoundary ──
   The app had no error boundary at all: a render throw anywhere gave a
   blank white page that recorded nothing, which during a pilot is the
   one failure you learn nothing from.

   It wraps the screen INSIDE the shell, so the topbar and the tab pill
   survive a crash and she can move to another screen instead of being
   stuck. `resetKey` (the route) clears the error when she navigates, so
   one broken screen doesn't poison the rest of the session.

   A class component because componentDidCatch has no hook equivalent. */

interface Props {
  children: ReactNode;
  /** Changing this clears the error — pass the current route. */
  resetKey?: string;
  /** Opens Ajustes → Diagnóstico, when the shell can route there. */
  onOpenDiagnostics?: () => void;
}

interface State {
  message: string | null;
  resetKey?: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { message: null, resetKey: undefined };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating away is her escape hatch: drop the error so the next
    // screen renders instead of inheriting this one's failure.
    if (state.message && state.resetKey !== undefined && props.resetKey !== state.resetKey) {
      return { message: null, resetKey: props.resetKey };
    }
    if (state.resetKey !== props.resetKey) return { resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* The component stack is what makes a crash report actionable —
       "Algo se rompió" alone identifies nothing. First frame only: the
       full stack is long, and the log caps message length anyway. */
    const frame = (info.componentStack ?? "").trim().split("\n")[0]?.trim() ?? "";
    recordEvent("crash", frame || "render", error.message || String(error));
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div className="page">
        <div className="empty-state" role="alert">
          <div className="empty-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="empty-state-title">Algo se rompió</div>
          {/* "Nada se perdió" was not a claim this boundary could make. It
              wraps the screen, and sheets are component state, not routes —
              so a half-filled sheet lives inside the subtree being replaced
              here, and Recargar is what finishes it off. Saved rows really
              are safe; what she was typing is not, and she is the one who
              should decide what to do about that. */}
          <div className="empty-state-body">
            Esta pantalla no pudo abrirse. Lo que ya guardaste está a salvo; lo que estabas
            escribiendo aquí, no. Puedes recargar para empezar de nuevo, o ir a otra pantalla
            desde el menú.
          </div>
          <div className="crash-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Recargar
            </button>
            {this.props.onOpenDiagnostics && (
              <button type="button" className="btn btn-secondary" onClick={this.props.onOpenDiagnostics}>
                Ver diagnóstico
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
