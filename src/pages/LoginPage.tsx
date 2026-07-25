import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { getBrowserFingerprint } from "../lib/fingerprint";
import { Button, Input, InfoBanner } from "../components/ui";

const STORAGE_KEY = "truesmm-access-key";

interface LoginPageProps {
  onAuthenticated: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [keyInput, setKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [remainingMsg, setRemainingMsg] = useState("");

  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY);
    if (!savedKey || !savedKey.trim()) return;

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("access_keys")
          .select("*")
          .eq("key", savedKey)
          .single();

        if (fetchError || !data || !data.is_active) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        if (data.expires_at) {
          const expMs = new Date(data.expires_at).getTime();
          if (Date.now() >= expMs) {
            localStorage.removeItem(STORAGE_KEY);
            setError(
              "Your access key has expired. Contact your administrator for a new one."
            );
            return;
          }
        }

        onAuthenticated();
      } catch {
        onAuthenticated();
      }
    })();
  }, [onAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = keyInput.trim().toUpperCase();

    if (!trimmedKey) {
      setError("Enter your access key.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const fingerprint = await getBrowserFingerprint();

      const { data, error: fetchError } = await supabase
        .from("access_keys")
        .select("*")
        .eq("key", trimmedKey)
        .single();

      if (fetchError || !data) {
        setError("Invalid access key. Contact your administrator.");
        setLoading(false);
        return;
      }

      if (!data.is_active) {
        setError("This key has been revoked. Contact your administrator.");
        setLoading(false);
        return;
      }

      if (data.fingerprint === null) {
        const activatedAt = new Date();
        const updatePayload: Record<string, unknown> = {
          fingerprint,
          activated_at: activatedAt.toISOString(),
        };

        if (
          typeof data.duration_seconds === "number" &&
          data.duration_seconds > 0
        ) {
          const expiresAt = new Date(
            activatedAt.getTime() + data.duration_seconds * 1000
          );
          updatePayload.expires_at = expiresAt.toISOString();
        }

        const { error: updateError } = await supabase
          .from("access_keys")
          .update(updatePayload)
          .eq("key", trimmedKey);

        if (updateError) {
          setError("Activation failed. Try again.");
          setLoading(false);
          return;
        }

        localStorage.setItem(STORAGE_KEY, trimmedKey);

        if (updatePayload.expires_at) {
          const ms =
            new Date(updatePayload.expires_at as string).getTime() - Date.now();
          setRemainingMsg(`Valid for ${formatRemaining(ms)}`);
        } else {
          setRemainingMsg("Lifetime access");
        }

        setSuccess(true);
        setTimeout(() => onAuthenticated(), 1200);
        return;
      }

      if (data.expires_at) {
        const expMs = new Date(data.expires_at).getTime();
        if (Date.now() >= expMs) {
          setError(
            "This key has expired. Contact your administrator for a new one."
          );
          setLoading(false);
          return;
        }
      }

      setError(
        "This key has already been used. Each key is single-use only. If this is your browser, access should be automatic."
      );
      setLoading(false);
    } catch (err) {
      console.error("Login error:", err);
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(79, 70, 229, 0.06) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="inline-flex items-center justify-center mb-5"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20">
              <svg viewBox="0 0 100 100" className="h-8 w-8 text-white" fill="currentColor">
                <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
              </svg>
            </div>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold tracking-tight text-slate-900"
          >
            TRUESMM
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-1 text-sm text-slate-500"
          >
            Social Media Marketing Panel
          </motion.p>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/60"
        >
          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="mt-4 text-lg font-semibold text-slate-900">Access granted</p>
              <p className="mt-1 text-sm text-slate-500">Welcome to TRUESMM…</p>
              {remainingMsg && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  {remainingMsg}
                </p>
              )}
            </motion.div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
                <p className="mt-1 text-sm text-slate-500">Enter your access key to continue.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Access Key"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value.toUpperCase());
                    setError("");
                  }}
                  placeholder="TRUESMM-XXXX-XXXX-XXXX"
                  disabled={loading}
                  autoFocus
                  className="font-mono tracking-wide text-sm"
                />

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <InfoBanner kind="danger">{error}</InfoBanner>
                  </motion.div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} disabled={!keyInput.trim()}>
                  Sign in
                </Button>

                <p className="text-center text-xs text-slate-500">
                  Keys are device-locked. One key per browser.
                </p>
              </form>
            </>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center text-xs text-slate-400"
        >
          Restricted access. Authorized personnel only.
        </motion.p>
      </motion.div>
    </div>
  );
}
