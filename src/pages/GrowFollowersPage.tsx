import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, InfoBanner, Spinner } from "../components/ui";
import { formatMoney } from "../utils/currency";
import {
  createSmmOrder,
  fetchPanelConfig,
  fetchQuote,
  fetchFollowerLimits,
  type FollowerLimits,
  looksLikePostUrl,
  normalizePlatform,
  FOLLOWER_PLATFORMS,
  PLATFORM_LABELS,
  PLATFORM_PROFILE_HINT,
  type PanelConfig,
  type Platform,
  type QuoteResult,
} from "../utils/api";
import {
  planFollowerDrip,
  paceVerdict,
  FOLLOWER_MIN_TOTAL,
  type FollowerPlan,
} from "../utils/followerPlan";
import type { CreatedOrder } from "../types/order";

interface GrowFollowersPageProps {
  onCreateOrder: (order: CreatedOrder) => void;
  onNavigateToOrders: (notice?: string) => void;
  onNavigateToWallet?: () => void;
  onBalanceChange?: (balance: number) => void;
}

/* Presets, in plain language. "Steady" is the default because it is the one
   that actually looks organic for a typical account. */
const SPEED_PRESETS = [
  { key: "gentle", label: "Gentle", days: 30, blurb: "Slowest, safest" },
  { key: "steady", label: "Steady", days: 14, blurb: "Recommended" },
  { key: "quick", label: "Quick", days: 7, blurb: "Faster growth" },
  { key: "rush", label: "Rush", days: 3, blurb: "Least natural" },
] as const;

const AMOUNT_PRESETS = [100, 250, 500, 1000, 2500];

const PLATFORM_TONE: Record<Platform, string> = {
  instagram: "border-pink-600 bg-pink-600",
  tiktok: "border-slate-900 bg-slate-900",
  youtube: "border-red-600 bg-red-600",
};

