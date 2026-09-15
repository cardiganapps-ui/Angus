import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppProvider, useApp, type WorkspaceActions } from "./context/AppContext";
import { SessionProvider, type SessionValue } from "./context/SessionContext";
import { ToastProvider } from "./context/ToastContext";
import { useAuth } from "./hooks/useAuth";
import { isTabRoute, useNavigation, type Route } from "./hooks/useNavigation";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTheme } from "./hooks/useTheme";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { AccountSheet } from "./components/AccountSheet";
import { ChangePasswordSheet } from "./components/ChangePasswordSheet";
import { Drawer } from "./components/Drawer";
import { EmptyState } from "./components/EmptyState";
import { Icon } from "./components/Icon";
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
import { Settings } from "./screens/Settings";
import { applyTextScale } from "./lib/appearance";
import { haptic } from "./lib/haptics";

function Screen({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  switch (route) {
    case "home":
      // Home's figures double as a way into the tab that owns them, so
      // it's the one screen that navigates from inside the content.
      return <Home navigate={navigate} />;
    case "projects":
      return <Projects />;
    case "contacts":
      return <Contacts />;
    case "schedule":
      return <Schedule />;
    case "money":
      return <Money />;
    case "settings":
      return <Settings />;
    default:
      return <Home navigate={navigate} />;
  }
}

/* ── Screen slide direction ──
   Moving to a tab with a HIGHER index slides the new screen in from
   the right (screenSlideLeft — content travels leftward), a lower
   index slides in from the left. Only tab-to-tab moves slide; a drawer
   route arrives with the plain fade (it's a different kind of place,
   not a neighbour). Derived during render from the previous route so
   the very first mount never animates; the wrapper is keyed on `route`
   in `SignedIn` so every later change replays the keyframe. */
type Direction = "left" | "right" | "fade" | null;
function useScreenDirection(route: Route): Direction {
  const [direction, setDirection] = useState<Direction>(null);
  const [prevRoute, setPrevRoute] = useState(route);
  if (route !== prevRoute) {
    setPrevRoute(route);
    if (isTabRoute(route) && isTabRoute(prevRoute)) {
      setDirection(TAB_ORDER.indexOf(route) > TAB_ORDER.indexOf(prevRoute) ? "left" : "right");
    } else {
      setDirection("fade");
    }
  }
  return direction;
}

const SCREEN_ANIMATION: Record<NonNullable<Direction>, string> = {
  left: "screenSlideLeft 0.5s var(--ease-spring)",
  right: "screenSlideRight 0.5s var(--ease-spring)",
  fade: "fadeIn var(--dur-base) var(--ease-out)"
};

/* ── SignedIn ──
   The data-backed body: pull-to-refresh wrapper → animated wrapper
   (keyed on route) → skeleton crossfade → the screen. Only this
   subtree moves on navigation; the chrome (top bar, FAB inside each
   screen is position: fixed, BottomTabs) stays put. */
function SignedIn({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const { loading, refreshAll } = useApp();
  const direction = useScreenDirection(route);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div
        key={route}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          animation: direction ? SCREEN_ANIMATION[direction] : undefined
        }}
      >
        <SkeletonCrossfade showContent={!loading} route={route}>
          <Screen route={route} navigate={navigate} />
        </SkeletonCrossfade>
      </div>
    </PullToRefresh>
  );
}

/* ── Shell ──
   Mirrors Cardigan's App.tsx chrome:
     .shell                       fixed-height flex column, overflow: clip
       [rail]                     ≥1024px: the drawer, persistent
       .main-content              flex: 1, overflow: clip
         .app-chrome-top          ONE floating glass layer (status bar +
                                  topbar) that page content scrolls UNDER
                                  on phones; measured into --chrome-top-h
         {children} → .page       the screen's own scroll container
         <BottomTabs />           floating Liquid Glass pill (hidden by
                                  the body:has(.sheet-overlay) rule while
                                  a sheet is open, together with the FAB)
   `tabs` is false on the auth screen so the pill doesn't render there. */
