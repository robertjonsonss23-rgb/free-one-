import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { formatMoney, formatMoneyShort, useCurrency } from "../utils/currency";
import { Button, Card, InfoBanner, Spinner } from "../components/ui";
import {
  fetchOrderAccess,
  purchaseOrderAccess,
  unlockOrderAccessFromWallet,
  type OrderAccessStatus,
} from "../utils/api";

interface PaywallPageProps {
  /** Called once access is confirmed, so the app can drop the gate. */
  onUnlocked: () => void;
  /** Keeps the header balance in sync after a wallet-funded unlock. */
  onBalanceChange?: (balance: number) => void;
  /** Lets the "top up first" button jump the user to the Wallet page. */
  onGoToWallet?: () => void;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const PERKS = [
  "Unlimited campaign creation on the New Order page",
  "Full growth-curve editor with live preview",
  "Schedule runs across every service you need",
  "One payment — no subscription, no renewal",
];

export function PaywallPage({
  onUnlocked,
  onBalanceChange,
  onGoToWallet,
}: PaywallPageProps) {
  // Re-render when the user switches display currency.
  useCurrency();
  const [status, setStatus] = useState<OrderAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [kind, setKind] = useState<"upi" | "crypto">("upi");
  const [methodId, setMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const next = await fetchOrderAccess();
      setStatus(next);
      onBalanceChange?.(next.balance);

      // Access may have been approved while the page was open.
      if (next.allowed) {
        onUnlocked();
        return;
      }

      const cryptoUsable = next.cryptoPrice !== "" && next.payment.cryptoMethods.length > 0;
      setMethodId((current) => {
        if (current) return current;
        const first = next.payment.upiEnabled
          ? next.payment.upiMethods[0]?.id
          : cryptoUsable
          ? next.payment.cryptoMethods[0]?.id
          : "";
        return first ?? "";
      });
      if (!next.payment.upiEnabled && cryptoUsable) setKind("crypto");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load unlock details.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUnlocked, onBalanceChange]);

  useEffect(() => {
    load();
  }, [load]);

  /* While a request is waiting for approval, poll so the page unlocks itself
     the moment the admin clicks approve — no refresh needed. */
  useEffect(() => {
    if (!status?.pending) return;
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [status?.pending, load]);

  const payment = status?.payment;
  /* Crypto is only offered once the admin has set a crypto price — otherwise
     there is no amount to ask the user for. */
  const cryptoPrice = status?.cryptoPrice ?? "";
  const cryptoOffered = cryptoPrice !== "" && (payment?.cryptoMethods.length ?? 0) > 0;
  const effectiveKind: "upi" | "crypto" = kind === "crypto" && !cryptoOffered ? "upi" : kind;
  const activeMethods =
    effectiveKind === "upi" ? (payment?.upiMethods ?? []) : (payment?.cryptoMethods ?? []);
  const selected = activeMethods.find((m) => m.id === methodId) ?? activeMethods[0];
  const noMethods =
    !payment ||
    (payment.upiMethods.length === 0 && !cryptoOffered);
  const coin = (selected as { coin?: string } | undefined)?.coin || "USDT";
  /** What the user must actually send, in the currency they picked. */
  const amountToSend =
    effectiveKind === "crypto" ? `${cryptoPrice} ${coin}` : formatMoney(status?.price ?? 0);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard blocked; the user can select the text manually */
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!selected) {
      setFormError("No payment method available. Contact the administrator.");
      return;
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
      const result = await purchaseOrderAccess({
        method: effectiveKind,
        methodId: selected.id,
        reference: reference.trim(),
      });
      setSuccess(result.message);
      setReference("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not submit the payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWalletUnlock = async () => {
    setFormError("");
    setWalletBusy(true);
    try {
      const { balance } = await unlockOrderAccessFromWallet();
      onBalanceChange?.(balance);
      onUnlocked();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not unlock from wallet.");
    } finally {
      setWalletBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm font-medium text-slate-500">Checking your access…</p>
        </div>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="mx-auto max-w-2xl">
        <InfoBanner kind="danger">{loadError}</InfoBanner>
        <div className="mt-4">
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const price = status?.price ?? 0;
  const canPayFromWallet = (status?.balance ?? 0) >= price && price > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-5"
    >
      {/* ---- Hero ---- */}
      <Card>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              One-time unlock
            </span>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {status?.title || "Unlock New Order"}
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-slate-500">
              {status?.blurb ||
                "One-time payment. Unlocks the New Order page on this account for life."}
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 px-6 py-4 text-center shadow-lg">
            <p className="text-3xl font-extrabold leading-none text-[#ffffff]">
              {formatMoneyShort(price)}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
              Pay once
            </p>
          </div>
        </div>

        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                ✓
              </span>
              {perk}
            </li>
          ))}
        </ul>
      </Card>

