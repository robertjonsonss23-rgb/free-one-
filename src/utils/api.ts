import type { ApiService } from "../types/order";
import type { BackendRunInfo } from "../types/order";

/* Credentials and service ids are NOT sent — the server resolves them from
   the admin-managed panel configuration. */
interface CreateOrderPayload {
  name?: string;
  link: string;
  services: Partial<
    Record<
      "views" | "likes" | "shares" | "saves" | "comments" | "reposts",
      {
        runs: Array<{
          time: string;
          quantity?: number;
          comments?: string;
        }>;
      }
    >
  >;
}

interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  schedulerOrderId?: string;
  status?: string;
  completedRuns?: number;
  message?: string;
  raw?: unknown;
}

interface OrderControlResult {
  success: boolean;
  status?: "running" | "paused" | "cancelled" | "completed";
  completedRuns?: number;
  runStatuses?: Array<"pending" | "completed" | "cancelled" | "retrying">;
  error?: string;
}

interface FetchOrderRunsResult {
  schedulerOrderId: string;
  runs: BackendRunInfo[];
}

interface OrderStatusResult {
  schedulerOrderId: string;
  name: string;
  link: string;
  status: string;
  totalRuns: number;
  completedRuns: number;
  runStatuses: string[];
  createdAt: string;
  lastUpdatedAt: string;
  runs: Array<{
    id: string;
    label: string;
    quantity: number;
    time: string;
    status: string;
    smmOrderId: string | null;
    executedAt: string | null;
    error: string | null;
  }>;
}

// Backend base URL.
// Preferred: set VITE_BACKEND_URL in .env.local (dev) and in Vercel → Settings →
// Environment Variables (prod). The constant below is only a safety net so the
// app still works if that env var is ever missing.
//
// NOTE: VITE_* vars are inlined at BUILD time. Changing one in Vercel requires a
// redeploy — a restart will not pick it up.
export const DEFAULT_BACKEND_URL = "https://freeone-back.onrender.com";

export const BACKEND_BASE_URL = (
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim() ||
  DEFAULT_BACKEND_URL
).replace(/\/$/, "");

if (!(import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim()) {
  console.warn(
    `[config] VITE_BACKEND_URL is not set — falling back to ${DEFAULT_BACKEND_URL}. ` +
      "Set it in Vercel → Settings → Environment Variables, then redeploy."
  );
}

console.info(`[config] Backend: ${BACKEND_BASE_URL}`);

/* ============================================================
   AUTH TOKEN
   Stored in localStorage so the session survives a refresh and
   the user stays signed in on this device.
   ============================================================ */
const AUTH_TOKEN_KEY = "truesmm-auth-token";

export function getAuthToken(): string {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || ""; } catch { return ""; }
}
export function setAuthToken(token: string) {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch { /* ignore */ }
}
export function clearAuthToken() {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* ignore */ }
}

/** Headers for an authenticated JSON request. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** Called when the server reports the session is no longer valid. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/** Wrapper that signs the user out automatically on a 401. */
async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (response.status === 401) {
    clearAuthToken();
    onUnauthorized?.();
  }
  return response;
}

interface RawService {
  service?: string | number;
  id?: string | number;
  name?: string;
  type?: string;
  rate?: string | number;
  min?: string | number;
  max?: string | number;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanRateString(val: unknown): string {
  if (val === null || val === undefined) return "0";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "0";
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
      // 1,234 is normally a thousands separator; 0,123 and 12,50 are decimals.
      clean = fraction.length === 3 && whole !== "0"
        ? `${whole}${fraction}`
        : `${whole}.${fraction}`;
    }
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

export async function createSmmOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  const endpoint = `${BACKEND_BASE_URL}/api/order`;
  console.info("[Create Order] Sending request", {
    endpoint,
    services: Object.keys(payload.services),
    link: payload.link,
    runsCount: Object.values(payload.services).reduce((sum, s) => sum + (s?.runs?.length || 0), 0),
  });

  let response: Response;
  try {
    response = await authedFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[Create Order] Network request failed", error);
    throw new Error("Cannot reach backend /api/order. Check backend availability and VITE_BACKEND_URL.");
  }

  const responseText = await response.text();
  const parsed = ((): unknown => {
    try { return JSON.parse(responseText); } catch { return null; }
  })();

