import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Input, InfoBanner } from "../components/ui";
import { login, signup, type AuthUser } from "../utils/api";
import { ThemeToggle } from "../components/ThemeToggle";
import type { Theme } from "../utils/theme";

interface AuthPageProps {
  onAuthenticated: (user: AuthUser) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

type Mode = "login" | "signup";

export function AuthPage({ onAuthenticated, theme, onToggleTheme }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setPassword("");
    setConfirm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "signup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await signup(trimmedEmail, password, name.trim())
          : await login(trimmedEmail, password);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20">
            <svg viewBox="0 0 100 100" className="h-8 w-8 text-white" fill="currentColor">
              <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
            </svg>
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">TRUESMM</h1>
          <p className="mt-1 text-sm text-slate-500">Social Media Marketing Panel</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/60">
          {/* Tabs */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                !isSignup ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isSignup ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Create account
            </button>
          </div>

          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">
              {isSignup ? "Create your account" : "Welcome back"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isSignup
                ? "Sign up with your email to start creating campaigns."
                : "Sign in to access your campaigns from any device."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <Input
                label="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={loading}
                autoComplete="name"
              />
            )}

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@example.com"
              disabled={loading}
              autoFocus={!isSignup}
              autoComplete="email"
            />

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              disabled={loading}
              autoComplete={isSignup ? "new-password" : "current-password"}
              hint={isSignup ? "Use at least 8 characters." : undefined}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="px-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              }
            />

            {isSignup && (
              <Input
                label="Confirm password"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                placeholder="Re-enter your password"
                disabled={loading}
                autoComplete="new-password"
              />
            )}

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                <InfoBanner kind="danger">{error}</InfoBanner>
              </motion.div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {isSignup ? "Already have an account? " : "Don't have an account? "}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? "login" : "signup")}
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
          <p className="text-center text-xs text-slate-400">
            Your campaigns are saved to your account and available on any device.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
