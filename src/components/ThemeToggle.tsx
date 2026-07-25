import type { Theme } from "../utils/theme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  /** Compact icon-only button, for headers and mobile bars. */
  compact?: boolean;
}

export function ThemeToggle({ theme, onToggle, compact = false }: ThemeToggleProps) {
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const icon = isDark ? (
    // sun
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  ) : (
    // moon
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
    </svg>
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
    >
      {icon}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
