import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button, Card, Input, InfoBanner, Spinner, StatusPill } from "../components/ui";
import {
  selfTopUp,
  fetchWallet,
  fetchPaymentMethods,
  submitDeposit,
  type WalletData,
  type PaymentMethods,
} from "../utils/api";

interface WalletPageProps {
  onBalanceChange?: (balance: number) => void;
  /** Owner accounts can fund themselves without a real payment. */
  isOwner?: boolean;
}

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000];

function formatMoney(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const TX_LABEL: Record<string, string> = {
  deposit: "Wallet top-up",
  order_debit: "Order placed",
  refund: "Refund",
  admin_credit: "Added by admin",
  admin_debit: "Removed by admin",
  referral: "Referral bonus",
};

export function WalletPage({ onBalanceChange, isOwner = false }: WalletPageProps) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [methods, setMethods] = useState<PaymentMethods | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<"upi" | "crypto">("upi");
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState("");
  // Which fixed rupee/crypto pack a crypto buyer selected.
  const [packId, setPackId] = useState("");
  const [ownerAmount, setOwnerAmount] = useState("");
  const [ownerBusy, setOwnerBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [w, m] = await Promise.all([fetchWallet(), fetchPaymentMethods()]);
      setWallet(w);
      setMethods(m);
      onBalanceChange?.(w.balance);
      if (!methodId) {
        const canCrypto = m.cryptoMethods.length > 0 && m.cryptoPacks.length > 0;
        const first = m.upiEnabled
          ? m.upiMethods[0]?.id
          : canCrypto ? m.cryptoMethods[0]?.id : "";
        if (first) setMethodId(first);
        if (!m.upiEnabled && canCrypto) setKind("crypto");
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your wallet.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBalanceChange]);

  useEffect(() => { load(); }, [load]);

  const packs = methods?.cryptoPacks ?? [];
  /* Crypto has no exchange rate, so it is only usable once the admin has
     published at least one fixed rupee/crypto pack. */
  const cryptoUsable = (methods?.cryptoMethods.length ?? 0) > 0 && packs.length > 0;
  const effectiveKind: "upi" | "crypto" = kind === "crypto" && !cryptoUsable ? "upi" : kind;
  const activeMethods =
    effectiveKind === "upi" ? (methods?.upiMethods ?? []) : (methods?.cryptoMethods ?? []);
  const selected = activeMethods.find((m) => m.id === methodId) ?? activeMethods[0];
  const coin = (selected as { coin?: string } | undefined)?.coin || "USDT";
  const selectedPack = packs.find((p) => p.id === packId) ?? null;
  /** Exactly what the user must send, in whichever currency they picked. */
  const amountToSend =
    effectiveKind === "crypto"
      ? selectedPack ? `${selectedPack.crypto} ${coin}` : ""
      : amount ? formatMoney(Number(amount) || 0) : "";

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 2000);
    } catch { /* clipboard blocked; user can select manually */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!selected) {
      setFormError("No payment method available. Contact the administrator.");
      return;
    }

    /* UPI takes a typed rupee amount; crypto takes one of the admin's packs,
       because without a rate an arbitrary amount can't be converted. */
    let value = 0;
    if (effectiveKind === "crypto") {
      if (!selectedPack) {
        setFormError("Choose how much you want to add.");
        return;
      }
    } else {
      value = Number(amount);
      const min = methods?.minDeposit ?? 50;
      if (!Number.isFinite(value) || value <= 0) {
        setFormError("Enter the amount you paid.");
        return;
      }
      if (value < min) {
        setFormError(`Minimum deposit is ${formatMoney(min)}.`);
        return;
      }
    }

    if (reference.trim().length < 6) {
      setFormError(
        effectiveKind === "upi"
          ? "Enter the 12-digit UTR / reference number from your payment app."
          : "Enter the transaction hash."
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitDeposit({
        ...(effectiveKind === "crypto"
          ? { packId: selectedPack!.id }
          : { amount: value }),
        method: effectiveKind,
        methodId: selected.id,
        reference: reference.trim(),
      });
      setSuccess(result.message);
      setAmount("");
      setPackId("");
      setReference("");
      setShowAdd(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm font-medium text-slate-500">Loading your wallet…</p>
        </div>
      </div>
    );
  }

  const pendingDeposits = wallet?.deposits.filter((d) => d.status === "pending") ?? [];
  /* Nothing to show if UPI is off/unconfigured AND crypto isn't usable
     (crypto needs both an address and at least one published pack). */
  const noMethods =
    (!methods?.upiEnabled || methods.upiMethods.length === 0) &&
    (!methods?.cryptoEnabled || !cryptoUsable);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5 sm:px-6">
      {loadError && <InfoBanner kind="danger">{loadError}</InfoBanner>}
      {success && <InfoBanner kind="success">{success}</InfoBanner>}

      {/* ---- Balance ---- */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg shadow-indigo-500/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">
            Wallet balance
          </p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">
            {formatMoney(wallet?.balance ?? 0)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => { setShowAdd((v) => !v); setSuccess(""); setFormError(""); }}
              className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
            >
              {showAdd ? "Close" : "+ Add money"}
            </button>
            {pendingDeposits.length > 0 && (
              <span className="rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-amber-950">
                {pendingDeposits.length} deposit{pendingDeposits.length > 1 ? "s" : ""} awaiting approval
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* ---- Owner self top-up ---- */}
      {isOwner && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
              Owner
            </span>
            <h2 className="text-base font-semibold text-slate-900">Add funds directly</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            This account can credit its own wallet without a payment. Use a negative
            amount to deduct.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Amount (₹)
              </label>
              <input
                type="number"
                value={ownerAmount}
                onChange={(e) => setOwnerAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <Button
              variant="primary"
              loading={ownerBusy}
              onClick={async () => {
                const value = Number(ownerAmount);
                if (!Number.isFinite(value) || value === 0) {
                  setLoadError("Enter a non-zero amount.");
                  return;
                }
                setOwnerBusy(true);
                setLoadError("");
                try {
                  const balance = await selfTopUp(value);
                  onBalanceChange?.(balance);
                  setOwnerAmount("");
                  setSuccess(`Wallet updated. New balance ${formatMoney(balance)}.`);
                  await load();
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Could not update wallet.");
                } finally {
                  setOwnerBusy(false);
                }
              }}
            >
              Update balance
            </Button>
            {[1000, 5000, 10000].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setOwnerAmount(String(q))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300"
              >
                ₹{q.toLocaleString()}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Add money ---- */}
      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            {noMethods ? (
              <InfoBanner kind="warning">
                No payment methods are set up yet. Please contact the administrator.
              </InfoBanner>
            ) : (
              <>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">Add money</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Pay using the details below, then enter the reference number so we can verify it.
                    {effectiveKind === "upi" && ` Minimum ${formatMoney(methods?.minDeposit ?? 50)}.`}
                  </p>
                </div>

                {/* method type */}
                {methods?.upiEnabled && cryptoUsable && (
                  <div className="mb-4 grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                    {(["upi", "crypto"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setKind(k);
                          const list = k === "upi" ? methods.upiMethods : methods.cryptoMethods;
                          setMethodId(list[0]?.id ?? "");
                        }}
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold uppercase transition ${
                          effectiveKind === k
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                )}

                {activeMethods.length > 1 && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Pay to
                    </label>
                    <select
                      value={selected?.id ?? ""}
                      onChange={(e) => setMethodId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {activeMethods.map((m) => (
                        <option key={m.id} value={m.id}>{m.label || m.id}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* payment target */}
                {selected && (
                  <div className="mb-5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-4">
                    {/* Scannable QR, when the admin has uploaded one */}
                    {(selected as { qrImage?: string }).qrImage && (
                      <div className="mb-4 flex flex-col items-center">
                        <img
                          src={(selected as { qrImage: string }).qrImage}
                          alt="Payment QR code"
                          className="h-52 w-52 rounded-xl border border-slate-200 bg-white object-contain p-2 shadow-sm"
                        />
                        <p className="mt-2 text-[11px] font-semibold text-slate-600">
                          Scan with any {effectiveKind === "upi" ? "UPI" : "crypto"} app
                        </p>
                      </div>
                    )}
                    {effectiveKind === "upi" ? (
                      <>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                          Send payment to this UPI ID
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <code className="rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-slate-900 shadow-sm">
                            {(selected as { upiId: string }).upiId}
                          </code>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => copy((selected as { upiId: string }).upiId, "upi")}
                          >
                            {copied === "upi" ? "Copied!" : "Copy"}
                          </Button>
                        </div>
                        {(selected as { payeeName?: string }).payeeName && (
                          <p className="mt-2 text-xs text-slate-600">
                            Name: <strong>{(selected as { payeeName: string }).payeeName}</strong>
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                          Send to this address
                          {(selected as { network?: string }).network
                            ? ` · ${(selected as { network: string }).network}`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <code className="max-w-full break-all rounded-lg bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 shadow-sm">
                            {(selected as { address: string }).address}
                          </code>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => copy((selected as { address: string }).address, "addr")}
                          >
                            {copied === "addr" ? "Copied!" : "Copy"}
                          </Button>
                        </div>
                      </>
                    )}
                    {selected.instructions && (
                      <p className="mt-3 whitespace-pre-line text-xs text-slate-600">
                        {selected.instructions}
                      </p>
                    )}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {effectiveKind === "crypto" ? (
                    /* No exchange rate exists, so the user picks a fixed
                       rupee/crypto pair the admin has published. */
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        How much do you want to add?
                      </label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {packs.map((p) => {
                          const active = packId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setPackId(p.id); setFormError(""); }}
                              className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left transition ${
                                active
                                  ? "border-indigo-500 bg-indigo-50"
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <span className="text-sm font-bold text-slate-900">
                                {formatMoney(p.amount)}
                              </span>
                              <span
                                className={`font-mono text-sm font-bold ${
                                  active ? "text-indigo-700" : "text-slate-500"
                                }`}
                              >
                                {p.crypto} {coin}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Left is what lands in your wallet; right is what you send.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Amount paid
                      </label>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {QUICK_AMOUNTS.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setAmount(String(q))}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                              amount === String(q)
                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            ₹{q}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => { setAmount(e.target.value); setFormError(""); }}
                        placeholder={`Minimum ${methods?.minDeposit ?? 50}`}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {/* The exact figure to send, once a choice has been made. */}
                  {amountToSend && (
                    <div className="pay-amount-strip flex flex-wrap items-baseline gap-2 rounded-xl px-4 py-3">
                      <span className="pay-amount-label text-[11px] font-bold uppercase tracking-wide">
                        Send exactly
                      </span>
                      <span className="pay-amount-value text-xl font-extrabold">
                        {amountToSend}
                      </span>
                      {effectiveKind === "crypto" && selectedPack && (
                        <span className="pay-amount-note text-xs">
                          (adds {formatMoney(selectedPack.amount)} to your wallet)
                        </span>
                      )}
                    </div>
                  )}

                  <Input
                    label={effectiveKind === "upi" ? "UTR / Reference number" : "Transaction hash"}
                    value={reference}
                    onChange={(e) => { setReference(e.target.value); setFormError(""); }}
                    placeholder={effectiveKind === "upi" ? "e.g. 401234567890" : "0x…"}
                    hint={
                      effectiveKind === "upi"
                        ? "Find this in your UPI app under transaction details."
                        : "The transaction id from your wallet or explorer."
                    }
                    className="font-mono"
                  />

                  {formError && <InfoBanner kind="danger">{formError}</InfoBanner>}

                  <InfoBanner kind="info">
                    Your wallet is credited after we verify the payment — usually within 5 minutes.
                  </InfoBanner>

                  <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
                    Submit for verification
                  </Button>
                </form>
              </>
            )}
          </Card>
        </motion.div>
      )}

      {/* ---- Deposits ---- */}
      {wallet && wallet.deposits.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Your deposits</h2>
          <div className="space-y-2">
            {wallet.deposits.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(d.amount)}
                    <span className="ml-2 text-[11px] font-medium uppercase text-slate-500">
                      {d.method}
                    </span>
                  </p>
                  <p className="truncate font-mono text-[11px] text-slate-500">{d.reference}</p>
                  {d.adminNote && (
                    <p className="mt-0.5 text-[11px] text-rose-600">{d.adminNote}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">{formatDate(d.createdAt)}</span>
                  <StatusPill
                    kind={
                      d.status === "approved" ? "active" : d.status === "rejected" ? "danger" : "warning"
                    }
                  >
                    {d.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Ledger ---- */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Transaction history</h2>
        {!wallet || wallet.transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No transactions yet. Add money to get started.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {wallet.transactions.map((t) => {
              const credit = t.amount > 0;
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {TX_LABEL[t.type] ?? t.type}
                    </p>
                    {t.note && <p className="truncate text-[11px] text-slate-500">{t.note}</p>}
                    <p className="text-[11px] text-slate-400">{formatDate(t.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        credit ? "text-emerald-600" : "text-slate-900"
                      }`}
                    >
                      {credit ? "+" : "−"}{formatMoney(Math.abs(t.amount))}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      bal {formatMoney(t.balanceAfter)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
