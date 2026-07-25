import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { AuthPage } from "./pages/AuthPage.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Spinner } from "./components/ui.tsx";
import {
  fetchCurrentUser,
  setUnauthorizedHandler,
  type AuthUser,
} from "./utils/api.ts";
import { applyTheme, resolveInitialTheme, useTheme } from "./utils/theme.ts";

// Apply the saved theme before React paints, so there is no white flash.
applyTheme(resolveInitialTheme());
document.documentElement.classList.add("theme-ready");

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
  const { theme, toggleTheme } = useTheme();
  const isAdminRoute = hash === "#admin" || hash === "#/admin";

  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  // Restore the session on load (token lives in localStorage).
  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((found) => { if (!cancelled) setUser(found); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  // If any API call returns 401, drop straight back to the login screen.
  const handleUnauthorized = useCallback(() => setUser(null), []);
  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
  }, [handleUnauthorized]);

  // The admin area has its own password and is independent of user accounts.
  if (isAdminRoute) return <AdminPage theme={theme} onToggleTheme={toggleTheme} />;

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-slate-500 font-medium">Loading TRUESMM…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <App
      user={user}
      onSignOut={() => setUser(null)}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
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
