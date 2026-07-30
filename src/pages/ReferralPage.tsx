import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { formatMoney, useCurrency } from "../utils/currency";
import { Button, Card, InfoBanner, Spinner, StatusPill } from "../components/ui";
import { fetchReferral, type ReferralStatus } from "../utils/api";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ReferralPage() {
  // Re-render when the user switches display currency.
  useCurrency();
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setStatus(await fetchReferral());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your referral details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shareLink = status
    ? `${window.location.origin}/?ref=${status.code}`
    : "";

  const shareText = status
    ? `Join me on TRUESMM and get ${formatMoney(status.refereeReward)} free credit. Use my code ${status.code}: ${shareLink}`
    : "";

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard blocked; the user can select the text manually */
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm font-medium text-slate-500">Loading your invite link…</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <InfoBanner kind="danger">{error}</InfoBanner>
        <div className="mt-4">
          <Button variant="secondary" onClick={load}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6"
    >
      {!status.enabled && (
        <InfoBanner kind="info">
          The referral programme isn&apos;t running right now. Your code below will
          start earning as soon as it&apos;s switched back on.
        </InfoBanner>
      )}

      {/* ---- Hero ---- */}
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Invite &amp; earn
            </span>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Give {formatMoney(status.refereeReward)}, get{" "}
              {formatMoney(status.referrerReward)}
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-slate-500">
              Share your code. When a friend signs up and adds at least{" "}
              {formatMoney(status.minDeposit)} to their wallet, you both get credited
              automatically.
            </p>
          </div>

          <div className="shrink-0 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-6 py-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Your code
            </p>
            <p className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-slate-900">
              {status.code}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => copy(status.code, "code")}>
            {copied === "code" ? "Copied!" : "Copy code"}
          </Button>
          <Button variant="secondary" onClick={() => copy(shareLink, "link")}>
            {copied === "link" ? "Copied!" : "Copy invite link"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="share-btn share-btn-whatsapp inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold transition"
          >
            Share on WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(
              `Join me on TRUESMM and get ${formatMoney(status.refereeReward)} free credit.`
            )}`}
            target="_blank"
            rel="noreferrer noopener"
            className="share-btn share-btn-telegram inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold transition"
          >
            Share on Telegram
          </a>
        </div>

        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="break-all font-mono text-xs text-slate-600">{shareLink}</p>
        </div>
      </Card>

      {/* ---- Stats ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Friends invited", value: String(status.totalInvited) },
          { label: "Rewarded", value: String(status.totalRewarded) },
          { label: "Total earned", value: formatMoney(status.earned) },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      {/* ---- How it works ---- */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">How it works</h2>
        <ol className="space-y-2.5">
          {[
            "Send your code or invite link to a friend.",
            "They sign up and enter your code.",
            `They add at least ${formatMoney(status.minDeposit)} to their wallet.`,
            `You get ${formatMoney(status.referrerReward)}, they get ${formatMoney(status.refereeReward)} — credited automatically.`,
          ].map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-sm text-slate-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          Rewards are released only after your friend&apos;s first payment is verified,
          so please don&apos;t create extra accounts yourself — they won&apos;t earn
          anything.
        </p>
      </Card>

      {/* ---- Invited list ---- */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Your invites</h2>
          <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
        </div>

        {status.invites.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No one has used your code yet. Share it to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {status.invites.map((invite) => (
              <div
                key={`${invite.email}-${invite.joinedAt}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                  <p className="text-[11px] text-slate-500">
                    Joined {formatDate(invite.joinedAt)}
                  </p>
                </div>
                {invite.rewarded ? (
                  <StatusPill kind="active">
                    +{formatMoney(status.referrerReward)} earned
                  </StatusPill>
                ) : (
                  <StatusPill kind="warning">Awaiting their first top-up</StatusPill>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
