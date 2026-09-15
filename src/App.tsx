import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { ToastProvider } from "./context/ToastContext";
import { useAuth } from "./hooks/useAuth";
import { useNavigation, type Route } from "./hooks/useNavigation";
import { useTheme } from "./hooks/useTheme";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { AccountSheet } from "./components/AccountSheet";
import { EmptyState } from "./components/EmptyState";
import { BottomTabs, TAB_ORDER } from "./components/BottomTabs";
import { DataErrorToast } from "./components/DataErrorToast";
import { LoadingSkeleton, SkeletonCrossfade } from "./components/LoadingSkeleton";
import { PullToRefresh } from "./components/PullToRefresh";
import { AuthScreen } from "./screens/AuthScreen";
import { Home } from "./screens/Home";
import { Projects } from "./screens/Projects";
import { Contacts } from "./screens/Contacts";
import { Schedule } from "./screens/Schedule";
import { Money } from "./screens/Money";

function Screen({ route }: { route: Route }) {
  switch (route) {
    case "home":
      return <Home />;
    case "projects":
      return <Projects />;
    case "contacts":
      return <Contacts />;
    case "schedule":
      return <Schedule />;
    case "money":
      return <Money />;
  }
}

/* ── Screen slide direction ──
   Mirrors Cardigan's useNavigation `direction`: moving to a tab with
   a HIGHER index slides the new screen in from the right
   (screenSlideLeft — content travels leftward), a lower index slides
   in from the left. Derived during render from the previous route so
   the very first mount (no previous route) never animates; the
   wrapper is keyed on `route` in `SignedIn` so every later change
   replays the keyframe from scratch. */
type Direction = "left" | "right" | null;
function useScreenDirection(route: Route): Direction {
  const [direction, setDirection] = useState<Direction>(null);
  const [prevRoute, setPrevRoute] = useState(route);
  if (route !== prevRoute) {
    setPrevRoute(route);
    setDirection(TAB_ORDER.indexOf(route) > TAB_ORDER.indexOf(prevRoute) ? "left" : "right");
  }
  return direction;
}

/* ── SignedIn ──
   The data-backed body: pull-to-refresh wrapper → slide-animated
   wrapper (keyed on route) → skeleton crossfade → the screen. Only
   this subtree moves on tab change; the chrome (top bar, FAB inside
   each screen is position: fixed, BottomTabs) stays put. */
function SignedIn({ route }: { route: Route }) {
  const { loading, refreshAll } = useApp();
  const direction = useScreenDirection(route);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div
        key={route}
        style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          animation: direction === "left" ? "screenSlideLeft 0.5s var(--ease-spring)"
            : direction === "right" ? "screenSlideRight 0.5s var(--ease-spring)"
            : undefined,
        }}>
        <SkeletonCrossfade showContent={!loading} route={route}>
          <Screen route={route} />
        </SkeletonCrossfade>
      </div>
    </PullToRefresh>
  );
}

/* ── Shell ──
   Mirrors Cardigan's App.tsx chrome:
     .shell                       fixed-height flex column, overflow: clip
       .main-content              flex: 1, overflow: clip
         .app-chrome-top          ONE floating glass layer (status bar +
                                  topbar) that page content scrolls UNDER
                                  on phones; measured into --chrome-top-h
         {children} → .page       the screen's own scroll container
         <BottomTabs />           floating Liquid Glass pill (hidden by
                                  the body:has(.sheet-overlay) rule while
                                  a sheet is open, together with the FAB)
   `tabs` is false on the auth screen so the pill doesn't render there. */
