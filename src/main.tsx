import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { installBreadcrumbs } from "./lib/breadcrumbs";

// Before anything renders, so the first error is in the trail too.
installBreadcrumbs();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
