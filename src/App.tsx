import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardPage } from "./pages/DashboardPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrdersPage } from "./pages/OrdersPage";
import { WalletPage } from "./pages/WalletPage";
import { PaywallPage } from "./pages/PaywallPage";
import { ReferralPage } from "./pages/ReferralPage";
import type {
  CreatedOrder,
  RunStatus,
} from "./types/order";
import {
  updateOrderControl,
  fetchOrderStatus,
  normalizePlatform,
  fetchOrdersForCurrentUser,
  fetchOrderAccess,
  logout,
  type AuthUser,
  type OrderAccessStatus,
} from "./utils/api";
import { Button, Spinner } from "./components/ui";
import { ThemeToggle } from "./components/ThemeToggle";
import { CurrencyPicker } from "./components/CurrencyPicker";
import type { Theme } from "./utils/theme";
import { cn } from "./utils/cn";
import { formatMoney, useCurrency } from "./utils/currency";

type NavKey =
  | "dashboard"
  | "new-order"
  | "orders"
  | "wallet"
  | "referrals";

const NAV_ITEMS: { key: NavKey; label: string; description: string }[] = [
  { key: "dashboard", label: "Dashboard", description: "Overview & analytics" },
  { key: "new-order", label: "New Order", description: "Create a campaign" },
  { key: "orders", label: "Orders", description: "Manage active orders" },
  { key: "wallet", label: "Wallet", description: "Balance & top-ups" },
  { key: "referrals", label: "Refer & Earn", description: "Invite friends, earn credit" },
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

interface AppProps {
  user: AuthUser;
  onSignOut: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export default function App({ user, onSignOut, theme, onToggleTheme }: AppProps) {
  // Re-render when the user switches display currency.
  useCurrency();
  const [activePage, setActivePage] = useState<NavKey>(() => {
    const saved = localStorage.getItem("dev-smm-active-page");
    if (
      saved === "dashboard" ||
      saved === "new-order" ||
      saved === "orders" ||
      saved === "wallet" ||
      saved === "referrals"
    ) {
      return saved;
    }
    return "new-order";
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [ordersNotice, setOrdersNotice] = useState("");
  // Orders cache is namespaced per account so switching users on the same
  // browser never shows the previous user's campaigns.
  const ordersKey = `dev-smm-orders:${user.id}`;
  const [orders, setOrders] = useState<CreatedOrder[]>(() =>
    hydrateOrderDates(readStorage<CreatedOrder[]>(`dev-smm-orders:${user.id}`, []))
  );
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [balance, setBalance] = useState<number>(user.balance ?? 0);
  const [cloneSourceOrder, setCloneSourceOrder] = useState<CreatedOrder | null>(
    null
  );
  const [controllingOrderId, setControllingOrderId] = useState<string | null>(
    null
  );

  /* ---- New Order paywall ----
     `null` means "not checked yet"; until it resolves we don't gate anything,
     so a slow backend never flashes a paywall at someone who has access. */
  const [orderAccess, setOrderAccess] = useState<OrderAccessStatus | null>(null);

  const refreshOrderAccess = useCallback(async () => {
    try {
      const next = await fetchOrderAccess();
      setOrderAccess(next);
      return next;
    } catch {
      // Network hiccup: leave the previous answer in place rather than
      // locking someone out of a page they have paid for.
      return null;
    }
  }, []);

  useEffect(() => { refreshOrderAccess(); }, [refreshOrderAccess]);

  // Only gate once we actually know the answer.
  const orderPageLocked = orderAccess !== null && orderAccess.allowed === false;

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
          localStorage.setItem(ordersKey, JSON.stringify(updated));
          return updated;
        });
      } else {
        setOrders(next);
        localStorage.setItem(ordersKey, JSON.stringify(next));
      }
    },
    [ordersKey]
  );

  /* Load this account's orders from the server on sign-in. This is what makes
     campaigns visible after logging in on a different device, where
     localStorage is empty. Server data is the source of truth. */
  useEffect(() => {
    let cancelled = false;
    setOrdersLoading(true);
    fetchOrdersForCurrentUser()
      .then((serverOrders) => {
        if (cancelled) return;
        setOrders((localOrders) => {
          // Keep any richer local copy (it has the original pattern/engagement
          // detail) but let the server decide which orders exist at all.
          const byId = new Map(
            localOrders
              .filter((o) => o.schedulerOrderId)
              .map((o) => [o.schedulerOrderId as string, o])
          );
          const merged = serverOrders.map((serverOrder) => {
            const local = byId.get(serverOrder.schedulerOrderId as string);
            return local
              ? {
                  ...local,
                  status: serverOrder.status,
                  completedRuns: serverOrder.completedRuns,
                  runStatuses: serverOrder.runStatuses,
                  lastUpdatedAt: serverOrder.lastUpdatedAt,
                }
              : serverOrder;
          });
          localStorage.setItem(ordersKey, JSON.stringify(merged));
          return merged;
        });
      })
      .catch((error) => {
        console.error("[Orders] Could not load from server:", error);
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => { cancelled = true; };
  }, [ordersKey]);


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
          readStorage<CreatedOrder[]>(ordersKey, [])
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
                /* The server is authoritative for the platform. This also
                   back-fills orders placed before the platform feature,
                   which have nothing stored locally. */
                platform: normalizePlatform(result.platform),
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
      if (orderPageLocked) {
        return (
          <PaywallPage
            onUnlocked={() => { refreshOrderAccess(); }}
            onBalanceChange={setBalance}
            onGoToWallet={() => navigateToPage("wallet")}
          />
        );
      }
      return (
        <NewOrderPage
          orders={orders}
          prefillOrder={cloneSourceOrder}
          onCreateOrder={(order) =>
            persistOrders((prev) => [order, ...prev])
          }
          onNavigateToWallet={() => navigateToPage("wallet")}
          onBalanceChange={setBalance}
          onNavigateToOrders={(notice) => {
            if (notice) setOrdersNotice(notice);
            navigateToPage("orders");
          }}
        />
      );
    }

    if (activePage === "wallet") {
      return <WalletPage onBalanceChange={setBalance} isOwner={user.isOwner} />;
    }

    if (activePage === "referrals") {
      return <ReferralPage />;
    }


    if (activePage === "orders") {
      if (ordersLoading && orders.length === 0) {
        return (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" />
              <p className="text-sm font-medium text-slate-500">Loading your orders…</p>
            </div>
          </div>
        );
      }
      return (
        <OrdersPage
          orders={orders}
          notice={ordersNotice}
          controllingOrderId={controllingOrderId}
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

    return <DashboardPage orders={orders} />;
  }, [
    activePage,
    orders,
    controllingOrderId,
    ordersNotice,
    cloneSourceOrder,
    navigateToPage,
    persistOrders,
    syncOrdersWithBackend,
    ordersLoading,
    balance,
    orderPageLocked,
    refreshOrderAccess,
  ]);

  const currentItem = NAV_ITEMS.find((item) => item.key === activePage)!;

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
                  {/* Padlock hints that this page needs a one-time unlock. */}
                  {item.key === "new-order" && orderPageLocked && (
                    <span
                      title="Locked — one-time unlock required"
                      className="relative ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                    >
                      🔒
                    </span>
                  )}
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
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <CurrencyPicker />
            <button
              type="button"
              onClick={() => navigateToPage("wallet")}
              className="w-full rounded-lg bg-emerald-50 px-3 py-2 text-left transition hover:bg-emerald-100"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Wallet
              </p>
              <p className="text-sm font-extrabold tabular-nums text-emerald-900">
                {formatMoney(balance)}
              </p>
            </button>
            <div className="rounded-lg bg-indigo-50 px-3 py-2">
              <p className="truncate text-[11px] font-semibold text-indigo-900" title={user.email}>
                {user.name || user.email}
              </p>
              {user.name && (
                <p className="truncate text-[10px] text-indigo-600" title={user.email}>
                  {user.email}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={async () => {
                if (!window.confirm("Sign out of TRUESMM?")) return;
                await logout();
                onSignOut();
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
          <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
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
