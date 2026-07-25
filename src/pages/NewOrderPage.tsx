import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RunTable } from "../components/RunTable";
import type {
  ApiPanel,
  Bundle,
  CreatedOrder,
  DeliveryOption,
  EngagementRatios,
  OrderConfig,
  PatternPlan,
  QuickPatternPreset,
} from "../types/order";
import { DEFAULT_ENGAGEMENT_RATIOS } from "../types/order";
import { createSmmOrder, fetchPanelPricingMetadata } from "../utils/api"; 
import { createPatternPlan } from "../utils/patterns";
import {
  Button,
  Card,
  StatusPill,
  InfoBanner,
} from "../components/ui";

interface NewOrderPageProps {
  apis: ApiPanel[];
  bundles: Bundle[];
  orders: CreatedOrder[];
  prefillOrder?: CreatedOrder | null;
  activeRatios?: EngagementRatios;
  onCreateOrder: (order: CreatedOrder) => void;
  onPricingMetadataUpdate: (apiId: string, metadata: Partial<ApiPanel>) => void;
  onNavigateToOrders: (notice?: string) => void;
}

function createOrderId() {
  return `ORD-${Date.now().toString().slice(-6)}`;
}

/* ============================================ */
/* SECTION HEADER HELPER                        */
/* ============================================ */

function SectionTitle({
  step,
  title,
  description,
  accent = "indigo",
}: {
  step: string;
  title: string;
  description: string;
  accent?: "indigo" | "emerald" | "amber" | "violet" | "rose";
}) {
  const accents = {
    indigo: { bg: "bg-indigo-600", text: "text-indigo-600" },
    emerald: { bg: "bg-emerald-600", text: "text-emerald-600" },
    amber: { bg: "bg-amber-600", text: "text-amber-600" },
    violet: { bg: "bg-violet-600", text: "text-violet-600" },
    rose: { bg: "bg-rose-600", text: "text-rose-600" },
  };
  const a = accents[accent];
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-lg ${a.bg} text-white text-base sm:text-lg font-extrabold shadow-md`}>
        {step}
      </div>
      <div>
        <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${a.text}`}>{title}</h3>
        <p className="text-xs sm:text-sm text-slate-600 font-medium leading-tight">{description}</p>
      </div>
    </div>
  );
}

/* ============================================ */
/* MAIN PAGE                                    */
/* ============================================ */

