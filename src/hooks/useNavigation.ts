import { useEffect, useState } from "react";

export type Route = "home" | "projects" | "contacts" | "schedule" | "money";

function readRoute(): Route {
  const hash = window.location.hash.replace("#", "");
  if (hash === "projects" || hash === "contacts" || hash === "schedule" || hash === "money") {
    return hash;
  }
  return "home";
}

export function useNavigation() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: Route) => {
    window.location.hash = next;
    setRoute(next);
  };

  return { route, navigate };
}
