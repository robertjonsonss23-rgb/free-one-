// ============ STATUS TYPES ============
export type RunStatus = "pending" | "completed" | "cancelled" | "failed" | "retrying";

export type OrderStatus =
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "processing"
  | "failed"
  | "pending";

export type PatternType =
  | "smooth-s-curve" 
  | "rocket-launch"
  | "sunset-fade"
  | "viral-spike"
  | "micro-burst"
  | "heartbeat"
  | "sawtooth"
  | "fibonacci-spiral"
  | "natural-decay"
  | "exponential"
  | "steady-climb"
  | "wave-pattern"
  | "manual";

export type QuickPatternPreset =
  | "viral-boost"
  | "fast-start"
  | "trending-push"
  | "slow-burn";

export type RelativeCountMode = "auto" | "custom";

// ============ ENGAGEMENT RATIOS ============
// All values are percentages of TOTAL VIEWS (e.g. 2.5 means 2.5% of views)
export interface EngagementRatios {
  likes: number;
  shares: number;
  saves: number;
  comments: number;
  reposts: number;
}

// Defaults derived from original hard-coded patterns.ts logic
export const DEFAULT_ENGAGEMENT_RATIOS: EngagementRatios = {
  likes: 2.5,
  shares: 1.75,
  saves: 0.45,
  comments: 0.05,
  reposts: 0.85,
};

export interface RatioPreset {
  id: string;
  name: string;
  ratios: EngagementRatios;
  createdAt: string;
}

// ============ CONFIG TYPES ============
export interface DeliveryOption {
  mode: "auto" | "preset" | "custom";
  hours: number;
  label: string;
}

export interface OrderConfig {
  postUrl: string;
  totalViews: number;
  startDelayHours: number;
  includeLikes: boolean;
  includeShares: boolean;
  includeSaves: boolean;
  includeComments: boolean;
  includeReposts: boolean;
  variancePercent: number;
  peakHoursBoost: boolean;
  quickPreset: QuickPatternPreset | null;
  delivery: DeliveryOption;
  minViewsPerRun: number;
  manualRunCount?: number;
  sharesMode?: RelativeCountMode;
  savesMode?: RelativeCountMode;
  repostsMode?: RelativeCountMode;
  customSharesTotal?: number;
  customSavesTotal?: number;
  customRepostsTotal?: number;
  // 🔥 NEW: optional custom engagement ratios (overrides defaults if set)
  customRatios?: EngagementRatios | null;
}

// ============ RUN TYPES ============
export interface RunStep {
  run: number;
  at: Date;
  minutesFromStart: number;
  views: number;
  likes: number;
  shares: number;
  saves: number;
  comments: number;
  reposts: number;
  cumulativeViews: number;
  cumulativeLikes: number;
  cumulativeShares: number;
  cumulativeSaves: number;
  cumulativeComments: number;
  cumulativeReposts: number;
}

export type PatternRun = RunStep;

// ============ PATTERN PLAN ============
export interface PatternPlan {
  patternId: number;
  patternName: string;
  patternType: PatternType;
  totalRuns: number;
  approximateIntervalMin: number;
  finishTime: Date;
  estimatedDurationHours: number;
  risk: "Safe" | "Medium" | "High" | "Risk";
  runs: RunStep[];
}

// ============ API TYPES ============
export interface ApiService {
  id: string;
  name: string;
  type: string;
  rate: string;
  min: number;
  max: number;
}

export interface ApiPanel {
  id: string;
  name: string;
  url: string;
  key: string;
  status: "Active" | "Inactive";
  services: ApiService[];
  /** ISO 4217 currency used by this panel account (for example USD, INR, EUR). */
  currency?: string;
  /** Number of INR for one unit of `currency`. */
  exchangeRateToInr?: number;
  currencySource?: "panel" | "user";
  exchangeRateUpdatedAt?: string;
  lastFetchAt?: string;
  lastFetchError?: string;
}

export interface Bundle {
  id: string;
  apiId: string;
  name: string;
  serviceIds: {
    views: string;
    likes: string;
    shares: string;
    saves: string;
    comments: string;
    reposts: string;
  };
  serviceApis?: {
    views?: string;
    likes?: string;
    shares?: string;
    saves?: string;
    comments?: string;
    reposts?: string;
  };
}

// ============ BACKEND RUN INFO ============
export interface BackendRunInfo {
  id: string | number;
  label: string;
  quantity: number;
  time: string;
  status: string;
  done?: boolean;
  cancelled?: boolean;
  error: string | null;
  lastError?: string | null;
  retryCount?: number;
  retryReason?: string | null;
  originalTime?: string;
  currentTime?: string;
  executedAt: string | null;
  smmOrderId: string | number | null;
}

// ============ CREATED ORDER ============
export interface CreatedOrder {
  id: string;
  name: string;
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  schedulerOrderId?: string;
  smmOrderId: string;
  link: string;
  totalViews: number;
  startDelayHours: number;
  patternType: PatternType;
  patternName: string;
  runs: RunStep[];
  engagement: {
    likes: number;
    shares: number;
    saves: number;
    comments: number;
    reposts: number;
  };
  serviceId: string;
  selectedAPI: string | null;
  selectedBundle: string;
  status: OrderStatus;
  completedRuns: number;
  runStatuses: RunStatus[];
  runErrors?: string[];
  runRetries?: number[];
  runOriginalTimes?: string[];
  runCurrentTimes?: string[];
  runReasons?: string[];
  runActualExecutedTimes?: (string | null)[];
  errorMessage?: string;
  createdAt: string;
  lastUpdatedAt?: string;
  backendRuns?: BackendRunInfo[];
}