      {/* ---- Waiting for approval ---- */}
      {status?.pending && (
        <Card>
          <InfoBanner kind="info">
            <strong>Payment submitted — waiting for verification.</strong>
            <br />
            {status.pending.crypto
              ? `${status.pending.crypto} ${status.pending.coin}`
              : formatMoney(status.pending.amount)}{" "}
            via {status.pending.method.toUpperCase()} · reference{" "}
            <code className="font-mono">{status.pending.reference}</code> · sent{" "}
            {formatDate(status.pending.createdAt)}.
            <br />
            Your access opens automatically once it is approved — usually within 5
            minutes. This page checks for you, so you can leave it open.
          </InfoBanner>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={load}>
              Check now
            </Button>
          </div>
        </Card>
      )}

      {/* ---- Pay from wallet ---- */}
      {!status?.pending && price > 0 && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pay from your wallet
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Instant — no waiting for approval. Your balance is{" "}
                <strong>{formatMoney(status?.balance ?? 0)}</strong>.
              </p>
            </div>
            {canPayFromWallet ? (
              <Button variant="primary" loading={walletBusy} onClick={handleWalletUnlock}>
                Unlock for {formatMoney(price)}
              </Button>
            ) : (
              <Button variant="secondary" onClick={onGoToWallet}>
                Add money to wallet
              </Button>
            )}
          </div>
          {!canPayFromWallet && (
            <p className="mt-2 text-xs text-slate-500">
              You need {formatMoney(Math.max(0, price - (status?.balance ?? 0)))} more to
              unlock straight from your wallet.
            </p>
          )}
        </Card>
      )}

      {/* ---- Pay directly (UPI / crypto) ---- */}
      {!status?.pending && (
        <Card>
          {noMethods ? (
            <InfoBanner kind="warning">
              No payment methods are set up yet. Please contact the administrator.
            </InfoBanner>
          ) : (
            <>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900">
                  Or pay directly
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Send exactly <strong>{amountToSend}</strong> using the details below,
                  then enter the reference number so we can verify it. Access is granted
                  after verification — usually within 5 minutes.
                </p>
              </div>

              {/* method type */}
              {payment?.upiEnabled && cryptoOffered && (
                <div className="mb-4 grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {(["upi", "crypto"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        const list =
                          k === "upi" ? payment.upiMethods : payment.cryptoMethods;
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

              {/* The exact figure to send, stated once and unmissably. */}
              <div className="pay-amount-strip mb-4 flex flex-wrap items-baseline gap-2 rounded-xl px-4 py-3">
                <span className="pay-amount-label text-[11px] font-bold uppercase tracking-wide">
                  Send exactly
                </span>
                <span className="pay-amount-value text-xl font-extrabold">{amountToSend}</span>
                {effectiveKind === "crypto" && (
                  <span className="pay-amount-note text-xs">
                    (covers the {formatMoney(price)} unlock)
                  </span>
                )}
              </div>

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
                      <option key={m.id} value={m.id}>
                        {m.label || m.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* payment target — identical layout to the wallet deposit screen */}
              {selected && (
                <div className="mb-5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-4">
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
                          Name:{" "}
                          <strong>{(selected as { payeeName: string }).payeeName}</strong>
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
                          onClick={() =>
                            copy((selected as { address: string }).address, "addr")
                          }
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {effectiveKind === "upi" ? "UTR / reference number" : "Transaction hash"}
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={
                      effectiveKind === "upi" ? "e.g. 402312345678" : "e.g. 0x9f2c…"
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    You&apos;ll find this in your payment app right after the transfer.
                  </p>
                </div>

                {formError && <InfoBanner kind="danger">{formError}</InfoBanner>}
                {success && <InfoBanner kind="success">{success}</InfoBanner>}

                <Button type="submit" variant="primary" loading={submitting} fullWidth>
                  I&apos;ve paid {amountToSend} — submit for verification
                </Button>
              </form>
            </>
          )}
        </Card>
      )}

      {formError && status?.pending && <InfoBanner kind="danger">{formError}</InfoBanner>}
    </motion.div>
  );
}
