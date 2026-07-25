import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import {
  Button,
  Card,
  Input,
  Select,
  StatCard,
  StatusPill,
  InfoBanner,
  SectionHeader,
  EmptyState,
} from "../components/ui";

const ADMIN_SESSION_KEY = "truesmm-admin-session";
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;

interface AccessKeyRow {
  id?: number | string;
  key: string;
  is_active: boolean;
  fingerprint: string | null;
  activated_at: string | null;
  expires_at: string | null;
  duration_seconds: number | null;
  created_at?: string | null;
  note?: string | null;
}

interface DurationOption {
  label: string;
  seconds: number | null;
}

const DURATION_OPTIONS: DurationOption[] = [
  { label: "10 minutes", seconds: 10 * 60 },
  { label: "30 minutes", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "6 hours", seconds: 6 * 60 * 60 },
  { label: "12 hours", seconds: 12 * 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: 30 * 24 * 60 * 60 },
  { label: "Lifetime (never expires)", seconds: null },
];

function randomKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = (n: number) =>
    Array.from(
      { length: n },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `TRUESMM-${block(4)}-${block(4)}-${block(4)}`;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m left`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h left`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "Lifetime";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

type KeyStatus = "unused" | "active" | "expired" | "revoked";

function keyStatus(k: AccessKeyRow): KeyStatus {
  if (!k.is_active) return "revoked";
  if (!k.fingerprint) return "unused";
  if (k.expires_at && Date.now() >= new Date(k.expires_at).getTime())
    return "expired";
  return "active";
}

export function AdminPage() {
  const [authed, setAuthed] = useState<boolean>(() => {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  });
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const [keys, setKeys] = useState<AccessKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [newKey, setNewKey] = useState(randomKey());
  const [newDuration, setNewDuration] = useState<DurationOption>(DURATION_OPTIONS[5]);
  const [customMinutes, setCustomMinutes] = useState<number>(0);
  const [useCustom, setUseCustom] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "warning" | "danger" | "info"; message: string } | null>(null);

  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const fireToast = (kind: "success" | "warning" | "danger" | "info", msg: string) => {
    setToast({ kind, message: msg });
    setTimeout(() => setToast(null), 6000);
  };

  function describeError(e: unknown): string {
    if (!e) return "Unknown error";
    if (typeof e === "string") return e;
    if (e instanceof Error) return e.message;
    const anyE = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof anyE.message === "string") parts.push(anyE.message);
    if (typeof anyE.details === "string") parts.push(`details: ${anyE.details}`);
    if (typeof anyE.hint === "string") parts.push(`hint: ${anyE.hint}`);
    if (typeof anyE.code === "string") parts.push(`code: ${anyE.code}`);
    if (parts.length > 0) return parts.join(" — ");
    try { return JSON.stringify(e); } catch { return String(e); }
  }

  const loadKeys = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("access_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setKeys((data as AccessKeyRow[]) || []);
    } catch (e: unknown) {
      setLoadError(
        `Could not load keys. Make sure the access_keys table has the new columns (duration_seconds, expires_at, note) and admin row-level read access. Details: ${describeError(e)}`
      );
      console.error("Load keys failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) loadKeys();
  }, [authed]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ADMIN_PASSWORD) {
      setPwError("Admin password is not configured. Set VITE_ADMIN_PASSWORD in Vercel.");
      return;
    }
    if (pwInput === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      setAuthed(true);
      setPwError("");
    } else {
      setPwError("Wrong password.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAuthed(false);
    setPwInput("");
  };

  const effectiveSeconds = (): number | null => {
    if (useCustom) {
      const m = Math.max(0, Math.floor(customMinutes));
      return m === 0 ? null : m * 60;
    }
    return newDuration.seconds;
  };

  const handleCreate = async () => {
    const trimmed = newKey.trim().toUpperCase();
    if (!trimmed) {
      fireToast("warning", "Key cannot be empty.");
      return;
    }
    setCreating(true);
    try {
      const payload: Partial<AccessKeyRow> = {
        key: trimmed,
        is_active: true,
        fingerprint: null,
        activated_at: null,
        expires_at: null,
        duration_seconds: effectiveSeconds(),
        note: newNote.trim() || null,
      };
      const { error } = await supabase.from("access_keys").insert(payload);
      if (error) throw error;
      fireToast("success", `Key created: ${trimmed}`);
      setNewKey(randomKey());
      setNewNote("");
      await loadKeys();
    } catch (e: unknown) {
      fireToast("danger", describeError(e));
      console.error("Create key failed:", e);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (k: AccessKeyRow) => {
    if (!confirm(`Revoke key "${k.key}"? Users will be locked out immediately.`)) return;
    const { error } = await supabase
      .from("access_keys")
      .update({ is_active: false })
      .eq("key", k.key);
    if (error) {
      fireToast("danger", describeError(error));
      return;
    }
    fireToast("info", "Key revoked.");
    loadKeys();
  };

  const handleReactivate = async (k: AccessKeyRow) => {
    if (!confirm(`Reactivate key "${k.key}"?`)) return;
    const { error } = await supabase
      .from("access_keys")
      .update({ is_active: true })
      .eq("key", k.key);
    if (error) {
      fireToast("danger", describeError(error));
      return;
    }
    fireToast("success", "Key reactivated.");
    loadKeys();
  };

  const handleResetFingerprint = async (k: AccessKeyRow) => {
    if (
      !confirm(
        `Unbind device for "${k.key}"? The next person who enters this key on any browser will activate it freshly.`
      )
    )
      return;
    const { error } = await supabase
      .from("access_keys")
      .update({ fingerprint: null, activated_at: null, expires_at: null })
      .eq("key", k.key);
    if (error) {
      fireToast("danger", describeError(error));
      return;
    }
    fireToast("success", "Device unbound. Expiry timer also reset.");
    loadKeys();
  };

  const handleExtend = async (k: AccessKeyRow, extraSeconds: number) => {
    const baseMs = k.expires_at
      ? new Date(k.expires_at).getTime()
      : Date.now();
    const fromMs = baseMs < Date.now() ? Date.now() : baseMs;
    const newExp = new Date(fromMs + extraSeconds * 1000).toISOString();
    const { error } = await supabase
      .from("access_keys")
      .update({ expires_at: newExp })
      .eq("key", k.key);
    if (error) {
      fireToast("danger", describeError(error));
      return;
    }
    fireToast("success", `Extended by ${formatDuration(extraSeconds)}.`);
    loadKeys();
  };

  const handleDelete = async (k: AccessKeyRow) => {
    if (
      !confirm(
        `PERMANENTLY DELETE key "${k.key}"? This cannot be undone. Prefer Revoke instead.`
      )
    )
      return;
    const { error } = await supabase
      .from("access_keys")
      .delete()
      .eq("key", k.key);
    if (error) {
      fireToast("danger", describeError(error));
      return;
    }
    fireToast("info", "Key deleted.");
    loadKeys();
  };

  const copyKey = async (k: string) => {
    try {
      await navigator.clipboard.writeText(k);
      fireToast("success", `Copied: ${k}`);
    } catch {
      fireToast("warning", "Could not copy.");
    }
  };

  const stats = useMemo(() => {
    const s = { total: keys.length, unused: 0, active: 0, expired: 0, revoked: 0 };
    for (const k of keys) s[keyStatus(k)]++;
    return s;
  }, [keys]);

  // ===== Auth gate =====
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20">
              <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Admin</h1>
            <p className="mt-1 text-sm text-slate-500">Key management console</p>
          </div>
          <Card padding="md">
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Admin password"
                type="password"
                value={pwInput}
                onChange={(e) => {
                  setPwInput(e.target.value);
                  setPwError("");
                }}
                autoFocus
              />
              {pwError && <InfoBanner kind="danger">{pwError}</InfoBanner>}
              <Button type="submit" variant="primary" fullWidth size="lg">Unlock</Button>
              <p className="text-center text-xs text-slate-500">
                Set the password via <code className="text-slate-700">VITE_ADMIN_PASSWORD</code> at build time.
              </p>
            </form>
          </Card>
          <p className="mt-4 text-center text-xs text-slate-500">
            Go back: <a href="#" className="text-indigo-600 hover:underline">remove #admin from URL</a>
          </p>
        </motion.div>
      </div>
    );
  }

  // ===== Admin dashboard =====
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        <SectionHeader
          eyebrow="Administration"
          title="Access keys"
          description="Create, set duration, revoke, extend, and unbind keys. Timers start at first login."
          actions={
            <div className="flex items-center gap-2">
              <a href="#" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                Back to app
              </a>
              <Button variant="danger" size="sm" onClick={handleLogout}>
                Lock
              </Button>
            </div>
          }
        />

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <InfoBanner kind={toast.kind}>{toast.message}</InfoBanner>
            </motion.div>
          )}
        </AnimatePresence>

        {loadError && <InfoBanner kind="danger">{loadError}</InfoBanner>}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          } />
          <StatCard label="Unused" value={stats.unused} tone="info" icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          } />
          <StatCard label="Active" value={stats.active} tone="success" icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          } />
          <StatCard label="Expired" value={stats.expired} tone="warning" icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          } />
          <StatCard label="Revoked" value={stats.revoked} tone="danger" icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          } />
        </div>

        {/* Create form */}
        <Card padding="md">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Create a new key</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Access key</label>
              <div className="flex gap-2">
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                  className="flex-1 font-mono"
                />
                <Button variant="outline" size="md" onClick={() => setNewKey(randomKey())} title="Generate random">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Active duration</label>
              {!useCustom ? (
                <Select
                  value={String(newDuration.seconds ?? "null")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "custom") { setUseCustom(true); return; }
                    const opt = DURATION_OPTIONS.find((o) => String(o.seconds ?? "null") === v) || DURATION_OPTIONS[0];
                    setNewDuration(opt);
                  }}
                  options={[
                    ...DURATION_OPTIONS.map((o) => ({ value: String(o.seconds ?? "null"), label: o.label })),
                    { value: "custom", label: "Custom (minutes)…" },
                  ]}
                />
              ) : (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={customMinutes || ""}
                    onChange={(e) => setCustomMinutes(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="minutes"
                    className="flex-1"
                  />
                  <Button variant="outline" size="md" onClick={() => setUseCustom(false)}>
                    ↩
                  </Button>
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Timer starts at first login. Lifetime = never expires.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Note (optional)</label>
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. for Alex - paid trial"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={creating} disabled={creating} onClick={handleCreate}>
              Create key
            </Button>
            <span className="text-sm text-slate-600">
              Selected:{" "}
              <span className="font-semibold text-indigo-700">
                {useCustom
                  ? customMinutes > 0
                    ? `${customMinutes} min`
                    : "Lifetime"
                  : newDuration.label}
              </span>
            </span>
          </div>
        </Card>

        {/* Keys table */}
        <Card padding="none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">All keys</h2>
              <p className="text-xs text-slate-500 mt-0.5">{keys.length} total</p>
            </div>
            <Button variant="outline" size="sm" loading={loading} disabled={loading} onClick={loadKeys}>
              Refresh
            </Button>
          </div>

          {keys.length === 0 && !loading ? (
            <div className="p-6">
              <EmptyState
                icon={
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                }
                title="No keys yet"
                description="Create your first access key above."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Key</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">Duration</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Activated</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Expires</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Note</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map((k) => {
                    const s = keyStatus(k);
                    const remaining = k.expires_at
                      ? new Date(k.expires_at).getTime() - Date.now()
                      : null;
                    return (
                      <tr key={k.key} className="hover:bg-slate-50 align-top">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => copyKey(k.key)}
                            title="Click to copy"
                            className="font-mono text-sm text-indigo-700 hover:text-indigo-900 transition font-semibold"
                          >
                            {k.key}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill kind={s as any}>{s.charAt(0).toUpperCase() + s.slice(1)}</StatusPill>
                          {s === "active" && remaining !== null && (
                            <p className="mt-1 text-xs text-slate-500 tabular-nums">
                              {formatRemaining(remaining)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell text-sm">
                          {formatDuration(k.duration_seconds ?? null)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-sm">
                          {k.activated_at ? new Date(k.activated_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-sm">
                          {k.expires_at ? new Date(k.expires_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden lg:table-cell max-w-[180px] truncate text-sm" title={k.note || ""}>
                          {k.note || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1">
                            {s === "active" && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleExtend(k, 60 * 60)}>+1h</Button>
                                <Button size="sm" variant="outline" onClick={() => handleExtend(k, 24 * 60 * 60)}>+1d</Button>
                              </>
                            )}
                            {(s === "expired" || s === "unused") && (
                              <Button size="sm" variant="outline" onClick={() => handleExtend(k, 24 * 60 * 60)}>+1d</Button>
                            )}
                            {s !== "revoked" ? (
                              <Button size="sm" variant="danger" onClick={() => handleRevoke(k)}>Revoke</Button>
                            ) : (
                              <Button size="sm" variant="success" onClick={() => handleReactivate(k)}>Reactivate</Button>
                            )}
                            {k.fingerprint && (
                              <Button size="sm" variant="ghost" onClick={() => handleResetFingerprint(k)} title="Unbind device + reset expiry timer">
                                Unbind
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(k)}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
