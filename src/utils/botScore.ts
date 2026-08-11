/* ============================================================
   BOT SCORE

   A 0–100 read on how artificial a campaign will look to the platform's
   own spam detection. HIGHER = MORE BOT-LIKE. 0 would be indistinguishable
   from organic; 100 is an obvious purchase.

   This is owner-only. It exists so YOU can sanity-check a campaign before
   it runs — not to reassure a customer, and not as a guarantee. Instagram
   and TikTok do not publish their heuristics, so this scores the things
   that are known to matter and are visible from the order:

     1. ENGAGEMENT RATIOS  — a 15% like rate does not happen naturally.
     2. DELIVERY SPEED     — views/hour far above what the post could earn.
     3. UNIFORMITY         — identical run sizes are the clearest tell of
                             automation; real traffic is lumpy.
     4. BURST SIZE         — one run delivering a large share of the total.
     5. ENGAGEMENT BALANCE — views with no likes at all, or comments
                             outnumbering likes, both read as fake.
     6. TIME SHAPE         — everything inside a couple of hours, or a
                             flat line across the night.

   Each factor returns 0–100 for its own dimension and carries a weight.
   The weights are judgement, not science, and are stated openly in the UI
   so the number is never presented as more authoritative than it is.
   ============================================================ */

import type { PatternPlan, RunStep } from "../types/order";

export interface BotFactor {
  key: string;
  label: string;
  /** 0–100 for this dimension. Higher = more bot-like. */
  score: number;
  /** Share of the final score. */
  weight: number;
  /** One line the owner can act on. */
  detail: string;
}

export interface BotScoreResult {
  /** 0–100, higher = more bot-like. */
  score: number;
  band: "organic" | "low" | "moderate" | "high" | "severe";
  label: string;
  summary: string;
  factors: BotFactor[];
  /** The worst factors, worst first — what to fix to bring the score down. */
  advice: string[];
}

/* Realistic engagement rates as a share of VIEWS, from public benchmarks
   for short-form video. The "high" figure is roughly where a real post
   stops being plausible and starts looking bought. */
const NATURAL_RATE = {
  likes:    { good: 0.05,  high: 0.12 },
  comments: { good: 0.004, high: 0.02 },
  shares:   { good: 0.01,  high: 0.05 },
  saves:    { good: 0.008, high: 0.04 },
  reposts:  { good: 0.008, high: 0.04 },
} as const;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Linear ramp: at or below `good` → 0, at or above `bad` → 100. */
function ramp(value: number, good: number, bad: number): number {
  if (!Number.isFinite(value)) return 0;
  if (bad === good) return value > good ? 100 : 0;
  return clamp(((value - good) / (bad - good)) * 100);
}

/** Coefficient of variation — 0 means every run is identical. */
function variation(values: number[]): number {
  const list = values.filter((v) => v > 0);
  if (list.length < 2) return 0;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  if (mean <= 0) return 0;
  const sd = Math.sqrt(
    list.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / list.length
  );
  return sd / mean;
}

export interface BotScoreInput {
  plan: PatternPlan;
  totalViews: number;
  /** Which engagement types the customer switched on. */
  active: { likes: boolean; shares: boolean; saves: boolean; comments: boolean; reposts: boolean };
  /** What the reposts channel means on this platform, for wording. */
  repostsLabel?: string;
}

