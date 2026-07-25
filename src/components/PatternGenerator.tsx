import { AnimatePresence, motion } from "framer-motion";
import type { PatternPlan } from "../types/order";
import { RunTable } from "./RunTable";
import { Card, Button, StatusPill } from "./ui";

interface PatternGeneratorProps {
  plan: PatternPlan;
  expandedRuns: boolean;
  onToggleRuns: () => void;
}

export function PatternGenerator({ plan, expandedRuns, onToggleRuns }: PatternGeneratorProps) {
  const safeRuns = plan?.runs || [];
  const safeFinishTime = plan?.finishTime instanceof Date ? plan.finishTime : new Date();

  const riskKind = plan?.risk === "Safe" ? "success" : plan?.risk === "Medium" ? "warning" : "danger";

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Schedule preview</h2>
          <p className="text-xs text-slate-500 mt-0.5">Pattern: {plan?.patternName || "—"}</p>
        </div>
        <StatusPill kind={riskKind}>{plan?.risk ?? "Safe"}</StatusPill>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Total runs</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{plan?.totalRuns ?? 0}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Interval</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {plan?.approximateIntervalMin ?? 0}
            <span className="text-sm font-medium text-slate-500 ml-0.5">min</span>
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Finish</p>
          <p className="mt-1.5 text-sm font-bold text-slate-900 leading-tight">
            {safeFinishTime.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            <span className="block text-xs font-medium text-slate-500 mt-0.5">
              {safeFinishTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={onToggleRuns}>
          {expandedRuns ? "Hide runs" : `View runs (${safeRuns.length})`}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {expandedRuns && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <RunTable runs={safeRuns} mode="schedule" />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