  const payloadObject = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const explicitError =
    typeof payloadObject?.error === "string" && payloadObject.error.trim()
      ? payloadObject.error.trim()
      : "";
  const isExplicitSuccess = payloadObject?.success === true;
  const successMessage =
    typeof payloadObject?.message === "string" && payloadObject.message.trim()
      ? payloadObject.message.trim()
      : "Order Scheduled Successfully";
  const orderIds = Array.isArray(payloadObject?.orderIds) ? payloadObject.orderIds : null;
  const resolvedOrderId = payloadObject?.orderId ?? payloadObject?.order ?? (orderIds && orderIds[0]);
  const schedulerOrderId =
    payloadObject?.schedulerOrderId !== undefined && payloadObject?.schedulerOrderId !== null
      ? String(payloadObject.schedulerOrderId)
      : undefined;

  console.info("[Create Order] schedulerOrderId received:", schedulerOrderId);

  if (explicitError) {
    console.error("[Create Order] API returned error", { status: response.status, payload: payloadObject });
    throw new Error(explicitError);
  }

  if (!response.ok) {
    console.error("[Create Order] Failed response", {
      status: response.status,
      payload: payloadObject,
      bodyPreview: responseText.slice(0, 500),
    });
    throw new Error(`Order request failed (HTTP ${response.status})`);
  }

  if (isExplicitSuccess) {
    return {
      success: true,
      orderId:
        resolvedOrderId !== undefined && resolvedOrderId !== null && String(resolvedOrderId).trim() !== ""
          ? String(resolvedOrderId)
          : undefined,
      message: successMessage,
      schedulerOrderId,
      status: typeof payloadObject?.status === "string" ? payloadObject.status : undefined,
      completedRuns: typeof payloadObject?.completedRuns === "number" ? payloadObject.completedRuns : undefined,
      raw: payloadObject,
    };
  }

  if (resolvedOrderId === undefined || resolvedOrderId === null || String(resolvedOrderId).trim() === "") {
    throw new Error("Order failed: provider did not return an order ID or success confirmation");
  }

  return {
    success: true,
    orderId: String(resolvedOrderId),
    message: successMessage,
    schedulerOrderId,
    status: typeof payloadObject?.status === "string" ? payloadObject.status : undefined,
    completedRuns: typeof payloadObject?.completedRuns === "number" ? payloadObject.completedRuns : undefined,
    raw: payloadObject,
  };
}

