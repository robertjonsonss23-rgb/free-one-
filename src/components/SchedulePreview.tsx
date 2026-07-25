import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PatternPlan, QuickPatternPreset, DeliveryOption } from "../types/order";
import { Card, Button, StatusPill } from "./ui";
import { RunTable } from "./RunTable";

/* ============================================ */
/* SAVED CONFIGS (favorites)                   */
/* ============================================ */

interface FavouriteConfig {
  id: string;
  savedAt: string;
  name: string;
  patternName: string;
  patternType: PatternPlan["patternType"];
  totalRuns: number;
  estimatedDurationHours: number;
  approximateIntervalMin: number;
  finishTime: string;
  risk: PatternPlan["risk"];
  quickPreset: QuickPatternPreset | null;
  variancePercent: number;
  delivery: DeliveryOption;
  includeLikes: boolean;
  includeShares: boolean;
  includeSaves: boolean;
  includeComments: boolean;
  includeReposts: boolean;
  peakHoursBoost: boolean;
  runProportions: Array<{
    minutesFromStart: number;
    viewsFraction: number;
    likesFraction: number;
    sharesFraction: number;
    savesFraction: number;
    commentsFraction: number;
    repostsFraction: number;
  }>;
  savedTotalViews: number;
}

const FAVOURITES_KEY = "dev-smm-favourite-configs";

function readFavourites(): FavouriteConfig[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavouritesToStorage(favs: FavouriteConfig[]) {
  localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favs));
}

/* ============================================ */
/* CHART HELPERS                                */
/* ============================================ */

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function lineTypeForPattern(patternType: PatternPlan["patternType"]) {
  if (patternType === "sawtooth") return "stepAfter";
  if (patternType === "viral-spike" || patternType === "micro-burst") return "linear";
  if (patternType === "heartbeat") return "natural";
  return "monotoneX";
}

function buildSmoothGraphData(plan: PatternPlan) {
  const safeRuns = plan?.runs || [];
  const rows: Array<{
    label: string;
    views: number;
    likes: number;
    shares: number;
    saves: number;
    reposts: number;
    comments: number;
  }> = [];

  rows.push({ label: "0m", views: 0, likes: 0, shares: 0, saves: 0, reposts: 0, comments: 0 });

  for (let index = 0; index < safeRuns.length; index += 1) {
    const current = safeRuns[index];
    const previous =
      index === 0
        ? {
            minutesFromStart: 0,
            cumulativeViews: 0,
            cumulativeLikes: 0,
            cumulativeShares: 0,
            cumulativeSaves: 0,
            cumulativeReposts: 0,
            cumulativeComments: 0,
          }
        : safeRuns[index - 1];

    const dt = Math.max(1, current.minutesFromStart - previous.minutesFromStart);
    const phase = index / Math.max(1, safeRuns.length - 1);
    const segmentNoise = clamp(
      0.01 + (current.views / Math.max(1, safeRuns[0]?.views ?? 1)) * 0.004,
      0.01,
      0.03
    );

    const pointValue = (
      start: number,
      end: number,
      progress: number,
      wobbleScale: number,
      preserveMonotone: boolean
    ) => {
      const eased = Math.pow(progress, phase < 0.2 ? 1.8 : phase > 0.8 ? 0.88 : 1.05);
      const delta = end - start;
      const wobble = delta * segmentNoise * wobbleScale;
      const value = start + delta * eased + wobble;
      if (!preserveMonotone) return Math.max(0, value);
      return clamp(value, Math.min(start, end), Math.max(start, end));
    };

    const wave = Math.sin((index + 1) * 1.13 + phase * Math.PI * 1.7);
    const minuteA = previous.minutesFromStart + dt * 0.38;
    const minuteB = previous.minutesFromStart + dt * 0.76;

    rows.push({
      label: `${Math.round(minuteA)}m`,
      views: pointValue(previous.cumulativeViews, current.cumulativeViews, 0.38, wave * 0.7, true),
      likes: pointValue(previous.cumulativeLikes, current.cumulativeLikes, 0.38, wave * 0.8, false),
      shares: pointValue(previous.cumulativeShares, current.cumulativeShares, 0.38, wave * 0.75, false),
      saves: pointValue(previous.cumulativeSaves, current.cumulativeSaves, 0.38, wave * 0.85, false),
      reposts: pointValue(previous.cumulativeReposts, current.cumulativeReposts, 0.38, wave * 0.82, false),
      comments: pointValue(previous.cumulativeComments, current.cumulativeComments, 0.38, wave * 0.9, false),
    });

    rows.push({
      label: `${Math.round(minuteB)}m`,
      views: pointValue(previous.cumulativeViews, current.cumulativeViews, 0.76, wave * -0.55, true),
      likes: pointValue(previous.cumulativeLikes, current.cumulativeLikes, 0.76, wave * -0.62, false),
      shares: pointValue(previous.cumulativeShares, current.cumulativeShares, 0.76, wave * -0.58, false),
      saves: pointValue(previous.cumulativeSaves, current.cumulativeSaves, 0.76, wave * -0.64, false),
      reposts: pointValue(previous.cumulativeReposts, current.cumulativeReposts, 0.76, wave * -0.61, false),
      comments: pointValue(previous.cumulativeComments, current.cumulativeComments, 0.76, wave * -0.7, false),
    });

    rows.push({
      label: current.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      views: current.cumulativeViews,
      likes: current.cumulativeLikes,
      shares: current.cumulativeShares,
      saves: current.cumulativeSaves,
      reposts: current.cumulativeReposts,
      comments: current.cumulativeComments,
    });
  }

  return rows;
}

