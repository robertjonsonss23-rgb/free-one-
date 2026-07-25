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
  addPanel,
  updatePanel,
  deletePanel,
  saveServiceSlots,
  verifyAdminPassword,
  getStoredAdminPassword,
  setStoredAdminPassword,
  clearStoredAdminPassword,
  fetchAdminUsers,
  setUserActive,
  type AdminPanelConfig,
  type ServiceSlot,
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

function emptySlots(): Record<ServiceLabel, ServiceSlot[]> {
  return { views: [], likes: [], shares: [], saves: [], comments: [], reposts: [] };
}

export function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const [config, setConfig] = useState<AdminPanelConfig | null>(null);
  const [slots, setSlots] = useState<Record<ServiceLabel, ServiceSlot[]>>(emptySlots());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "danger"; msg: string } | null>(null);

  const [tab, setTab] = useState<"panels" | "services" | "users">("panels");

  // Add-panel form
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [addingPanel, setAddingPanel] = useState(false);

  // Service catalogue, cached per panel so switching panels is instant.
  const [catalogues, setCatalogues] = useState<Record<string, ApiService[]>>({});
  const [loadingPanelId, setLoadingPanelId] = useState<string | null>(null);
  const [catalogueError, setCatalogueError] = useState("");

  // Service picker modal
  const [picker, setPicker] = useState<{ label: ServiceLabel; index: number } | null>(null);
  const [pickerPanelId, setPickerPanelId] = useState("");
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  const fireToast = (kind: "success" | "danger", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const applyConfig = useCallback((cfg: AdminPanelConfig) => {
    setConfig(cfg);
    setSlots({ ...emptySlots(), ...cfg.serviceSlots });
  }, []);

  const loadConfig = useCallback(async (pw: string) => {
    applyConfig(await fetchAdminPanelConfig(pw));
  }, [applyConfig]);

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
  };

  /* ---- Panels ---- */
  const handleAddPanel = async () => {
    if (!newName.trim()) { fireToast("danger", "Panel name is required."); return; }
    if (!newUrl.trim()) { fireToast("danger", "API URL is required."); return; }
    if (!newKey.trim()) { fireToast("danger", "API key is required."); return; }
    setAddingPanel(true);
    try {
      applyConfig(await addPanel(password, {
        name: newName.trim(), apiUrl: newUrl.trim(), apiKey: newKey.trim(),
      }));
      setNewName(""); setNewUrl(""); setNewKey("");
      fireToast("success", "Panel added.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Could not add panel.");
    } finally {
      setAddingPanel(false);
    }
  };

  const handleTogglePanel = async (id: string, isActive: boolean) => {
    try {
      applyConfig(await updatePanel(password, id, { isActive }));
      fireToast("success", isActive ? "Panel enabled." : "Panel disabled.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Update failed.");
    }
  };

  const handleDeletePanel = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Any service slots using it will be removed.`)) return;
    try {
      applyConfig(await deletePanel(password, id));
      fireToast("success", "Panel deleted.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Delete failed.");
    }
  };

  /* ---- Catalogue ---- */
  const loadCatalogue = async (panelId: string) => {
    if (catalogues[panelId]) return;
    setLoadingPanelId(panelId);
    setCatalogueError("");
    try {
      const list = await fetchAdminServices(password, { panelId });
      setCatalogues((prev) => ({ ...prev, [panelId]: list }));
      if (list.length === 0) setCatalogueError("That panel returned no services.");
    } catch (e) {
      setCatalogueError(e instanceof Error ? e.message : "Could not load services.");
    } finally {
      setLoadingPanelId(null);
    }
  };

  /* ---- Slots ---- */
  const addSlot = (label: ServiceLabel) => {
    const firstPanel = config?.panels.find((p) => p.isActive)?.id || "";
    setSlots((prev) => ({
      ...prev,
      [label]: [...prev[label], { panelId: firstPanel, serviceId: "" }],
    }));
  };

  const removeSlot = (label: ServiceLabel, index: number) => {
    setSlots((prev) => ({
      ...prev,
      [label]: prev[label].filter((_, i) => i !== index),
    }));
  };

  const patchSlot = (label: ServiceLabel, index: number, patch: Partial<ServiceSlot>) => {
    setSlots((prev) => ({
      ...prev,
      [label]: prev[label].map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const handleSaveSlots = async () => {
    if (slots.views.length === 0 || !slots.views.some((s) => s.serviceId.trim())) {
      fireToast("danger", "At least one Views service is required.");
      return;
    }
    const incomplete = SERVICE_LABELS.some((label) =>
      slots[label].some((s) => !s.panelId || !s.serviceId.trim())
    );
    if (incomplete) {
      fireToast("danger", "Every slot needs a panel and a service ID.");
      return;
    }
    setSaving(true);
    try {
      const payload = {} as Record<ServiceLabel, Array<{ panelId: string; serviceId: string }>>;
      for (const label of SERVICE_LABELS) {
        payload[label] = slots[label].map((s) => ({
          panelId: s.panelId,
          serviceId: s.serviceId.trim(),
        }));
      }
      applyConfig(await saveServiceSlots(password, payload));
      fireToast("success", "Service mapping saved.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  /* ---- Users ---- */
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

  const panelNameById = useMemo(() => {
    const map = new Map<string, string>();
    config?.panels.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [config]);

  const pickerServices = useMemo(() => {
    const list = catalogues[pickerPanelId] || [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
      : list;
    return filtered.slice(0, 300);
  }, [catalogues, pickerPanelId, search]);

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
  const activePanels = config?.panels.filter((p) => p.isActive) || [];

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
              <p className="text-[11px] text-slate-500">Panels, services &amp; users</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-slate-900">View app</a>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        <div className="grid w-full max-w-md grid-cols-3 gap-1 rounded-lg bg-slate-200/70 p-1">
          {(["panels", "services", "users"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); if (key === "users" && users.length === 0) loadUsers(); }}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {toast && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <InfoBanner kind={toast.kind === "success" ? "success" : "danger"}>{toast.msg}</InfoBanner>
          </motion.div>
        )}

        {config && (
          <InfoBanner kind={config.configured ? "success" : "warning"}>
            {config.configured
              ? `Live — ${activePanels.length} panel${activePanels.length === 1 ? "" : "s"} connected, users can place orders.`
              : "Not ready yet. Add a panel, then map at least one Views service."}
          </InfoBanner>
        )}

        {/* ============ PANELS ============ */}
        {tab === "panels" && (
          <>
            <Card>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900">Connected panels</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Add as many SMM providers as you like. Credentials stay on the server.
                </p>
              </div>

              {config && config.panels.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">
                  No panels yet — add your first one below.
                </p>
              )}

              <div className="space-y-2">
                {config?.panels.map((panel) => (
                  <div
                    key={panel.id}
                    className="rounded-lg border border-slate-200 p-3 sm:flex sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{panel.name}</span>
                        <StatusPill kind={panel.isActive ? "active" : "danger"}>
                          {panel.isActive ? "Active" : "Disabled"}
                        </StatusPill>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{panel.apiUrl}</p>
                      <p className="text-[11px] font-mono text-slate-400">{panel.apiKeyMask}</p>
                    </div>
                    <div className="mt-2 flex gap-2 sm:mt-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTogglePanel(panel.id, !panel.isActive)}
                      >
                        {panel.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePanel(panel.id, panel.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Add a panel</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Panel name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My SMM Provider"
                />
                <Input
                  label="API URL"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://panel.example.com/api/v2"
                />
              </div>
              <div className="mt-4">
                <Input
                  label="API key"
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Paste the panel API key"
                />
              </div>
              <div className="mt-4">
                <Button variant="primary" onClick={handleAddPanel} loading={addingPanel}>
                  Add panel
                </Button>
              </div>
            </Card>
          </>
        )}

        {/* ============ SERVICES ============ */}
        {tab === "services" && (
          <Card>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">Service mapping</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Add more than one service to a row and the scheduler will{" "}
                <strong>rotate through them run by run</strong> — run 1 uses the first,
                run 2 the second, and so on. Each slot can point at a different panel.
              </p>
            </div>

            {activePanels.length === 0 ? (
              <InfoBanner kind="warning">
                Add an active panel first, then come back to map services.
              </InfoBanner>
            ) : (
              <>
                {catalogueError && <InfoBanner kind="danger">{catalogueError}</InfoBanner>}

                <div className="space-y-4">
                  {SERVICE_LABELS.map((label) => {
                    const meta = LABEL_META[label];
                    const rows = slots[label];
                    return (
                      <div key={label} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{meta.title}</span>
                            {meta.required && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                REQUIRED
                              </span>
                            )}
                            {rows.length > 1 && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                ROTATING ×{rows.length}
                              </span>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => addSlot(label)}>
                            + Add service
                          </Button>
                        </div>

                        {rows.length === 0 && (
                          <p className="py-2 text-[11px] text-slate-500">
                            Not offered to users. Click “Add service” to enable it.
                          </p>
                        )}

                        <div className="space-y-2">
                          {rows.map((slot, index) => {
                            const catalogue = catalogues[slot.panelId] || [];
                            const match = catalogue.find((s) => s.id === slot.serviceId);
                            return (
                              <div
                                key={index}
                                className="rounded-md bg-slate-50 p-2 sm:flex sm:items-center sm:gap-2"
                              >
                                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                                  {index + 1}
                                </span>

                                <select
                                  value={slot.panelId}
                                  onChange={(e) => {
                                    patchSlot(label, index, { panelId: e.target.value, serviceId: "" });
                                    loadCatalogue(e.target.value);
                                  }}
                                  className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:mt-0 sm:w-44"
                                >
                                  <option value="">Choose panel…</option>
                                  {activePanels.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>

                                <input
                                  value={slot.serviceId}
                                  onChange={(e) => patchSlot(label, index, { serviceId: e.target.value.trim() })}
                                  placeholder="Service ID"
                                  className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm sm:mt-0 sm:flex-1"
                                />

                                <div className="mt-2 flex gap-1 sm:mt-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={!slot.panelId}
                                    loading={loadingPanelId === slot.panelId}
                                    onClick={async () => {
                                      await loadCatalogue(slot.panelId);
                                      setPickerPanelId(slot.panelId);
                                      setPicker({ label, index });
                                      setSearch("");
                                    }}
                                  >
                                    Browse
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => removeSlot(label, index)}>
                                    Remove
                                  </Button>
                                </div>

                                {match && (
                                  <p className="mt-1 w-full truncate text-[11px] text-emerald-700 sm:mt-0 sm:basis-full">
                                    ✓ {match.name} — rate {match.rate}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
                  <Button variant="primary" onClick={handleSaveSlots} loading={saving}>
                    Save mapping
                  </Button>
                  {config?.updatedAt && (
                    <span className="text-xs text-slate-500">
                      Last saved {new Date(config.updatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {/* ============ USERS ============ */}
        {tab === "users" && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Registered users</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Disabling an account signs it out immediately.
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
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:h-[70vh] sm:rounded-2xl"
          >
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">
                  {LABEL_META[picker.label].title} — slot {picker.index + 1}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {panelNameById.get(pickerPanelId)}
                  </span>
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setPicker(null)}>Close</Button>
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
              {pickerServices.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">No matching services.</p>
              ) : (
                pickerServices.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      patchSlot(picker.label, picker.index, { serviceId: s.id });
                      setPicker(null);
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
