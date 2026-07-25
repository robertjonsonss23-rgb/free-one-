import { useState, useMemo } from "react";
import type { CreatedOrder } from "../types/order";
import { Card, StatCard, StatusPill, SectionHeader, EmptyState, Tabs } from "../components/ui";

interface DashboardPageProps {
  orders: CreatedOrder[];
}

type TimePeriod = "today" | "week" | "month" | "all";

const PERIOD_TABS = [
  { key: "today" as const, label: "Today" },
  { key: "week" as const, label: "7 Days" },
  { key: "month" as const, label: "30 Days" },
  { key: "all" as const, label: "All Time" },
];

export function DashboardPage({ orders }: DashboardPageProps) {
  const [period, setPeriod] = useState<TimePeriod>("all");

  function getRealStatus(order: CreatedOrder): string {
    const runs = order.runs || [];
    const now = Date.now();

    if (runs.length > 0) {
      const allFuture = runs.every((run) => {
        const runTime = run?.at instanceof Date ? run.at.getTime() : new Date(run?.at ?? now).getTime();
        return runTime > now;
      });
      if (allFuture && order.status !== "cancelled" && order.status !== "paused") {
        return "scheduled";
      }
    }

    if (runs.length > 0) {
      const allCompleted = runs.every((run) => {
        const runTime = run?.at instanceof Date ? run.at.getTime() : new Date(run?.at ?? now).getTime();
        return runTime <= now;
      });
      if (allCompleted) return "completed";
    }

    if (order.status === "processing") return "running";
    if (order.status === "pending") return "running";

    return order.status;
  }

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      if (period === "today") return orderDate >= todayStart;
      if (period === "week") return orderDate >= weekStart;
      if (period === "month") return orderDate >= monthStart;
      return true;
    });
  }, [orders, period]);

  const stats = useMemo(() => {
    const total = filteredOrders.length;

    const running = filteredOrders.filter((o) => {
      const realStatus = getRealStatus(o);
      return realStatus === "running" || realStatus === "processing" || realStatus === "paused";
    }).length;

    const completed = filteredOrders.filter((o) => {
      const realStatus = getRealStatus(o);
      return realStatus === "completed";
    }).length;

    const failed = filteredOrders.filter((o) => {
      const realStatus = getRealStatus(o);
      return realStatus === "failed" || realStatus === "cancelled";
    }).length;

    const scheduled = filteredOrders.filter((o) => {
      const realStatus = getRealStatus(o);
      return realStatus === "scheduled";
    }).length;

    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, running, completed, failed, scheduled, successRate };
  }, [filteredOrders]);

  const servicesBreakdown = useMemo(() => {
    let views = 0;
    let likes = 0;
    let shares = 0;
    let saves = 0;
    let reposts = 0;

    filteredOrders.forEach((order) => {
      (order.runs || []).forEach((run) => {
        views += run.views || 0;
        likes += run.likes || 0;
        shares += run.shares || 0;
        saves += run.saves || 0;
        reposts += run.reposts || 0;
      });
    });

    const total = views + likes + shares + saves + reposts;
    return {
      views: { count: views, percent: total > 0 ? Math.round((views / total) * 100) : 0 },
      likes: { count: likes, percent: total > 0 ? Math.round((likes / total) * 100) : 0 },
      shares: { count: shares, percent: total > 0 ? Math.round((shares / total) * 100) : 0 },
      saves: { count: saves, percent: total > 0 ? Math.round((saves / total) * 100) : 0 },
      reposts: { count: reposts, percent: total > 0 ? Math.round((reposts / total) * 100) : 0 },
      total,
    };
  }, [filteredOrders]);

  const chartData = useMemo(() => {
    const days: { label: string; count: number; date: Date }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = orders.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= dayStart && orderDate < dayEnd;
      }).length;

      days.push({
        label: date.toLocaleDateString("en", { weekday: "short" }),
        count,
        date: dayStart,
      });
    }

    const maxCount = Math.max(...days.map((d) => d.count), 1);
    return { days, maxCount };
  }, [orders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [orders]);

  const periodLabel = {
    today: "Today",
    week: "Last 7 days",
    month: "Last 30 days",
    all: "All time",
  }[period];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      {/* Header */}
      <SectionHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Monitor your campaigns and engagement metrics."
        actions={
          <Tabs
            tabs={PERIOD_TABS}
            active={period}
            onChange={(key) => setPeriod(key as TimePeriod)}
          />
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Orders"
          value={stats.total}
          hint={periodLabel}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
          tone="brand"
        />
        <StatCard
          label="Active"
          value={stats.running}
          hint={stats.running > 0 ? "In progress" : "None active"}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          tone="info"
        />
        <StatCard
          label="Scheduled"
          value={stats.scheduled}
          hint="Awaiting deploy"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          tone="neutral"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          hint="Successfully delivered"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          tone="success"
        />
      </div>

      {/* Success rate + failed row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card padding="md" className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Success rate</p>
              <p className="text-xs text-slate-500 mt-0.5">Completed vs total orders</p>
            </div>
            <p className={`text-3xl font-bold ${
              stats.successRate >= 70 ? "text-emerald-600" :
              stats.successRate >= 40 ? "text-amber-600" : "text-rose-600"
            }`}>
              {stats.successRate}%
            </p>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                stats.successRate >= 70 ? "bg-emerald-500" :
                stats.successRate >= 40 ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{ width: `${stats.successRate}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span><span className="font-semibold text-emerald-600">{stats.completed}</span> completed</span>
            <span><span className="font-semibold text-rose-600">{stats.failed}</span> failed</span>
          </div>
        </Card>

        <Card padding="md">
          <p className="text-sm font-medium text-slate-700">Failed</p>
          <p className="text-xs text-slate-500 mt-0.5">Needs attention</p>
          <p className="mt-3 text-3xl font-bold text-rose-600">{stats.failed}</p>
          {stats.failed > 0 && (
            <p className="mt-2 text-xs text-rose-600 font-medium">Review cancelled or rejected orders</p>
          )}
        </Card>
      </div>

      {/* Activity + Services breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700">Activity</p>
            <p className="text-xs text-slate-500 mt-0.5">Orders created in the last 7 days</p>
          </div>
          {chartData.days.every((d) => d.count === 0) ? (
            <div className="h-40 flex items-center justify-center text-sm text-slate-500">
              No activity in the last 7 days
            </div>
          ) : (
            <div className="flex h-40 items-end justify-between gap-2">
              {chartData.days.map((day, index) => {
                const height = chartData.maxCount > 0 ? (day.count / chartData.maxCount) * 100 : 0;
                const isToday = index === chartData.days.length - 1;
                return (
                  <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{day.count}</span>
                    <div className="relative w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          isToday ? "bg-indigo-500" : "bg-slate-200"
                        }`}
                        style={{ height: `${Math.max(height, 6)}%` }}
                      />
                    </div>
                    <span className={`text-xs ${isToday ? "text-indigo-600 font-semibold" : "text-slate-500"}`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card padding="md">
          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700">Engagement breakdown</p>
            <p className="text-xs text-slate-500 mt-0.5">Total interactions delivered</p>
          </div>
          <div className="space-y-3">
            {[
              { label: "Views", data: servicesBreakdown.views, color: "bg-indigo-500" },
              { label: "Likes", data: servicesBreakdown.likes, color: "bg-pink-500" },
              { label: "Shares", data: servicesBreakdown.shares, color: "bg-sky-500" },
              { label: "Saves", data: servicesBreakdown.saves, color: "bg-violet-500" },
              { label: "Reposts", data: servicesBreakdown.reposts, color: "bg-cyan-500" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-700">{item.label}</span>
                  <span className="text-slate-500 tabular-nums">
                    {item.data.count.toLocaleString()} <span className="text-slate-400">({item.data.percent}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                    style={{ width: `${item.data.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-600">Total engagement</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              {servicesBreakdown.total.toLocaleString()}
            </span>
          </div>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-900">Recent orders</p>
            <p className="text-xs text-slate-500 mt-0.5">Last 5 orders</p>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              title="No orders yet"
              description="Once you create your first campaign, it will appear here."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {recentOrders.map((order) => {
              const realStatus = getRealStatus(order);
              const statusKind = realStatus as any;
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {order.name || `Order #${order.id.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(order.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" · "}
                        {order.runs?.length || 0} runs
                      </p>
                    </div>
                  </div>
                  <StatusPill kind={statusKind} className="capitalize">
                    {realStatus}
                  </StatusPill>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Quick stats footer */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card padding="md" className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Avg Runs / Mission</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {filteredOrders.length > 0
              ? Math.round(filteredOrders.reduce((sum, o) => sum + (o.runs?.length || 0), 0) / filteredOrders.length)
              : 0}
          </p>
        </Card>
        <Card padding="md" className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Total Runs</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {filteredOrders.reduce((sum, o) => sum + (o.runs?.length || 0), 0)}
          </p>
        </Card>
        <Card padding="md" className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Completed Runs</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600 tabular-nums">
            {filteredOrders.reduce((sum, o) => sum + (o.completedRuns || 0), 0)}
          </p>
        </Card>
      </div>
    </div>
  );
}
