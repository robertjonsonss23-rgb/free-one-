import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CreatedOrder, OrderStatus } from "../types/order";
import { RunTable } from "./RunTable";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card, Button, StatusPill } from "./ui";

interface OrderCardProps {
  order: CreatedOrder;
  onControl: (order: CreatedOrder, action: "pause" | "resume" | "cancel") => void;
  onClone: (order: CreatedOrder) => void;
  controlBusy: boolean;
}

const STATUS_KINDS: Record<OrderStatus, any> = {
  running: "running",
  paused: "paused",
  cancelled: "cancelled",
  completed: "completed",
  processing: "running",
  failed: "failed",
  pending: "pending",
};

export function OrderCard({ order, onControl, onClone, controlBusy }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const safeRuns = order?.runs || [];
  const safeRunStatuses = order?.runStatuses || [];
  const safeRunErrors = order?.runErrors || [];
  const finishTime = safeRuns[safeRuns.length - 1]?.at;
  const safeLink = order?.link || "";

  const { totalRuns, completedRuns, progressPercent } = useMemo(() => {
    const nextTotalRuns = Math.max(1, safeRuns.length);
    const completedFromStatuses = safeRunStatuses.filter(
      (status) => status === "completed"
    ).length;
    const nextCompletedRuns =
      order.status === "completed"
        ? nextTotalRuns
        : Math.min(nextTotalRuns, completedFromStatuses);
    const nextProgressPercent = Math.round(
      (nextCompletedRuns / nextTotalRuns) * 100
    );
    return {
      totalRuns: nextTotalRuns,
      completedRuns: nextCompletedRuns,
      progressPercent: nextProgressPercent,
    };
  }, [safeRuns, safeRunStatuses, order.status]);

  const effectiveStatus = useMemo((): OrderStatus => {
    if (order.status === "processing") return "running";
    if (order.status === "completed") return "completed";
    if (order.status === "cancelled") return "cancelled";
    if (order.status === "failed") return "failed";
    if (order.status === "paused") return "paused";
    if (order.status === "pending") return "pending";
    return order.status;
  }, [order.status]);

  const plannedData = useMemo(() => {
    const runs = order?.runs || [];
    if (runs.length === 0) return [];

    const hasCumulative = runs.some((r) => (r.cumulativeViews || 0) > 0);

    const parseTime = (value: Date | string | number | undefined): Date | null => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      return isNaN(d.getTime()) ? null : d;
    };

    if (hasCumulative) {
      return runs
        .map((run) => {
          const time = parseTime(run.at);
          if (!time) return null;
          return {
            time: time.getTime(),
            views: run.cumulativeViews || 0,
            likes: (run.cumulativeLikes || 0) * 10,
            shares: (run.cumulativeShares || 0) * 10,
            saves: (run.cumulativeSaves || 0) * 10,
            comments: (run.cumulativeComments || 0) * 10,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
    }

    let cv = 0, cl = 0, cs = 0, csa = 0, cc = 0;
    return runs
      .map((run) => {
        const time = parseTime(run.at);
        if (!time) return null;
        cv += Number(run.views || 0);
        cl += Number(run.likes || 0);
        cs += Number(run.shares || 0);
        csa += Number(run.saves || 0);
        cc += Number(run.comments || 0);
        return {
          time: time.getTime(),
          views: cv,
          likes: cl * 10,
          shares: cs * 10,
          saves: csa * 10,
          comments: cc * 10,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [order?.runs]);

  const shortLink =
    safeLink.length > 56
      ? `${safeLink.slice(0, 36)}…${safeLink.slice(-14)}`
      : safeLink;

  const formatDate = (value: Date | string | number | undefined) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const handleControl = async (action: "pause" | "resume" | "cancel") => {
    try {
      if (action === "cancel") {
        const confirmCancel = window.confirm("Are you sure you want to cancel this mission?");
        if (!confirmCancel) return;
      }
      onControl(order, action);
    } catch (err) {
      console.error("Control action failed", err);
      alert("Action failed. Please try again.");
    }
  };

  return (
    <Card padding="md" className="space-y-4">
      {/* Top section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Mission</p>
          <h3 className="text-base font-semibold text-slate-900">
            {order.name || `Mission #${order.id.slice(0, 8)}`}
          </h3>
          <p className="text-xs text-slate-500 truncate max-w-full" title={safeLink || undefined}>
            {shortLink || "No link provided"}
          </p>
          {order?.schedulerOrderId && (
            <p className="text-[10px] text-slate-400 font-mono">ID: {order.schedulerOrderId}</p>
          )}
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1">
          <StatusPill kind={STATUS_KINDS[effectiveStatus]} className="capitalize">
            {effectiveStatus}
          </StatusPill>
          {finishTime && (
            <p className="text-xs text-slate-500">
              ETA: {formatDate(finishTime)}
            </p>
          )}
          <p className="text-[10px] text-slate-400">
            Updated {formatDate(order.lastUpdatedAt || order.createdAt)}
          </p>
        </div>
      </div>

      {order.errorMessage && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {order.errorMessage}
        </div>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
          <span>Progress</span>
          <span className="font-semibold text-slate-900 tabular-nums">{progressPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercent === 100 ? "bg-emerald-500" : progressPercent > 50 ? "bg-indigo-500" : "bg-amber-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {completedRuns} / {totalRuns} runs completed
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Views", value: `${(order.totalViews / 1000).toFixed(0)}k`, color: "text-indigo-600" },
          { label: "Likes", value: order.engagement.likes, color: "text-pink-600" },
          { label: "Shares", value: order.engagement.shares, color: "text-sky-600" },
          { label: "Saves", value: order.engagement.saves, color: "text-violet-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-md bg-slate-50 px-3 py-2">
            <p className={`text-base font-bold ${s.color} tabular-nums`}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Graph */}
      {plannedData.length > 0 && (
        <div className="h-36 sm:h-44 w-full -mx-1">
          <ErrorBoundary>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plannedData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="#cbd5e1"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(time) => {
                    if (!Number.isFinite(time)) return "";
                    const d = new Date(time);
                    if (isNaN(d.getTime())) return "";
                    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#cbd5e1"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  width={42}
                  tickFormatter={(v) => (Number.isFinite(v) && v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v ?? ""))}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e6e8ec",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "#475569",
                  }}
                  labelFormatter={(label) => {
                    if (!Number.isFinite(label)) return String(label ?? "");
                    const d = new Date(label);
                    return isNaN(d.getTime()) ? String(label) : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  }}
                />
                <Line type="basis" dataKey="views" stroke="#4f46e5" strokeWidth={2} dot={false} name="Views" />
                <Line type="basis" dataKey="likes" stroke="#ec4899" strokeWidth={1.5} dot={false} name="Likes" />
                <Line type="basis" dataKey="shares" stroke="#0ea5e9" strokeWidth={1.5} dot={false} name="Shares" />
                <Line type="basis" dataKey="saves" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Saves" />
                <Line type="basis" dataKey="comments" stroke="#10b981" strokeWidth={1.5} dot={false} name="Comments" />
              </LineChart>
            </ResponsiveContainer>
          </ErrorBoundary>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
        <Button
          size="sm"
          variant="secondary"
          disabled={controlBusy || effectiveStatus !== "running"}
          onClick={() => handleControl("pause")}
        >
          Pause
        </Button>
        <Button
          size="sm"
          variant="success"
          disabled={controlBusy || effectiveStatus !== "paused"}
          onClick={() => handleControl("resume")}
        >
          Resume
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={controlBusy || effectiveStatus === "cancelled" || effectiveStatus === "completed"}
          onClick={() => handleControl("cancel")}
        >
          Cancel
        </Button>
        <Button size="sm" variant="outline" onClick={() => onClone(order)}>
          Clone
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setExpanded((prev) => !prev)}
          className="ml-auto"
        >
          {expanded ? "Hide runs" : `Runs (${totalRuns})`}
        </Button>
      </div>

      {/* Run Table */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <RunTable
                runs={safeRuns}
                runStatuses={safeRunStatuses}
                runErrors={safeRunErrors}
                runRetries={order.runRetries || []}
                runOriginalTimes={order.runOriginalTimes || []}
                runCurrentTimes={order.runCurrentTimes || []}
                runReasons={order.runReasons || []}
                runActualExecutedTimes={order.runActualExecutedTimes || []}
                mode="logs"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
