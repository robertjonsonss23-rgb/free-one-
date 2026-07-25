import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DEFAULT_ENGAGEMENT_RATIOS,
  type EngagementRatios,
  type RatioPreset,
} from "../types/order";
import {
  Button,
  Card,
  Input,
  SectionHeader,
  EmptyState,
  InfoBanner,
  StatusPill,
} from "../components/ui";

interface RatiosPageProps {
  activeRatios: EngagementRatios;
  presets: RatioPreset[];
  onSaveActive: (ratios: EngagementRatios) => void;
  onResetActive: () => void;
  onSavePreset: (name: string, ratios: EngagementRatios) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (id: string) => void;
}

type FieldKey = keyof EngagementRatios;

const FIELD_META: { key: FieldKey; label: string; hint: string; emoji: string; color: string }[] = [
  { key: "likes", label: "Likes", hint: "Default 2.5% of views", emoji: "❤️", color: "pink" },
  { key: "shares", label: "Shares", hint: "Default 1.75% of views", emoji: "🔁", color: "sky" },
  { key: "saves", label: "Saves", hint: "Default 0.45% of views", emoji: "🔖", color: "violet" },
  { key: "comments", label: "Comments", hint: "Default 0.05% of views", emoji: "💬", color: "emerald" },
  { key: "reposts", label: "Reposts", hint: "Default 0.85% of views", emoji: "📢", color: "cyan" },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  pink: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
  sky: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  cyan: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
};

function sanitize(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n * 1000) / 1000);
}

export function RatiosPage({
  activeRatios,
  presets,
  onSaveActive,
  onResetActive,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
}: RatiosPageProps) {
  const [draft, setDraft] = useState<EngagementRatios>(activeRatios);
  const [presetName, setPresetName] = useState("");
  const [toast, setToast] = useState<{ kind: "success" | "warning" | "info"; message: string } | null>(null);

  const showToast = (kind: "success" | "warning" | "info", message: string) => {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleField = (key: FieldKey, raw: string) => {
    setDraft((prev) => ({ ...prev, [key]: sanitize(raw) }));
  };

  const handleSaveActive = () => {
    onSaveActive(draft);
    showToast("success", "Active ratios saved. All new orders will use these.");
  };

  const handleResetActive = () => {
    setDraft(DEFAULT_ENGAGEMENT_RATIOS);
    onResetActive();
    showToast("info", "Reset to factory defaults.");
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      showToast("warning", "Enter a preset name first.");
      return;
    }
    onSavePreset(name, draft);
    setPresetName("");
    showToast("success", `Preset "${name}" saved.`);
  };

  const handleApplyPreset = (preset: RatioPreset) => {
    setDraft(preset.ratios);
    onApplyPreset(preset.id);
    showToast("success", `Preset "${preset.name}" loaded and set as active.`);
  };

  const isDirty = (Object.keys(draft) as FieldKey[]).some(
    (k) => draft[k] !== activeRatios[k]
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <SectionHeader
        eyebrow="Engagement"
        title="Engagement Ratios"
        description="Override the default engagement ratios. New orders will use these values."
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <InfoBanner kind={toast.kind}>{toast.message}</InfoBanner>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ratios editor */}
      <Card padding="md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Current draft</h2>
            <p className="text-xs text-slate-500 mt-0.5">Adjust values and save to apply them</p>
          </div>
          <StatusPill kind={isDirty ? "warning" : "success"}>
            {isDirty ? "Unsaved changes" : "In sync"}
          </StatusPill>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_META.map((field) => {
            const colors = COLOR_MAP[field.color];
            return (
              <div
                key={field.key}
                className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition hover:border-slate-300`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{field.emoji}</span>
                  <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={draft[field.key]}
                    onChange={(e) => handleField(field.key, e.target.value)}
                    className="flex-1 text-right font-mono text-sm"
                  />
                  <span className={`text-sm font-bold ${colors.text}`}>%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.05}
                  value={Math.min(draft[field.key], 10)}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>{field.hint}</span>
                  <span className={colors.text}>
                    Active: <span className="font-mono font-semibold">{activeRatios[field.key]}%</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live preview */}
        <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="mb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">
            Preview for a sample of 10,000 views
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {FIELD_META.map((f) => (
              <span key={f.key} className="text-slate-700">
                {f.emoji} {f.label}:{" "}
                <span className={`font-bold tabular-nums ${COLOR_MAP[f.color].text}`}>
                  {Math.max(
                    f.key === "comments" ? 1 : 10,
                    Math.floor(10000 * (draft[f.key] / 100))
                  ).toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="primary" disabled={!isDirty} onClick={handleSaveActive}>
            Save as active
          </Button>
          <Button variant="outline" onClick={handleResetActive} className="text-rose-600 hover:bg-rose-50">
            Reset to defaults
          </Button>
          <Button variant="ghost" disabled={!isDirty} onClick={() => setDraft(activeRatios)}>
            Revert draft
          </Button>
        </div>
      </Card>

      {/* Save as preset */}
      <Card padding="md">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Save as preset</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g. Aggressive growth, Instagram Reels..."
            className="flex-1"
          />
          <Button variant="primary" onClick={handleSavePreset}>
            Save preset
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Presets are saved to your browser. Click any preset below to load and apply instantly.
        </p>
      </Card>

      {/* Preset list */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Saved presets
          <span className="ml-2 text-sm font-normal text-slate-500">({presets.length})</span>
        </h2>
        {presets.length === 0 ? (
          <EmptyState
            icon={
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            }
            title="No presets yet"
            description="Save your favorite ratio combinations for one-click reuse."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presets.map((preset) => (
              <Card key={preset.id} padding="md" hover>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{preset.name}</h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete preset "${preset.name}"?`)) onDeletePreset(preset.id);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-600 transition p-1"
                    aria-label="Delete preset"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  {FIELD_META.map((f) => {
                    const colors = COLOR_MAP[f.color];
                    return (
                      <div key={f.key} className="flex items-center justify-between">
                        <span className="text-slate-600">
                          {f.emoji} {f.label}
                        </span>
                        <span className={`font-mono font-semibold ${colors.text} tabular-nums`}>
                          {preset.ratios[f.key]}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" size="sm" fullWidth onClick={() => handleApplyPreset(preset)} className="mt-3">
                  Load & activate
                </Button>
                <p className="mt-2 text-[10px] text-slate-500">
                  Saved {new Date(preset.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
