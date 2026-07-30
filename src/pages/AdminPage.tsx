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
import { ThemeToggle } from "../components/ThemeToggle";
import type { Theme } from "../utils/theme";
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
  createOwnerAccount,
  setUserOwner,
  setUserOrderAccess,
  sendTelegramTest,
  fetchAdminDeposits,
  reviewDeposit,
  adjustUserWallet,
  fetchPaymentSettings,
  savePaymentSettings,
  type AdminDeposit,
  type AdminPaymentSettings,
  type AdminUpiMethod,
  type AdminCryptoMethod,
  type AdminCryptoPack,
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

interface AdminPageProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function AdminPage({ theme, onToggleTheme }: AdminPageProps) {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const [config, setConfig] = useState<AdminPanelConfig | null>(null);
  const [slots, setSlots] = useState<Record<ServiceLabel, ServiceSlot[]>>(emptySlots());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "danger"; msg: string } | null>(null);

  const [tab, setTab] = useState<"panels" | "services" | "payments" | "paywall" | "users">("panels");

  // Payments
  const [deposits, setDeposits] = useState<AdminDeposit[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [depositFilter, setDepositFilter] = useState<"pending" | "all">("pending");
  const [pendingAccessCount, setPendingAccessCount] = useState(0);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositsError, setDepositsError] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [payment, setPayment] = useState<AdminPaymentSettings | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

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
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPass, setOwnerPass] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [creatingOwner, setCreatingOwner] = useState(false);

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

  /* ---- Payments ---- */
  const loadDeposits = useCallback(async (
    pw: string,
    filter: "pending" | "all",
    purpose: "all" | "wallet" | "access" = "all"
  ) => {
    setDepositsLoading(true);
    setDepositsError("");
    try {
      const result = await fetchAdminDeposits(pw, filter, purpose);
      setDeposits(result.deposits);
      setPendingCount(result.pendingCount);
      setPendingAccessCount(result.pendingAccessCount);
    } catch (e) {
      setDepositsError(e instanceof Error ? e.message : "Could not load deposits.");
    } finally {
      setDepositsLoading(false);
    }
  }, []);

  const loadPaymentSettings = useCallback(async (pw: string) => {
    try {
      setPayment(await fetchPaymentSettings(pw));
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Could not load payment settings.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = getStoredAdminPassword();
    if (!saved) { setBooting(false); return; }
    (async () => {
      try {
        await loadConfig(saved);
        setPassword(saved);
        setAuthed(true);
        loadDeposits(saved, "pending", "wallet");
        loadPaymentSettings(saved);
      } catch {
        clearStoredAdminPassword();
      } finally {
        setBooting(false);
      }
    })();
  }, [loadConfig, loadDeposits, loadPaymentSettings]);

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
      loadDeposits(password, "pending", "wallet");
      loadPaymentSettings(password);
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

  const handleReview = async (d: AdminDeposit, action: "approve" | "reject") => {
    const isAccess = d.purpose === "access";
    const verb = action === "approve" ? "Approve" : "Reject";
    let note = "";
    if (action === "reject") {
      note = prompt(`Why is this rejected? (shown to ${d.userEmail})`) || "";
    } else if (
      !confirm(
        `${verb} ${d.crypto ? `${d.crypto} ${d.coin} (₹${d.amount.toFixed(2)})` : `₹${d.amount.toFixed(2)}`} for ${d.userEmail}?\n\n` +
          `${d.method === "upi" ? "UTR" : "TX"}: ${d.reference}\n\n` +
          (isAccess
            ? "This unlocks the New Order page on their account for life."
            : "This credits their wallet.") +
          "\n\nOnly approve after confirming the money reached your account."
      )
    ) {
      return;
    }
    setReviewingId(d.id);
    // Refresh whichever queue this row came from.
    const queue: "wallet" | "access" = isAccess ? "access" : "wallet";
    try {
      const result = await reviewDeposit(password, d.id, action, note);
      fireToast(
        "success",
        action === "reject"
          ? `${isAccess ? "Unlock request" : "Deposit"} rejected.`
          : isAccess
          ? `Approved. ${d.userEmail} can now use the New Order page.`
          : `Approved. ${d.userEmail} now has ₹${(result.newBalance ?? 0).toFixed(2)}.`
      );
      await loadDeposits(password, depositFilter, queue);
      // The Users tab shows a lock column, so keep it honest.
      if (isAccess && users.length > 0) loadUsers();
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Review failed.");
      await loadDeposits(password, depositFilter, queue);
    } finally {
      setReviewingId(null);
    }
  };

  const handleSavePayment = async () => {
    if (!payment) return;
    if (payment.upiEnabled && payment.upiMethods.filter((m) => m.isActive).length === 0) {
      fireToast("danger", "UPI is enabled but no active UPI ID is configured.");
      return;
    }
    if (payment.cryptoEnabled && payment.cryptoMethods.filter((m) => m.isActive).length === 0) {
      fireToast("danger", "Crypto is enabled but no active address is configured.");
      return;
    }
    setSavingPayment(true);
    try {
      await savePaymentSettings(password, {
        minDeposit: payment.minDeposit,
        markupPercent: payment.markupPercent,
        upiEnabled: payment.upiEnabled,
        cryptoEnabled: payment.cryptoEnabled,
        upiMethods: payment.upiMethods,
        cryptoMethods: payment.cryptoMethods,
        cryptoPacks: payment.cryptoPacks,
        hideRunProblems: payment.hideRunProblems,
        pendingGraceMinutes: payment.pendingGraceMinutes,
        referralEnabled: payment.referralEnabled,
        referrerReward: payment.referrerReward,
        refereeReward: payment.refereeReward,
        referralMinDeposit: payment.referralMinDeposit,
        paywallEnabled: payment.paywallEnabled,
        paywallPrice: payment.paywallPrice,
        paywallCryptoPrice: payment.paywallCryptoPrice,
        paywallTitle: payment.paywallTitle,
        paywallBlurb: payment.paywallBlurb,
      });
      fireToast("success", "Payment settings saved.");
      await loadPaymentSettings(password);
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingPayment(false);
    }
  };

  /* Saves ONLY the paywall fields, so flipping the switch can never
     disturb the UPI / crypto configuration sitting in the same document. */
  const [savingPaywall, setSavingPaywall] = useState(false);
  const savePaywall = async (patch: Partial<AdminPaymentSettings>) => {
    if (!payment) return;
    const next = { ...payment, ...patch };
    setPayment(next);
    setSavingPaywall(true);
    try {
      await savePaymentSettings(password, {
        paywallEnabled: next.paywallEnabled,
        paywallPrice: next.paywallPrice,
        paywallCryptoPrice: next.paywallCryptoPrice,
        paywallTitle: next.paywallTitle,
        paywallBlurb: next.paywallBlurb,
      });
      fireToast("success", "Paywall settings saved.");
      await loadPaymentSettings(password);
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Save failed.");
      await loadPaymentSettings(password);
    } finally {
      setSavingPaywall(false);
    }
  };

  const [tgTesting, setTgTesting] = useState(false);
  const handleTelegramTest = async () => {
    setTgTesting(true);
    try {
      await sendTelegramTest(password);
      fireToast("success", "Test alert sent — check your Telegram.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Could not send the test alert.");
    } finally {
      setTgTesting(false);
    }
  };

  const patchPayment = (patch: Partial<AdminPaymentSettings>) =>
    setPayment((prev) => (prev ? { ...prev, ...patch } : prev));

  /* The two queues share one collection, so each tab filters client-side too.
     That way a stale fetch never leaks wallet rows into the unlock list. */
  const accessRequests = useMemo(
    () => deposits.filter((d) => d.purpose === "access"),
    [deposits]
  );
  const walletRequests = useMemo(
    () => deposits.filter((d) => d.purpose !== "access"),
    [deposits]
  );

  const addUpiMethod = () =>
    patchPayment({
      upiMethods: [
        ...(payment?.upiMethods ?? []),
        { id: `upi-${Date.now()}`, label: "", upiId: "", payeeName: "", instructions: "", qrImage: "", isActive: true },
      ],
    });

  const addCryptoMethod = () =>
    patchPayment({
      cryptoMethods: [
        ...(payment?.cryptoMethods ?? []),
        { id: `crypto-${Date.now()}`, label: "", network: "", address: "", instructions: "", qrImage: "", isActive: true, coin: "USDT" },
      ],
    });

  /* Read a chosen file, downscale it to a sane QR size, and return a
     compact data URL. Doing this client-side keeps the stored document
     small regardless of what the admin uploads. */
  const readQrFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Choose an image file (PNG or JPG)."));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error("That image is over 8 MB. Pick a smaller one."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file isn't a valid image."));
        img.onload = () => {
          const MAX = 512;                       // plenty for a scannable QR
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Could not process the image.")); return; }
          // White backing: transparent PNGs would vanish on dark backgrounds.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

  const handleQrUpload = async (
    file: File | undefined,
    apply: (dataUrl: string) => void
  ) => {
    if (!file) return;
    try {
      apply(await readQrFile(file));
      fireToast("success", "QR added. Remember to save.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Upload failed.");
    }
  };

  const patchUpi = (i: number, patch: Partial<AdminUpiMethod>) =>
    patchPayment({
      upiMethods: (payment?.upiMethods ?? []).map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });

  const addCryptoPack = () =>
    patchPayment({
      cryptoPacks: [
        ...(payment?.cryptoPacks ?? []),
        { id: `pack-${Date.now()}`, amount: 0, crypto: "", isActive: true },
      ],
    });

  const patchPack = (i: number, patch: Partial<AdminCryptoPack>) =>
    patchPayment({
      cryptoPacks: (payment?.cryptoPacks ?? []).map((p, idx) =>
        idx === i ? { ...p, ...patch } : p
      ),
    });

  const removePack = (i: number) =>
    patchPayment({
      cryptoPacks: (payment?.cryptoPacks ?? []).filter((_, idx) => idx !== i),
    });

  const patchCrypto = (i: number, patch: Partial<AdminCryptoMethod>) =>
    patchPayment({
      cryptoMethods: (payment?.cryptoMethods ?? []).map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });

  const handleAdjustWallet = async (u: AdminUser) => {
    const raw = prompt(
      `Adjust wallet for ${u.email}\nCurrent balance: ₹${u.balance.toFixed(2)}\n\n` +
      `Enter an amount — positive to add, negative to remove (e.g. 100 or -50):`
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) {
      fireToast("danger", "Enter a valid non-zero number.");
      return;
    }
    const note = prompt("Reason (saved in the ledger):") || "Manual adjustment";
    try {
      const balance = await adjustUserWallet(password, u.id, amount, note);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, balance } : x)));
      fireToast("success", `Balance is now ₹${balance.toFixed(2)}.`);
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Adjustment failed.");
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

  const handleCreateOwner = async () => {
    if (!ownerEmail.trim() || ownerPass.length < 8) {
      fireToast("danger", "Enter an email and a password of at least 8 characters.");
      return;
    }
    setCreatingOwner(true);
    try {
      const { promoted } = await createOwnerAccount(password, {
        email: ownerEmail.trim(),
        password: ownerPass,
        name: ownerName.trim(),
      });
      fireToast("success", promoted
        ? "Existing account promoted to owner."
        : "Owner account created.");
      setOwnerEmail(""); setOwnerPass(""); setOwnerName("");
      await loadUsers();
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Could not create owner account.");
    } finally {
      setCreatingOwner(false);
    }
  };

  const toggleOwner = async (u: AdminUser) => {
    const next = !u.isOwner;
    if (next && !confirm(`Make ${u.email} an OWNER?\n\nThey will be able to add funds to their own wallet without paying, and will see your commission on every order.`)) return;
    try {
      await setUserOwner(password, u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isOwner: next } : x)));
      fireToast("success", next ? "Account is now an owner." : "Owner status removed.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Update failed.");
    }
  };

  /* Comp or revoke the New Order unlock without any payment. */
  const toggleOrderAccess = async (u: AdminUser) => {
    const next = !u.hasOrderAccess;
    const question = next
      ? `Give ${u.email} free access to the New Order page?\n\nThey will not be charged the unlock fee.`
      : `Revoke ${u.email}'s New Order access?\n\nThey will see the paywall again (only while the paywall is switched on).`;
    if (!confirm(question)) return;
    try {
      await setUserOrderAccess(password, u.id, next);
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, hasOrderAccess: next } : x))
      );
      fireToast("success", next ? "Access granted." : "Access revoked.");
    } catch (e) {
      fireToast("danger", e instanceof Error ? e.message : "Update failed.");
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

          <div className="mt-6 flex flex-col items-center gap-3">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            <p className="text-center text-xs text-slate-400">
              <a href="#" className="hover:text-slate-600">← Back to the app</a>
            </p>
          </div>
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
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-slate-900">View app</a>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        <div className="grid w-full max-w-2xl grid-cols-5 gap-1 rounded-lg bg-slate-200/70 p-1">
          {(["panels", "services", "payments", "paywall", "users"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                if (key === "users" && users.length === 0) loadUsers();
                if (key === "payments") {
                  loadDeposits(password, depositFilter, "wallet");
                  if (!payment) loadPaymentSettings(password);
                }
                if (key === "paywall") {
                  loadDeposits(password, "pending", "access");
                  setDepositFilter("pending");
                  if (!payment) loadPaymentSettings(password);
                }
              }}
              className={`relative rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {key}
              {key === "payments" && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
              {key === "paywall" && pendingAccessCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingAccessCount}
                </span>
              )}
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

        {/* ============ PAYMENTS ============ */}
        {tab === "payments" && (
          <>
            {/* ---- Deposit queue ---- */}
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Deposit requests
                    {pendingCount > 0 && (
                      <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                        {pendingCount} pending
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Check the money actually reached your account, then approve. Approving
                    credits the user's wallet immediately.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={depositFilter}
                    onChange={(e) => {
                      const next = e.target.value as "pending" | "all";
                      setDepositFilter(next);
                      loadDeposits(password, next, "wallet");
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="pending">Pending only</option>
                    <option value="all">All</option>
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={depositsLoading}
                    onClick={() => loadDeposits(password, depositFilter, "wallet")}
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {depositsError && <InfoBanner kind="danger">{depositsError}</InfoBanner>}

              {!depositsError && walletRequests.length === 0 && !depositsLoading && (
                <p className="py-8 text-center text-sm text-slate-500">
                  {depositFilter === "pending"
                    ? "Nothing waiting for approval."
                    : "No deposits yet."}
                </p>
              )}

              <div className="space-y-2">
                {walletRequests.map((d) => (
                  <div
                    key={d.id}
                    className={`rounded-lg border p-3 ${
                      d.status === "pending"
                        ? "border-amber-300 bg-amber-50/50"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-extrabold tabular-nums text-slate-900">
                            ₹{d.amount.toFixed(2)}
                          </span>
                          {/* What actually left their wallet — verify against this. */}
                          {d.crypto && (
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet-700">
                              {d.crypto} {d.coin}
                            </span>
                          )}
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                            {d.method}
                          </span>
                          <StatusPill
                            kind={
                              d.status === "approved"
                                ? "active"
                                : d.status === "rejected"
                                ? "danger"
                                : "warning"
                            }
                          >
                            {d.status}
                          </StatusPill>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-700">{d.userEmail}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-slate-500">
                          {d.method === "upi" ? "UTR: " : "TX: "}{d.reference}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
                        </p>
                        {d.adminNote && (
                          <p className="mt-1 text-[11px] text-rose-600">Note: {d.adminNote}</p>
                        )}
                      </div>

                      {d.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            loading={reviewingId === d.id}
                            onClick={() => handleReview(d, "approve")}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={reviewingId === d.id}
                            onClick={() => handleReview(d, "reject")}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* ---- Pricing ---- */}
            {payment && (
              <Card>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">Pricing &amp; limits</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Markup is added on top of what your SMM panel charges you.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Markup %
                    </label>
                    <input
                      type="number"
                      value={payment.markupPercent}
                      onChange={(e) => patchPayment({ markupPercent: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Panel cost ₹100 → user pays ₹{(100 * (1 + (payment.markupPercent || 0) / 100)).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Minimum deposit (₹)
                    </label>
                    <input
                      type="number"
                      value={payment.minDeposit}
                      onChange={(e) => patchPayment({ minDeposit: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </Card>
            )}

            {/* ---- UPI ---- */}
            {payment && (
              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">UPI</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Users see these details and pay you directly.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={payment.upiEnabled}
                      onChange={(e) => patchPayment({ upiEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Enabled
                  </label>
                </div>

                <div className="space-y-3">
                  {payment.upiMethods.map((m, i) => (
                    <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Label"
                          value={m.label}
                          onChange={(e) => patchUpi(i, { label: e.target.value })}
                          placeholder="Main UPI"
                        />
                        <Input
                          label="UPI ID"
                          value={m.upiId}
                          onChange={(e) => patchUpi(i, { upiId: e.target.value })}
                          placeholder="yourname@okaxis"
                          className="font-mono"
                        />
                        <Input
                          label="Payee name"
                          value={m.payeeName}
                          onChange={(e) => patchUpi(i, { payeeName: e.target.value })}
                          placeholder="Shown so users can verify"
                        />
                        <Input
                          label="Instructions (optional)"
                          value={m.instructions}
                          onChange={(e) => patchUpi(i, { instructions: e.target.value })}
                          placeholder="e.g. Add your email in the note"
                        />
                      </div>
                      {/* QR code */}
                      <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-slate-200 pt-3">
                        {m.qrImage ? (
                          <img
                            src={m.qrImage}
                            alt="QR code"
                            className="h-24 w-24 rounded-lg border border-slate-200 bg-white object-contain p-1"
                          />
                        ) : (
                          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-[10px] text-slate-400">
                            No QR
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-700">QR code</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Upload a screenshot of your payment QR. Users can scan it directly.
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                              {m.qrImage ? "Replace" : "Upload QR"}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  handleQrUpload(e.target.files?.[0], (url) =>
                                    patchUpi(i, { qrImage: url })
                                  );
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {m.qrImage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => patchUpi(i, { qrImage: "" })}
                              >
                                Remove QR
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                          <input
                            type="checkbox"
                            checked={m.isActive}
                            onChange={(e) => patchUpi(i, { isActive: e.target.checked })}
                          />
                          Active
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            patchPayment({
                              upiMethods: payment.upiMethods.filter((_, idx) => idx !== i),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <Button variant="ghost" size="sm" onClick={addUpiMethod}>
                    + Add UPI ID
                  </Button>
                </div>
              </Card>
            )}

            {/* ---- Crypto ---- */}
            {payment && (
              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Crypto</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Users send to these addresses and submit the transaction hash.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={payment.cryptoEnabled}
                      onChange={(e) => patchPayment({ cryptoEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Enabled
                  </label>
                </div>

                <div className="space-y-3">
                  {payment.cryptoMethods.map((m, i) => (
                    <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Label"
                          value={m.label}
                          onChange={(e) => patchCrypto(i, { label: e.target.value })}
                          placeholder="USDT"
                        />
                        <Input
                          label="Network"
                          value={m.network}
                          onChange={(e) => patchCrypto(i, { network: e.target.value })}
                          placeholder="TRC20"
                        />
                        <Input
                          label="Coin ticker"
                          value={m.coin}
                          onChange={(e) => patchCrypto(i, { coin: e.target.value.toUpperCase() })}
                          placeholder="USDT"
                          hint="Shown next to every crypto amount."
                        />
                        <Input
                          label="Wallet address"
                          value={m.address}
                          onChange={(e) => patchCrypto(i, { address: e.target.value })}
                          placeholder="T…"
                          className="font-mono"
                        />
                        <Input
                          label="Instructions (optional)"
                          value={m.instructions}
                          onChange={(e) => patchCrypto(i, { instructions: e.target.value })}
                          placeholder="e.g. TRC20 only"
                        />
                      </div>
                      {/* QR code */}
                      <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-slate-200 pt-3">
                        {m.qrImage ? (
                          <img
                            src={m.qrImage}
                            alt="QR code"
                            className="h-24 w-24 rounded-lg border border-slate-200 bg-white object-contain p-1"
                          />
                        ) : (
                          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-[10px] text-slate-400">
                            No QR
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-700">QR code</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Upload a screenshot of your payment QR. Users can scan it directly.
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                              {m.qrImage ? "Replace" : "Upload QR"}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  handleQrUpload(e.target.files?.[0], (url) =>
                                    patchCrypto(i, { qrImage: url })
                                  );
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {m.qrImage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => patchCrypto(i, { qrImage: "" })}
                              >
                                Remove QR
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                          <input
                            type="checkbox"
                            checked={m.isActive}
                            onChange={(e) => patchCrypto(i, { isActive: e.target.checked })}
                          />
                          Active
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            patchPayment({
                              cryptoMethods: payment.cryptoMethods.filter((_, idx) => idx !== i),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <Button variant="ghost" size="sm" onClick={addCryptoMethod}>
                    + Add crypto address
                  </Button>
                </div>

                {/* ---- Fixed top-up amounts ----
                    There is no exchange rate, so a crypto buyer must choose one
                    of these pairs rather than typing a rupee figure. */}
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Crypto top-up amounts
                  </h3>
                  <p className="mt-0.5 mb-3 text-sm text-slate-500">
                    Because there&apos;s no live exchange rate, you set each pair yourself.
                    Left = what lands in their wallet, right = what they send you.
                  </p>

                  {payment.cryptoPacks.length === 0 && (
                    <div className="mb-3">
                      <InfoBanner kind="warning">
                        No amounts set up, so <strong>crypto top-ups are hidden</strong> on
                        the wallet page. Add at least one pair below.
                      </InfoBanner>
                    </div>
                  )}

                  <div className="space-y-2">
                    {payment.cryptoPacks.map((pk, i) => (
                      <div
                        key={pk.id}
                        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3"
                      >
                        <div className="min-w-28 flex-1">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Wallet gets (₹)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={pk.amount || ""}
                            onChange={(e) =>
                              patchPack(i, { amount: Number(e.target.value) })
                            }
                            placeholder="500"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <span className="pb-2 text-slate-400">←</span>
                        <div className="min-w-28 flex-1">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            They send ({payment.cryptoMethods[0]?.coin || "USDT"})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={pk.crypto}
                            onChange={(e) => patchPack(i, { crypto: e.target.value })}
                            placeholder="6"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                          />
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removePack(i)}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3">
                    <Button variant="ghost" size="sm" onClick={addCryptoPack}>
                      + Add amount
                    </Button>
                  </div>
                </div>

                {/* ---- Orders display mask ---- */}
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Hide problems on the Orders page
                      </h3>
                      <p className="mt-0.5 max-w-xl text-sm text-slate-500">
                        When on, customers never see failed runs, error messages or
                        retry counts — those show as completed. A run still stuck on
                        pending also flips to completed after the grace period below.
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={payment.hideRunProblems}
                        onChange={(e) => patchPayment({ hideRunProblems: e.target.checked })}
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="max-w-xs">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Pending shows as completed after (minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={payment.pendingGraceMinutes}
                      onChange={(e) => patchPayment({ pendingGraceMinutes: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      disabled={!payment.hideRunProblems}
                    />
                  </div>

                  <div className="mt-3">
                    <InfoBanner kind={payment.hideRunProblems ? "warning" : "info"}>
                      {payment.hideRunProblems ? (
                        <>
                          <strong>Display only — nothing is cancelled.</strong> The system
                          keeps retrying in the background, so a run shown as completed can
                          still be delivered. Your <strong>owner accounts</strong> and this
                          admin panel always see the real status.
                        </>
                      ) : (
                        <>Customers currently see the real status, errors included.</>
                      )}
                    </InfoBanner>
                  </div>
                </div>

                {/* ---- Referral programme ---- */}
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Refer &amp; earn
                      </h3>
                      <p className="mt-0.5 max-w-xl text-sm text-slate-500">
                        Rewards are paid only after the invited friend&apos;s first
                        deposit is approved, so fake signups cost you nothing.
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={payment.referralEnabled}
                        onChange={(e) => patchPayment({ referralEnabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Inviter gets (₹)
                      </label>
                      <input
                        type="number"
                        value={payment.referrerReward}
                        onChange={(e) => patchPayment({ referrerReward: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Friend gets (₹)
                      </label>
                      <input
                        type="number"
                        value={payment.refereeReward}
                        onChange={(e) => patchPayment({ refereeReward: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Min. deposit to qualify (₹)
                      </label>
                      <input
                        type="number"
                        value={payment.referralMinDeposit}
                        onChange={(e) => patchPayment({ referralMinDeposit: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-500">
                    Each successful referral costs you ₹
                    {(payment.referrerReward || 0) + (payment.refereeReward || 0)} in
                    credit, against a minimum ₹{payment.referralMinDeposit || 0} deposit.
                  </p>
                </div>

                {/* ---- Telegram alerts ---- */}
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Telegram alerts</h3>
                  <p className="mt-0.5 mb-3 max-w-xl text-sm text-slate-500">
                    Get a phone notification the moment a deposit or unlock request
                    arrives. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render,
                    then use this button to confirm it works.
                  </p>
                  <Button variant="secondary" size="sm" loading={tgTesting} onClick={handleTelegramTest}>
                    Send test alert
                  </Button>
                </div>

                <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
                  <Button variant="primary" onClick={handleSavePayment} loading={savingPayment}>
                    Save payment settings
                  </Button>
                  {payment.updatedAt && (
                    <span className="text-xs text-slate-500">
                      Last saved {new Date(payment.updatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ============ USERS ============ */}
        {/* ============ PAYWALL ============ */}
        {tab === "paywall" && (
          <>
            {!payment && (
              <Card>
                <div className="flex items-center gap-3 py-6">
                  <Spinner /> <span className="text-sm text-slate-500">Loading…</span>
                </div>
              </Card>
            )}

            {payment && (
              <>
                {/* ---- The master switch ---- */}
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-slate-900">
                        Lock the New Order page
                      </h2>
                      <p className="mt-1 max-w-xl text-sm text-slate-500">
                        When this is ON, a signed-in user can still browse the Dashboard,
                        Orders and Wallet, but the New Order page shows a paywall until
                        they pay once. The unlock is for life. Turning it OFF instantly
                        opens the page to everyone again — nobody loses an unlock they
                        already bought.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingPaywall}
                      onClick={() => savePaywall({ paywallEnabled: !payment.paywallEnabled })}
                      className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
                        payment.paywallEnabled ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      aria-label="Toggle the New Order paywall"
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
                          payment.paywallEnabled ? "left-7" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-4">
                    <InfoBanner kind={payment.paywallEnabled ? "warning" : "success"}>
                      {payment.paywallEnabled ? (
                        <>
                          <strong>Paywall is ON.</strong> New users must pay ₹
                          {payment.paywallPrice.toLocaleString("en-IN")} once before they can
                          create an order. Owner accounts are never charged.
                        </>
                      ) : (
                        <>
                          <strong>Paywall is OFF.</strong> Every signed-in user can create
                          orders right away.
                        </>
                      )}
                    </InfoBanner>
                  </div>
                </Card>

                {/* ---- Price & wording ---- */}
                <Card>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-slate-900">
                      Price &amp; wording
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Users pay this using the same UPI / crypto details as a wallet
                      top-up — set those up on the Payments tab.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Unlock price (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={payment.paywallPrice}
                        onChange={(e) => patchPayment({ paywallPrice: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[199, 299, 499, 999, 1999].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => patchPayment({ paywallPrice: q })}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                              payment.paywallPrice === q
                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            ₹{q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Unlock price in crypto
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={payment.paywallCryptoPrice}
                          onChange={(e) =>
                            patchPayment({ paywallCryptoPrice: e.target.value })
                          }
                          placeholder="e.g. 5.67"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <span className="shrink-0 text-sm font-bold text-slate-500">
                          {payment.cryptoMethods[0]?.coin || "USDT"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {payment.paywallCryptoPrice
                          ? `Crypto buyers are asked for exactly ${payment.paywallCryptoPrice} ${payment.cryptoMethods[0]?.coin || "USDT"}.`
                          : "Leave blank to hide crypto on the paywall — only UPI will be offered."}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Headline
                      </label>
                      <input
                        type="text"
                        maxLength={80}
                        value={payment.paywallTitle}
                        onChange={(e) => patchPayment({ paywallTitle: e.target.value })}
                        placeholder="Unlock New Order"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {payment.cryptoEnabled && !payment.paywallCryptoPrice && (
                    <div className="mt-4">
                      <InfoBanner kind="warning">
                        Crypto is switched on for deposits, but the unlock has no crypto
                        price — so the paywall will only show UPI. Set a figure above to
                        accept crypto for unlocks.
                      </InfoBanner>
                    </div>
                  )}

                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Description shown to the user
                    </label>
                    <textarea
                      rows={2}
                      maxLength={400}
                      value={payment.paywallBlurb}
                      onChange={(e) => patchPayment({ paywallBlurb: e.target.value })}
                      placeholder="One-time payment. Unlocks the New Order page on this account for life."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      variant="primary"
                      loading={savingPaywall}
                      onClick={() => savePaywall({})}
                    >
                      Save paywall settings
                    </Button>
                    <span className="text-xs text-slate-500">
                      Takes effect immediately for every user.
                    </span>
                  </div>
                </Card>

                {/* ---- Unlock payment queue ---- */}
                <Card>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Unlock requests
                        {pendingAccessCount > 0 && (
                          <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                            {pendingAccessCount} pending
                          </span>
                        )}
                      </h2>
                      <p className="mt-0.5 text-sm text-slate-500">
                        Confirm the money arrived, then approve. Approving unlocks the New
                        Order page for that account — it does <strong>not</strong> add to
                        their wallet.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={depositsLoading}
                      onClick={() => loadDeposits(password, depositFilter, "access")}
                    >
                      Refresh
                    </Button>
                  </div>

                  {depositsError && <InfoBanner kind="danger">{depositsError}</InfoBanner>}

                  {!depositsError &&
                    accessRequests.length === 0 &&
                    !depositsLoading && (
                      <p className="py-8 text-center text-sm text-slate-500">
                        Nothing waiting for approval.
                      </p>
                    )}

                  <div className="space-y-2">
                    {accessRequests.map((d) => (
                      <div
                        key={d.id}
                        className={`rounded-lg border p-3 ${
                          d.status === "pending"
                            ? "border-amber-300 bg-amber-50/50"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-lg font-extrabold tabular-nums text-slate-900">
                                ₹{d.amount.toFixed(2)}
                              </span>
                              {d.crypto && (
                                <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet-700">
                                  {d.crypto} {d.coin}
                                </span>
                              )}
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                                unlock
                              </span>
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                {d.method}
                              </span>
                              <StatusPill
                                kind={
                                  d.status === "approved"
                                    ? "active"
                                    : d.status === "rejected"
                                    ? "danger"
                                    : "warning"
                                }
                              >
                                {d.status}
                              </StatusPill>
                            </div>
                            <p className="mt-1 text-sm font-medium text-slate-700">
                              {d.userEmail}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-xs text-slate-500">
                              {d.method === "upi" ? "UTR: " : "TX: "}
                              {d.reference}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
                            </p>
                          </div>

                          {d.status === "pending" && (
                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                size="sm"
                                loading={reviewingId === d.id}
                                onClick={() => handleReview(d, "approve")}
                              >
                                Approve &amp; unlock
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={reviewingId === d.id}
                                onClick={() => handleReview(d, "reject")}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </>
        )}

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

            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">
                  Owner
                </span>
                <h3 className="text-sm font-semibold text-slate-900">Create an owner account</h3>
              </div>
              <p className="mb-3 text-xs text-slate-600">
                Owner accounts add funds to their own wallet without paying, and see your
                commission in rupees on every order. Use this for yourself.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Input
                  label="Password"
                  type="password"
                  value={ownerPass}
                  onChange={(e) => setOwnerPass(e.target.value)}
                  placeholder="At least 8 characters"
                />
                <Input
                  label="Name (optional)"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="mt-3">
                <Button variant="primary" size="sm" loading={creatingOwner} onClick={handleCreateOwner}>
                  Create owner account
                </Button>
                <span className="ml-3 text-[11px] text-slate-500">
                  If the email already exists, that account is promoted instead.
                </span>
              </div>
            </div>

            {users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Email</th>
                      <th className="py-2 pr-3 font-semibold">Name</th>
                      <th className="py-2 pr-3 font-semibold">Balance</th>
                      <th className="py-2 pr-3 font-semibold">Orders</th>
                      <th className="py-2 pr-3 font-semibold">Refs</th>
                      <th className="py-2 pr-3 font-semibold">Seen</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 last:border-0">
                        <td className="max-w-40 truncate py-2.5 pr-3 font-medium text-slate-900" title={u.email}>
                          {u.email}
                          {u.isOwner && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                              Owner
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{u.name || "—"}</td>
                        <td className="py-2.5 pr-3 font-semibold tabular-nums text-emerald-700">
                          ₹{u.balance.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-slate-600">{u.orderCount}</td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          <span className="tabular-nums font-semibold">{u.referralCount}</span>
                          {u.referralCode && (
                            <div
                              className="font-mono text-[10px] text-slate-400"
                              title="Their referral code"
                            >
                              {u.referralCode}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-slate-500">
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusPill kind={u.isActive ? "active" : "danger"}>
                              {u.isActive ? "Active" : "Disabled"}
                            </StatusPill>
                            {/* New Order access, shown only when it can differ. */}
                            <span
                              title={
                                u.isOwner
                                  ? "Owner — New Order is always available"
                                  : u.hasOrderAccess
                                  ? "New Order page unlocked"
                                  : "New Order page locked"
                              }
                              className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                u.isOwner
                                  ? "bg-amber-100 text-amber-700"
                                  : u.hasOrderAccess
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {u.isOwner ? "🔓 always" : u.hasOrderAccess ? "🔓 order" : "🔒 order"}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pl-2">
                          <div className="flex flex-nowrap items-center justify-end gap-0.5">
                            <Button variant="ghost" size="sm" onClick={() => handleAdjustWallet(u)}>
                              Wallet
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title={u.isOwner ? "Remove owner status" : "Make this an owner account"}
                              onClick={() => toggleOwner(u)}
                            >
                              {u.isOwner ? "Un-owner" : "Owner"}
                            </Button>
                            {!u.isOwner && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={
                                  u.hasOrderAccess
                                    ? "Revoke New Order access"
                                    : "Give free New Order access"
                                }
                                onClick={() => toggleOrderAccess(u)}
                              >
                                {u.hasOrderAccess ? "Lock" : "Unlock"}
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => toggleUser(u)}>
                              {u.isActive ? "Disable" : "Enable"}
                            </Button>
                          </div>
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
