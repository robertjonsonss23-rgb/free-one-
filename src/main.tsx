import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

// User auth was removed; the app opens straight to the dashboard.
// #admin is the only gated area (password checked server-side).

function useHash(): string {
  const [hash, setHash] = useState<string>(
    typeof window !== "undefined" ? window.location.hash : ""
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Root() {
  const hash = useHash();
  const isAdminRoute = hash === "#admin" || hash === "#/admin";
  return isAdminRoute ? <AdminPage /> : <App />;
}

// Global fallback for uncaught runtime errors so the screen never stays white.
window.addEventListener("error", (event) => {
  console.error("Uncaught runtime error:", event.error);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>
);
