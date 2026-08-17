/* ============================================================
   BOT SCORE — VIEW DELIVERY ONLY

   0–100. HIGHER = MORE BOT-LIKE. Owner-only.

   This looks at ONE thing: the shape of the view curve. Likes, shares,
   saves and comments are deliberately ignored — they are a separate
   purchase, the customer may not buy any, and their ratios are already
   capped by the scheduling engine. What actually gets a post flagged is
   how the VIEWS arrive.

   Six things are measured, all derived from the run list alone:

     PACE      views per hour against what a real post could plausibly earn
     RHYTHM    are the gaps between runs machine-regular?
     SPREAD    do run sizes vary, or is every batch the same?
     SHAPE     does it rise and decay like a real post, or run flat?
     SPIKE     does one run carry an implausible share of the total?
     HOURS     does it deliver through the small hours when nobody is awake?

   Each returns 0–100 for its own dimension. The final score leans on the
   worst offender rather than averaging it away, because one bad signal is
   enough to make a campaign obvious.
   ============================================================ */

import type { PatternPlan, RunStep } from "../types/order";

export interface BotFactor {
  key: string;
  label: string;
  /** 0–100 for this dimension. Higher = more bot-like. */
  score: number;
  weight: number;
  /** Short verdict shown next to the bar. */
  verdict: string;
  /** One actionable line, shown when this factor is a problem. */
  detail: string;
}

