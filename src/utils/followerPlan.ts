/* ============================================================
   ORGANIC FOLLOWER DRIP PLANNER

   Turns "300 followers over 7 days" into a list of dated batches that
   look like natural growth rather than a purchase:

     - a slow WARMUP, a rounded PEAK, then a TAPER (a bell curve), so the
       account does not jump from 2/day to 90/day overnight;
     - per-day JITTER from a seeded RNG, because a perfectly smooth curve
       is itself a fingerprint;
     - batches land at a plausible hour of the day, not 03:00;
     - the total always comes out EXACTLY right, since the customer is
       charged for that number.

   Kept deliberately separate from patterns.ts: that engine spreads
   engagement across the runs of a single post over hours. This spreads a
   profile metric over days, which is a different shape and a different
   set of constraints.
   ============================================================ */

export interface FollowerBatch {
  /** When this batch is sent to the provider. */
  at: Date;
  /** How many followers in this batch. */
  quantity: number;
  /** 1-based day number, for display. */
  day: number;
}

export interface FollowerPlan {
  batches: FollowerBatch[];
  total: number;
  days: number;
  /** Largest single-day amount — the number that looks suspicious if high. */
  peakPerDay: number;
  averagePerDay: number;
  finishAt: Date;
}

export interface FollowerPlanInput {
  total: number;
  days: number;
  /** Hours to wait before the first batch. */
  startDelayHours?: number;
  /** 0 = perfectly smooth, 1 = very uneven. */
  variance?: number;
  /** Same seed ⇒ same plan, so a re-render never reshuffles the preview. */
  seed?: number;
  /** Batches per day. 1 keeps it simple; 2 looks more natural on big orders. */
  perDay?: number;
}

/* Small deterministic RNG (mulberry32). Math.random() would reshuffle the
   preview on every keystroke, which makes the page feel broken. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bell-ish weight for day i of n: slow start, peak around 45%, long tail. */
function warmupWeight(i: number, n: number): number {
  if (n <= 1) return 1;
  const x = i / (n - 1);              // 0 → 1 across the campaign
  const peak = 0.45;                  // peak slightly before the middle
  const width = 0.34;
  const bell = Math.exp(-Math.pow((x - peak) / width, 2));
  /* Floor of 0.25 so no day is empty — a gap day reads as "the service
     stopped", which worries customers more than an uneven curve. */
  return 0.25 + 0.75 * bell;
}

export const FOLLOWER_MIN_TOTAL = 10;
export const FOLLOWER_MAX_DAYS = 60;

/**
 * Build the drip plan.
 *
 * Every batch is at least 1, and the quantities sum to exactly `total`.
 */
export function planFollowerDrip({
  total,
  days,
  startDelayHours = 2,
  variance = 0.35,
  seed = 7,
  perDay = 1,
}: FollowerPlanInput): FollowerPlan {
  const safeTotal = Math.max(0, Math.floor(total || 0));
  const safeDays = Math.max(1, Math.min(FOLLOWER_MAX_DAYS, Math.floor(days || 1)));
  const slotsPerDay = Math.max(1, Math.min(3, Math.floor(perDay || 1)));

  /* Never create more batches than there are followers: 20 followers over
     30 days would otherwise mean batches of 0. */
  const wantedSlots = safeDays * slotsPerDay;
  const slotCount = Math.max(1, Math.min(wantedSlots, safeTotal));

  const rand = rng(seed || 1);

  // 1. Raw weights: warmup shape × jitter.
  const weights: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    const dayIndex = Math.floor((i / slotCount) * safeDays);
    const jitter = 1 + (rand() * 2 - 1) * Math.max(0, Math.min(1, variance));
    weights.push(Math.max(0.05, warmupWeight(dayIndex, safeDays) * jitter));
  }

  // 2. Weights → integer quantities, floor first.
  const sumWeights = weights.reduce((a, b) => a + b, 0) || 1;
  const quantities = weights.map(w => Math.floor((w / sumWeights) * safeTotal));

  // 3. Guarantee at least 1 per batch (we already capped slotCount ≤ total).
  for (let i = 0; i < quantities.length; i++) {
    if (quantities[i] < 1) quantities[i] = 1;
  }

  /* 4. Reconcile to EXACTLY the paid-for total. Flooring leaves a shortfall;
        the min-1 rule can overshoot. Adjust biggest-first so the correction
        disappears into the large batches instead of distorting small ones. */
  const order = quantities
    .map((q, i) => ({ q, i }))
    .sort((a, b) => b.q - a.q)
    .map(o => o.i);

  let diff = safeTotal - quantities.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard < 100000) {
    for (const i of order) {
      if (diff === 0) break;
      if (diff > 0) { quantities[i] += 1; diff -= 1; }
      else if (quantities[i] > 1) { quantities[i] -= 1; diff += 1; }
    }
    guard += 1;
    // Everything is already at the floor of 1 and we still owe a reduction.
    if (diff < 0 && quantities.every(q => q <= 1)) break;
  }

  // 5. Dates. Batches land between 09:00 and 21:00 local, never overnight.
  const start = new Date(Date.now() + Math.max(0, startDelayHours) * 3600_000);
  const batches: FollowerBatch[] = quantities.map((quantity, i) => {
    const dayIndex = Math.floor((i / slotCount) * safeDays);
    const at = new Date(start.getTime() + dayIndex * 86400_000);
    if (i > 0) {
      const slotInDay = i % slotsPerDay;
      const hour = 9 + Math.floor(rand() * 12);
      at.setHours(hour + slotInDay * 2, Math.floor(rand() * 60), 0, 0);
      // Never schedule into the past on day 0.
      if (at.getTime() < start.getTime()) at.setTime(start.getTime() + i * 60_000);
    }
    return { at, quantity, day: dayIndex + 1 };
  });

  batches.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Per-DAY totals (a day can hold several batches).
  const perDayTotals = new Map<number, number>();
  for (const b of batches) perDayTotals.set(b.day, (perDayTotals.get(b.day) || 0) + b.quantity);

  const realTotal = batches.reduce((sum, b) => sum + b.quantity, 0);
  return {
    batches,
    total: realTotal,
    days: safeDays,
    peakPerDay: Math.max(0, ...perDayTotals.values()),
    averagePerDay: safeDays > 0 ? realTotal / safeDays : realTotal,
    finishAt: batches.length ? batches[batches.length - 1].at : start,
  };
}

/** Rough "does this look natural?" read, shown to the customer as guidance. */
export function paceVerdict(peakPerDay: number): {
  kind: "success" | "warning" | "danger";
  label: string;
  hint: string;
} {
  /* Thresholds raised after seeing 500-over-14-days (a genuinely gentle
     order) get flagged at 59/day. Real accounts running ads routinely gain
     100+/day, so warning that low just trains people to ignore the badge. */
  if (peakPerDay <= 150) {
    return {
      kind: "success",
      label: "Looks organic",
      hint: "This pace is comfortable for a normal account.",
    };
  }
  if (peakPerDay <= 500) {
    return {
      kind: "warning",
      label: "Noticeable",
      hint: "Fine for an account that already grows fast. Add days to soften it.",
    };
  }
  return {
    kind: "danger",
    label: "Very fast",
    hint: "A big daily jump is the main thing that looks bought. Add more days.",
  };
}