export function NewOrderPage({
  apis,
  bundles,
  orders,
  prefillOrder,
  activeRatios,
  onCreateOrder,
  onPricingMetadataUpdate,
  onNavigateToOrders,
}: NewOrderPageProps) {
  const effectiveRatios = activeRatios ?? DEFAULT_ENGAGEMENT_RATIOS;
  const ratiosAreCustom =
    !!activeRatios &&
    (Object.keys(effectiveRatios) as (keyof EngagementRatios)[]).some(
      (k) => effectiveRatios[k] !== DEFAULT_ENGAGEMENT_RATIOS[k]
    );
  const prefillApiId = prefillOrder ? apis.find((api) => api.name === prefillOrder.selectedAPI)?.id ?? "" : "";
  const prefillBundleId = prefillOrder
    ? bundles.find((bundle) => bundle.name === prefillOrder.selectedBundle && bundle.apiId === prefillApiId)?.id ?? ""
    : "";
  const prefillRuns = prefillOrder?.runs || [];
  const prefillPlan: PatternPlan | null = prefillOrder
    ? {
        patternId: Number(prefillOrder.id.replace(/\D/g, "")) || Date.now() % 1000,
        patternName: prefillOrder.patternName,
        patternType: prefillOrder.patternType,
        totalRuns: prefillRuns.length,
        approximateIntervalMin:
          prefillRuns.length > 1
            ? Math.max(
                1,
                Math.round(
                  prefillRuns
                    .slice(1)
                    .reduce((acc, run, index) => {
                      const prev = prefillRuns[index];
                      return acc + (run.at.getTime() - prev.at.getTime()) / 60000;
                    }, 0) / (prefillRuns.length - 1)
                )
              )
            : 0,
        finishTime: prefillRuns[prefillRuns.length - 1]?.at ?? new Date(),
        estimatedDurationHours:
          prefillRuns.length > 1
            ? Math.round(
                ((prefillRuns[prefillRuns.length - 1]?.at.getTime() ?? Date.now()) -
                  (prefillRuns[0]?.at.getTime() ?? Date.now())) /
                  3600000
              )
            : 0,
        risk: "Safe",
        runs: prefillRuns,
      }
    : null;

  const [orderName, setOrderName] = useState(prefillOrder?.name && !prefillOrder.name.startsWith("Order #") ? prefillOrder.name : "");
  const [postUrl, setPostUrl] = useState(prefillOrder?.link ?? "");
  const [bulkLinks, setBulkLinks] = useState("");
  const [totalViews, setTotalViews] = useState(prefillOrder?.totalViews ?? 50000);
  const [minViewsPerRun, setMinViewsPerRun] = useState(10);
  const [selectedApiId, setSelectedApiId] = useState(prefillApiId);
  const [selectedBundleId, setSelectedBundleId] = useState(prefillBundleId);
  const [startDelayHours, setStartDelayHours] = useState(prefillOrder?.startDelayHours ?? 0);
  const [includeLikes, setIncludeLikes] = useState((prefillOrder?.engagement.likes ?? 0) > 0);
  const [includeShares, setIncludeShares] = useState((prefillOrder?.engagement.shares ?? 0) > 0);
  const [includeSaves, setIncludeSaves] = useState((prefillOrder?.engagement.saves ?? 0) > 0);
  const [includeReposts, setIncludeReposts] = useState((prefillOrder?.engagement.reposts ?? 0) > 0);
  const [customComments, setCustomComments] = useState("");
  const [includeComments, setIncludeComments] = useState(false);
  const [variancePercent, setVariancePercent] = useState(40);
  const [peakHoursBoost, setPeakHoursBoost] = useState(false);
  const [quickPreset, setQuickPreset] = useState<QuickPatternPreset | null>(null);
  const [customHours, setCustomHours] = useState(30);
  const [delivery, setDelivery] = useState<DeliveryOption>({ mode: "auto", hours: 18, label: "Auto" });
  const [seed, setSeed] = useState(0);
  const [useClonedPlan, setUseClonedPlan] = useState(Boolean(prefillPlan));
  const [clonedPlan] = useState<PatternPlan | null>(prefillPlan);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [pricingRefreshError, setPricingRefreshError] = useState("");

  useEffect(() => {
    const fetchMinViews = async () => {
      try {
        const backendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/$/, "") || "https://truesmm-backend.onrender.com";
        const response = await fetch(`${backendUrl}/api/settings/min-views`);
        if (response.ok) {
          const data = await response.json();
          if (data.minViewsPerRun) {
            setMinViewsPerRun(data.minViewsPerRun);
          }
        }
      } catch (error) {
        console.warn("Could not fetch min views setting, using default 10");
      }
    };
    fetchMinViews();
  }, []);

  // Refresh conversion rates older than six hours when an API is selected.
  useEffect(() => {
    const selected = apis.find((api) => api.id === selectedApiId);
    if (!selected?.currency) return;
    const updatedAt = selected.exchangeRateUpdatedAt
      ? new Date(selected.exchangeRateUpdatedAt).getTime()
      : 0;
    const stale = !selected.exchangeRateToInr || !updatedAt || Date.now() - updatedAt > 6 * 60 * 60 * 1000;
    if (!stale) return;

    let cancelled = false;
    setPricingRefreshError("");
    fetchPanelPricingMetadata(selected.url, selected.key, selected.currency)
      .then((metadata) => {
        if (cancelled || !metadata.currency || !metadata.exchangeRateToInr) return;
        onPricingMetadataUpdate(selected.id, {
          currency: metadata.currency,
          currencySource: selected.currencySource || "user",
          exchangeRateToInr: metadata.exchangeRateToInr,
          exchangeRateUpdatedAt: metadata.exchangeRateUpdatedAt || new Date().toISOString(),
        });
      })
      .catch((error) => {
        if (!cancelled) setPricingRefreshError(error instanceof Error ? error.message : "Exchange-rate refresh failed");
      });
    return () => { cancelled = true; };
  }, [selectedApiId, apis]);

  const config: OrderConfig = useMemo(
    () => ({
      postUrl,
      totalViews,
      startDelayHours,
      includeLikes,
      includeShares,
      includeSaves,
      includeComments,
      includeReposts,
      variancePercent,
      peakHoursBoost,
      quickPreset,
      delivery:
        delivery.mode === "custom"
          ? { ...delivery, hours: customHours, label: "Custom" }
          : delivery.mode === "auto"
            ? { ...delivery, hours: Math.max(6, Math.min(48, delivery.hours)) }
            : delivery,
      minViewsPerRun,
      customRatios: ratiosAreCustom ? effectiveRatios : null,
    }),
    [
      postUrl, totalViews, startDelayHours, includeLikes, includeShares,
      includeSaves, includeComments, includeReposts, variancePercent, peakHoursBoost,
      quickPreset, delivery, customHours, minViewsPerRun,
      effectiveRatios, ratiosAreCustom,
    ]
  );

  const generatedPlan = useMemo(() => {
    try {
      const nextPlan = createPatternPlan(config);
      return { ...nextPlan, runs: nextPlan?.runs || [] };
    } catch (error) {
      console.error("Pattern plan generation failed", error);
      const now = new Date();
      return {
        patternId: 0,
        patternName: "fallback",
        patternType: "smooth-s-curve" as const,
        totalRuns: 0,
        approximateIntervalMin: 0,
        finishTime: now,
        estimatedDurationHours: 0,
        risk: "Safe" as const,
        runs: [],
      };
    }
  }, [config, seed]);

  const plan = useMemo(() => {
    const basePlan = useClonedPlan && clonedPlan
      ? { ...clonedPlan, runs: clonedPlan.runs || [] }
      : generatedPlan;

    const runs = basePlan?.runs || [];
    if (runs.length <= 1) return basePlan;

    const baseIntervalMin = basePlan.approximateIntervalMin || 120;

    const newRuns = runs.map((run, i) => {
      if (i === 0) return run;
      const prevTime = new Date(runs[i - 1].at).getTime();
      const hour = new Date(prevTime).getHours();
      let multiplier = 1;
      if (hour >= 0 && hour < 6) multiplier = 1.4;
      else if (hour >= 6 && hour < 12) multiplier = 1.1;
      else if (hour >= 18 && hour <= 23) multiplier = 0.85;
      const baseIntervalMs = baseIntervalMin * 60 * 1000 * multiplier;
      const variation = baseIntervalMs * (Math.random() * 0.4 - 0.2);
      const newTime = prevTime + baseIntervalMs + variation;
      return { ...run, at: new Date(newTime) };
    });

    return { ...basePlan, runs: newRuns };
  }, [useClonedPlan, clonedPlan, generatedPlan]);

  const safePlan = useMemo(() => ({ ...plan, runs: plan?.runs || [] }), [plan]);

  const bundleOptions = useMemo(() => {
    if (!selectedApiId) return bundles;
    return bundles.filter((bundle) => String(bundle.apiId || "").trim() === String(selectedApiId || "").trim());
  }, [bundles, selectedApiId]);

  function isValidUrl(value: string) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  const handleApplyPreset = (preset: QuickPatternPreset) => {
    setUseClonedPlan(false);
    setQuickPreset(preset);
    if (preset === "viral-boost") { setVariancePercent(48); setDelivery({ mode: "preset", label: "12h", hours: 12 }); }
    if (preset === "fast-start") { setVariancePercent(32); setDelivery({ mode: "preset", label: "6h", hours: 6 }); }
    if (preset === "trending-push") { setVariancePercent(40); setDelivery({ mode: "preset", label: "24h", hours: 24 }); }
    if (preset === "slow-burn") { setVariancePercent(22); setDelivery({ mode: "preset", label: "48h", hours: 48 }); }
    setSeed((current) => current + 1);
  };

  const handleMinViewsChange = (value: number) => {
    const newValue = Math.max(1, Math.floor(value));
    setMinViewsPerRun(newValue);
    setUseClonedPlan(false);
    setSeed((current) => current + 1);
    const backendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/$/, "") || "https://truesmm-backend.onrender.com";
    fetch(`${backendUrl}/api/settings/min-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minViewsPerRun: newValue }),
    }).catch(() => console.warn("Could not update min views setting on backend"));
  };

  const deliveryOptions: DeliveryOption[] = [
    { mode: "preset", label: "6h", hours: 6 },
    { mode: "preset", label: "12h", hours: 12 },
    { mode: "auto", label: "Auto", hours: 18 },
    { mode: "preset", label: "24h", hours: 24 },
    { mode: "preset", label: "48h", hours: 48 },
    { mode: "custom", label: "Custom", hours: customHours },
  ];

  const presetButtons: Array<{ label: string; value: QuickPatternPreset; emoji: string }> = [
    { label: "Viral Boost", value: "viral-boost", emoji: "🚀" },
    { label: "Fast Start", value: "fast-start", emoji: "⚡" },
    { label: "Trending", value: "trending-push", emoji: "🔥" },
    { label: "Slow Burn", value: "slow-burn", emoji: "🌊" },
  ];

  const graphTotals = useMemo(() => {
    return safePlan.runs.reduce(
      (acc, run) => ({
        views: Math.max(acc.views, run.cumulativeViews || 0),
        likes: Math.max(acc.likes, run.cumulativeLikes || 0),
        shares: Math.max(acc.shares, run.cumulativeShares || 0),
        comments: Math.max(acc.comments, run.cumulativeComments || 0),
        saves: Math.max(acc.saves, run.cumulativeSaves || 0),
        reposts: Math.max(acc.reposts, run.cumulativeReposts || 0),
      }),
      { views: 0, likes: 0, shares: 0, comments: 0, saves: 0, reposts: 0 }
    );
  }, [safePlan.runs]);

  const totalCost = useMemo(() => {
    const selBundle = bundles.find(b => String(b.id || "").trim() === String(selectedBundleId || "").trim());
    const selApi = apis.find(a => String(a.id || "").trim() === String(selectedApiId || "").trim());
    if (!selBundle || !selApi || safePlan.runs.length === 0) return null;

    const findSvc = (targetId?: string | number) => {
      if (targetId === null || targetId === undefined || targetId === "") return undefined;
      const t = String(targetId).trim();
      return selApi.services.find(s => {
        const sid = String(s.id ?? (s as any).service ?? (s as any).services ?? (s as any).service_id ?? (s as any).serviceId ?? "").trim();
        return sid === t;
      });
    };

    const viewsService = findSvc(selBundle.serviceIds.views);
    const likesService = findSvc(selBundle.serviceIds.likes);
    const sharesService = findSvc(selBundle.serviceIds.shares);
    const savesService = findSvc(selBundle.serviceIds.saves);
    const repostsService = findSvc(selBundle.serviceIds.reposts);
    const commentsService = findSvc(selBundle.serviceIds.comments);

    // Mirror the exact quantities sent/accepted by order creation and addRuns.
    const totalViewsQty = safePlan.runs.reduce(
      (sum, run) => sum + Math.max(Math.floor(run.views || 0), minViewsPerRun), 0
    );
    const totalLikesQty = safePlan.runs.reduce(
      (sum, run) => sum + Math.max(0, Math.floor(run.likes || 0)), 0
    );
    const totalSharesQty = safePlan.runs.reduce(
      (sum, run) => sum + Math.max(0, Math.floor(run.shares || 0)), 0
    );
    const totalSavesQty = safePlan.runs.reduce(
      (sum, run) => sum + Math.max(0, Math.floor(run.saves || 0)), 0
    );
    const totalRepostsQty = safePlan.runs.reduce((sum, run) => {
      const quantity = Math.max(0, Math.floor(run.reposts || 0));
      return sum + (quantity >= 10 ? quantity : 0);
    }, 0);
    const totalCommentsQty = safePlan.runs.reduce((sum, run) => {
      const requested = Math.max(0, Math.floor(run.comments || 0));
      return sum + Math.min(requested, 10);
    }, 0);

    const parseRate = (val: unknown): number => {
      if (val === null || val === undefined) return 0;
      if (typeof val === "number") return Number.isFinite(val) ? Math.max(0, val) : 0;
      const str = String(val).trim();
      let clean = str.replace(/[^\d.,]/g, "");
      if (clean.includes(".") && clean.includes(",")) {
        if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) {
          clean = clean.replace(/\./g, "").replace(",", ".");
        } else {
          clean = clean.replace(/,/g, "");
        }
      } else if (clean.includes(",")) {
        const parts = clean.split(",");
        if (parts.length > 2) {
          clean = clean.replace(/,/g, "");
        } else {
          const [whole, fraction = ""] = parts;
          clean = fraction.length === 3 && whole !== "0"
            ? `${whole}${fraction}`
            : `${whole}.${fraction}`;
        }
      }
      const parsed = Number(clean);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const viewsRate = parseRate(viewsService?.rate ?? viewsService?.price ?? viewsService?.cost);
    const likesRate = parseRate(likesService?.rate ?? likesService?.price ?? likesService?.cost);
    const sharesRate = parseRate(sharesService?.rate ?? sharesService?.price ?? sharesService?.cost);
    const savesRate = parseRate(savesService?.rate ?? savesService?.price ?? savesService?.cost);
    const repostsRate = parseRate(repostsService?.rate ?? repostsService?.price ?? repostsService?.cost);
    const commentsRate = parseRate(commentsService?.rate ?? commentsService?.price ?? commentsService?.cost);

    // A zero/missing rate for any selected service makes the quote incomplete.
    if (
      viewsRate <= 0 ||
      (includeLikes && likesRate <= 0) ||
      (includeShares && sharesRate <= 0) ||
      (includeSaves && savesRate <= 0) ||
      (includeReposts && repostsRate <= 0) ||
      (includeComments && commentsRate <= 0)
    ) return null;

    // Standard SMM API rates are prices per 1,000 units in the panel account's
    // currency. Currency must be detected or user-confirmed; it is never guessed.
    const exchangeRate = Number(selApi.exchangeRateToInr);
    if (!selApi.currency || !Number.isFinite(exchangeRate) || exchangeRate <= 0) return null;

    const viewsNative = (totalViewsQty / 1000) * viewsRate;
    const likesNative = includeLikes ? (totalLikesQty / 1000) * likesRate : 0;
    const sharesNative = includeShares ? (totalSharesQty / 1000) * sharesRate : 0;
    const savesNative = includeSaves ? (totalSavesQty / 1000) * savesRate : 0;
    const repostsNative = includeReposts ? (totalRepostsQty / 1000) * repostsRate : 0;
    const commentsNative = includeComments ? (totalCommentsQty / 1000) * commentsRate : 0;
    const nativeTotal = viewsNative + likesNative + sharesNative + savesNative + repostsNative + commentsNative;

    return {
      total: nativeTotal * exchangeRate,
      views: viewsNative * exchangeRate,
      likes: likesNative * exchangeRate,
      shares: sharesNative * exchangeRate,
      saves: savesNative * exchangeRate,
      reposts: repostsNative * exchangeRate,
      comments: commentsNative * exchangeRate,
      nativeTotal,
      currency: selApi.currency,
      exchangeRate,
      exchangeRateUpdatedAt: selApi.exchangeRateUpdatedAt,
    };
  }, [selectedBundleId, selectedApiId, bundles, apis, safePlan.runs, minViewsPerRun, customComments, includeLikes, includeShares, includeSaves, includeReposts, includeComments]);

  const estimatedRunCount = safePlan.runs.length;
  const averageViewsPerRun = estimatedRunCount > 0 ? Math.round(totalViews / estimatedRunCount) : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      {/* ============ HERO HEADER (compact) ============ */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-3 sm:p-4 shadow-lg shadow-indigo-500/20"
      >
        <div className="absolute inset-0 opacity-15" style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }} />

        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🚀</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  New mission
                </h1>
                {ratiosAreCustom && (
                  <span className="inline-flex items-center rounded-full bg-amber-400/30 px-2 py-0.5 text-[9px] font-bold text-amber-50 backdrop-blur-sm">
                    Custom ratios
                  </span>
                )}
              </div>
              <p className="text-xs text-indigo-100 font-medium">
                Configure everything below, then deploy
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {[
              { label: "Views", value: totalViews.toLocaleString() },
              { label: "Runs", value: estimatedRunCount.toString() },
              { label: "Hours", value: `${safePlan.estimatedDurationHours || 0}h` },
              { label: "Pattern", value: safePlan.patternName || "—" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md bg-white/10 backdrop-blur-sm border border-white/20 px-2 py-1.5 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-100">{stat.label}</p>
                <p className="text-xs sm:text-sm font-bold text-white tabular-nums truncate">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {ratiosAreCustom && (
        <InfoBanner kind="info" title="Custom engagement ratios are active">
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm font-semibold">
            <span>Likes {effectiveRatios.likes}%</span>
            <span>Shares {effectiveRatios.shares}%</span>
            <span>Saves {effectiveRatios.saves}%</span>
            <span>Comments {effectiveRatios.comments}%</span>
            <span>Reposts {effectiveRatios.reposts}%</span>
          </div>
        </InfoBanner>
      )}

      {/* ============ TOP ROW: Target & Volume + Delivery Pattern ============ */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">

        {/* === QUADRANT 1 (top-left): Target & Volume === */}
        <Card padding="md" className="border-2 border-indigo-200 shadow-md bg-white">
          <SectionTitle step="1" title="Target & volume" description="Where to send & how much" accent="indigo" />

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Order name</label>
                <input
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  placeholder="e.g. Spring campaign"
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Total views</label>
                <input
                  type="number"
                  value={totalViews}
                  onChange={(e) => {
                    setUseClonedPlan(false);
                    const safeValue = Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0;
                    setTotalViews(Math.max(0, Math.floor(safeValue)));
                  }}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 tabular-nums focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Min / run</label>
                <input
                  type="number"
                  value={minViewsPerRun}
                  onChange={(e) => handleMinViewsChange(Number(e.target.value))}
                  min={1}
                  max={10000}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 tabular-nums focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Runs</p>
                <p className="mt-0.5 text-base font-extrabold text-indigo-700 tabular-nums">{estimatedRunCount}</p>
              </div>
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Avg/run</p>
                <p className="mt-0.5 text-base font-extrabold text-indigo-700 tabular-nums">{averageViewsPerRun.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-violet-50 border border-violet-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Hours</p>
                <p className="mt-0.5 text-base font-extrabold text-violet-700 tabular-nums">{safePlan.estimatedDurationHours || 0}h</p>
              </div>
              <div className="rounded-lg bg-violet-50 border border-violet-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Interval</p>
                <p className="mt-0.5 text-base font-extrabold text-violet-700 tabular-nums">{safePlan.approximateIntervalMin || 0}<span className="text-[10px]">m</span></p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Post URL</label>
              <input
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://instagram.com/reel/..."
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Bulk links <span className="text-[10px] font-medium text-slate-500">(one per line)</span>
              </label>
              <textarea
                value={bulkLinks}
                onChange={(e) => setBulkLinks(e.target.value)}
                rows={2}
                placeholder="Paste multiple URLs…"
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none resize-none transition"
              />
              {bulkLinks && (
                <p className="mt-1 text-[10px] font-bold text-indigo-600">
                  {(bulkLinks.match(/\n/g)?.length ?? 0) + 1} link{(bulkLinks.match(/\n/g)?.length ?? 0) > 0 ? "s" : ""} detected
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">API panel</label>
                <select
                  value={selectedApiId}
                  onChange={(e) => { setSelectedApiId(e.target.value); setSelectedBundleId(""); }}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
                >
                  <option value="">Select API…</option>
                  {apis.map((api) => (
                    <option key={api.id} value={api.id}>{api.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Bundle</label>
                <select
                  value={selectedBundleId}
                  onChange={(e) => setSelectedBundleId(e.target.value)}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition"
                >
                  <option value="">Select bundle…</option>
                  {bundleOptions.map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>{bundle.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* === QUADRANT 2 (top-right): Delivery Pattern === */}
        <Card padding="md" className="border-2 border-violet-200 shadow-md bg-white">
          <SectionTitle step="2" title="Delivery pattern" description="How to spread views over time" accent="violet" />

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Delivery window</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {deliveryOptions.map((option) => {
                  const isActive = delivery.label === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => { setUseClonedPlan(false); setDelivery(option); }}
                      className={`rounded-lg px-2 py-2 text-xs font-bold transition-all ${
                        isActive
                          ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300 scale-[1.02]"
                          : "bg-white border-2 border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                      }`}
                    >
                      <span className="block">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              {delivery.mode === "custom" && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    value={customHours}
                    onChange={(e) => {
                      setUseClonedPlan(false);
                      const safeHours = Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 1;
                      const clampedHours = Math.max(1, Math.min(96, safeHours));
                      setCustomHours(clampedHours);
                      setDelivery({ mode: "custom", label: "Custom", hours: clampedHours });
                    }}
                    min={1}
                    max={96}
                    className="w-24 rounded-lg border-2 border-emerald-200 bg-white px-3 py-2 text-sm font-extrabold text-emerald-700 tabular-nums focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition"
                  />
                  <span className="text-xs font-bold text-slate-600">hours</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Random variance</label>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-sm font-extrabold text-indigo-700 tabular-nums">
                  {variancePercent}%
                </span>
              </div>
              <input
                type="range"
                value={variancePercent}
                onChange={(e) => { setUseClonedPlan(false); setVariancePercent(Number(e.target.value)); }}
                min={0}
                max={50}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setUseClonedPlan(false); setPeakHoursBoost(!peakHoursBoost); }}
                className={`flex items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-all ${
                  peakHoursBoost
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md ring-2 ring-orange-300"
                    : "bg-white border-2 border-slate-200 text-slate-700 hover:border-orange-300"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🔥</span>
                    <p className={`text-xs font-bold ${peakHoursBoost ? "text-white" : "text-slate-900"}`}>
                      Peak hours
                    </p>
                  </div>
                  <p className={`text-[10px] font-medium mt-0.5 ${peakHoursBoost ? "text-white/80" : "text-slate-500"}`}>
                    Boost 6 PM - 11 PM
                  </p>
                </div>
                <div className={`flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${peakHoursBoost ? "bg-white/30" : "bg-slate-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${peakHoursBoost ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </button>

              <div className="flex items-center gap-2 rounded-lg border-2 border-slate-200 bg-white px-3 py-2">
                <input
                  type="number"
                  value={startDelayHours}
                  onChange={(e) => {
                    setUseClonedPlan(false);
                    const safeValue = Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0;
                    setStartDelayHours(Math.max(0, Math.min(168, Math.floor(safeValue))));
                  }}
                  min={0}
                  max={168}
                  className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-900 tabular-nums focus:border-violet-500 focus:outline-none"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">Start delay</p>
                  <p className="text-[10px] text-slate-500">hours before deploy</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ============ ROW 2: SCHEDULE & ENGAGEMENT ============ */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
        {/* ============ SCHEDULE PREVIEW (iAMBATMAN EXACT) ============ */}
        <Card padding="md" className="border-2 border-orange-200/70 shadow-md bg-white flex flex-col">
          <SchedulePreviewIambatman
            plan={safePlan}
            quickPreset={quickPreset}
            presetButtons={presetButtons}
            onApplyPreset={handleApplyPreset}
          />
        </Card>

        {/* ============ ENGAGEMENT MIX ============ */}
        <Card padding="md" className="border-2 border-amber-200 shadow-md bg-white flex flex-col">
          <SectionTitle step="3" title="Engagement mix" description="Toggle engagement types" accent="amber" />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[
            { label: "Likes", description: "Heart reactions", active: includeLikes, toggle: () => { setUseClonedPlan(false); setIncludeLikes(!includeLikes); }, color: "pink", emoji: "❤️" },
            { label: "Shares", description: "Forward to friends", active: includeShares, toggle: () => { setUseClonedPlan(false); setIncludeShares(!includeShares); }, color: "sky", emoji: "🔁" },
            { label: "Saves", description: "Bookmark posts", active: includeSaves, toggle: () => { setUseClonedPlan(false); setIncludeSaves(!includeSaves); }, color: "violet", emoji: "🔖" },
            { label: "Reposts", description: "Share to feed", active: includeReposts, toggle: () => { setUseClonedPlan(false); setIncludeReposts(!includeReposts); }, color: "cyan", emoji: "📢" },
            { label: "Comments", description: "Custom text", active: includeComments, toggle: () => { setUseClonedPlan(false); setIncludeComments(!includeComments); }, color: "amber", emoji: "💬" },
          ].map((btn) => {
            const tones: Record<string, { bg: string; ring: string }> = {
              pink: { bg: "bg-pink-600", ring: "ring-pink-300" },
              sky: { bg: "bg-sky-600", ring: "ring-sky-300" },
              violet: { bg: "bg-violet-600", ring: "ring-violet-300" },
              cyan: { bg: "bg-cyan-600", ring: "ring-cyan-300" },
              amber: { bg: "bg-amber-600", ring: "ring-amber-300" },
            };
            const t = tones[btn.color];
            return (
              <button
                key={btn.label}
                type="button"
                onClick={btn.toggle}
                className={`flex items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-all ${
                  btn.active
                    ? `${t.bg} text-white shadow-md ring-2 ${t.ring}`
                    : "bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{btn.emoji}</span>
                    <p className={`text-xs font-bold ${btn.active ? "text-white" : "text-slate-900"}`}>
                      {btn.label}
                    </p>
                  </div>
                  <p className={`text-[10px] font-medium mt-0.5 ${btn.active ? "text-white/80" : "text-slate-500"}`}>
                    {btn.description}
                  </p>
                </div>
                <div className={`flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${btn.active ? "bg-white/30" : "bg-slate-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${btn.active ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </button>
            );
          })}
        </div>

        {includeComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3"
          >
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Custom comments <span className="text-[10px] font-medium text-slate-500">(one per line)</span>
            </label>
            <textarea
              value={customComments}
              onChange={(e) => setCustomComments(e.target.value)}
              rows={2}
              placeholder={"Nice post!\n🔥🔥\nAmazing"}
              className="w-full rounded-lg border-2 border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 focus:outline-none resize-none transition"
            />
          </motion.div>
        )}
      </Card>
      </div>

      {/* ============ ROW 3: RUN TABLE ============ */}
      <Card padding="md" className="border-2 border-slate-200 shadow-md bg-white">
        <SectionTitle step="4" title="Run schedule" description="Detailed list of automated runs" accent="emerald" />
        <RunTable runs={safePlan.runs || []} mode="schedule" />
      </Card>

      {/* ============ STICKY FOOTER: COST + DEPLOY ============ */}
      <div className="sticky bottom-3 z-10">
        <div className="rounded-xl border-2 border-indigo-200 bg-white shadow-2xl shadow-indigo-500/20 overflow-hidden">
          <div className="px-3 sm:px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-3">
            {createError ? (
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-rose-700">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600 font-bold text-xs">!</span>
                <span>{createError}</span>
              </div>
            ) : createSuccess ? (
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-700">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 font-bold text-xs">✓</span>
                <span>{createSuccess}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Ready
                </span>
                <span className="text-xs font-bold text-slate-700 tabular-nums">
                  {estimatedRunCount} runs · ~{averageViewsPerRun.toLocaleString()} views/run
                </span>
              </div>
            )}
          </div>

          <div className="px-3 sm:px-4 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              {totalCost && totalCost.total > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Estimated</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-indigo-700 tabular-nums">
                    ₹{totalCost.total.toFixed(2)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {totalCost.views > 0 && (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        Views ₹{totalCost.views.toFixed(0)}
                      </span>
                    )}
                    {includeLikes && totalCost.likes > 0 && (
                      <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-700">
                        ❤️ ₹{totalCost.likes.toFixed(0)}
                      </span>
                    )}
                    {includeShares && totalCost.shares > 0 && (
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                        🔁 ₹{totalCost.shares.toFixed(0)}
                      </span>
                    )}
                    {includeSaves && totalCost.saves > 0 && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        🔖 ₹{totalCost.saves.toFixed(0)}
                      </span>
                    )}
                    {includeReposts && totalCost.reposts > 0 && (
                      <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                        📢 ₹{totalCost.reposts.toFixed(0)}
                      </span>
                    )}
                    {includeComments && totalCost.comments > 0 && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        💬 ₹{totalCost.comments.toFixed(0)}
                      </span>
                    )}
                  </div>
                  <p className="w-full text-[10px] font-semibold text-slate-500">
                    {totalCost.nativeTotal.toFixed(4)} {totalCost.currency} converted at 1 {totalCost.currency} = ₹{totalCost.exchangeRate.toFixed(4)}
                    {totalCost.exchangeRateUpdatedAt
                      ? ` · rate ${new Date(totalCost.exchangeRateUpdatedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
              ) : selectedApiId && selectedBundleId ? (
                <p className="text-xs font-bold text-amber-700">
                  {pricingRefreshError
                    ? `Cost unavailable — ${pricingRefreshError}`
                    : "Cost unavailable — sync this API, confirm its currency, and verify all selected service rates."}
                </p>
              ) : (
                <p className="text-xs font-bold text-slate-500">Select API & bundle to see cost</p>
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              loading={isCreatingOrder}
              disabled={isCreatingOrder}
              className="text-sm font-extrabold shadow-lg shadow-indigo-500/40"
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              onClick={async () => {
                setCreateError("");
                setCreateSuccess("");
                if (!selectedBundleId) { setCreateError("Select a bundle before creating a mission."); return; }
                const bulkTargets = bulkLinks.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                const singleTarget = postUrl.trim();
                const targets = bulkTargets.length > 0 ? bulkTargets : singleTarget ? [singleTarget] : [];
                if (!targets.length) { setCreateError("Add a post URL or paste multiple links."); return; }
                const invalidTarget = targets.find((target) => !isValidUrl(target));
                if (invalidTarget) { setCreateError(`Invalid URL: ${invalidTarget.slice(0, 30)}...`); return; }

                const selApi = apis.find((api) => api.id === selectedApiId) ?? null;
                if (!selApi) { setCreateError("Select an API."); return; }
                if (!selApi.url.trim()) { setCreateError("API URL is required."); return; }
                if (!isValidUrl(selApi.url.trim())) { setCreateError("API URL must be valid."); return; }
                if (!selApi.key.trim()) { setCreateError("API key is required."); return; }

                const selBundle = bundles.find((bundle) => bundle.id === selectedBundleId);
                if (!selBundle) { setCreateError("Select a valid bundle."); return; }
                const viewsServiceId = selBundle.serviceIds.views.trim();
                if (!viewsServiceId) { setCreateError("Bundle has no Views service."); return; }
                const likesServiceId = selBundle.serviceIds.likes.trim();
                const sharesServiceId = selBundle.serviceIds.shares.trim();
                const savesServiceId = selBundle.serviceIds.saves.trim();
                const repostsServiceId = selBundle.serviceIds.reposts?.trim();
                if (includeLikes && !likesServiceId) { setCreateError("Bundle has no Likes service."); return; }
                if (includeShares && !sharesServiceId) { setCreateError("Bundle has no Shares service."); return; }
                if (includeSaves && !savesServiceId) { setCreateError("Bundle has no Saves service."); return; }
                if (includeReposts && !repostsServiceId) { setCreateError("Bundle has no Reposts service."); return; }
                const commentsServiceId = selBundle.serviceIds.comments?.trim();
                if (includeComments && !commentsServiceId) { setCreateError("Bundle has no Comments service."); return; }

                const quantity = (safePlan?.runs || []).reduce((acc, run) => acc + run.views, 0);
                if (!Number.isFinite(quantity) || quantity <= 0) { setCreateError("Quantity must be > 0."); return; }
                if (quantity < minViewsPerRun) { setCreateError(`Views must be at least ${minViewsPerRun}.`); return; }

                const totalLikes = (safePlan?.runs || []).reduce((acc, run) => acc + run.likes, 0);
                const totalShares = (safePlan?.runs || []).reduce((acc, run) => acc + run.shares, 0);
                const totalSaves = (safePlan?.runs || []).reduce((acc, run) => acc + run.saves, 0);
                const totalReposts = (safePlan?.runs || []).reduce((acc, run) => acc + (run.reposts || 0), 0);
                const totalCommentsQty = (safePlan?.runs || []).reduce((acc, run) => acc + (run.comments || 0), 0);

                if (includeLikes && totalLikes < 10) { setCreateError("Likes must be at least 10."); return; }
                if (includeShares && totalShares < 20) { setCreateError("Shares must be at least 20."); return; }
                if (includeSaves && totalSaves < 10) { setCreateError("Saves must be at least 10."); return; }
                if (includeReposts && totalReposts < 10) { setCreateError("Reposts must be at least 10."); return; }
                if (includeComments && totalCommentsQty <= 0) { setCreateError("Comments must be greater than 0."); return; }
                if (quantity > 100000) { const proceed = window.confirm("Large mission. Continue?"); if (!proceed) return; }

                const viewRuns = (safePlan?.runs || []).map((run) => ({
                  time: run.at.toISOString(),
                  quantity: Math.max(Math.floor(run.views), minViewsPerRun),
                }));
                if (!viewRuns.length || viewRuns.some((run) => !run.time || !Number.isFinite(run.quantity) || run.quantity <= 0)) {
                  setCreateError("Invalid run schedule. Regenerate."); return;
                }

                const likesRuns = (safePlan?.runs || []).map((run) => ({ time: run.at.toISOString(), quantity: Math.max(0, Math.floor(run.likes)) }));
                const sharesRuns = (safePlan?.runs || []).map((run) => ({ time: run.at.toISOString(), quantity: Math.max(0, Math.floor(run.shares)) }));
                const savesRuns = (safePlan?.runs || []).map((run) => ({ time: run.at.toISOString(), quantity: Math.max(0, Math.floor(run.saves)) }));
                const repostsRuns = (safePlan?.runs || []).map((run) => ({ time: run.at.toISOString(), quantity: Math.max(0, Math.floor(run.reposts || 0)) }));

                const commentList = customComments.split("\n").map(c => c.trim()).filter(Boolean);
                const commentsRuns = (safePlan?.runs || []).map((run) => {
                  const required = Math.floor(run.comments || 0);
                  if (required <= 0) return { time: run.at.toISOString(), comments: "" };
                  let finalComments: string[] = [];
                  if (commentList.length === 0) { finalComments = ["Nice post"]; }
                  else if (commentList.length >= required) { finalComments = commentList.slice(0, required); }
                  else { while (finalComments.length < required) { finalComments.push(commentList[finalComments.length % commentList.length]); } }
                  return { time: run.at.toISOString(), comments: finalComments.join("\n") };
                });
                const filteredCommentsRuns = commentsRuns.filter(run => run.comments && run.comments.length > 0);

                const servicesPayload: {
                  views: { serviceId: string; runs: Array<{ time: string; quantity: number }> };
                  likes?: { serviceId: string; runs: Array<{ time: string; quantity: number }> };
                  shares?: { serviceId: string; runs: Array<{ time: string; quantity: number }> };
                  saves?: { serviceId: string; runs: Array<{ time: string; quantity: number }> };
                  reposts?: { serviceId: string; runs: Array<{ time: string; quantity: number }> };
                  comments?: { serviceId: string; runs: Array<{ time: string; comments: string }> };
                } = { views: { serviceId: viewsServiceId, runs: viewRuns } };

                if (includeLikes) servicesPayload.likes = { serviceId: likesServiceId, runs: likesRuns };
                if (includeShares) servicesPayload.shares = { serviceId: sharesServiceId, runs: sharesRuns };
                if (includeSaves) servicesPayload.saves = { serviceId: savesServiceId, runs: savesRuns };
                if (includeReposts) servicesPayload.reposts = { serviceId: repostsServiceId!, runs: repostsRuns };
                if (includeComments && filteredCommentsRuns.length > 0) {
                  servicesPayload.comments = { serviceId: commentsServiceId!, runs: filteredCommentsRuns };
                }

                setIsCreatingOrder(true);
                setCreateSuccess(`Processing ${targets.length} mission${targets.length > 1 ? "s" : ""}...`);

                const batchId = targets.length > 1 ? `batch-${Date.now()}` : undefined;

                try {
                  const activeLinks = new Set(
                    orders.filter((order) => {
                      const now = Date.now();
                      const runs = order.runs || [];
                      if (!runs.length) return false;
                      const allRunsCompleted = runs.every((run) => new Date(run.at).getTime() <= now);
                      return !allRunsCompleted && order.status !== "cancelled" && order.status !== "failed" && order.status !== "completed";
                    }).map((order) => order.link.replace(/\/+$/, "").toLowerCase())
                  );
                  const createdLinks = new Set<string>();
                  let successCount = 0;
                  let failedCount = 0;
                  let lastError = "";

                  for (let index = 0; index < targets.length; index += 1) {
                    const trimmedUrl = targets[index];
                    const normalizedTarget = trimmedUrl.replace(/\/+$/, "").toLowerCase();
                    if (activeLinks.has(normalizedTarget) || createdLinks.has(normalizedTarget)) {
                      failedCount += 1; lastError = "Duplicate link."; continue;
                    }

                    try {
                      const result = await createSmmOrder({
                        name: orderName.trim() || undefined,
                        apiUrl: selApi.url,
                        apiKey: selApi.key,
                        link: trimmedUrl,
                        services: servicesPayload,
                      });

                      const order: CreatedOrder = {
                        id: createOrderId(),
                        name: orderName.trim() || `Mission #${createOrderId()}`,
                        batchId,
                        batchIndex: index + 1,
                        batchTotal: targets.length,
                        schedulerOrderId: result.schedulerOrderId,
                        smmOrderId: result.orderId ?? "Scheduled",
                        link: trimmedUrl,
                        totalViews: quantity,
                        startDelayHours,
                        patternType: safePlan.patternType,
                        patternName: safePlan.patternName,
                        runs: safePlan?.runs || [],
                        engagement: { likes: totalLikes, shares: totalShares, saves: totalSaves, comments: totalCommentsQty, reposts: totalReposts },
                        serviceId: viewsServiceId,
                        selectedAPI: selApi.name,
                        selectedBundle: selBundle.name,
                        status: result.status === "completed" ? "completed" : "running",
                        completedRuns: typeof result.completedRuns === "number" ? result.completedRuns : 0,
                        runStatuses: (safePlan?.runs || []).map(() => "pending"),
                        createdAt: new Date().toISOString(),
                        lastUpdatedAt: new Date().toISOString(),
                      };

                      onCreateOrder(order);
                      createdLinks.add(normalizedTarget);
                      successCount += 1;
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Failed";
                      const failedOrder: CreatedOrder = {
                        id: createOrderId(),
                        name: orderName.trim() || `Mission #${createOrderId()}`,
                        batchId,
                        batchIndex: index + 1,
                        batchTotal: targets.length,
                        smmOrderId: "N/A",
                        link: trimmedUrl,
                        totalViews: quantity,
                        startDelayHours,
                        patternType: safePlan.patternType,
                        patternName: safePlan.patternName,
                        runs: safePlan?.runs || [],
                        engagement: { likes: totalLikes, shares: totalShares, saves: totalSaves, comments: totalCommentsQty, reposts: totalReposts },
                        serviceId: viewsServiceId,
                        selectedAPI: selApi.name,
                        selectedBundle: selBundle.name,
                        status: "failed",
                        completedRuns: 0,
                        runStatuses: (safePlan?.runs || []).map((_, i) => (i === 0 ? "cancelled" : "pending")),
                        runErrors: (safePlan?.runs || []).map((_, i) => (i === 0 ? message : "")),
                        errorMessage: message,
                        createdAt: new Date().toISOString(),
                        lastUpdatedAt: new Date().toISOString(),
                      };
                      onCreateOrder(failedOrder);
                      failedCount += 1;
                      lastError = message;
                    }
                  }

                  if (failedCount > 0 && successCount === 0) {
                    setCreateError(lastError || "Failed.");
                    setCreateSuccess("");
                    return;
                  }

                  const successLabel = targets.length > 1 ? `Done: ${successCount}/${targets.length}` : "Mission deployed";
                  setCreateSuccess(successLabel);
                  if (failedCount > 0) setCreateError(`${failedCount} failed`);
                  onNavigateToOrders(successLabel);
                } finally {
                  setIsCreatingOrder(false);
                }
              }}
            >
              {isCreatingOrder ? "Deploying..." : "Deploy mission"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================ */
/* SCHEDULE PREVIEW — iAMBATMAN EXACT MATCH     */
/* ============================================ */

import {
  CartesianGrid as _CartesianGrid,
  Legend as _Legend,
  Line as _Line,
  LineChart as _LineChart,
  ResponsiveContainer as _ResponsiveContainer,
  Tooltip as _Tooltip,
  XAxis as _XAxis,
  YAxis as _YAxis,
} from "recharts";

function compactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function buildIambatmanChartData(plan: PatternPlan) {
  const safeRuns = plan?.runs || [];
  const final = safeRuns[safeRuns.length - 1];
  const totalViews = Math.max(1, final?.cumulativeViews || safeRuns.reduce((sum, r) => sum + (r.views || 0), 0));
  const totalLikes = Math.max(0, final?.cumulativeLikes || safeRuns.reduce((sum, r) => sum + (r.likes || 0), 0));
  const totalShares = Math.max(0, final?.cumulativeShares || safeRuns.reduce((sum, r) => sum + (r.shares || 0), 0));
  const totalComments = Math.max(0, final?.cumulativeComments || safeRuns.reduce((sum, r) => sum + (r.comments || 0), 0));

  // 🎨 Screenshot-style synthetic visual scale (iambatman exact)
  const visualHeight = {
    likes: totalViews * 0.56,
    shares: totalViews * 0.18,
    comments: totalViews * 0.045,
  };

  const startMs = safeRuns[0]
    ? safeRuns[0].at.getTime() - Math.max(0, safeRuns[0].minutesFromStart || 0) * 60_000
    : Date.now();

  const rows = safeRuns.map((run) => {
    return {
      minute: Math.max(0, Math.round((run.at.getTime() - startMs) / 60_000)),
      time: run.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      views: run.cumulativeViews || 0,
      likesVisual: totalLikes > 0 ? ((run.cumulativeLikes || 0) / totalLikes) * visualHeight.likes : 0,
      sharesVisual: totalShares > 0 ? ((run.cumulativeShares || 0) / totalShares) * visualHeight.shares : 0,
      commentsVisual: totalComments > 0 ? ((run.cumulativeComments || 0) / totalComments) * visualHeight.comments : 0,
      likesActual: run.cumulativeLikes || 0,
      sharesActual: run.cumulativeShares || 0,
      commentsActual: run.cumulativeComments || 0,
    };
  });

  return rows;
}

function IamTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const filtered = payload.filter((e: any) => !String(e.name || "").startsWith("planned-"));
  if (filtered.length === 0) return null;
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid rgba(210, 180, 140, 0.55)",
      borderRadius: "0.75rem",
      color: "#27211b",
      fontSize: "12px",
      padding: "8px 12px",
    }}>
              <p style={{ marginBottom: 4, color: "#9a8f84" }}>{label}</p>
              {filtered.map((e: any) => {
                let displayValue = e.value;
                if (e.dataKey === "likesVisual") displayValue = e.payload.likesActual;
                if (e.dataKey === "sharesVisual") displayValue = e.payload.sharesActual;
                if (e.dataKey === "commentsVisual") displayValue = e.payload.commentsActual;
                
                return (
                  <p key={e.name} style={{ color: e.color, margin: "2px 0" }}>
                    {e.name}: {Math.round(displayValue).toLocaleString()}
                  </p>
                );
              })}
            </div>
  );
}

