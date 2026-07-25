import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { supabase } from "./lib/supabase.ts";
import { Spinner } from "./components/ui.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

const STORAGE_KEY = "truesmm-access-key";

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

  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    if (isAdminRoute) return;
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRoute]);

  const checkAuth = async () => {
    try {
      const savedKey = localStorage.getItem(STORAGE_KEY);

      if (!savedKey || !savedKey.trim()) {
        setAuthState("unauthenticated");
        return;
      }

      const { data, error } = await supabase
        .from("access_keys")
        .select("is_active, expires_at")
        .eq("key", savedKey)
        .single();

      if (error || !data || !data.is_active) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthState("unauthenticated");
        return;
      }

      if (data.expires_at && Date.now() >= new Date(data.expires_at).getTime()) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthState("unauthenticated");
        return;
      }

      setAuthState("authenticated");
    } catch (err) {
      console.error("Auth check failed:", err);
      const savedKey = localStorage.getItem(STORAGE_KEY);
      setAuthState(savedKey && savedKey.trim() ? "authenticated" : "unauthenticated");
    }
  };

  if (isAdminRoute) {
    return <AdminPage />;
  }

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-slate-500 font-medium">Loading TRUESMM…</p>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginPage onAuthenticated={() => setAuthState("authenticated")} />;
  }

  return <App />;
}

// Global fallback for uncaught runtime errors so the screen never stays white.
// In development this lets you see the real error in the console; in production
// it gives the user a recovery button instead of a blank page.
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


