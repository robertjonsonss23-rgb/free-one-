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

/* A single rotating slot: one service on one panel. */
export interface ServiceSlot {
  panelId: string;
  serviceId: string;
  panelName?: string;
}

/* Public view used by the New Order page. */
export interface ServiceAvailability {
  enabled: boolean;
  count: number;
  rotating: boolean;
  slots: Array<{ serviceId: string; panelId: string; panelName: string }>;
}

export interface PanelConfig {
  panels: Array<{ id: string; name: string }>;
  services: Record<ServiceLabel, ServiceAvailability>;
  configured: boolean;
  updatedAt: string | null;
}

/* Admin view: full panel detail + editable slot lists. */
export interface AdminPanel {
  id: string;
  name: string;
  apiUrl: string;
  apiKeyMask: string;
  isActive: boolean;
  createdAt?: string;
}

export interface AdminPanelConfig {
  panels: AdminPanel[];
  serviceSlots: Record<ServiceLabel, ServiceSlot[]>;
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

function emptySlots(): Record<ServiceLabel, ServiceSlot[]> {
  return { views: [], likes: [], shares: [], saves: [], comments: [], reposts: [] };
}

function normalizeAvailability(raw: unknown): ServiceAvailability {
  const o = (raw || {}) as Record<string, unknown>;
  const slots = Array.isArray(o.slots) ? o.slots : [];
  return {
    enabled: Boolean(o.enabled),
    count: Number(o.count) || 0,
    rotating: Boolean(o.rotating),
    slots: slots.map((s) => {
      const row = s as Record<string, unknown>;
      return {
        serviceId: String(row.serviceId ?? ""),
        panelId: String(row.panelId ?? ""),
        panelName: String(row.panelName ?? ""),
      };
    }),
  };
}

function normalizeConfig(raw: Record<string, unknown>): PanelConfig {
  const rawServices = (raw.services || {}) as Record<string, unknown>;
  const services = {} as Record<ServiceLabel, ServiceAvailability>;
  for (const label of SERVICE_LABELS) {
    services[label] = normalizeAvailability(rawServices[label]);
  }
  const panels = Array.isArray(raw.panels) ? raw.panels : [];
  return {
    panels: panels.map((p) => {
      const row = p as Record<string, unknown>;
      return { id: String(row.id ?? ""), name: String(row.name ?? "") };
    }),
    services,
    configured: Boolean(raw.configured),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function normalizeAdminConfig(raw: Record<string, unknown>): AdminPanelConfig {
  const rawSlots = (raw.serviceSlots || {}) as Record<string, unknown>;
  const serviceSlots = emptySlots();
  for (const label of SERVICE_LABELS) {
    const rows = Array.isArray(rawSlots[label]) ? (rawSlots[label] as unknown[]) : [];
    serviceSlots[label] = rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        panelId: String(row.panelId ?? ""),
        serviceId: String(row.serviceId ?? ""),
        panelName: String(row.panelName ?? ""),
      };
    });
  }
  const panels = Array.isArray(raw.panels) ? raw.panels : [];
  return {
    panels: panels.map((p) => {
      const row = p as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        apiUrl: String(row.apiUrl ?? ""),
        apiKeyMask: String(row.apiKeyMask ?? ""),
        isActive: row.isActive !== false,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
      };
    }),
    serviceSlots,
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

export async function fetchAdminPanelConfig(password: string): Promise<AdminPanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/panel-config`, {
    headers: { "x-admin-password": password },
  });
  return normalizeAdminConfig(await parseOrThrow(response));
}

/* ---- Panels ---- */

export async function addPanel(
  password: string,
  panel: { name: string; apiUrl: string; apiKey: string }
): Promise<AdminPanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/panels`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify(panel),
  });
  return normalizeAdminConfig(await parseOrThrow(response));
}

export async function updatePanel(
  password: string,
  panelId: string,
  changes: { name?: string; apiUrl?: string; apiKey?: string; isActive?: boolean }
): Promise<AdminPanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/panels/${panelId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify(changes),
  });
  return normalizeAdminConfig(await parseOrThrow(response));
}