export function GrowFollowersPage({
  onCreateOrder,
  onNavigateToOrders,
  onNavigateToWallet,
  onBalanceChange,
}: GrowFollowersPageProps) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [profileUrl, setProfileUrl] = useState("");
  const [total, setTotal] = useState(500);
  const [days, setDays] = useState(14);
  const [config, setConfig] = useState<PanelConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [limits, setLimits] = useState<Record<Platform, FollowerLimits> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPanelConfig()
      .then((cfg) => { if (!cancelled) { setConfig(cfg); setConfigError(""); } })
      .catch((e) => {
        if (!cancelled) setConfigError(e instanceof Error ? e.message : "Could not load configuration");
      });
    return () => { cancelled = true; };
  }, []);

  /* The provider's own per-batch minimum. Read from the panel rather than
     hardcoded, so changing service ID does not silently break the drip. */
  useEffect(() => {
    let cancelled = false;
    fetchFollowerLimits()
      .then((l) => { if (!cancelled) setLimits(l); })
      .catch(() => { /* falls back to a minimum of 1 */ });
    return () => { cancelled = true; };
  }, []);

  /* Only platforms with a followers service mapped. A platform whose post
     campaigns are live can still be missing here, and vice versa. */
  const livePlatforms = useMemo(
    () => FOLLOWER_PLATFORMS.filter((p) => config?.platforms?.[p]?.followersConfigured),
    [config]
  );

  useEffect(() => {
    if (!config || livePlatforms.length === 0) return;
    if (!livePlatforms.includes(platform)) setPlatform(livePlatforms[0]);
  }, [config, livePlatforms, platform]);


  /* The seed is derived from the inputs, so the preview is stable while you
     read it but genuinely re-rolls when you change the order. */
  const minPerBatch = limits?.[platform]?.minPerBatch ?? 1;
  /* The smallest order that is possible at all: one batch at the minimum. */
  const minOrder = Math.max(FOLLOWER_MIN_TOTAL, minPerBatch);

  /* Lift the amount to the provider minimum once limits arrive, so the page
     never opens showing a number that cannot be ordered. */
  useEffect(() => {
    if (!limits) return;
    setTotal((t) => (t < minOrder ? minOrder : t));
  }, [limits, minOrder]);

  const plan: FollowerPlan = useMemo(
    () => planFollowerDrip({
      total,
      days,
      minPerBatch,
      seed: total * 31 + days * 7,
    }),
    [total, days, minPerBatch]
  );

  const verdict = paceVerdict(plan.peakPerDay);

  const linkIsPost = profileUrl.trim().length > 0 && looksLikePostUrl(profileUrl);

  /* Price the real batch list, so the quote matches what will be billed. */
  const quotePayload = useMemo(
    () => ({ followers: plan.batches.map((b) => b.quantity) }),
    [plan]
  );

  useEffect(() => {
    if (!config?.platforms?.[platform]?.followersConfigured || total < minOrder) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const timer = setTimeout(() => {
      fetchQuote(quotePayload, platform)
        .then((r) => { if (!cancelled) setQuote(r); })
        .catch(() => { if (!cancelled) setQuote(null); })
        .finally(() => { if (!cancelled) setQuoteLoading(false); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [quotePayload, platform, config, total, minOrder]);

  const handleStart = useCallback(async () => {
    setError("");
    setSuccess("");
    const link = profileUrl.trim();
    if (!link) { setError("Add your profile link first."); return; }
    try { new URL(link); } catch { setError("That doesn't look like a valid link."); return; }
    if (looksLikePostUrl(link)) {
      setError("That's a link to a post. Followers go to your profile — use your profile link instead.");
      return;
    }
    if (total < minOrder) {
      setError(`This service has a minimum of ${minOrder.toLocaleString()} followers per order.`);
      return;
    }
    if (quote?.available && !quote.sufficient) {
      setError(`Not enough balance. This costs ${formatMoney(quote.total)} and you have ${formatMoney(quote.balance)}.`);
      return;
    }

    setBusy(true);
    try {
      const result = await createSmmOrder({
        name: `${PLATFORM_LABELS[platform]} followers · ${total.toLocaleString()}`,
        link,
        platform,
        services: {
          followers: {
            runs: plan.batches.map((b) => ({
              time: b.at.toISOString(),
              quantity: b.quantity,
            })),
          },
        },
      });

      const order: CreatedOrder = {
        id: `ORD-${Date.now().toString().slice(-6)}`,
        name: `${PLATFORM_LABELS[platform]} followers · ${total.toLocaleString()}`,
        platform,
        schedulerOrderId: result.schedulerOrderId,
        smmOrderId: result.orderId ?? "Scheduled",
        link,
        totalViews: 0,
        startDelayHours: 0,
        patternType: "manual",
        patternName: "Organic drip",
        runs: plan.batches.map((b, i) => ({
          run: i + 1,
          at: b.at,
          minutesFromStart: Math.round((b.at.getTime() - plan.batches[0].at.getTime()) / 60000),
          views: 0, likes: 0, shares: 0, saves: 0, comments: 0,
          reposts: b.quantity,
          cumulativeViews: 0, cumulativeLikes: 0, cumulativeShares: 0,
          cumulativeSaves: 0, cumulativeComments: 0,
          cumulativeReposts: plan.batches.slice(0, i + 1).reduce((s, x) => s + x.quantity, 0),
        })),
        engagement: { likes: 0, shares: 0, saves: 0, comments: 0, reposts: total },
        serviceId: "",
        selectedAPI: null,
        selectedBundle: "Organic followers",
        status: "running",
        completedRuns: 0,
        runStatuses: plan.batches.map(() => "pending"),
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      };

      onCreateOrder(order);
      if (typeof result.balance === "number") onBalanceChange?.(result.balance);
      setSuccess("Growth started.");
      setTimeout(() => onNavigateToOrders("Follower growth scheduled."), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start growth.");
    } finally {
      setBusy(false);
    }
  }, [profileUrl, total, days, platform, plan, quote, onCreateOrder, onBalanceChange, onNavigateToOrders]);

  /* ---- Not available yet ---- */
  if (config && livePlatforms.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card padding="md">
          <h1 className="text-lg font-bold text-slate-900">Grow followers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organic follower growth for Instagram and TikTok.
          </p>
          <div className="mt-4">
            <InfoBanner kind="warning">
              This isn't switched on yet. The administrator needs to map a
              Followers service before growth can be ordered.
            </InfoBanner>
          </div>
        </Card>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-24">
        {configError ? (
          <InfoBanner kind="danger">{configError}</InfoBanner>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      {/* ---- Header ---- */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="grow-hero rounded-2xl px-5 py-4"
      >
        <h1 className="text-lg font-bold">Grow followers</h1>
        <p className="mt-0.5 text-sm">
          Real followers, delivered slowly over days so your account grows the
          way it would naturally.
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ================= LEFT: what you want ================= */}
        <Card padding="md" className="space-y-4">
          {/* Platform */}
          {livePlatforms.length > 1 && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Platform</label>
              <div className="grow-platforms grid grid-cols-2 gap-2">
                {livePlatforms.map((p) => {
                  const active = platform === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPlatform(p)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-bold transition ${
                        active
                          ? `${PLATFORM_TONE[p]} text-white shadow-md`
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {PLATFORM_LABELS[p]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Profile link */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Your {PLATFORM_LABELS[platform]} profile
            </label>
            <input
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder={PLATFORM_PROFILE_HINT[platform]}
              className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
            {linkIsPost ? (
              <p className="mt-1 text-[11px] font-bold text-rose-600">
                That's a post link. Followers are added to your profile — paste
                your profile link instead.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                Your profile must be public, or the provider can't deliver.
              </p>
            )}
          </div>

          {/* How many */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              How many followers
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {/* Hide presets the provider would reject anyway. */}
              {AMOUNT_PRESETS.filter((n) => n >= minOrder).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={total === n}
                  onClick={() => setTotal(n)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    total === n
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={FOLLOWER_MIN_TOTAL}
              value={total}
              onChange={(e) => setTotal(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
            />
            {total > 0 && total < minOrder ? (
              <p className="mt-1 text-[11px] font-bold text-rose-600">
                This service has a minimum of {minOrder.toLocaleString()} followers.
              </p>
            ) : minPerBatch > 1 ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Minimum {minOrder.toLocaleString()} — your provider sends
                followers in batches of at least {minPerBatch.toLocaleString()}.
              </p>
            ) : null}
          </div>

          {/* How fast */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              How fast
            </label>
            <div className="grow-speeds grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SPEED_PRESETS.map((s) => {
                const active = days === s.days;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDays(s.days)}
                    className={`rounded-lg border-2 px-2 py-2 text-center transition ${
                      active
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p className={`text-xs font-bold ${active ? "text-indigo-700" : "text-slate-800"}`}>
                      {s.label}
                    </p>
                    <p className="text-[10px] font-medium text-slate-500">{s.days} days</p>
                    <p className="text-[9px] text-slate-400">{s.blurb}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Fine-tune
                </span>
                <span className="text-xs font-bold tabular-nums text-slate-700">
                  {days} day{days === 1 ? "" : "s"}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
              />
            </div>
          </div>
        </Card>

        {/* ================= RIGHT: what will happen ================= */}
        <Card padding="md" className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Your growth plan</h2>
            <p className="text-[11px] text-slate-500">
              Followers arrive in small batches, not all at once.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
              <p className="text-base font-extrabold tabular-nums text-indigo-700">
                {plan.total.toLocaleString()}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Total</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
              <p className="text-base font-extrabold tabular-nums text-indigo-700">
                ~{Math.round(plan.averagePerDay).toLocaleString()}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Per day</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
              <p className="text-base font-extrabold tabular-nums text-violet-700">
                {plan.days}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Days</p>
            </div>
          </div>

          {/* Honest pacing read */}
          <div data-verdict={verdict.kind}>
            <InfoBanner kind={verdict.kind === "success" ? "success" : verdict.kind === "warning" ? "warning" : "danger"}>
              <strong>{verdict.label}</strong> — peaks at about{" "}
              {plan.peakPerDay.toLocaleString()} followers on the busiest day.{" "}
              {verdict.hint}
            </InfoBanner>
          </div>

          {/* Deliberately no day-by-day breakdown. Customers were reading
              it as a promise and asking why day 4 landed at a different
              hour; the exact split is also a provider detail that can shift
              on retry. Only the shape of the delivery is shown. */}
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] font-bold text-slate-700">How it arrives</p>
            <ul className="mt-1.5 space-y-1 text-[11px] text-slate-600">
              <li>• Split into small batches through the day, never all at once.</li>
              <li>• Starts slow, builds up, then eases off — like real growth.</li>
              <li>• Spread across roughly {plan.days} day{plan.days === 1 ? "" : "s"}.</li>
              <li>• Nothing is delivered overnight.</li>
            </ul>
            <p className="mt-2 text-[10px] text-slate-500" data-finish>
              Expected to finish around{" "}
              <strong className="text-slate-700">
                {plan.finishAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </strong>
              .
            </p>
          </div>

        </Card>
      </div>

      {/* ================= COST + START ================= */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div data-cost>
            {quoteLoading ? (
              <p className="text-xs font-bold text-slate-500">Calculating cost…</p>
            ) : quote?.available ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Total cost
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-indigo-700">
                  {formatMoney(quote.total)}
                </p>
                <p className="text-[11px] text-slate-500">
                  Balance {formatMoney(quote.balance)}
                  {!quote.sufficient && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => onNavigateToWallet?.()}
                        className="font-bold text-rose-600 underline"
                      >
                        Add money
                      </button>
                    </>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-xs font-bold text-slate-500">
                {total < minOrder
                  ? `Choose at least ${minOrder.toLocaleString()} followers.`
                  : "Cost appears once your plan is ready."}
              </p>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            loading={busy}
            disabled={busy || linkIsPost || total < minOrder}
            onClick={handleStart}
            className="font-extrabold"
          >
            Start growing
          </Button>
        </div>

        {error && (
          <div className="mt-3">
            <InfoBanner kind="danger">{error}</InfoBanner>
          </div>
        )}
        {success && (
          <div className="mt-3">
            <InfoBanner kind="success">{success}</InfoBanner>
          </div>
        )}
      </Card>
    </div>
  );
}
