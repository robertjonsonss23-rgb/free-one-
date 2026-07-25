import { useMemo } from "react";
import type { RunStep } from "../types/order";
import { StatusPill } from "./ui";

type ExtendedRunStatus =
  | "pending"
  | "completed"
  | "cancelled"
  | "failed"
  | "retrying"
  | "executing"
  | "timeout";

interface RunTableProps {
  runs: RunStep[];
  runStatuses?: Array<"pending" | "completed" | "cancelled" | "failed" | "retrying">;
  runErrors?: string[];
  runRetries?: number[];
  runOriginalTimes?: string[];
  runCurrentTimes?: string[];
  runReasons?: string[];
  runActualExecutedTimes?: (string | null)[];
  mode?: "schedule" | "logs";
}

const STATUS_KIND: Record<ExtendedRunStatus, any> = {
  completed: "completed",
  pending: "pending",
  retrying: "warning",
  executing: "info",
  cancelled: "cancelled",
  failed: "failed",
  timeout: "warning",
};

export function RunTable({
  runs,
  runStatuses = [],
  runErrors = [],
  runRetries = [],
  runOriginalTimes = [],
  runCurrentTimes = [],
  runReasons = [],
  runActualExecutedTimes = [],
  mode = "logs",
}: RunTableProps) {
  const safeRuns = runs || [];
  const safeRunStatuses = runStatuses || [];
  const safeRunErrors = runErrors || [];
  const safeRunRetries = runRetries || [];
  const safeRunOriginalTimes = runOriginalTimes || [];
  const safeRunCurrentTimes = runCurrentTimes || [];
  const safeRunReasons = runReasons || [];
  const safeRunActualExecutedTimes = runActualExecutedTimes || [];

  const getTimeDisplay = (index: number, originalRunTime: Date) => {
    const originalTime = safeRunOriginalTimes[index];
    const currentTime = safeRunCurrentTimes[index];

    if (originalTime && currentTime) {
      const origDate = new Date(originalTime);
      const currDate = new Date(currentTime);
      const isRescheduled = origDate.getTime() !== currDate.getTime();
      return { original: origDate, current: currDate, isRescheduled };
    }

    return {
      original: originalRunTime,
      current: originalRunTime,
      isRescheduled: false,
    };
  };

  const getStatus = (index: number): ExtendedRunStatus => {
    const status = safeRunStatuses[index];
    const retryCount = safeRunRetries[index] || 0;
    const reason = safeRunReasons[index];

    if (status === "cancelled") return "cancelled";
    if (status === "failed") return "failed";
    if (status === "completed") return "completed";
    if (reason?.toLowerCase().includes("timeout")) return "timeout";
    if (status === "retrying" || retryCount > 0) return "retrying";
    return "pending";
  };

  const formatTime = (date: Date) => {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) {
      const minutes = Math.abs(Math.floor(diff / (1000 * 60)));
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
    }

    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `in ${hours}h`;
  };

  const stats = useMemo(() => {
    return {
      total: safeRuns.length,
      completed: safeRunStatuses.filter((s) => s === "completed").length,
      retrying: safeRunStatuses.filter((s) => s === "retrying").length,
      pending: safeRunStatuses.filter((s) => s === "pending").length,
      cancelled: safeRunStatuses.filter((s) => s === "cancelled").length,
      failed: safeRunStatuses.filter((s) => s === "failed").length,
      totalRetries: safeRunRetries.reduce((sum, r) => sum + (r || 0), 0),
    };
  }, [safeRuns, safeRunStatuses, safeRunRetries]);

  // ============ SCHEDULE MODE ============
  if (mode === "schedule") {
    return (
      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Views</th>
              <th className="px-3 py-2 font-medium">Likes</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Saves</th>
              <th className="px-3 py-2 font-medium">Comments</th>
              <th className="px-3 py-2 font-medium">Reposts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeRuns.map((run) => (
              <tr key={run.run} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-indigo-600 font-medium tabular-nums">#{run.run}</td>
                <td className="px-3 py-2 text-slate-700">
                  {run.at.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2 text-slate-900 font-semibold tabular-nums">{(run.views || 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-slate-700 tabular-nums">{run.likes || 0}</td>
                <td className="px-3 py-2 text-slate-700 tabular-nums">{run.shares || 0}</td>
                <td className="px-3 py-2 text-slate-700 tabular-nums">{run.saves || 0}</td>
                <td className="px-3 py-2 text-slate-700 tabular-nums">{run.comments || 0}</td>
                <td className="px-3 py-2 text-slate-700 tabular-nums">{run.reposts || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ============ LOGS MODE ============
  return (
    <div className="space-y-3">
      {/* Stats summary */}
      {stats.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusPill kind="completed" dot>{stats.completed} completed</StatusPill>
          {stats.retrying > 0 && (
            <StatusPill kind="warning" dot>{stats.retrying} retrying</StatusPill>
          )}
          {stats.pending > 0 && (
            <StatusPill kind="pending" dot>{stats.pending} pending</StatusPill>
          )}
          {stats.cancelled > 0 && (
            <StatusPill kind="cancelled" dot>{stats.cancelled} cancelled</StatusPill>
          )}
          {stats.failed > 0 && (
            <StatusPill kind="failed" dot>{stats.failed} failed</StatusPill>
          )}
          {stats.totalRetries > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stats.totalRetries} total retries
            </span>
          )}
        </div>
      )}

      {/* Main table */}
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 w-12 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 w-20 font-medium">Views</th>
              <th className="px-3 py-2 w-14 font-medium">Likes</th>
              <th className="px-3 py-2 w-16 font-medium">Shares</th>
              <th className="px-3 py-2 w-14 font-medium">Saves</th>
              <th className="px-3 py-2 w-14 font-medium">Cmts</th>
              <th className="px-3 py-2 w-16 font-medium">Reposts</th>
              <th className="px-3 py-2 w-24 font-medium">Status</th>
              <th className="px-3 py-2 w-32 font-medium">Placed At</th>
              <th className="px-3 py-2 font-medium">Info</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeRuns.map((run, index) => {
              const status = getStatus(index);
              const retryCount = safeRunRetries[index] || 0;
              const error = safeRunErrors[index];
              const reason = safeRunReasons[index];
              const timeData = getTimeDisplay(index, run.at);
              const rowBg =
                status === "completed" ? "bg-emerald-50/40" :
                status === "failed" ? "bg-rose-50/40" :
                status === "cancelled" ? "bg-slate-50/40" :
                status === "retrying" ? "bg-amber-50/40" : "";

              return (
                <tr key={run.run} className={`hover:bg-slate-50 align-top ${rowBg}`}>
                  <td className="px-3 py-2 font-medium text-indigo-600 tabular-nums">#{run.run}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">
                      {formatTime(run.at)}
                      <span className="ml-1 text-slate-500 text-[10px]">
                        ({formatRelativeTime(run.at)})
                      </span>
                    </div>
                    {timeData.isRescheduled && (
                      <div className="text-[10px] text-amber-600 mt-0.5">
                        Rescheduled from {formatTime(timeData.original)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-900 font-semibold tabular-nums">{(run.views || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-700 tabular-nums">{run.likes || 0}</td>
                  <td className="px-3 py-2 text-slate-700 tabular-nums">{run.shares || 0}</td>
                  <td className="px-3 py-2 text-slate-700 tabular-nums">{run.saves || 0}</td>
                  <td className="px-3 py-2 text-slate-700 tabular-nums">{run.comments || 0}</td>
                  <td className="px-3 py-2 text-slate-700 tabular-nums">{run.reposts || 0}</td>
                  <td className="px-3 py-2">
                    <StatusPill kind={STATUS_KIND[status]} className="capitalize">
                      {status}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const actualTime = safeRunActualExecutedTimes[index];
                      if (actualTime) {
                        const actualDate = new Date(actualTime);
                        const scheduledDate = timeData.original;
                        const delayMs = actualDate.getTime() - scheduledDate.getTime();
                        const delayMin = Math.round(delayMs / 60000);
                        const wasDelayed = delayMin > 2;

                        return (
                          <div className="space-y-0.5">
                            <p className={`text-[10px] font-medium ${wasDelayed ? "text-amber-600" : "text-emerald-600"}`}>
                              {actualDate.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {wasDelayed && (
                              <p className="text-[10px] text-amber-600">
                                +{delayMin}m delay{retryCount > 0 ? ` (${retryCount} retries)` : ""}
                              </p>
                            )}
                          </div>
                        );
                      }

                      if (retryCount > 0) {
                        return (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            ↻ retry {retryCount}
                          </span>
                        );
                      }

                      return <span className="text-slate-400">—</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    {reason || error ? (
                      <div className="space-y-0.5">
                        {reason && (
                          <p
                            className={`text-[10px] truncate ${
                              reason.toLowerCase().includes("waiting")
                                ? "text-amber-600"
                                : reason.toLowerCase().includes("timeout")
                                ? "text-orange-600"
                                : reason.toLowerCase().includes("success")
                                ? "text-emerald-600"
                                : "text-slate-600"
                            }`}
                            title={reason}
                          >
                            {reason.length > 40 ? `${reason.slice(0, 40)}…` : reason}
                          </p>
                        )}
                        {error && !reason?.includes(error) && (
                          <p className="text-[10px] text-rose-600 truncate" title={error}>
                            {error.length > 35 ? `${error.slice(0, 35)}…` : error}
                          </p>
                        )}
                      </div>
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

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Status:</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Completed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />Pending</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />Retrying</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Failed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />Cancelled</span>
      </div>
    </div>
  );
}
