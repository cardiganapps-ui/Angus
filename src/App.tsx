import { AppProvider } from "./context/AppContext";
import { useNavigation, type Route } from "./hooks/useNavigation";
import { Icon, type IconName } from "./components/Icon";
import { Home } from "./screens/Home";
import { Projects } from "./screens/Projects";
import { Contacts } from "./screens/Contacts";
import { Schedule } from "./screens/Schedule";

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: "home", label: "Hoy", icon: "home" },
  { route: "projects", label: "Proyectos", icon: "palette" },
  { route: "contacts", label: "Contactos", icon: "users" },
  { route: "schedule", label: "Agenda", icon: "calendar" }
];

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

export default function App() {
  const { route, navigate } = useNavigation();

  return (
    <AppProvider>
      <div className="shell">
        <div className="main-content">
          <Screen route={route} />
        </div>
        <nav className="bottom-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.route}
              className={`tab-btn ${route === tab.route ? "active" : ""}`}
              onClick={() => navigate(tab.route)}
            >
              <Icon name={tab.icon} size={22} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </AppProvider>
  );
}