export async function deletePanel(
  password: string,
  panelId: string
): Promise<AdminPanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/panels/${panelId}`, {
    method: "DELETE",
    headers: { "x-admin-password": password },
  });
  return normalizeAdminConfig(await parseOrThrow(response));
}

/** Replace the rotating slot list for one or more labels. */
export async function saveServiceSlots(
  password: string,
  serviceSlots: Partial<Record<ServiceLabel, Array<{ panelId: string; serviceId: string }>>>
): Promise<AdminPanelConfig> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/service-slots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify({ serviceSlots }),
  });
  return normalizeAdminConfig(await parseOrThrow(response));
}

/** Fetch a panel's service catalogue (by saved id, or unsaved credentials). */
export async function fetchAdminServices(
  password: string,
  target: { panelId?: string; apiUrl?: string; apiKey?: string }
): Promise<ApiService[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify(target || {}),
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

/* ============================================================
   PRICE QUOTE (calculated server-side; rates need the admin API key)
   ============================================================ */

export interface QuoteResult {
  available: boolean;
  reason?: string;
  total: number;
  breakdown: Partial<Record<ServiceLabel, number>>;
  currency: string;
  nativeTotal: number;
  exchangeRateToInr: number;
  partial?: boolean;
}

export async function fetchQuote(
  services: Partial<Record<ServiceLabel, number>>
): Promise<QuoteResult> {
  const response = await authedFetch(`${BACKEND_BASE_URL}/api/quote`, {
    method: "POST",
    body: JSON.stringify({ services }),
  });
  const payload = await parseOrThrow(response);
  return {
    available: payload.available === true,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
    total: Number(payload.total) || 0,
    breakdown: (payload.breakdown || {}) as Partial<Record<ServiceLabel, number>>,
    currency: String(payload.currency || "INR"),
    nativeTotal: Number(payload.nativeTotal) || 0,
    exchangeRateToInr: Number(payload.exchangeRateToInr) || 1,
    partial: payload.partial === true,
  };
}

/* ============================================================
   REBUILD LOCAL ORDERS FROM THE SERVER
   Orders live in MongoDB against the signed-in account, so a user
   who logs in on a new device has nothing in localStorage. This
   reconstructs the shape the UI expects from the server payload.
   ============================================================ */

import type { CreatedOrder, RunStep, RunStatus, OrderStatus } from "../types/order";

function toRunStatus(value: string): RunStatus {
  switch (value) {
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "failed":    return "failed";
    case "processing":return "pending";
    default:          return "pending";
  }
}

function toOrderStatus(value: string): OrderStatus {
  switch (value) {
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "failed":    return "failed";
    case "paused":    return "paused";
    case "running":
    case "processing":
    case "pending":   return "running";
    default:          return "running";
  }
}

/**
 * Fetch every order for the signed-in user and convert it into the
 * CreatedOrder shape the UI renders.
 */
export async function fetchOrdersForCurrentUser(): Promise<CreatedOrder[]> {
  const payload = await fetchAllOrdersStatus();
  const rows = Array.isArray(payload.orders) ? payload.orders : [];

  return rows.map((row) => {
    const raw = row as unknown as Record<string, unknown>;
    const runs = Array.isArray(row.runs) ? row.runs : [];

    // Only VIEWS runs drive the timeline; the others ride along with them.
    const viewRuns = runs.filter((r) => String(r.label).toUpperCase() === "VIEWS");
    const timeline = viewRuns.length > 0 ? viewRuns : runs;

    const sorted = [...timeline].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const sumLabel = (label: string) =>
      runs
        .filter((r) => String(r.label).toUpperCase() === label)
        .reduce((total, r) => total + (Number(r.quantity) || 0), 0);

    let cumulative = 0;
    const firstAt = sorted.length ? new Date(sorted[0].time).getTime() : Date.now();

    const runSteps: RunStep[] = sorted.map((r, index) => {
      const views = Number(r.quantity) || 0;
      cumulative += views;
      const at = new Date(r.time);
      return {
        run: index + 1,
        at,
        minutesFromStart: Math.max(0, Math.round((at.getTime() - firstAt) / 60000)),
        views,
        likes: 0, shares: 0, saves: 0, comments: 0, reposts: 0,
        cumulativeViews: cumulative,
        cumulativeLikes: 0, cumulativeShares: 0, cumulativeSaves: 0,
        cumulativeComments: 0, cumulativeReposts: 0,
      };
    });

    const runStatuses = sorted.map((r) => toRunStatus(String(r.status)));
    const totalViews = sumLabel("VIEWS");

    return {
      id: String(raw.schedulerOrderId || raw._id || ""),
      name: String(raw.name || "Order"),
      schedulerOrderId: String(raw.schedulerOrderId || ""),
      smmOrderId: String(sorted.find((r) => r.smmOrderId)?.smmOrderId ?? "Scheduled"),
      link: String(raw.link || ""),
      totalViews,
      startDelayHours: 0,
      patternType: "manual",
      patternName: "Scheduled",
      runs: runSteps,
      engagement: {
        likes: sumLabel("LIKES"),
        shares: sumLabel("SHARES"),
        saves: sumLabel("SAVES"),
        comments: sumLabel("COMMENTS"),
        reposts: sumLabel("REPOSTS"),
      },
      serviceId: "",
      selectedAPI: null,
      selectedBundle: "",
      status: toOrderStatus(String(raw.status || "")),
      completedRuns: runStatuses.filter((s) => s === "completed").length,
      runStatuses,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      lastUpdatedAt:
        typeof raw.lastUpdatedAt === "string" ? raw.lastUpdatedAt : new Date().toISOString(),
    } satisfies CreatedOrder;
  });
}
