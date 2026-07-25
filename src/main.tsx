import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

// Auth (Supabase access-keys) has been removed for now.
// The app opens straight to the dashboard.

// Global fallback for uncaught runtime errors so the screen never stays white.
window.addEventListener("error", (event) => {
  console.error("Uncaught runtime error:", event.error);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