export interface BotScoreResult {
  score: number;
  band: "organic" | "low" | "moderate" | "high" | "severe";
  label: string;
  summary: string;
  factors: BotFactor[];
  advice: string[];
  /** Normalised view curve for the sparkline, 0–1. */
  curve: number[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Linear ramp: at/below `good` → 0, at/above `bad` → 100. */
function ramp(value: number, good: number, bad: number): number {
  if (!Number.isFinite(value)) return 0;
  if (bad === good) return value > good ? 100 : 0;
  return clamp(((value - good) / (bad - good)) * 100);
}

/** Coefficient of variation. 0 = every value identical. */
function cv(values: number[]): number {
  const list = values.filter((v) => Number.isFinite(v) && v > 0);
  if (list.length < 2) return 0;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  if (mean <= 0) return 0;
  const sd = Math.sqrt(
    list.reduce((s, v) => s + (v - mean) ** 2, 0) / list.length
  );
  return sd / mean;
}

export interface BotScoreInput {
  plan: PatternPlan;
  totalViews: number;
}

export function computeBotScore({ plan, totalViews }: BotScoreInput): BotScoreResult {
  const runs: RunStep[] = (plan?.runs || [])
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const qty = runs.map((r) => Math.max(0, Number(r.views) || 0));
  const views = qty.reduce((a, b) => a + b, 0) || totalViews || 0;
  const hours = Math.max(0.25, Number(plan?.estimatedDurationHours) || 0);
  const factors: BotFactor[] = [];

  /* ---- 1. PACE ------------------------------------------------------
     Views per hour. A genuinely popular clip can pull thousands an hour,
     so this only bites well beyond that. */
  const perHour = views / hours;
  const paceScore = ramp(perHour, 2500, 40000);
  factors.push({
    key: "pace",
    label: "Pace",
    score: Math.round(paceScore),
    weight: 0.26,
    verdict:
      paceScore < 25 ? "Believable" : paceScore < 60 ? "Brisk" : "Too fast",
    detail:
      paceScore < 25
        ? `About ${Math.round(perHour).toLocaleString()} views/hour — a realistic rate.`
        : `${Math.round(perHour).toLocaleString()} views/hour is more than a post this size would earn. Widen the delivery window.`,
  });

  /* ---- 2. RHYTHM ----------------------------------------------------
     Gaps between runs. Perfectly even spacing is the signature of a
     scheduler; real attention arrives irregularly. */
  const gaps: number[] = [];
  for (let i = 1; i < runs.length; i++) {
    const a = new Date(runs[i - 1].at).getTime();
    const b = new Date(runs[i].at).getTime();
    const mins = (b - a) / 60000;
    if (mins > 0) gaps.push(mins);
  }
  const gapCv = cv(gaps);
  /* cv >= 0.35 reads as natural; a metronome (cv 0) is the worst case. */
  const rhythmScore = gaps.length < 2 ? 0 : ramp(0.35 - gapCv, 0, 0.35);
  factors.push({
    key: "rhythm",
    label: "Rhythm",
    score: Math.round(rhythmScore),
    weight: 0.2,
    verdict:
      rhythmScore < 25 ? "Irregular" : rhythmScore < 60 ? "Somewhat even" : "Clockwork",
    detail:
      rhythmScore < 25
        ? "Runs land at uneven intervals, the way real traffic does."
        : "Runs arrive at almost fixed intervals — that regularity is machine-like. Raise Random variance.",
  });

  /* ---- 3. SPREAD ----------------------------------------------------
     Run-to-run size variation. */
  const sizeCv = cv(qty);
  const spreadScore = qty.length < 2 ? 0 : ramp(0.5 - sizeCv, 0, 0.5);
  factors.push({
    key: "spread",
    label: "Batch spread",
    score: Math.round(spreadScore),
    weight: 0.16,
    verdict:
      spreadScore < 25 ? "Varied" : spreadScore < 60 ? "Repetitive" : "Identical",
    detail:
      spreadScore < 25
        ? "Batch sizes vary naturally from run to run."
        : "Every batch delivers a near-identical amount. Raise Random variance so they differ.",
  });

  /* ---- 4. SHAPE -----------------------------------------------------
     Real posts front-load: a burst of attention, then decay. A perfectly
     flat line across the whole window is the giveaway of a drip bot.
     Compared as first-third vs last-third volume. */
  /* What matters is that the curve MOVES. A real post ramps up, or peaks
     and decays — either is fine, and this scheduler deliberately warms up.
     The bot signature is a dead-flat line delivering the same volume from
     the first hour to the last, so only flatness is penalised, in whichever
     direction the curve happens to run. */
  let shapeScore = 0;
  let shapeVerdict = "Natural curve";
  let shapeDetail = "Volume rises and falls across the campaign, like a real post.";
  if (qty.length >= 6) {
    const third = Math.max(1, Math.floor(qty.length / 3));
    const parts = [0, 1, 2].map((i) =>
      qty.slice(i * third, (i + 1) * third).reduce((a, b) => a + b, 0)
    );
    const hi = Math.max(...parts);
    const lo = Math.min(...parts);
    /* How much the busiest third outweighs the quietest. 1.0 = perfectly
       flat; 2x+ is a pronounced, believable curve. */
    const swing = lo > 0 ? hi / lo : 4;
    shapeScore = ramp(2 - swing, 0, 1);
    if (shapeScore >= 60) {
      shapeVerdict = "Flat";
      shapeDetail = "Delivery is the same from start to finish. Real posts surge then fade — raise Random variance or pick a shaped preset.";
    } else if (shapeScore >= 25) {
      shapeVerdict = "Slightly flat";
      shapeDetail = "The curve is fairly even end-to-end; a stronger peak would read more naturally.";
    }
  }
  factors.push({
    key: "shape",
    label: "Curve shape",
    score: Math.round(shapeScore),
    weight: 0.18,
    verdict: shapeVerdict,
    detail: shapeDetail,
  });

  /* ---- 5. SPIKE ----------------------------------------------------- */
  const biggest = qty.length ? Math.max(...qty) : 0;
  const share = views > 0 ? biggest / views : 0;
  const spikeScore = ramp(share, 0.1, 0.55);
  factors.push({
    key: "spike",
    label: "Biggest jump",
    score: Math.round(spikeScore),
    weight: 0.12,
    verdict: spikeScore < 25 ? "Smooth" : spikeScore < 60 ? "Uneven" : "One big dump",
    detail:
      spikeScore < 25
        ? "No single delivery dominates the campaign."
        : `One run carries ${(share * 100).toFixed(0)}% of all views. Add more runs to spread it out.`,
  });

  /* ---- 6. HOURS -----------------------------------------------------
     Only meaningful once a campaign is long enough to span a night. */
  let hoursScore = 0;
  let hoursVerdict = "Daytime";
  let hoursDetail = "Delivery avoids the middle of the night.";
  if (hours >= 10 && runs.length > 0) {
    const nightRuns = runs.filter((r) => {
      const h = new Date(r.at).getHours();
      return h >= 1 && h < 6;
    }).length;
    const nightShare = nightRuns / runs.length;
    /* A campaign spanning 20h+ has to cross the night somewhere; 1am–6am is
       5/24 of the clock, so ~21% is simply proportional. Only a genuine
       skew towards the small hours is worth flagging. */
    hoursScore = ramp(nightShare, 0.3, 0.6);
    if (hoursScore >= 25) {
      hoursVerdict = "Overnight";
      hoursDetail = `${Math.round(nightShare * 100)}% of runs fire between 1am and 6am, when a real audience is asleep.`;
    }
  }
  factors.push({
    key: "hours",
    label: "Time of day",
    score: Math.round(hoursScore),
    weight: 0.08,
    verdict: hoursVerdict,
    detail: hoursDetail,
  });

  /* ---- Combine ------------------------------------------------------
     A plain weighted mean lets one catastrophic signal hide behind five
     clean ones. The worst factor pulls the result up. */
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const mean = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
  const worst = factors.reduce((m, f) => Math.max(m, f.score), 0);
  const score = runs.length === 0 ? 0 : Math.round(clamp(mean * 0.45 + worst * 0.55));

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
    organic: "This view curve would pass for real traffic.",
    low: "Broadly believable, with one or two rough edges.",
    moderate: "A careful viewer would spot the pattern.",
    high: "The delivery has the shape of a purchased campaign.",
    severe: "This pattern would be obvious to the platform.",
  } as const;

  const advice = factors
    .filter((f) => f.score >= 35)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .map((f) => f.detail);

  /* Sparkline data: cumulative views, normalised 0–1. Cumulative rather
     than per-run because the growth curve is what a human recognises. */
  let running = 0;
  const curve = qty.map((v) => {
    running += v;
    return views > 0 ? running / views : 0;
  });

  return {
    score,
    band,
    label: LABEL[band],
    summary: SUMMARY[band],
    factors: factors.sort((a, b) => b.score * b.weight - a.score * a.weight),
    advice,
    curve,
  };
}