function Shell({ route, navigate, tabs, topbarRight, children }: {
  route: Route;
  navigate: (r: Route) => void;
  tabs: boolean;
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const chromeTopRef = useRef<HTMLDivElement | null>(null);

  // Publish the floating top chrome's height as --chrome-top-h on the
  // shell (consumed by .page padding-top and the toast anchor — see
  // base.css --chrome-top-overlap). offsetHeight keeps it in layout px.
  useEffect(() => {
    const el = chromeTopRef.current;
    const shell = shellRef.current;
    if (!el || !shell || typeof ResizeObserver === "undefined") return;
    const apply = () => shell.style.setProperty("--chrome-top-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => { ro.disconnect(); shell.style.removeProperty("--chrome-top-h"); };
  }, []);

  // Scroll-edge effect (iOS 26): the chrome's bottom fade-blur strip
  // only appears once content is actually scrolled under the glass.
  // Scroll events don't bubble, so listen in the CAPTURE phase at
  // document level and filter for the active .page.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.classList && t.classList.contains("page")) {
        shell.classList.toggle("shell--scrolled", t.scrollTop > 4);
      }
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  // New screens mount with scrollTop 0 but fire no scroll event — clear
  // the scrolled state on navigation so the edge effect doesn't stick.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const id = requestAnimationFrame(() => {
      const page = shell.querySelector<HTMLElement>(".page");
      shell.classList.toggle("shell--scrolled", !!page && page.scrollTop > 4);
    });
    return () => cancelAnimationFrame(id);
  }, [route]);

  return (
    <div className="shell" ref={shellRef}>
      <ToastProvider>
        <a href="#main-content" className="skip-link">Saltar al contenido</a>
        <div className="main-content" id="main-content" tabIndex={-1}>
          <div className="app-chrome-top" ref={chromeTopRef}>
            <div className="status-bar" />
            <div className="topbar">
              <div className="topbar-brand">Angus</div>
              <div className="topbar-right">{topbarRight}</div>
            </div>
          </div>
          {children}
          {tabs && <BottomTabs route={route} navigate={navigate} />}
        </div>
      </ToastProvider>
    </div>
  );
}

export default function App() {
  const { route, navigate } = useNavigation();
  const auth = useAuth();
  const ws = useWorkspaces(auth.user?.id ?? null);
  const [accountOpen, setAccountOpen] = useState(false);
  useTheme();

  const user = auth.user;
  const signedIn = !auth.loading && !!user;
  const viewingShared = !!user && !!ws.active && ws.active.ownerId !== user.id;

  // Auth gate: skeleton while the session + workspace list resolve (first
  // paint looks like the destination), AuthScreen when signed out, then
  // the data provider keyed on the active workspace so switching remounts
  // the stores cleanly.
  let body: ReactNode;
  if (auth.loading || (user && !ws.ready)) {
    body = <LoadingSkeleton route={route} />;
  } else if (!user) {
    body = <AuthScreen auth={auth} />;
  } else if (!ws.active) {
    body = (
      <div className="page">
        <div className="card" style={{ marginTop: 24 }}>
          <EmptyState
            icon="home"
            title="No encontramos tu espacio"
            body={ws.error ? "No se pudo cargar. Revisa tu conexión." : "Tu cuenta aún no tiene un espacio de trabajo."}
          />
          <div style={{ padding: "0 16px 16px" }}>
            <button type="button" className="btn btn-secondary" style={{ width: "100%" }} onClick={() => void ws.reload()}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <AppProvider key={ws.active.id} workspaceId={ws.active.id}>
        <DataErrorToast />
        <SignedIn route={route} />
      </AppProvider>
    );
  }

  const topbarRight = signedIn ? (
    <>
      {viewingShared && <span className="badge badge-teal">Compartido</span>}
      <button
        type="button"
        className="topbar-avatar btn-tap"
        aria-label="Tu cuenta"
        onClick={() => setAccountOpen(true)}
      >
        {(user?.email ?? "?").slice(0, 1).toUpperCase()}
      </button>
    </>
  ) : null;

  return (
    <Shell route={route} navigate={navigate} tabs={signedIn} topbarRight={topbarRight}>
      {body}
      {accountOpen && user && (
        <AccountSheet
          email={user.email ?? ""}
          userId={user.id}
          workspaces={ws.workspaces}
          activeId={ws.active?.id ?? null}
          onSelectWorkspace={(id) => {
            ws.setActive(id);
            setAccountOpen(false);
          }}
          onUpdatePassword={auth.updatePassword}
          onSignOut={async () => {
            await auth.signOut();
            setAccountOpen(false);
          }}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </Shell>
  );
}