export async function updateOrderControl(payload: {
  schedulerOrderId: string;
  action: "pause" | "resume" | "cancel";
}): Promise<OrderControlResult> {
  const endpoint = `${BACKEND_BASE_URL}/api/order/control`;

  console.info(`[Order Control] Sending ${payload.action.toUpperCase()} request`, {
    endpoint,
    schedulerOrderId: payload.schedulerOrderId,
    action: payload.action,
  });

  const maxRetries = payload.action === "cancel" ? 3 : 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await authedFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(responseText); } catch { parsed = null; }

      const payloadObject = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

      if (!response.ok || payloadObject?.success === false) {
        const errorMsg = String(payloadObject?.error || `Order control failed (HTTP ${response.status})`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw new Error(errorMsg);
      }

      return {
        success: true,
        status:
          payloadObject?.status === "running" ||
          payloadObject?.status === "paused" ||
          payloadObject?.status === "cancelled" ||
          payloadObject?.status === "completed"
            ? payloadObject.status
            : undefined,
        completedRuns: typeof payloadObject?.completedRuns === "number" ? payloadObject.completedRuns : undefined,
        runStatuses: Array.isArray(payloadObject?.runStatuses)
          ? (payloadObject.runStatuses as Array<"pending" | "completed" | "cancelled" | "retrying">)
          : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError || new Error("Order control failed after all retries");
}

// 🔥 FIXED: Now returns properly typed BackendRunInfo matching actual backend response
export async function fetchOrderRuns(schedulerOrderId: string): Promise<FetchOrderRunsResult> {
  const endpoint = `${BACKEND_BASE_URL}/api/order/runs/${schedulerOrderId}`;

  try {
    const response = await authedFetch(endpoint, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Failed to fetch runs (HTTP ${response.status})`);
    }

    const data = await response.json();

    return {
      schedulerOrderId: data.schedulerOrderId,
      runs: Array.isArray(data.runs) ? data.runs : [],
    };
  } catch (error) {
    console.error(`[Fetch Order Runs] Error for ${schedulerOrderId}:`, error);
    throw error;
  }
}

export async function fetchOrderStatus(schedulerOrderId: string): Promise<OrderStatusResult> {
  const endpoint = `${BACKEND_BASE_URL}/api/order/status/${schedulerOrderId}`;

  try {
    const response = await authedFetch(endpoint, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Failed to fetch order status (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Fetch Order Status] Error for ${schedulerOrderId}:`, error);
    throw error;
  }
}

export async function fetchAllOrdersStatus(): Promise<{
  total: number;
  orders: Array<OrderStatusResult & {
    runs: Array<{
      id: string;
      label: string;
      quantity: number;
      time: string;
      status: string;
      smmOrderId: string | null;
    }>;
  }>;
}> {
  const endpoint = `${BACKEND_BASE_URL}/api/orders/status`;

  try {
    const response = await authedFetch(endpoint, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders status (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Fetch All Orders Status] Error:`, error);
    throw error;
  }
}

export async function fetchMinViewsSetting(): Promise<number> {
  const endpoint = `${BACKEND_BASE_URL}/api/settings/min-views`;

  try {
    const response = await fetch(endpoint);
    const data = await response.json();
    return data.minViewsPerRun || 10;
  } catch (error) {
    console.warn("[Fetch Min Views] Failed, using default 10");
    return 10;
  }
}

export async function updateMinViewsSetting(
  minViewsPerRun: number
): Promise<{ success: boolean; minViewsPerRun: number }> {
  const endpoint = `${BACKEND_BASE_URL}/api/settings/min-views`;

  try {
    const response = await authedFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ minViewsPerRun }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update min views (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Update Min Views] Error:`, error);
    throw error;
  }
}

export async function cancelMultipleOrders(schedulerOrderIds: string[]): Promise<{
  success: boolean;
  results: Array<{ schedulerOrderId: string; success: boolean; error?: string }>;
}> {
  console.info(`[Batch Cancel] Cancelling ${schedulerOrderIds.length} orders...`);

  const results: Array<{ schedulerOrderId: string; success: boolean; error?: string }> = [];

  for (const schedulerOrderId of schedulerOrderIds) {
    try {
      await updateOrderControl({ schedulerOrderId, action: "cancel" });
      results.push({ schedulerOrderId, success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ schedulerOrderId, success: false, error: errorMsg });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.info(`[Batch Cancel] Completed: ${successCount}/${schedulerOrderIds.length} successful`);

  return {
    success: successCount === schedulerOrderIds.length,
    results,
  };
}

export interface ProviderRunStatus {
  label: string;
  smmOrderId: string;
  providerStatus: string;
  remains?: number;
  charge?: string;
  currency?: string;
  error?: string;
}

export async function checkProviderOrderStatus(schedulerOrderId: string): Promise<{
  results: ProviderRunStatus[];
}> {
  const endpoint = `${BACKEND_BASE_URL}/api/order/provider-status/${schedulerOrderId}`;

  try {
    const response = await authedFetch(endpoint, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Failed to check provider status (HTTP ${response.status})`);
    }

    const data = await response.json();
    return {
      results: Array.isArray(data.results) ? data.results : [],
    };
  } catch (error) {
    console.error(`[Check Provider Status] Error for ${schedulerOrderId}:`, error);
    throw error;
  }
}

/* ============================================================
   ADMIN-MANAGED PANEL CONFIG
   The SMM panel URL, API key and per-service ids are stored on the
   server and set by the admin. Regular users never send credentials.
   ============================================================ */

export type ServiceLabel =
  | "views" | "likes" | "shares" | "saves" | "comments" | "reposts";

export const SERVICE_LABELS: ServiceLabel[] = [
  "views", "likes", "shares", "saves", "comments", "reposts",
];

export interface PanelConfig {
  panelName: string;
  apiUrl: string;
  hasApiKey: boolean;
  apiKeyMask: string;
  serviceIds: Record<ServiceLabel, string>;
  configured: boolean;
  updatedAt: string | null;
}

const ADMIN_PW_STORAGE_KEY = "truesmm-admin-pw";

export function getStoredAdminPassword(): string {
  try { return sessionStorage.getItem(ADMIN_PW_STORAGE_KEY) || ""; } catch { return ""; }
}
export function setStoredAdminPassword(pw: string) {
  try { sessionStorage.setItem(ADMIN_PW_STORAGE_KEY, pw); } catch { /* ignore */ }
}
export function clearStoredAdminPassword() {
  try { sessionStorage.removeItem(ADMIN_PW_STORAGE_KEY); } catch { /* ignore */ }
}

function emptyServiceIds(): Record<ServiceLabel, string> {
  return { views: "", likes: "", shares: "", saves: "", comments: "", reposts: "" };
}

function normalizeConfig(raw: Record<string, unknown>): PanelConfig {
  const ids = emptyServiceIds();
  const rawIds = (raw.serviceIds || {}) as Record<string, unknown>;
  for (const label of SERVICE_LABELS) ids[label] = String(rawIds[label] ?? "");
  return {
    panelName: String(raw.panelName ?? ""),
    apiUrl: String(raw.apiUrl ?? ""),
    hasApiKey: Boolean(raw.hasApiKey),
    apiKeyMask: String(raw.apiKeyMask ?? ""),
    serviceIds: ids,
    configured: Boolean(raw.configured),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

async function parseOrThrow(response: Response) {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* below */ }
  if (!response.ok) {
    throw new Error(String(payload.error || `Request failed (HTTP ${response.status})`));
  }
  return payload;
}

/** Public — used by the New Order page. Never contains the API key. */
export async function fetchPanelConfig(): Promise<PanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/panel-config`);
  return normalizeConfig(await parseOrThrow(response));
}

/** Check an admin password against the server. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
  });
  if (response.status === 401) return false;
  await parseOrThrow(response);
  return true;
}

export async function fetchAdminPanelConfig(password: string): Promise<PanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/panel-config`, {
    headers: { "x-admin-password": password },
  });
  return normalizeConfig(await parseOrThrow(response));
}

export async function saveAdminPanelConfig(
  password: string,
  payload: {
    panelName?: string;
    apiUrl?: string;
    apiKey?: string;
    serviceIds?: Partial<Record<ServiceLabel, string>>;
  }
): Promise<PanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/panel-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify(payload),
  });
  return normalizeConfig(await parseOrThrow(response));
}

/** Fetch the panel's service catalogue using stored (or supplied) credentials. */
export async function fetchAdminServices(
  password: string,
  overrides?: { apiUrl?: string; apiKey?: string }
): Promise<ApiService[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify(overrides || {}),
  });
  const payload = await parseOrThrow(response);
  const rows = Array.isArray(payload.services) ? (payload.services as RawService[]) : [];
  return rows
    .map((service) => {
      const id = String(service.service ?? service.id ?? "").trim();
      const name = String(service.name ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        type: String(service.type ?? "").trim(),
        rate: cleanRateString(service.rate),
        min: toNumber(service.min),
        max: toNumber(service.max),
      } satisfies ApiService;
    })
    .filter((s): s is ApiService => Boolean(s));
}

/* ============================================================
   USER ACCOUNTS (email + password)
   ============================================================ */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
}

interface AuthResult {
  token: string;
  user: AuthUser;
}

function normalizeUser(raw: unknown): AuthUser {
  const o = (raw || {}) as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    email: String(o.email ?? ""),
    name: String(o.name ?? ""),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
  };
}