export function computeBotScore({
  plan,
  totalViews,
  active,
  repostsLabel = "Reposts",
}: BotScoreInput): BotScoreResult {
  const runs: RunStep[] = plan?.runs || [];
  const factors: BotFactor[] = [];

  const views = runs.reduce((s, r) => s + (r.views || 0), 0) || totalViews || 0;
  const hours = Math.max(0.25, plan?.estimatedDurationHours || 0);
  const sum = (pick: (r: RunStep) => number) =>
    runs.reduce((s, r) => s + (Number(pick(r)) || 0), 0);

  /* ---- 1. Engagement ratios ---------------------------------------- */
  const totals = {
    likes: sum((r) => r.likes),
    comments: sum((r) => r.comments),
    shares: sum((r) => r.shares),
    saves: sum((r) => r.saves),
    reposts: sum((r) => r.reposts),
  };
  const rateOf = (k: keyof typeof totals) => (views > 0 ? totals[k] / views : 0);

  let ratioWorst = 0;
  let ratioCulprit = "";
  for (const key of Object.keys(NATURAL_RATE) as (keyof typeof NATURAL_RATE)[]) {
    if (!active[key]) continue;
    const rate = rateOf(key);
    if (rate <= 0) continue;
    const band = NATURAL_RATE[key];
    const s = ramp(rate, band.good, band.high);
    if (s > ratioWorst) {
      ratioWorst = s;
      const name = key === "reposts" ? repostsLabel : key;
      ratioCulprit = `${name} at ${(rate * 100).toFixed(1)}% of views`;
    }
  }
  factors.push({
    key: "ratios",
    label: "Engagement ratios",
    score: Math.round(ratioWorst),
    weight: 0.3,
    detail: ratioWorst < 20
      ? "Engagement sits inside normal ranges for real posts."
      : `${ratioCulprit} — above what a real post of this size earns.`,
  });

  /* ---- 2. Delivery speed ------------------------------------------- */
  /* Views per hour. A genuinely viral clip can do thousands per hour, so
     this only bites well above that. */
  const perHour = views / hours;
  const speedScore = ramp(perHour, 2000, 40000);
  factors.push({
    key: "speed",
    label: "Delivery speed",
    score: Math.round(speedScore),
    weight: 0.22,
    detail: speedScore < 20
      ? `About ${Math.round(perHour).toLocaleString()} views/hour — a believable pace.`
      : `${Math.round(perHour).toLocaleString()} views/hour is fast for a post this size. Widen the delivery window.`,
  });

  /* ---- 3. Uniformity ------------------------------------------------ */
  /* Identical run sizes are the single clearest automation signature. */
  const cv = variation(runs.map((r) => r.views || 0));
  const uniformScore = ramp(0.45 - cv, 0, 0.45);   // cv 0.45+ → 0, cv 0 → 100
  factors.push({
    key: "uniformity",
    label: "Run-to-run variation",
    score: Math.round(uniformScore),
    weight: 0.18,
    detail: uniformScore < 20
      ? "Run sizes vary naturally."
      : "Runs are too similar in size — raise Random variance so they differ.",
  });

  /* ---- 4. Largest burst --------------------------------------------- */
  const biggest = runs.reduce((m, r) => Math.max(m, r.views || 0), 0);
  const burstShare = views > 0 ? biggest / views : 0;
  const burstScore = ramp(burstShare, 0.08, 0.5);
  factors.push({
    key: "burst",
    label: "Largest single burst",
    score: Math.round(burstScore),
    weight: 0.12,
    detail: burstScore < 20
      ? "No single delivery dominates the campaign."
      : `One run carries ${(burstShare * 100).toFixed(0)}% of all views. More runs would smooth this.`,
  });

  /* ---- 5. Engagement balance ---------------------------------------- */
  /* Two classic fakes: views with nothing attached, and comments that
     outnumber likes (nobody comments without liking at that ratio). */
  let balanceScore = 0;
  let balanceDetail = "Engagement mix looks plausible.";
  const anyEngagement = totals.likes + totals.comments + totals.shares + totals.saves + totals.reposts;
  /* Order matters: "more comments than likes" is the strongest signal, and
     it usually ALSO has a low like rate — checking the weaker rule first
     would mask it entirely. */
  if (views > 0 && anyEngagement === 0) {
    balanceScore = 70;
    balanceDetail = "Views with zero engagement — real videos always pick up some likes.";
  } else if (totals.comments > totals.likes && totals.comments > 0) {
    balanceScore = 80;
    balanceDetail = "More comments than likes — that ordering does not occur naturally.";
  } else if (active.likes && rateOf("likes") > 0 && rateOf("likes") < 0.005) {
    balanceScore = 45;
    balanceDetail = "Very few likes for this many views; real posts sit nearer 5%.";
  }
  factors.push({
    key: "balance",
    label: "Engagement balance",
    score: balanceScore,
    weight: 0.1,
    detail: balanceDetail,
  });

  /* ---- 6. Time shape ------------------------------------------------ */
  /* Very short windows read as a dump. Very long flat ones read as a
     machine that never sleeps. */
  let timeScore = 0;
  let timeDetail = `Spread over about ${Math.round(hours)}h, which reads naturally.`;
  if (hours < 3) {
    timeScore = Math.round(ramp(3 - hours, 0, 3) * 0.9);
    timeDetail = `Everything lands inside ${hours.toFixed(1)}h — too compressed to look real.`;
  } else if (runs.length > 0 && hours > 24) {
    /* Long campaigns are fine, but only if they pause overnight like a
       real audience does. */
    const nightRuns = runs.filter((r) => {
      const h = r.at instanceof Date ? r.at.getHours() : new Date(r.at).getHours();
      return h >= 1 && h < 6;
    }).length;
    const nightShare = nightRuns / runs.length;
    timeScore = Math.round(ramp(nightShare, 0.1, 0.35));
    if (timeScore >= 20) {
      timeDetail = `${Math.round(nightShare * 100)}% of runs fire between 1am and 6am — real audiences sleep.`;
    }
  }
  factors.push({
    key: "time",
    label: "Timing pattern",
    score: timeScore,
    weight: 0.08,
    detail: timeDetail,
  });

  /* ---- Combine ------------------------------------------------------
     A plain weighted mean under-reports the case that matters most: one
     catastrophic signal (a 40% like rate) surrounded by five clean ones
     averages down to "fine", when in reality that single factor is what
     gets a post actioned. So the result is pulled towards the worst
     factor — the mean sets the floor, the worst signal raises it. */
  const weighted = factors.reduce((s, f) => s + f.score * f.weight, 0);
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const mean = weighted / totalWeight;
  const worst = factors.reduce((m, f) => Math.max(m, f.score), 0);
  const score = Math.round(clamp(mean * 0.55 + worst * 0.45));

  const band: BotScoreResult["band"] =
    score < 20 ? "organic"
    : score < 40 ? "low"
    : score < 60 ? "moderate"
    : score < 80 ? "high"
    : "severe";

  const LABEL = {
    organic: "Looks organic",
    low: "Mostly natural",
    moderate: "Noticeable",
    high: "Looks bought",
    severe: "Obvious bot",
  } as const;

  const SUMMARY = {
    organic: "Nothing here stands out as automated.",
    low: "Broadly believable, with one or two rough edges.",
    moderate: "A careful viewer would notice the pattern.",
    high: "This has the shape of a purchased campaign.",
    severe: "This would be obvious to anyone looking, including the platform.",
  } as const;

  /* Worst-first, and only things actually worth fixing. */
  const advice = factors
    .filter((f) => f.score >= 35)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .map((f) => f.detail);

  return {
    score,
    band,
    label: LABEL[band],
    summary: SUMMARY[band],
    factors: factors.sort((a, b) => b.score * b.weight - a.score * a.weight),
    advice,
  };
}