interface SchedulePreviewIambatmanProps {
  plan: PatternPlan;
  quickPreset?: QuickPatternPreset | null;
  presetButtons?: Array<{ label: string; value: QuickPatternPreset; emoji: string }>;
  onApplyPreset?: (preset: QuickPatternPreset) => void;
}

function SchedulePreviewIambatman({
  plan,
  quickPreset,
  presetButtons,
  onApplyPreset,
}: SchedulePreviewIambatmanProps) {
  const [expandedRuns, setExpandedRuns] = useState(false);
  const safeRuns = plan?.runs || [];
  const safeFinishTime = plan?.finishTime instanceof Date ? plan.finishTime : new Date();
  const riskKind = plan?.risk === "Safe" ? "success" : plan?.risk === "Medium" ? "warning" : "danger";
  const riskLabel = plan?.risk ?? "Safe";

  const graphTotals = useMemo(() => {
    return safeRuns.reduce(
      (acc, run) => ({
        views: Math.max(acc.views, run.cumulativeViews || 0),
        likes: Math.max(acc.likes, run.cumulativeLikes || 0),
        shares: Math.max(acc.shares, run.cumulativeShares || 0),
        comments: Math.max(acc.comments, run.cumulativeComments || 0),
        saves: Math.max(acc.saves, run.cumulativeSaves || 0),
        reposts: Math.max(acc.reposts, run.cumulativeReposts || 0),
      }),
      { views: 0, likes: 0, shares: 0, comments: 0, saves: 0, reposts: 0 }
    );
  }, [safeRuns]);

  const chartData = useMemo(() => buildIambatmanChartData(plan), [plan]);

  // 🎯 4 stat cards matching image EXACTLY
  const statsCards = [
    { label: "Views", value: graphTotals.views, color: "border-pink-300", text: "text-stone-950" },
    { label: "Likes", value: graphTotals.likes, color: "border-blue-300", text: "text-stone-950" },
    { label: "Comments", value: graphTotals.comments, color: "border-cyan-300", text: "text-stone-950" },
    { label: "Shares", value: graphTotals.shares, color: "border-orange-300", text: "text-stone-950" },
  ];

  return (
    <div>
      {/* 🎯 Quick presets ABOVE chart */}
      {presetButtons && onApplyPreset && (
        <div className="mb-4">
          <label className="block text-xs font-bold text-stone-700 mb-2">Quick presets</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {presetButtons.map((preset) => {
              const isActive = quickPreset === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onApplyPreset(preset.value)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? "bg-violet-600 text-white shadow-md ring-2 ring-violet-300 scale-[1.02]"
                      : "bg-white border-2 border-stone-200 text-stone-700 hover:border-violet-300 hover:bg-violet-50/50"
                  }`}
                >
                  <span className="block">{preset.emoji} {preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 🎯 Screenshot-style top metrics - EXACT match with image */}
      <div className="mb-3 grid grid-cols-4 overflow-hidden rounded-xl border border-orange-200/70 bg-white/35 text-center shadow-inner shadow-white/40">
        {statsCards.map((item) => (
          <div key={item.label} className={`border-b-2 ${item.color} px-2 py-2`}>
            <div className="text-[10px] font-medium text-stone-500">{item.label}</div>
            <div className={`text-sm font-semibold ${item.text}`}>{compactNumber(item.value)}</div>
          </div>
        ))}
      </div>

      {/* 🎯 The chart - EXACT 4 lines matching image */}
      <div className="h-72 sm:h-80">
        <_ResponsiveContainer width="100%" height="100%">
          <_LineChart data={chartData} margin={{ top: 14, right: 20, left: 0, bottom: 4 }}>
            <_CartesianGrid strokeDasharray="3 3" stroke="#d8d0c5" opacity={0.45} />
            <_XAxis
              dataKey="minute"
              type="number"
              domain={[0, "dataMax"]}
              allowDataOverflow={false}
              stroke="#9a8f84"
              tick={{ fill: "#8a7e72", fontSize: 11 }}
              tickFormatter={(value) => `${Math.round(Number(value) / 60)}h`}
            />
            <_YAxis stroke="#9a8f84" tick={{ fill: "#8a7e72", fontSize: 11 }} width={52} tickFormatter={compactNumber} />
            <_Tooltip content={<IamTooltip />} />
            <_Legend wrapperStyle={{ fontSize: "12px", color: "#44382e" }} iconType="circle" />
            {/* Faded planned lines (iambatman style) */}
            <_Line type="basis" dataKey="views" stroke="#d86bd8" opacity={0.13} dot={false} strokeDasharray="5 5" name="planned-views" legendType="none" tooltipType="none" />
            <_Line type="basis" dataKey="likesVisual" stroke="#7188de" opacity={0.13} dot={false} strokeDasharray="5 5" name="planned-likes" legendType="none" tooltipType="none" />
            <_Line type="basis" dataKey="commentsVisual" stroke="#54d5de" opacity={0.13} dot={false} strokeDasharray="5 5" name="planned-comments" legendType="none" tooltipType="none" />
            <_Line type="basis" dataKey="sharesVisual" stroke="#e6a263" opacity={0.13} dot={false} strokeDasharray="5 5" name="planned-shares" legendType="none" tooltipType="none" />
            {/* Solid actual lines (iambatman colors) */}
            <_Line type="basis" dataKey="views" stroke="#d86bd8" strokeWidth={2.4} dot={false} name="Views" isAnimationActive animationDuration={900} />
            <_Line type="basis" dataKey="likesVisual" stroke="#7188de" strokeWidth={2.1} dot={false} name="Likes" isAnimationActive animationDuration={900} />
            <_Line type="basis" dataKey="commentsVisual" stroke="#54d5de" strokeWidth={2} dot={false} name="Comments" isAnimationActive animationDuration={900} />
            <_Line type="basis" dataKey="sharesVisual" stroke="#e6a263" strokeWidth={2} dot={false} name="Shares" isAnimationActive animationDuration={900} />
          </_LineChart>
        </_ResponsiveContainer>
      </div>

      {/* 🎯 Footer matching image EXACTLY */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[9px] text-stone-600">
          📊 Visual scale matches creator analytics screenshots; tooltip/top stats show real planned total.
        </p>
      </div>
    </div>
  );
}
