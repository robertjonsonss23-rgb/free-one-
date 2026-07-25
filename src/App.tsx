import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { APIsPage } from "./pages/APIsPage";
import { BundlesPage } from "./pages/BundlesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrdersPage } from "./pages/OrdersPage";
import { RatiosPage } from "./pages/RatiosPage";
import type {
  ApiPanel,
  Bundle,
  CreatedOrder,
  EngagementRatios, 
  RatioPreset,
  RunStatus,
} from "./types/order";
import { DEFAULT_ENGAGEMENT_RATIOS } from "./types/order";
import { fetchServices, fetchPanelPricingMetadata, updateOrderControl, fetchOrderStatus } from "./utils/api";
import { cn } from "./utils/cn";
import { Button } from "./components/ui";

type NavKey =
  | "dashboard"
  | "new-order"
  | "orders"
  | "apis"
  | "bundles"
  | "ratios";

const NAV_ITEMS: { key: NavKey; label: string; description: string }[] = [
  { key: "dashboard", label: "Dashboard", description: "Overview & analytics" },
  { key: "new-order", label: "New Order", description: "Create a campaign" },
  { key: "orders", label: "Orders", description: "Manage active orders" },
  { key: "apis", label: "APIs", description: "API connections" },
  { key: "bundles", label: "Bundles", description: "Service bundles" },
  { key: "ratios", label: "Ratios", description: "Engagement presets" },
];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function hydrateOrderDates(orders: CreatedOrder[]): CreatedOrder[] {
  return (orders || []).map((order) => {
    const safeRuns = Array.isArray(order?.runs)
      ? order.runs.map((run, index) => ({
          run: Number.isFinite(run?.run) ? run.run : index + 1,
          at: run?.at ? new Date(run.at) : new Date(),
          minutesFromStart: Number.isFinite(run?.minutesFromStart)
            ? run.minutesFromStart
            : 0,
          views: Number.isFinite(run?.views) ? run.views : 0,
          likes: Number.isFinite(run?.likes) ? run.likes : 0,
          shares: Number.isFinite(run?.shares) ? run.shares : 0,
          saves: Number.isFinite(run?.saves) ? run.saves : 0,
          comments: Number.isFinite(run?.comments) ? run.comments : 0,
          reposts: Number.isFinite(run?.reposts) ? run.reposts : 0,
          cumulativeViews: Number.isFinite(run?.cumulativeViews)
            ? run.cumulativeViews
            : 0,
          cumulativeLikes: Number.isFinite(run?.cumulativeLikes)
            ? run.cumulativeLikes
            : 0,
          cumulativeShares: Number.isFinite(run?.cumulativeShares)
            ? run.cumulativeShares
            : 0,
          cumulativeSaves: Number.isFinite(run?.cumulativeSaves)
            ? run.cumulativeSaves
            : 0,
          cumulativeComments: Number.isFinite(run?.cumulativeComments)
            ? run.cumulativeComments
            : 0,
          cumulativeReposts: Number.isFinite(run?.cumulativeReposts)
            ? run.cumulativeReposts
            : 0,
        }))
      : [];

    const safeRunStatuses: RunStatus[] = Array.isArray(order?.runStatuses)
      ? safeRuns.map((_, index) => {
          const next = order.runStatuses[index];
          return next === "completed" ||
            next === "cancelled" ||
            next === "failed" ||
            next === "retrying"
            ? next
            : "pending";
        })
      : safeRuns.map(() => "pending");

    const safeRunErrors = Array.isArray(order?.runErrors)
      ? safeRuns.map((_, index) => order.runErrors?.[index] ?? "")
      : safeRuns.map(() => "");

    return {
      ...order,
      name: order?.name || `Order #${order?.id ?? Date.now()}`,
      smmOrderId: order?.smmOrderId ?? "N/A",
      serviceId: order?.serviceId ?? "N/A",
      status:
        order?.status === "failed" ||
        order?.status === "paused" ||
        order?.status === "cancelled" ||
        order?.status === "completed" ||
        order?.status === "running" ||
        order?.status === "processing" ||
        order?.status === "pending"
          ? order.status
          : "running",
      completedRuns: Number.isFinite(order?.completedRuns)
        ? order.completedRuns
        : 0,
      engagement: {
        likes: Number.isFinite(order?.engagement?.likes) ? order.engagement.likes : 0,
        shares: Number.isFinite(order?.engagement?.shares) ? order.engagement.shares : 0,
        saves: Number.isFinite(order?.engagement?.saves) ? order.engagement.saves : 0,
        comments: Number.isFinite(order?.engagement?.comments) ? order.engagement.comments : 0,
        reposts: Number.isFinite(order?.engagement?.reposts) ? order.engagement.reposts : 0,
      },
      runStatuses: safeRunStatuses,
      runErrors: safeRunErrors,
      runRetries: order?.runRetries || [],
      runOriginalTimes: order?.runOriginalTimes || [],
      runCurrentTimes: order?.runCurrentTimes || [],
      runReasons: order?.runReasons || [],
      runActualExecutedTimes: Array.isArray(order?.runActualExecutedTimes)
        ? order.runActualExecutedTimes
        : safeRuns.map(() => null),
      lastUpdatedAt:
        order?.lastUpdatedAt ?? order?.createdAt ?? new Date().toISOString(),
      runs: safeRuns,
    };
  });
}