export async function signup(
  email: string,
  password: string,
  name?: string
): Promise<AuthResult> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const payload = await parseOrThrow(response);
  const token = String(payload.token || "");
  setAuthToken(token);
  return { token, user: normalizeUser(payload.user) };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await parseOrThrow(response);
  const token = String(payload.token || "");
  setAuthToken(token);
  return { token, user: normalizeUser(payload.user) };
}

/** Restore a session on page load. Returns null when not signed in. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!getAuthToken()) return null;
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/auth/me`, {
      headers: authHeaders(),
    });
    if (response.status === 401) { clearAuthToken(); return null; }
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    return normalizeUser(payload.user);
  } catch {
    // Network failure: keep the token so a refresh can retry.
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BACKEND_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch { /* logging out locally is what matters */ }
  clearAuthToken();
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/auth/change-password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const payload = await parseOrThrow(response);
  if (typeof payload.token === "string") setAuthToken(payload.token);
}

/* ---- Admin: user management ---- */

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  orderCount: number;
}

export async function fetchAdminUsers(password: string): Promise<AdminUser[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/users`, {
    headers: { "x-admin-password": password },
  });
  const payload = await parseOrThrow(response);
  const rows = Array.isArray(payload.users) ? payload.users : [];
  return rows.map((raw) => {
    const o = raw as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      email: String(o.email ?? ""),
      name: String(o.name ?? ""),
      isActive: o.isActive !== false,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : null,
      lastLoginAt: typeof o.lastLoginAt === "string" ? o.lastLoginAt : null,
      orderCount: Number(o.orderCount) || 0,
    };
  });
}

export async function setUserActive(
  password: string,
  userId: string,
  isActive: boolean
): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/users/${userId}/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify({ isActive }),
  });
  await parseOrThrow(response);
}