function buildSteppedGraphData(plan: PatternPlan) {
  const safeRuns = plan?.runs || [];
  return safeRuns.map((run) => ({
    time: run.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    views: run.cumulativeViews || 0,
    likes: (run.cumulativeLikes || 0) * 10,
    shares: (run.cumulativeShares || 0) * 10,
    saves: (run.cumulativeSaves || 0) * 10,
    reposts: (run.cumulativeReposts || 0) * 10,
    comments: (run.cumulativeComments || 0) * 10,
  }));
}

const COLORS = {
  views: "#4f46e5",
  likes: "#ec4899",
  shares: "#0ea5e9",
  saves: "#8b5cf6",
  reposts: "#06b6d4",
  comments: "#10b981",
};

const SteppedTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const filtered = payload.filter(
    (entry: any) => !String(entry.name || "").startsWith("planned-")
  );
  if (filtered.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 shadow-2xl px-4 py-3 text-sm">
      <p className="text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-xs">{label}</p>
      {filtered.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-bold tabular-nums text-sm">
          {entry.name}: {Math.round(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

const SmoothTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 shadow-2xl px-4 py-3 text-sm">
      <p className="text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-xs">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-bold tabular-nums text-sm">
          {entry.name}: {Math.round(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

/* ============================================ */
/* SCHEDULE PREVIEW COMPONENT                   */
/* Combines chart + stats + run table          */
/* ============================================ */

interface SchedulePreviewProps {
  plan: PatternPlan;
  variancePercent?: number;
  delivery?: DeliveryOption;
  includeLikes?: boolean;
  includeShares?: boolean;
  includeSaves?: boolean;
  includeComments?: boolean;
  includeReposts?: boolean;
  peakHoursBoost?: boolean;
  onApplyFavourite?: (config: FavouriteConfig) => void;
}

type GraphMode = "smooth" | "stepped";

export function SchedulePreview({
  plan,
  variancePercent = 40,
  delivery = { mode: "auto", hours: 18, label: "Auto" },
  includeLikes = false,
  includeShares = false,
  includeSaves = false,
  includeComments = false,
  includeReposts = false,
  peakHoursBoost = false,
  onApplyFavourite,
}: SchedulePreviewProps) {
  const [graphMode, setGraphMode] = useState<GraphMode>("smooth");
  const [favourites, setFavourites] = useState<FavouriteConfig[]>(() => readFavourites());
  const [showFavourites, setShowFavourites] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [favouriteName, setFavouriteName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState(false);

  const safePlan = useMemo(
    () => ({ ...plan, runs: plan?.runs || [] }),
    [plan]
  );
  const smoothData = useMemo(() => buildSmoothGraphData(safePlan), [safePlan]);
  const steppedData = useMemo(() => buildSteppedGraphData(safePlan), [safePlan]);
  const curveType = lineTypeForPattern(safePlan.patternType);

  const safeRuns = plan?.runs || [];
  const safeFinishTime = plan?.finishTime instanceof Date ? plan.finishTime : new Date();
  const riskKind = plan?.risk === "Safe" ? "success" : plan?.risk === "Medium" ? "warning" : "danger";
  const riskLabel = plan?.risk ?? "Safe";

  const handleSaveFavourite = () => {
    const name = favouriteName.trim() || `${safePlan.patternName} · ${safePlan.totalRuns} runs`;

    const savedTotalViews = safePlan.runs.reduce((sum, r) => sum + (r.views || 0), 0);
    const savedTotalLikes = safePlan.runs.reduce((sum, r) => sum + (r.likes || 0), 0);
    const savedTotalShares = safePlan.runs.reduce((sum, r) => sum + (r.shares || 0), 0);
    const savedTotalSaves = safePlan.runs.reduce((sum, r) => sum + (r.saves || 0), 0);
    const savedTotalComments = safePlan.runs.reduce((sum, r) => sum + (r.comments || 0), 0);
    const savedTotalReposts = safePlan.runs.reduce((sum, r) => sum + (r.reposts || 0), 0);

    const runProportions = safePlan.runs.map((r) => ({
      minutesFromStart: r.minutesFromStart,
      viewsFraction: savedTotalViews > 0 ? (r.views || 0) / savedTotalViews : 0,
      likesFraction: savedTotalLikes > 0 ? (r.likes || 0) / savedTotalLikes : 0,
      sharesFraction: savedTotalShares > 0 ? (r.shares || 0) / savedTotalShares : 0,
      savesFraction: savedTotalSaves > 0 ? (r.saves || 0) / savedTotalSaves : 0,
      commentsFraction: savedTotalComments > 0 ? (r.comments || 0) / savedTotalComments : 0,
      repostsFraction: savedTotalReposts > 0 ? (r.reposts || 0) / savedTotalReposts : 0,
    }));

    const newFav: FavouriteConfig = {
      id: `fav-${Date.now()}`,
      savedAt: new Date().toISOString(),
      name,
      patternName: safePlan.patternName,
      patternType: safePlan.patternType,
      totalRuns: safePlan.totalRuns,
      estimatedDurationHours: safePlan.estimatedDurationHours,
      approximateIntervalMin: safePlan.approximateIntervalMin,
      finishTime: safePlan.finishTime instanceof Date ? safePlan.finishTime.toISOString() : new Date().toISOString(),
      risk: safePlan.risk,
      quickPreset: null,
      variancePercent,
      delivery,
      includeLikes,
      includeShares,
      includeSaves,
      includeComments,
      includeReposts,
      peakHoursBoost,
      runProportions,
      savedTotalViews,
    };

    const updated = [newFav, ...favourites].slice(0, 10);
    setFavourites(updated);
    saveFavouritesToStorage(updated);
    setJustSaved(true);
    setShowNameInput(false);
    setFavouriteName("");
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleDeleteFavourite = (id: string) => {
    const updated = favourites.filter((f) => f.id !== id);
    setFavourites(updated);
    saveFavouritesToStorage(updated);
  };

  return (
    <Card padding="lg" className="border-2 border-indigo-200 shadow-md bg-gradient-to-br from-white to-indigo-50/30">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            📅 Schedule preview
          </h2>
          <p className="text-sm font-semibold text-slate-600 mt-0.5">
            Pattern: <span className="text-indigo-700 font-bold">{plan?.patternName || "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill kind={riskKind} className="text-sm font-bold">
            {riskLabel}
          </StatusPill>

          <div className="inline-flex rounded-xl border-2 border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setGraphMode("smooth")}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                graphMode === "smooth"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Smooth
            </button>
            <button
              type="button"
              onClick={() => setGraphMode("stepped")}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                graphMode === "stepped"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Stepped
            </button>
          </div>

          {graphMode === "stepped" && (
            <div className="flex items-center gap-2">
              {showNameInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={favouriteName}
                    onChange={(e) => setFavouriteName(e.target.value)}
                    placeholder="Name this config..."
                    className="w-40 text-sm font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveFavourite();
                      if (e.key === "Escape") {
                        setShowNameInput(false);
                        setFavouriteName("");
                      }
                    }}
                  />
                  <Button size="sm" variant="primary" onClick={handleSaveFavourite}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNameInput(false); setFavouriteName(""); }}>
                    ✕
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={justSaved ? "success" : "outline"}
                  onClick={() => setShowNameInput(true)}
                >
                  {justSaved ? "Saved" : "Save config"}
                </Button>
              )}

              {favourites.length > 0 && (
                <Button
                  size="sm"
                  variant={showFavourites ? "secondary" : "ghost"}
                  onClick={() => setShowFavourites((prev) => !prev)}
                >
                  {favourites.length} saved
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl bg-white border-2 border-slate-200 p-4 sm:p-5 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total runs</p>
          <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-indigo-700 tabular-nums">
            {plan?.totalRuns ?? 0}
          </p>
        </div>
        <div className="rounded-xl bg-white border-2 border-slate-200 p-4 sm:p-5 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Interval</p>
          <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-indigo-700 tabular-nums">
            {plan?.approximateIntervalMin ?? 0}
            <span className="text-base font-bold text-slate-500 ml-1">min</span>
          </p>
        </div>
        <div className="rounded-xl bg-white border-2 border-slate-200 p-4 sm:p-5 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Finish</p>
          <p className="mt-2 text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
            {safeFinishTime.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            <span className="block text-sm font-bold text-slate-500 mt-0.5">
              {safeFinishTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        </div>
      </div>

      {/* Favourites panel */}
      {showFavourites && graphMode === "stepped" && favourites.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-5 rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
        >
          <p className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">
            ❤️ Saved configs ({favourites.length}/10)
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {favourites.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center justify-between rounded-lg border-2 border-slate-200 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-slate-900 truncate">{fav.name}</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-sm font-semibold text-slate-600">
                    <span>{fav.delivery.label}</span>
                    <span>·</span>
                    <span>{fav.variancePercent}% var</span>
                    <span>·</span>
                    <span className="capitalize">{fav.risk}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  {onApplyFavourite && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => {
                        onApplyFavourite(fav);
                        setShowFavourites(false);
                      }}
                    >
                      Apply
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteFavourite(fav.id)}
                    className="text-base text-slate-400 hover:text-rose-600 transition p-1 font-bold"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Chart */}
      <motion.div
        key={`${safePlan.patternId}-${safePlan.totalRuns}-${graphMode}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="h-80 sm:h-96"
      >
        {graphMode === "smooth" ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={smoothData} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 13, fontWeight: 600 }} minTickGap={26} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 13, fontWeight: 600 }} width={60} axisLine={false} tickLine={false} />
              <Tooltip content={<SmoothTooltip />} />
              <Legend wrapperStyle={{ fontSize: "14px", color: "#1e293b", paddingTop: 12, fontWeight: 600 }} iconType="circle" />
              <Line type={curveType} dataKey="views" name="Views" stroke={COLORS.views} strokeWidth={3} dot={false} isAnimationActive animationDuration={900} />
              <Line type={curveType} dataKey="likes" name="Likes" stroke={COLORS.likes} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
              <Line type={curveType} dataKey="shares" name="Shares" stroke={COLORS.shares} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
              <Line type={curveType} dataKey="saves" name="Saves" stroke={COLORS.saves} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
              <Line type={curveType} dataKey="reposts" name="Reposts" stroke={COLORS.reposts} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
              <Line type={curveType} dataKey="comments" name="Comments" stroke={COLORS.comments} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={steppedData} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="time" stroke="#cbd5e1" tick={{ fill: "#475569", fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#cbd5e1" tick={{ fill: "#475569", fontSize: 13, fontWeight: 600 }} width={60} axisLine={false} tickLine={false} />
              <Tooltip content={<SteppedTooltip />} />
              <Legend wrapperStyle={{ fontSize: "14px", color: "#1e293b", paddingTop: 12, fontWeight: 600 }} iconType="circle" />
              <Line type="basis" dataKey="views" stroke={COLORS.views} strokeWidth={3} dot={false} name="Views" isAnimationActive animationDuration={900} />
              <Line type="basis" dataKey="likes" stroke={COLORS.likes} strokeWidth={2.5} dot={false} name="Likes" isAnimationActive animationDuration={900} />
              <Line type="basis" dataKey="shares" stroke={COLORS.shares} strokeWidth={2.5} dot={false} name="Shares" isAnimationActive animationDuration={900} />
              <Line type="basis" dataKey="saves" stroke={COLORS.saves} strokeWidth={2.5} dot={false} name="Saves" isAnimationActive animationDuration={900} />
              <Line type="basis" dataKey="reposts" stroke={COLORS.reposts} strokeWidth={2.5} dot={false} name="Reposts" isAnimationActive animationDuration={900} />
              <Line type="basis" dataKey="comments" stroke={COLORS.comments} strokeWidth={2.5} dot={false} name="Comments" isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      <div className="mt-4 flex items-center justify-between text-sm font-semibold text-slate-500">
        <Button variant="outline" size="md" onClick={() => setExpandedRuns((prev) => !prev)} className="text-sm font-bold">
          {expandedRuns ? "🔼 Hide runs" : `📋 View runs (${safeRuns.length})`}
        </Button>
        <p>
          {graphMode === "smooth"
            ? "〰️ Smooth: Interpolated cumulative growth"
            : "📊 Stepped: Per-run cumulative view"}
        </p>
      </div>

      <AnimatePresence initial={false}>
        {expandedRuns && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5 overflow-hidden"
          >
            <RunTable runs={safeRuns} mode="schedule" />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
