import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BackendRunInfo, CreatedOrder } from "../types/order";
import { OrderCard } from "../components/OrderCard";
import {
  Button,
  Card,
  Input,
  StatusPill,
  Tabs,
  EmptyState,
  SectionHeader,
  InfoBanner,
} from "../components/ui";

interface OrdersPageProps {
  orders: CreatedOrder[];
  notice: string;
  controllingOrderId: string | null;
  onControlOrder: (order: CreatedOrder, action: "pause" | "resume" | "cancel") => void;
  onCloneOrder: (order: CreatedOrder) => void;
  onDismissNotice: () => void;
}

type TabType = "running" | "completed" | "scheduled" | "cancelled";
type ViewMode = "rows" | "columns";

interface GroupedOrder {
  id: string;
  batchId: string | null;
  name: string;
  orders: CreatedOrder[];
  isBatch: boolean;
  totalViews: number;
  linksCount: number;
  createdAt: string;
}

const TABS: { key: TabType; label: string; icon?: React.ReactNode }[] = [
  { key: "running", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function getRealStatus(order: CreatedOrder): string {
  if (!order) return "running";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "failed") return "failed";
  if (order.status === "completed") return "completed";
  if (order.status === "paused") return "paused";

  const runs = order.runs || [];
  const now = Date.now();

  if (runs.length > 0) {
    const allFuture = runs.every((run) => {
      const runTime =
        run?.at instanceof Date
          ? run.at.getTime()
          : new Date(run?.at ?? now).getTime();
      return Number.isFinite(runTime) && runTime > now;
    });
    if (allFuture) return "scheduled";
  }

  const rs = order.runStatuses || [];
  if (rs.length > 0) {
    if (rs.every((s) => s === "completed")) return "completed";
    if (rs.every((s) => s === "cancelled")) return "cancelled";
  }

  if (order.status === "processing" || order.status === "pending") return "running";
  return "running";
}

function BackendRunTable({ runs }: { runs: BackendRunInfo[] }) {
  const labelColors: Record<string, string> = {
    VIEWS: "text-indigo-700 bg-indigo-50",
    LIKES: "text-pink-700 bg-pink-50",
    SHARES: "text-sky-700 bg-sky-50",
    SAVES: "text-violet-700 bg-violet-50",
    REPOSTS: "text-cyan-700 bg-cyan-50",
    COMMENTS: "text-emerald-700 bg-emerald-50",
  };

  const statusKind: Record<string, any> = {
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
    processing: "running",
    queued: "warning",
    pending: "pending",
    paused: "paused",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider">
            <th className="pb-2 pr-3 font-medium">Type</th>
            <th className="pb-2 pr-3 font-medium">Qty</th>
            <th className="pb-2 pr-3 font-medium">Scheduled</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 pr-3 font-medium">SMM ID</th>
            <th className="pb-2 font-medium">Executed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((run, index) => {
            const safeRun = run || {};
            const scheduledTime = safeRun.time ? new Date(safeRun.time) : null;
            const executedTime = safeRun.executedAt ? new Date(safeRun.executedAt) : null;
            const isCompleted = safeRun.status === "completed";
            const quantity = typeof safeRun.quantity === "number" ? safeRun.quantity : 0;
            const runLabel = safeRun.label || "UNKNOWN";

            return (
              <tr key={`${safeRun.id ?? index}-${index}`} className="hover:bg-slate-50">
                <td className="py-2 pr-3">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${labelColors[runLabel] || "text-slate-600 bg-slate-100"}`}>
                    {runLabel}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-900 font-mono tabular-nums">{quantity.toLocaleString()}</td>
                <td className="py-2 pr-3 text-slate-600">
                  {scheduledTime && !isNaN(scheduledTime.getTime()) ? (
                    <span title={scheduledTime.toLocaleString()}>
                      {scheduledTime.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      <span className="block text-[10px] text-slate-400">{scheduledTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <StatusPill kind={statusKind[safeRun.status] || "pending"} className="capitalize">
                    {safeRun.status || "pending"}
                  </StatusPill>
                  {safeRun.error && (
                    <span className="block text-rose-600 text-[10px] mt-0.5 max-w-[150px] truncate" title={safeRun.error}>
                      {safeRun.error}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {isCompleted && safeRun.smmOrderId ? (
                    <span className="font-mono text-emerald-600">#{safeRun.smmOrderId}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2">
                  {executedTime && !isNaN(executedTime.getTime()) ? (
                    <span className="text-slate-600 text-[11px]">
                      {executedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersPage({
  orders,
  notice,
  controllingOrderId,
  onControlOrder,
  onCloneOrder,
  onDismissNotice,
}: OrdersPageProps) {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("rows");
  const [activeTab, setActiveTab] = useState<TabType>("running");
  const [openedGroupId, setOpenedGroupId] = useState<string | null>(null);
  const openedGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    openedGroupIdRef.current = openedGroupId;
  }, [openedGroupId]);

  function getProgress(order: CreatedOrder) {
    const safeRuns = order.runs || [];
    const totalRuns = safeRuns.length;
    if (totalRuns === 0) return { percent: 0, completed: 0, total: 0 };
    const statusCompleted = (order.runStatuses || []).filter((s) => s === "completed").length;
    const completed = Math.min(totalRuns, Math.max(order.completedRuns || 0, statusCompleted));
    return {
      percent: Math.round((completed / totalRuns) * 100),
      completed,
      total: totalRuns,
    };
  }

  function getGroupProgress(group: GroupedOrder) {
    let completedCount = 0;
    let totalCount = 0;
    group.orders.forEach((order) => {
      const progress = getProgress(order);
      completedCount += progress.completed;
      totalCount += progress.total;
    });
    return {
      percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      completed: completedCount,
      total: totalCount,
    };
  }

  function getGroupStatus(group: GroupedOrder): string {
    const statuses = group.orders.map((o) => getRealStatus(o));
    if (statuses.every((s) => s === "cancelled" || s === "failed")) return "cancelled";
    if (statuses.every((s) => s === "completed")) return "completed";
    if (statuses.every((s) => s === "scheduled")) return "scheduled";
    if (statuses.some((s) => s === "failed")) return "failed";
    if (statuses.some((s) => s === "paused")) return "paused";
    if (statuses.some((s) => s === "running")) return "running";
    return "running";
  }

  function getGroupCategory(group: GroupedOrder): TabType {
    const status = getGroupStatus(group);
    if (status === "cancelled" || status === "failed") return "cancelled";
    if (status === "completed") return "completed";
    if (status === "scheduled") return "scheduled";
    return "running";
  }

  function toShortLink(link: string) {
    if (!link || typeof link !== "string") return "—";
    return link.length > 48 ? `${link.slice(0, 30)}…${link.slice(-12)}` : link;
  }

  const groupedOrders = useMemo(() => {
    const groups: Map<string, GroupedOrder> = new Map();
    orders.forEach((order) => {
      const groupKey = order.batchId || order.id;
      if (groups.has(groupKey)) {
        const existing = groups.get(groupKey)!;
        existing.orders.push(order);
        existing.totalViews += order.totalViews;
        existing.linksCount += 1;
      } else {
        groups.set(groupKey, {
          id: groupKey,
          batchId: order.batchId || null,
          name: order.name,
          orders: [order],
          isBatch: !!order.batchId,
          totalViews: order.totalViews,
          linksCount: 1,
          createdAt: order.createdAt,
        });
      }
    });
    groups.forEach((group) => {
      group.orders.sort((a, b) => (a.batchIndex || 0) - (b.batchIndex || 0));
    });
    return Array.from(groups.values());
  }, [orders]);

  const categorizedGroups = useMemo(() => {
    const running: GroupedOrder[] = [];
    const completed: GroupedOrder[] = [];
    const scheduled: GroupedOrder[] = [];
    const cancelled: GroupedOrder[] = [];

    groupedOrders.forEach((group) => {
      const category = getGroupCategory(group);
      if (category === "running") running.push(group);
      else if (category === "completed") completed.push(group);
      else if (category === "scheduled") scheduled.push(group);
      else if (category === "cancelled") cancelled.push(group);
    });

    running.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    completed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    scheduled.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    cancelled.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { running, completed, scheduled, cancelled };
  }, [groupedOrders]);

  const filteredGroups = useMemo(() => {
    const groupsForTab = categorizedGroups[activeTab];
    const value = query.trim().toLowerCase();
    if (!value) return groupsForTab;
    return groupsForTab.filter(
      (group) =>
        group.name.toLowerCase().includes(value) ||
        group.orders.some(
          (order) =>
            order.link.toLowerCase().includes(value) ||
            order.id.toLowerCase().includes(value)
        )
    );
  }, [categorizedGroups, activeTab, query]);

  const openedGroup = useMemo(
    () => groupedOrders.find((group) => group.id === openedGroupId) ?? null,
    [groupedOrders, openedGroupId]
  );

  useEffect(() => {
    if (!openedGroupId) return;
    const stillExists = groupedOrders.some((group) => group.id === openedGroupId);
    if (!stillExists) setOpenedGroupId(null);
  }, [groupedOrders, openedGroupId]);

  function ProgressBar({ percent }: { percent: number }) {
    return (
      <div className="w-full h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            percent === 100 ? "bg-emerald-500" : percent > 50 ? "bg-indigo-500" : "bg-amber-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  }

  const stats = [
    { label: "Active", count: categorizedGroups.running.length, kind: "running" as const },
    { label: "Scheduled", count: categorizedGroups.scheduled.length, kind: "scheduled" as const },
    { label: "Completed", count: categorizedGroups.completed.length, kind: "completed" as const },
    { label: "Cancelled", count: categorizedGroups.cancelled.length, kind: "cancelled" as const },
  ];

  const tabCounts: Record<TabType, number> = {
    running: categorizedGroups.running.length,
    scheduled: categorizedGroups.scheduled.length,
    completed: categorizedGroups.completed.length,
    cancelled: categorizedGroups.cancelled.length,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <SectionHeader
        eyebrow="Management"
        title="Orders"
        description="Track, pause, resume, or cancel your campaigns."
        actions={
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="flex h-2 w-2 relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
            </span>
            <span>Live monitoring</span>
          </div>
        }
      />

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} padding="md" className="text-center">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{stat.count}</p>
            <div className="mt-2">
              <StatusPill kind={stat.kind} dot={false}>
                {stat.count > 0 ? "Active" : "None"}
              </StatusPill>
            </div>
          </Card>
        ))}
      </div>

      {/* Notice */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <InfoBanner kind="success" title={notice}>
              <button onClick={onDismissNotice} className="text-emerald-700 font-medium hover:underline ml-1 text-xs">Dismiss</button>
            </InfoBanner>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs & Controls */}
      <Card padding="md">
        <div className="flex flex-col gap-3">
          <Tabs tabs={TABS} active={activeTab} onChange={(k) => setActiveTab(k as TabType)} counts={tabCounts} />

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search missions..."
                className="pl-10"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("rows")}
                className={`rounded-md px-2.5 py-1.5 text-sm transition ${
                  viewMode === "rows" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
                title="Table view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("columns")}
                className={`rounded-md px-2.5 py-1.5 text-sm transition ${
                  viewMode === "columns" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
                title="Grid view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {query && (
        <p className="text-sm text-slate-600">
          Found <span className="font-semibold text-slate-900">{filteredGroups.length}</span> mission{filteredGroups.length !== 1 ? "s" : ""} matching "<span className="font-medium text-indigo-600">{query}</span>"
        </p>
      )}

      {/* Orders Display */}
      {filteredGroups.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
          title={
            activeTab === "running" ? "No active missions" :
            activeTab === "completed" ? "No completed missions" :
            activeTab === "scheduled" ? "No scheduled missions" :
            "No cancelled missions"
          }
          description={
            activeTab === "running" ? "Missions in progress will appear here" :
            activeTab === "completed" ? "Finished missions will appear here" :
            activeTab === "scheduled" ? "Future missions will appear here" :
            "Cancelled or failed missions will appear here"
          }
        />
      ) : viewMode === "rows" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-4 py-3 font-semibold">Mission</th>
                  <th className="hidden sm:table-cell px-4 py-3 font-semibold">Link</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden md:table-cell px-4 py-3 font-semibold w-48">Progress</th>
                  <th className="hidden sm:table-cell px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGroups.map((group) => {
                  const progress = getGroupProgress(group);
                  const status = getGroupStatus(group);
                  return (
                    <tr
                      key={group.id}
                      onClick={() => setOpenedGroupId(group.id)}
                      className="cursor-pointer hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">
                            {group.name || `Mission #${group.id.slice(0, 8)}`}
                          </p>
                          {group.isBatch && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              Batch · {group.linksCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 max-w-[200px]">
                        {group.isBatch ? (
                          <p className="text-slate-500 text-xs">{group.linksCount} links</p>
                        ) : (
                          <p className="truncate text-slate-600 text-xs font-mono" title={group.orders[0]?.link}>
                            {toShortLink(group.orders[0]?.link || "")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill kind={status as any} className="capitalize">{status}</StatusPill>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div className="flex items-center justify-between mb-1 text-xs">
                          <span className="text-slate-500 tabular-nums">{progress.completed}/{progress.total}</span>
                          <span className="text-slate-700 font-semibold tabular-nums">{progress.percent}%</span>
                        </div>
                        <ProgressBar percent={progress.percent} />
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-slate-600 text-xs">
                        {new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        <span className="block text-slate-400 text-[10px]">{new Date(group.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredGroups.map((group) => (
            <OrderCard
              key={group.id}
              order={group.orders[0]}
              onControl={onControlOrder}
              onClone={onCloneOrder}
              controlBusy={controllingOrderId === group.orders[0].id}
            />
          ))}
        </div>
      )}

      {/* Detail Popup */}
      <AnimatePresence>
        {openedGroup && (
          openedGroup.isBatch ? (
            <BatchDetailPopup
              group={openedGroup}
              controllingOrderId={controllingOrderId}
              onClose={() => setOpenedGroupId(null)}
              onControl={onControlOrder}
              onClone={onCloneOrder}
            />
          ) : (
            <OrderDetailPopup
              order={openedGroup.orders[0]}
              controllingOrderId={controllingOrderId}
              onClose={() => setOpenedGroupId(null)}
              onControl={onControlOrder}
              onClone={onCloneOrder}
            />
          )
        )}
      </AnimatePresence>
    </div>
  );
}

// ============ ORDER DETAIL POPUP ============

function OrderDetailPopup({
  order,
  controllingOrderId,
  onClose,
  onControl,
  onClone,
}: {
  order: CreatedOrder;
  controllingOrderId: string | null;
  onClose: () => void;
  onControl: (order: CreatedOrder, action: "pause" | "resume" | "cancel") => void;
  onClone: (order: CreatedOrder) => void;
}) {
  const status = getRealStatus(order);
  const progress = (() => {
    const safeRuns = order.runs || [];
    const totalRuns = safeRuns.length;
    if (totalRuns === 0) return { percent: 0, completed: 0, total: 0 };
    const statusCompleted = (order.runStatuses || []).filter((s) => s === "completed").length;
    const completed = Math.min(totalRuns, Math.max(order.completedRuns || 0, statusCompleted));
    return {
      percent: Math.round((completed / totalRuns) * 100),
      completed,
      total: totalRuns,
    };
  })();

  const isControlling = controllingOrderId === order.id;
  const isCancelled = status === "cancelled" || status === "failed";
  const hasBackendRuns = order.backendRuns && order.backendRuns.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="w-full sm:max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-slate-900 truncate">
                {order.name || "Mission Details"}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 font-mono">{order.id}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{(order.totalViews / 1000).toFixed(0)}k</p>
              <p className="text-xs text-slate-500 mt-1">Views</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{progress.completed}/{progress.total}</p>
              <p className="text-xs text-slate-500 mt-1">Runs</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{progress.percent}%</p>
              <p className="text-xs text-slate-500 mt-1">Done</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 flex items-center justify-center">
              <StatusPill kind={status as any} className="capitalize">{status}</StatusPill>
            </div>
          </div>

          <div className="mt-4">
            <div className="w-full h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.percent === 100 ? "bg-emerald-500" : progress.percent > 50 ? "bg-indigo-500" : "bg-amber-500"
                }`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!isCancelled && status === "running" && (
              <Button size="sm" variant="secondary" disabled={isControlling} onClick={() => onControl(order, "pause")}>
                {isControlling ? "..." : "Pause"}
              </Button>
            )}
            {!isCancelled && status === "paused" && (
              <Button size="sm" variant="success" disabled={isControlling} onClick={() => onControl(order, "resume")}>
                {isControlling ? "..." : "Resume"}
              </Button>
            )}
            {!isCancelled && status !== "completed" && (
              <Button size="sm" variant="danger" disabled={isControlling} onClick={() => {
                if (window.confirm("Cancel this mission?")) onControl(order, "cancel");
              }}>
                {isControlling ? "..." : "Cancel"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onClone(order)}>Clone</Button>
            {order.link && (
              <a href={order.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                Open link
              </a>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Run table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">
                Run schedule
                {hasBackendRuns && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                )}
              </h4>
              <span className="text-xs text-slate-500 tabular-nums">{progress.completed} completed</span>
            </div>
            {hasBackendRuns ? (
              <BackendRunTable runs={order.backendRuns!} />
            ) : order.runs && order.runs.length > 0 ? (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Views</th>
                      <th className="px-3 py-2 font-medium">Likes</th>
                      <th className="px-3 py-2 font-medium">Shares</th>
                      <th className="px-3 py-2 font-medium">Saves</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.runs.map((run, i) => {
                      const rawTime = run?.at instanceof Date ? run.at : new Date(run?.at ?? "");
                      const runTime = isNaN(rawTime.getTime()) ? null : rawTime;
                      const runStatus = order.runStatuses?.[i] || "pending";
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {runTime ? (
                              <>
                                {runTime.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                <span className="block text-[10px] text-slate-400">{runTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-900 font-semibold tabular-nums">{(run?.views || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{run?.likes || 0}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{run?.shares || 0}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{run?.saves || 0}</td>
                          <td className="px-3 py-2">
                            <StatusPill kind={runStatus as any} className="capitalize">{runStatus}</StatusPill>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm text-slate-500">No run data available.</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">API</p>
              <p className="font-medium text-slate-900">{order.selectedAPI || "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">Bundle</p>
              <p className="font-medium text-slate-900">{order.selectedBundle || "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">Pattern</p>
              <p className="font-medium text-slate-900">{order.patternName || "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">Created</p>
              <p className="font-medium text-slate-900">
                {(() => {
                  const d = order.createdAt ? new Date(order.createdAt) : null;
                  return d && !isNaN(d.getTime()) ? d.toLocaleDateString() : "—";
                })()}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============ BATCH DETAIL POPUP ============

function BatchDetailPopup({
  group,
  controllingOrderId,
  onClose,
  onControl,
  onClone,
}: {
  group: GroupedOrder;
  controllingOrderId: string | null;
  onClose: () => void;
  onControl: (order: CreatedOrder, action: "pause" | "resume" | "cancel") => void;
  onClone: (order: CreatedOrder) => void;
}) {
  const overallProgress = (() => {
    let completedCount = 0;
    let totalCount = 0;
    group.orders.forEach((order) => {
      const safeRuns = order.runs || [];
      const statusCompleted = (order.runStatuses || []).filter((s) => s === "completed").length;
      completedCount += Math.min(safeRuns.length, Math.max(order.completedRuns || 0, statusCompleted));
      totalCount += safeRuns.length;
    });
    return {
      percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      completed: completedCount,
      total: totalCount,
    };
  })();

  const overallStatus = (() => {
    const statuses = group.orders.map((o) => getRealStatus(o));
    if (statuses.every((s) => s === "cancelled" || s === "failed")) return "cancelled";
    if (statuses.every((s) => s === "completed")) return "completed";
    if (statuses.every((s) => s === "scheduled")) return "scheduled";
    if (statuses.some((s) => s === "failed")) return "failed";
    if (statuses.some((s) => s === "paused")) return "paused";
    if (statuses.some((s) => s === "running")) return "running";
    return "running";
  })();

  const isCancelled = overallStatus === "cancelled" || overallStatus === "failed";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="w-full sm:max-w-4xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-slate-900 truncate">{group.name}</h3>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                  Batch · {group.linksCount} links
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 font-mono">{group.batchId || group.id}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{group.linksCount}</p>
              <p className="text-xs text-slate-500 mt-1">Links</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{(group.totalViews / 1000).toFixed(0)}k</p>
              <p className="text-xs text-slate-500 mt-1">Views</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{overallProgress.completed}/{overallProgress.total}</p>
              <p className="text-xs text-slate-500 mt-1">Runs</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 flex flex-col items-center justify-center">
              <StatusPill kind={overallStatus as any} className="capitalize">{overallStatus}</StatusPill>
            </div>
          </div>

          {!isCancelled && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const runningCount = group.orders.filter((o) => getRealStatus(o) === "running").length;
                if (runningCount > 0 && window.confirm(`Pause ALL ${runningCount} running orders?`)) {
                  group.orders.forEach((order) => {
                    if (getRealStatus(order) === "running") onControl(order, "pause");
                  });
                }
              }}>
                Pause all
              </Button>
              <Button size="sm" variant="success" onClick={() => {
                const pausedCount = group.orders.filter((o) => getRealStatus(o) === "paused").length;
                if (pausedCount > 0 && window.confirm(`Resume ALL ${pausedCount} paused orders?`)) {
                  group.orders.forEach((order) => {
                    if (getRealStatus(order) === "paused") onControl(order, "resume");
                  });
                }
              }}>
                Resume all
              </Button>
              <Button size="sm" variant="danger" onClick={() => {
                const activeCount = group.orders.filter(
                  (o) => !["completed", "cancelled", "failed"].includes(getRealStatus(o))
                ).length;
                if (activeCount > 0 && window.confirm(`Cancel ALL ${activeCount} active orders?`)) {
                  group.orders.forEach((order) => {
                    const status = getRealStatus(order);
                    if (status !== "completed" && status !== "cancelled" && status !== "failed") {
                      onControl(order, "cancel");
                    }
                  });
                }
              }}>
                Cancel all
              </Button>
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Individual links ({group.orders.length})</h4>
          <div className="space-y-3">
            {group.orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onControl={onControl}
                onClone={onClone}
                controlBusy={controllingOrderId === order.id}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