function hydrateApis(apis: ApiPanel[]): ApiPanel[] {
  return apis.map((api) => ({
    ...api,
    services: Array.isArray(api.services) ? api.services : [],
    currency: typeof api.currency === "string" ? api.currency.toUpperCase() : undefined,
    exchangeRateToInr: Number.isFinite(api.exchangeRateToInr) ? api.exchangeRateToInr : undefined,
    currencySource: api.currencySource,
    exchangeRateUpdatedAt: api.exchangeRateUpdatedAt,
    lastFetchError: api.lastFetchError,
    lastFetchAt: api.lastFetchAt,
  }));
}

function hydrateBundles(bundles: Bundle[]): Bundle[] {
  return bundles.map((bundle) => ({
    ...bundle,
    apiId: bundle.apiId ?? "",
    serviceIds: {
      views: bundle.serviceIds?.views ?? "",
      likes: bundle.serviceIds?.likes ?? "",
      shares: bundle.serviceIds?.shares ?? "",
      saves: bundle.serviceIds?.saves ?? "",
      comments: bundle.serviceIds?.comments ?? "",
      reposts: bundle.serviceIds?.reposts ?? "",
    },
  }));
}

export default function App() {
  const [activePage, setActivePage] = useState<NavKey>(() => {
    const saved = localStorage.getItem("dev-smm-active-page");
    if (
      saved === "dashboard" ||
      saved === "new-order" ||
      saved === "orders" ||
      saved === "apis" ||
      saved === "bundles" ||
      saved === "ratios"
    ) {
      return saved;
    }
    return "new-order";
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [ordersNotice, setOrdersNotice] = useState("");
  const [orders, setOrders] = useState<CreatedOrder[]>(() =>
    hydrateOrderDates(readStorage<CreatedOrder[]>("dev-smm-orders", []))
  );
  const [apis, setApis] = useState<ApiPanel[]>(() =>
    hydrateApis(readStorage<ApiPanel[]>("dev-smm-apis", []))
  );
  const [bundles, setBundles] = useState<Bundle[]>(() =>
    hydrateBundles(readStorage<Bundle[]>("dev-smm-bundles", []))
  );
  const [activeRatios, setActiveRatios] = useState<EngagementRatios>(() =>
    readStorage<EngagementRatios>(
      "dev-smm-active-ratios",
      DEFAULT_ENGAGEMENT_RATIOS
    )
  );
  const [ratioPresets, setRatioPresets] = useState<RatioPreset[]>(() =>
    readStorage<RatioPreset[]>("dev-smm-ratio-presets", [])
  );
  const [cloneSourceOrder, setCloneSourceOrder] = useState<CreatedOrder | null>(
    null
  );
  const [fetchingApiId, setFetchingApiId] = useState<string | null>(null);
  const [controllingOrderId, setControllingOrderId] = useState<string | null>(
    null
  );

  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef(0);

  const navigateToPage = useCallback((page: NavKey) => {
    setActivePage(page);
    setMobileNavOpen(false);
    localStorage.setItem("dev-smm-active-page", page);
  }, []);

  const persistOrders = useCallback(
    (next: CreatedOrder[] | ((prev: CreatedOrder[]) => CreatedOrder[])) => {
      if (typeof next === "function") {
        setOrders((prev) => {
          const updated = next(prev);
          localStorage.setItem("dev-smm-orders", JSON.stringify(updated));
          return updated;
        });
      } else {
        setOrders(next);
        localStorage.setItem("dev-smm-orders", JSON.stringify(next));
      }
    },
    []
  );

  const persistApis = useCallback((next: ApiPanel[]) => {
    setApis(next);
    localStorage.setItem("dev-smm-apis", JSON.stringify(next));
  }, []);

  const persistBundles = useCallback((next: Bundle[]) => {
    setBundles(next);
    localStorage.setItem("dev-smm-bundles", JSON.stringify(next));
  }, []);

  const persistActiveRatios = useCallback((next: EngagementRatios) => {
    setActiveRatios(next);
    localStorage.setItem("dev-smm-active-ratios", JSON.stringify(next));
  }, []);

  const persistRatioPresets = useCallback((next: RatioPreset[]) => {
    setRatioPresets(next);
    localStorage.setItem("dev-smm-ratio-presets", JSON.stringify(next));
  }, []);

  const syncOrdersWithBackend = useCallback(
    async (force = false) => {
      if (isSyncingRef.current) return;

      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTimeRef.current;
      if (!force && timeSinceLastSync < 10000) return;

      isSyncingRef.current = true;
      lastSyncTimeRef.current = now;

      try {
        const currentOrders = hydrateOrderDates(
          readStorage<CreatedOrder[]>("dev-smm-orders", [])
        );

        const activeOrders = currentOrders.filter(
          (order) =>
            order.schedulerOrderId &&
            order.status !== "cancelled" &&
            order.status !== "failed"
        );

        if (activeOrders.length === 0) return;

        const updates: Array<{
          orderId: string;
          data: Partial<CreatedOrder>;
        }> = [];

        for (const order of activeOrders) {
          try {
            const result = await fetchOrderStatus(order.schedulerOrderId!);

            const runStatuses: RunStatus[] = result.runs.map((backendRun) => {
              switch (backendRun.status) {
                case "completed":
                  return "completed";
                case "cancelled":
                  return "cancelled";
                case "failed":
                  return "failed";
                default:
                  return "pending";
              }
            });

            const runErrors: string[] = result.runs.map(
              (backendRun) => backendRun.error || ""
            );
            const completedRuns = runStatuses.filter(
              (s) => s === "completed"
            ).length;

            let frontendStatus: CreatedOrder["status"] = order.status;
            switch (result.status) {
              case "completed":
                frontendStatus = "completed";
                break;
              case "cancelled":
                frontendStatus = "cancelled";
                break;
              case "failed":
                frontendStatus = "failed";
                break;
              case "paused":
                frontendStatus = "paused";
                break;
              case "running":
              case "processing":
                frontendStatus = "running";
                break;
              case "pending":
                frontendStatus = "running";
                break;
              default:
                frontendStatus = order.status;
            }

            updates.push({
              orderId: order.id,
              data: {
                status: frontendStatus,
                completedRuns,
                runStatuses,
                runErrors,
                backendRuns: result.runs,
                lastUpdatedAt: new Date().toISOString(),
              },
            });
          } catch (error) {
            console.error(
              `[Sync] Failed to sync order ${order.id}:`,
              error
            );
          }
        }

        if (updates.length > 0) {
          persistOrders((prev) =>
            prev.map((order) => {
              const update = updates.find((u) => u.orderId === order.id);
              return update ? { ...order, ...update.data } : order;
            })
          );
        }
      } catch (error) {
        console.error("[Sync] Error:", error);
      } finally {
        isSyncingRef.current = false;
      }
    },
    [persistOrders]
  );

  useEffect(() => {
    if (activePage !== "orders" && activePage !== "dashboard") return;

    const initialSync = setTimeout(() => {
      syncOrdersWithBackend();
    }, 5000);

    const interval = setInterval(() => {
      syncOrdersWithBackend();
    }, 300000);

    return () => {
      clearTimeout(initialSync);
      clearInterval(interval);
    };
  }, [activePage, syncOrdersWithBackend]);

  const content = useMemo(() => {
    if (activePage === "new-order") {
      return (
        <NewOrderPage
          apis={apis}
          bundles={bundles}
          orders={orders}
          prefillOrder={cloneSourceOrder}
          activeRatios={activeRatios}
          onCreateOrder={(order) =>
            persistOrders((prev) => [order, ...prev])
          }
          onPricingMetadataUpdate={(apiId, metadata) => {
            persistApis(apis.map((api) => api.id === apiId ? { ...api, ...metadata } : api));
          }}
          onNavigateToOrders={(notice) => {
            if (notice) setOrdersNotice(notice);
            navigateToPage("orders");
          }}
        />
      );
    }

    if (activePage === "dashboard") {
      return <DashboardPage orders={orders} />;
    }

    if (activePage === "orders") {
      return (
        <OrdersPage
          orders={orders}
          notice={ordersNotice}
          controllingOrderId={controllingOrderId}
          apis={apis}
          bundles={bundles}
          onCloneOrder={(order) => {
            setCloneSourceOrder(order);
            navigateToPage("new-order");
          }}
          onControlOrder={async (order, action) => {
            const applyLocalUpdate = (
              nextStatus: CreatedOrder["status"]
            ) => {
              persistOrders((prev) =>
                prev.map((item) => {
                  if (item.id !== order.id) return item;
                  if (nextStatus === "cancelled") {
                    const nextRunStatuses = item.runStatuses.map((status) =>
                      status === "pending" || status === "retrying"
                        ? "cancelled"
                        : status
                    );
                    const completedRuns = nextRunStatuses.filter(
                      (status) => status === "completed"
                    ).length;
                    return {
                      ...item,
                      status: nextStatus,
                      runStatuses: nextRunStatuses,
                      completedRuns,
                      lastUpdatedAt: new Date().toISOString(),
                    };
                  }
                  return {
                    ...item,
                    status: nextStatus,
                    lastUpdatedAt: new Date().toISOString(),
                  };
                })
              );
            };

            setControllingOrderId(order.id);
            try {
              if (order.schedulerOrderId) {
                const result = await updateOrderControl({
                  schedulerOrderId: order.schedulerOrderId,
                  action,
                });
                const nextStatus =
                  result.status ||
                  (action === "pause"
                    ? "paused"
                    : action === "resume"
                    ? "running"
                    : "cancelled");
                persistOrders((prev) =>
                  prev.map((item) => {
                    if (item.id !== order.id) return item;
                    return {
                      ...item,
                      status: nextStatus,
                      completedRuns:
                        typeof result.completedRuns === "number"
                          ? result.completedRuns
                          : item.completedRuns,
                      runStatuses:
                        result.runStatuses ?? item.runStatuses,
                      lastUpdatedAt: new Date().toISOString(),
                    };
                  })
                );
                setTimeout(() => syncOrdersWithBackend(true), 2000);
              } else {
                applyLocalUpdate(
                  action === "pause"
                    ? "paused"
                    : action === "resume"
                    ? "running"
                    : "cancelled"
                );
              }
            } catch {
              applyLocalUpdate(
                action === "pause"
                  ? "paused"
                  : action === "resume"
                  ? "running"
                  : "cancelled"
              );
            } finally {
              setControllingOrderId(null);
            }
          }}
          onDismissNotice={() => setOrdersNotice("")}
        />
      );
    }

    if (activePage === "apis") {
      return (
        <APIsPage
          apis={apis}
          onAddApi={(api) => {
            const next: ApiPanel[] = [
              ...apis,
              {
                id: `api-${Date.now()}`,
                name: api.name,
                url: api.url,
                key: api.key,
                currency: api.currency,
                currencySource: api.currency ? "user" : undefined,
                status: "Active",
                services: [],
              },
            ];
            persistApis(next);
          }}
          onEditApi={(id, api) => {
            const next: ApiPanel[] = apis.map((item) =>
              item.id === id
                ? {
                    ...item,
                    name: api.name,
                    url: api.url,
                    key: api.key,
                    currency: api.currency,
                    // Any connection/currency edit requires revalidation before showing cost.
                    exchangeRateToInr: undefined,
                    currencySource: api.currency ? "user" : undefined,
                    exchangeRateUpdatedAt: undefined,
                  }
                : item
            );
            persistApis(next);
          }}
          onDeleteApi={(id) => {
            persistApis(apis.filter((api) => api.id !== id));
          }}
          onToggleStatus={(id) => {
            const next: ApiPanel[] = apis.map((api) =>
              api.id === id
                ? {
                    ...api,
                    status:
                      api.status === "Active" ? "Inactive" : "Active",
                  }
                : api
            );
            persistApis(next);
          }}
          onFetchServices={async (id) => {
            const targetApi = apis.find((api) => api.id === id);
            if (!targetApi) return;
            setFetchingApiId(id);
            try {
              const services = await fetchServices(targetApi.url, targetApi.key);

              let pricing = await fetchPanelPricingMetadata(
                targetApi.url,
                targetApi.key,
                targetApi.currency
              );
              let currencySource: "panel" | "user" | undefined =
                pricing.currencySource ?? targetApi.currencySource;

              // Many SMM APIs omit currency. Never guess from panel name or rate size.
              if (!pricing.currency) {
                const entered = window.prompt(
                  `${targetApi.name} did not report its account currency. Enter its 3-letter currency code (for example USD, INR, EUR):`,
                  targetApi.currency || ""
                );
                const confirmedCurrency = String(entered || "").trim().toUpperCase();
                if (!/^[A-Z]{3}$/.test(confirmedCurrency)) {
                  throw new Error("Services synced, but cost is disabled until a valid 3-letter panel currency is confirmed.");
                }
                pricing = await fetchPanelPricingMetadata(
                  targetApi.url,
                  targetApi.key,
                  confirmedCurrency
                );
                currencySource = "user";
              }

              const next = apis.map((api) =>
                api.id === id
                  ? {
                      ...api,
                      services,
                      currency: pricing.currency || undefined,
                      currencySource,
                      exchangeRateToInr: pricing.exchangeRateToInr || undefined,
                      exchangeRateUpdatedAt: pricing.exchangeRateUpdatedAt || undefined,
                      lastFetchAt: new Date().toISOString(),
                      lastFetchError: undefined,
                    }
                  : api
              );
              persistApis(next);
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Failed to fetch services";
              const next = apis.map((api) =>
                api.id === id ? { ...api, lastFetchError: message } : api
              );
              persistApis(next);
            } finally {
              setFetchingApiId(null);
            }
          }}
          fetchingApiId={fetchingApiId}
        />
      );
    }

    if (activePage === "ratios") {
      return (
        <RatiosPage
          activeRatios={activeRatios}
          presets={ratioPresets}
          onSaveActive={(ratios) => persistActiveRatios(ratios)}
          onResetActive={() => persistActiveRatios(DEFAULT_ENGAGEMENT_RATIOS)}
          onSavePreset={(name, ratios) => {
            const next: RatioPreset[] = [
              {
                id: `ratio-${Date.now()}`,
                name,
                ratios,
                createdAt: new Date().toISOString(),
              },
              ...ratioPresets,
            ];
            persistRatioPresets(next);
          }}
          onDeletePreset={(id) => {
            persistRatioPresets(ratioPresets.filter((p) => p.id !== id));
          }}
          onApplyPreset={(id) => {
            const p = ratioPresets.find((x) => x.id === id);
            if (p) persistActiveRatios(p.ratios);
          }}
        />
      );
    }

    return (
      <BundlesPage
        apis={apis}
        bundles={bundles}
        onAddBundle={(bundle) => {
          const next: Bundle[] = [
            ...bundles,
            {
              id: `bundle-${Date.now()}`,
              apiId: bundle.apiId,
              name: bundle.name,
              serviceIds: {
                views: bundle.views,
                likes: bundle.likes,
                shares: bundle.shares,
                saves: bundle.saves,
                comments: bundle.comments,
                reposts: bundle.reposts,
              },
            },
          ];
          persistBundles(next);
        }}
        onUpdateBundle={(id, bundle) => {
          const next: Bundle[] = bundles.map((item) =>
            item.id === id
              ? {
                  ...item,
                  apiId: bundle.apiId,
                  name: bundle.name,
                  serviceIds: {
                    views: bundle.views,
                    likes: bundle.likes,
                    shares: bundle.shares,
                    saves: bundle.saves,
                    comments: bundle.comments,
                    reposts: bundle.reposts,
                  },
                }
              : item
          );
          persistBundles(next);
        }}
        onDeleteBundle={(id) => {
          persistBundles(bundles.filter((bundle) => bundle.id !== id));
        }}
      />
    );
  }, [
    activePage,
    apis,
    bundles,
    orders,
    fetchingApiId,
    controllingOrderId,
    ordersNotice,
    cloneSourceOrder,
    navigateToPage,
    persistOrders,
    persistApis,
    persistBundles,
    syncOrdersWithBackend,
    activeRatios,
    ratioPresets,
    persistActiveRatios,
    persistRatioPresets,
  ]);

  const currentItem = NAV_ITEMS.find((item) => item.key === activePage)!;
  const activeIndex = NAV_ITEMS.findIndex((item) => item.key === activePage);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        {/* =============== DESKTOP SIDEBAR =============== */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white">
          {/* Brand */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
              <svg viewBox="0 0 100 100" className="h-5 w-5 text-white" fill="currentColor">
                <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">TRUESMM</h1>
              <p className="text-[11px] text-slate-500">Marketing Panel</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (item.key === "new-order") setCloneSourceOrder(null);
                    navigateToPage(item.key);
                  }}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="active-nav"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-indigo-600"
                      transition={{ type: "spring", stiffness: 280, damping: 28 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer info */}
          <div className="border-t border-slate-200 p-3 space-y-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-medium text-slate-600">Auto-sync</p>
              <p className="text-[11px] text-slate-500">Every 5 minutes</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => {
                if (window.confirm("Sign out of TRUESMM?")) {
                  localStorage.removeItem("truesmm-access-key");
                  window.location.reload();
                }
              }}
            >
              Sign out
            </Button>
          </div>
        </aside>

        {/* =============== MOBILE HEADER =============== */}
        <div className="fixed top-0 left-0 right-0 z-40 flex lg:hidden items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3 safe-top">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600">
              <svg viewBox="0 0 100 100" className="h-4 w-4 text-white" fill="currentColor">
                <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900">TRUESMM</h1>
              <p className="text-[10px] text-slate-500">{currentItem.label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white p-2"
            aria-label="Toggle menu"
          >
            <span
              className={cn(
                "block h-0.5 w-4 bg-slate-700 transition-all",
                mobileNavOpen && "translate-y-1.5 rotate-45"
              )}
            />
            <span
              className={cn(
                "block h-0.5 w-4 bg-slate-700 transition-all",
                mobileNavOpen && "opacity-0"
              )}
            />
            <span
              className={cn(
                "block h-0.5 w-4 bg-slate-700 transition-all",
                mobileNavOpen && "-translate-y-1.5 -rotate-45"
              )}
            />
          </button>
        </div>

        {/* =============== MOBILE DRAWER =============== */}
        <AnimatePresence>
          {mobileNavOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden modal-backdrop"
                onClick={() => setMobileNavOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed top-0 left-0 z-50 h-full w-72 border-r border-slate-200 bg-white p-4 lg:hidden safe-top safe-bottom"
              >
                <div className="mb-6 flex items-center gap-3 px-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600">
                    <svg viewBox="0 0 100 100" className="h-5 w-5 text-white" fill="currentColor">
                      <path d="M50 22 L58 42 L78 46 L64 60 L68 80 L50 70 L32 80 L36 60 L22 46 L42 42 Z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-base font-bold tracking-tight text-slate-900">TRUESMM</h1>
                    <p className="text-[11px] text-slate-500">Marketing Panel</p>
                  </div>
                </div>

                <nav className="space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const isActive = activePage === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (item.key === "new-order") setCloneSourceOrder(null);
                          navigateToPage(item.key);
                        }}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                          isActive
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <span className="font-semibold">{item.label}</span>
                        <span className={cn("text-[11px] font-normal", isActive ? "text-indigo-500" : "text-slate-500")}>
                          {item.description}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* =============== BOTTOM NAV (Mobile) =============== */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur-md safe-bottom">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === "new-order") setCloneSourceOrder(null);
                  navigateToPage(item.key);
                }}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition",
                  isActive ? "text-indigo-600" : "text-slate-500"
                )}
              >
                <span className="text-[13px] font-semibold">{item.label.split(" ")[0]}</span>
                <span className="text-[10px] opacity-80">{item.label.split(" ").slice(1).join(" ") || "Home"}</span>
                {isActive && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-indigo-600" />
                )}
              </button>
            );
          })}
        </nav>

        {/* =============== MAIN CONTENT =============== */}
        <main className="flex-1 overflow-y-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="min-h-full"
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
