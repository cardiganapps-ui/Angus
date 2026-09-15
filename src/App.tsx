import { useEffect, useRef, type ReactNode } from "react";
import { AppProvider } from "./context/AppContext";
import { ToastProvider } from "./context/ToastContext";
import { useAuth } from "./hooks/useAuth";
import { useNavigation, type Route } from "./hooks/useNavigation";
import { useTheme } from "./hooks/useTheme";
import { BottomTabs } from "./components/BottomTabs";
import { DataErrorToast } from "./components/DataErrorToast";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { AuthScreen } from "./screens/AuthScreen";
import { Home } from "./screens/Home";
import { Projects } from "./screens/Projects";
import { Contacts } from "./screens/Contacts";
import { Schedule } from "./screens/Schedule";

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
  }
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
function Shell({ route, navigate, tabs, children }: {
  route: Route;
  navigate: (r: Route) => void;
  tabs: boolean;
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
  useTheme();

  // Auth gate: skeleton while the session resolves (first paint looks
  // like the destination), AuthScreen when signed out, the data
  // provider + screens once we have a user id.
  let body: ReactNode;
  if (auth.loading) {
    body = <LoadingSkeleton />;
  } else if (!auth.user) {
    body = <AuthScreen auth={auth} />;
  } else {
    body = (
      <AppProvider userId={auth.user.id}>
        <DataErrorToast />
        <Screen route={route} />
      </AppProvider>
    );
  }

  return (
    <Shell route={route} navigate={navigate} tabs={!auth.loading && !!auth.user}>
      {body}
    </Shell>
  );
}
