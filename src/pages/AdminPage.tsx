import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Button,
  Card,
  Input,
  InfoBanner,
  Spinner,
  StatusPill,
} from "../components/ui";
import type { ApiService } from "../types/order";
import {
  SERVICE_LABELS,
  fetchAdminPanelConfig,
  fetchAdminServices,
  saveAdminPanelConfig,
  verifyAdminPassword,
  getStoredAdminPassword,
  setStoredAdminPassword,
  clearStoredAdminPassword,
  type PanelConfig,
  fetchAdminUsers,
  setUserActive,
  type ServiceLabel,
  type AdminUser,
} from "../utils/api";

const LABEL_META: Record<ServiceLabel, { title: string; hint: string; required?: boolean }> = {
  views:    { title: "Views",    hint: "Required — drives the whole schedule", required: true },
  likes:    { title: "Likes",    hint: "Optional" },
  shares:   { title: "Shares",   hint: "Optional" },
  saves:    { title: "Saves",    hint: "Optional" },
  comments: { title: "Comments", hint: "Optional" },
  reposts:  { title: "Reposts",  hint: "Optional" },
};

function emptyIds(): Record<ServiceLabel, string> {
  return { views: "", likes: "", shares: "", saves: "", comments: "", reposts: "" };
}

export function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const [config, setConfig] = useState<PanelConfig | null>(null);
  const [panelName, setPanelName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [serviceIds, setServiceIds] = useState<Record<ServiceLabel, string>>(emptyIds());

  const [services, setServices] = useState<ApiService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [search, setSearch] = useState("");
  const [pickingFor, setPickingFor] = useState<ServiceLabel | null>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "danger"; msg: string } | null>(null);

  const [tab, setTab] = useState<"panel" | "users">("panel");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  const fireToast = (kind: "success" | "danger", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const applyConfig = useCallback((cfg: PanelConfig) => {
    setConfig(cfg);
    setPanelName(cfg.panelName);
    setApiUrl(cfg.apiUrl);
    setServiceIds({ ...emptyIds(), ...cfg.serviceIds });
    setApiKey("");
  }, []);

  const loadConfig = useCallback(async (pw: string) => {
    const cfg = await fetchAdminPanelConfig(pw);
    applyConfig(cfg);
  }, [applyConfig]);

  // Restore an existing session on mount
  useEffect(() => {
    const saved = getStoredAdminPassword();
    if (!saved) { setBooting(false); return; }
    (async () => {
      try {
        await loadConfig(saved);
        setPassword(saved);
        setAuthed(true);
      } catch {
        clearStoredAdminPassword();
      } finally {
        setBooting(false);
      }
    })();
  }, [loadConfig]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setAuthError("Enter the admin password."); return; }
    setAuthLoading(true);
    setAuthError("");
    try {
      const ok = await verifyAdminPassword(password);
      if (!ok) { setAuthError("Wrong password."); return; }
      await loadConfig(password);
      setStoredAdminPassword(password);
      setAuthed(true);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredAdminPassword();
    setAuthed(false);
    setPassword("");
    setConfig(null);
    setServices([]);
  };

  const handleLoadServices = async () => {
    setServicesLoading(true);
    setServicesError("");
    try {
      // Pass the typed values so the admin can test before saving.
      const list = await fetchAdminServices(password, {
        apiUrl: apiUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      setServices(list);
      if (list.length === 0) setServicesError("The panel returned no services.");
    } catch (e) {
      setServicesError(e instanceof Error ? e.message : "Could not load services.");
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      setUsers(await fetchAdminUsers(password));
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Could not load users.");
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleUser = async (u: AdminUser) => {
    const next = !u.isActive;
    if (!next && !confirm(`Disable ${u.email}? They will be signed out immediately.`)) return;
    try {
      await setUserActive(password, u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: next } : x)));
      fireToast("success", next ? "Account enabled." : "Account disabled.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Update failed.");
    }
  };

  const handleSave = async () => {
    if (!apiUrl.trim()) { fireToast("danger", "Panel API URL is required."); return; }
    if (!config?.hasApiKey && !apiKey.trim()) {
      fireToast("danger", "API key is required the first time.");
      return;
    }
    if (!serviceIds.views.trim()) { fireToast("danger", "A Views service id is required."); return; }

    setSaving(true);
    try {
      const cfg = await saveAdminPanelConfig(password, {
        panelName: panelName.trim(),
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        serviceIds,
      });
      applyConfig(cfg);
      fireToast("success", "Configuration saved. Users can now place orders.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? services.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
      : services;
    return list.slice(0, 300);
  }, [services, search]);

  const serviceById = useMemo(() => {
    const map = new Map<string, ApiService>();
    services.forEach((s) => map.set(s.id, s));
    return map;
  }, [services]);

  /* ---------------- LOGIN ---------------- */
  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg">
              <svg viewBox="0 0 100 100" className="h-8 w-8 text-white" fill="currentColor">
                <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
            <p className="mt-1 text-sm text-slate-500">TRUESMM panel configuration</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Admin password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(""); }}
                placeholder="••••••••"
                autoFocus
                disabled={authLoading}
              />
              {authError && <InfoBanner kind="danger">{authError}</InfoBanner>}
              <Button type="submit" variant="primary" size="lg" fullWidth loading={authLoading}>
                Sign in
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            <a href="#" className="hover:text-slate-600">← Back to the app</a>
          </p>
        </motion.div>
      </div>
    );
  }

  /* ---------------- DASHBOARD ---------------- */
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600">
              <svg viewBox="0 0 100 100" className="h-5 w-5 text-white" fill="currentColor">
                <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Admin</h1>
              <p className="text-[11px] text-slate-500">Panel &amp; service configuration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              View app
            </a>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setTab("panel")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              tab === "panel" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Panel
          </button>
          <button
            type="button"
            onClick={() => { setTab("users"); if (users.length === 0) loadUsers(); }}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              tab === "users" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Users
          </button>
        </div>

        {toast && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <InfoBanner kind={toast.kind === "success" ? "success" : "danger"}>{toast.msg}</InfoBanner>
          </motion.div>
        )}

        {tab === "panel" && (
          <>
          {config && (
            <InfoBanner kind={config.configured ? "success" : "warning"}>
              {config.configured
                ? `Live — users can place orders against "${config.panelName || config.apiUrl}".`
                : "Not configured yet. Set the panel URL, API key and at least a Views service id."}
            </InfoBanner>
          )}

          {/* ---- Panel credentials ---- */}
          <Card>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">SMM panel</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                These credentials stay on the server. Users never see or send them.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Panel name"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                placeholder="My SMM Provider"
              />
              <Input
                label="API URL"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://panel.example.com/api/v2"
              />
            </div>

            <div className="mt-4">
              <Input
                label="API key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config?.hasApiKey ? `Saved (${config.apiKeyMask}) — leave blank to keep` : "Paste the panel API key"}
                hint={config?.hasApiKey
                  ? "A key is already stored. Type a new one only if you want to replace it."
                  : "Required the first time."}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleLoadServices} loading={servicesLoading}>
                Load services from panel
              </Button>
              {services.length > 0 && (
                <span className="self-center text-xs font-medium text-slate-500">
                  {services.length} services loaded
                </span>
              )}
            </div>

            {servicesError && (
              <div className="mt-3">
                <InfoBanner kind="danger">{servicesError}</InfoBanner>
              </div>
            )}
          </Card>

          {/* ---- Service ids ---- */}
          <Card>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">Service IDs</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Map each engagement type to a service on the panel. Leave one blank to
                disable it — users won't be able to order it.
              </p>
            </div>

            <div className="space-y-3">
              {SERVICE_LABELS.map((label) => {
                const meta = LABEL_META[label];
                const current = serviceIds[label];
                const match = current ? serviceById.get(current) : undefined;
                return (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-200 p-3 sm:flex sm:items-center sm:gap-4"
                  >
                    <div className="sm:w-32">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{meta.title}</span>
                        {meta.required && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            REQUIRED
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{meta.hint}</p>
                    </div>

                    <div className="mt-2 flex-1 sm:mt-0">
                      <input
                        value={current}
                        onChange={(e) =>
                          setServiceIds((prev) => ({ ...prev, [label]: e.target.value.trim() }))
                        }
                        placeholder="Service ID (e.g. 1234)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                      />
                      {match && (
                        <p className="mt-1 truncate text-[11px] text-emerald-700">
                          ✓ {match.name} — rate {match.rate} / min {match.min} / max {match.max}
                        </p>
                      )}
                      {current && !match && services.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-600">
                          Not found in the loaded catalogue — double-check this id.
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex gap-2 sm:mt-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={services.length === 0}
                        onClick={() => { setPickingFor(label); setSearch(""); }}
                      >
                        Browse
                      </Button>
                      {current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setServiceIds((prev) => ({ ...prev, [label]: "" }))}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
              <Button variant="primary" onClick={handleSave} loading={saving}>
                Save configuration
              </Button>
              {config?.updatedAt && (
                <span className="text-xs text-slate-500">
                  Last saved {new Date(config.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </Card>
          </>
        )}

        {tab === "users" && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Registered users</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Everyone who signed up. Disabling an account signs it out immediately.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadUsers} loading={usersLoading}>
                Refresh
              </Button>
            </div>

            {usersError && <InfoBanner kind="danger">{usersError}</InfoBanner>}

            {!usersError && users.length === 0 && !usersLoading && (
              <p className="py-8 text-center text-sm text-slate-500">No accounts yet.</p>
            )}

            {users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Email</th>
                      <th className="py-2 pr-3 font-semibold">Name</th>
                      <th className="py-2 pr-3 font-semibold">Orders</th>
                      <th className="py-2 pr-3 font-semibold">Last login</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{u.email}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{u.name || "—"}</td>
                        <td className="py-2.5 pr-3 tabular-nums text-slate-600">{u.orderCount}</td>
                        <td className="py-2.5 pr-3 text-slate-500">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusPill kind={u.isActive ? "active" : "danger"}>
                            {u.isActive ? "Active" : "Disabled"}
                          </StatusPill>
                        </td>
                        <td className="py-2.5 text-right">
                          <Button variant="ghost" size="sm" onClick={() => toggleUser(u)}>
                            {u.isActive ? "Disable" : "Enable"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </main>

      {/* ---- Service picker ---- */}
      {pickingFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:h-[70vh] sm:rounded-2xl"
          >
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">
                  Choose a service for {LABEL_META[pickingFor].title}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setPickingFor(null)}>Close</Button>
              </div>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or id…"
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredServices.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">No matching services.</p>
              ) : (
                filteredServices.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setServiceIds((prev) => ({ ...prev, [pickingFor]: s.id }));
                      setPickingFor(null);
                    }}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-indigo-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-slate-900">{s.name}</span>
                      <StatusPill kind="info">{s.id}</StatusPill>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      rate {s.rate} · min {s.min} · max {s.max}
                    </p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