function Shell({
  route,
  navigate,
  tabs,
  topbarLeft,
  topbarRight,
  brand,
  rail,
  children
}: {
  route: Route;
  navigate: (r: Route) => void;
  tabs: boolean;
  topbarLeft?: ReactNode;
  topbarRight?: ReactNode;
  brand: string;
  rail?: ReactNode;
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
    return () => {
      ro.disconnect();
      shell.style.removeProperty("--chrome-top-h");
    };
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
    <div className={`shell ${rail ? "shell--rail" : ""}`} ref={shellRef}>
      <ToastProvider>
        <a href="#main-content" className="skip-link">
          Saltar al contenido
        </a>
        {rail}
        <div className="main-content" id="main-content" tabIndex={-1}>
          <div className="app-chrome-top" ref={chromeTopRef}>
            <div className="status-bar" />
            <div className="topbar">
              <div className="topbar-left">{topbarLeft}</div>
              <div className="topbar-brand">{brand}</div>
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
  const { route, navigate, back } = useNavigation();
  const auth = useAuth();
  const ws = useWorkspaces(auth.user?.id ?? null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const wide = useMediaQuery("(min-width: 1024px)");

  // Stable across renders so AppProvider's memo doesn't churn on every
  // App re-render (the hook's callbacks are themselves stable).
  const wsActions = useMemo<WorkspaceActions>(
    () => ({
      updateSettings: ws.updateSettings,
      renameWorkspace: ws.renameWorkspace,
      markOnboarded: ws.markOnboarded,
      error: ws.error,
      clearError: ws.clearError
    }),
    [ws.updateSettings, ws.renameWorkspace, ws.markOnboarded, ws.error, ws.clearError]
  );

  const user = auth.user;
  const signedIn = !auth.loading && !!user;
  const active = ws.active;
  const viewingShared = !!user && !!active && active.ownerId !== user.id;

  // The workspace's appearance settings are the source of truth; the
  // theme hook's localStorage copy only covers the pre-load paint.
  const themePref = active?.settings.theme;
  const textScale = active?.settings.textScale;
  useEffect(() => {
    if (themePref) theme.setPreference(themePref);
  }, [themePref, theme]);
  useEffect(() => {
    if (textScale) applyTextScale(textScale);
  }, [textScale]);

  const session = useMemo<SessionValue | null>(
    () =>
      user
        ? {
            email: user.email ?? "",
            userId: user.id,
            workspaces: ws.workspaces,
            activeWorkspaceId: active?.id ?? null,
            selectWorkspace: (id) => {
              ws.setActive(id);
              setAccountOpen(false);
            },
            signOut: async () => {
              await auth.signOut();
              setAccountOpen(false);
            },
            updatePassword: auth.updatePassword,
            openAccount: () => setAccountOpen(true)
          }
        : null,
    [user, ws, active?.id, auth]
  );

  const rail = wide && signedIn && !!active;
  const onTab = isTabRoute(route);

  // Auth gate: skeleton while the session + workspace list resolve (first
  // paint looks like the destination), AuthScreen when signed out, then
  // the data provider keyed on the active workspace so switching remounts
  // the stores cleanly.
  let body: ReactNode;
  if (auth.loading || (user && !ws.ready)) {
    body = <LoadingSkeleton route={route} />;
  } else if (!user) {
    body = <AuthScreen auth={auth} />;
  } else if (!active) {
    body = (
      <div className="page">
        <div className="card" style={{ marginTop: 24 }}>
          <EmptyState
            icon="home"
            title="No encontramos tu espacio"
            body={
              ws.error
                ? "No se pudo cargar. Revisa tu conexión."
                : "Tu cuenta aún no tiene un espacio de trabajo."
            }
          />
          <div style={{ padding: "0 16px 16px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%" }}
              onClick={() => void ws.reload()}
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <DataErrorToast />
        <SignedIn route={route} navigate={navigate} />
      </>
    );
  }

  const topbarLeft =
    signedIn && active ? (
      rail ? null : onTab ? (
        <button
          type="button"
          className="topbar-menu btn-tap"
          aria-label="Menú"
          aria-expanded={drawerOpen}
          onClick={() => {
            haptic.tap();
            setDrawerOpen(true);
          }}
        >
          <Icon name="menu" size={22} strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          className="topbar-menu btn-tap"
          aria-label="Volver"
          onClick={() => {
            haptic.tap();
            back();
          }}
        >
          <Icon name="chevron-left" size={22} strokeWidth={2.2} />
        </button>
      )
    ) : null;

  const topbarRight = signedIn ? (
    <>
      {viewingShared && <span className="badge badge-teal">Compartido</span>}
      <button
        type="button"
        className="topbar-avatar btn-tap"
        aria-label="Tu cuenta"
        onClick={() => setAccountOpen(true)}
      >
        {(active?.settings.artistName || user?.email || "?").slice(0, 1).toUpperCase()}
      </button>
    </>
  ) : null;

  const overlays = (
    <>
      {/* Arrived from a password-reset link: go straight to choosing a new
          one rather than dropping her into the app with a session she
          can't reproduce next time. */}
      {auth.recovering && user && (
        <ChangePasswordSheet updatePassword={auth.updatePassword} onClose={auth.clearRecovering} />
      )}
      {accountOpen && user && (
        <AccountSheet
          email={user.email ?? ""}
          userId={user.id}
          workspaces={ws.workspaces}
          activeId={active?.id ?? null}
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
    </>
  );

  if (!(signedIn && active && session)) {
    return (
      <Shell route={route} navigate={navigate} tabs={false} brand="Angus" topbarRight={topbarRight}>
        {body}
        {overlays}
      </Shell>
    );
  }

  return (
    <AppProvider key={active.id} workspace={active} actions={wsActions}>
      <SessionProvider value={session}>
        <Shell
          route={route}
          navigate={navigate}
          tabs
          brand={active.name}
          topbarLeft={topbarLeft}
          topbarRight={topbarRight}
          rail={rail ? <Drawer route={route} navigate={navigate} onClose={null} rail /> : null}
        >
          {body}
          {drawerOpen && !rail && (
            <Drawer route={route} navigate={navigate} onClose={() => setDrawerOpen(false)} />
          )}
          {overlays}
        </Shell>
      </SessionProvider>
    </AppProvider>
  );
}
