import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from "react";

/* ============================================ */
/* BUTTON                                       */
/* ============================================ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm disabled:bg-indigo-300",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:bg-slate-100",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:bg-emerald-300",
  outline:
    "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-lg font-semibold",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon,
    iconRight,
    loading,
    fullWidth,
    className = "",
    children,
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
      {iconRight && !loading && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  );
});

/* ============================================ */
/* CARD                                         */
/* ============================================ */

export interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const CARD_PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export function Card({ children, className = "", hover = false, padding = "md" }: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-xs ${CARD_PADDING[padding]} ${
        hover ? "transition hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-4 ${className}`}>{children}</div>
  );
}

export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`text-base sm:text-lg font-semibold text-slate-900 ${className}`}>{children}</h3>
  );
}

export function CardDescription({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-slate-500 mt-0.5 ${className}`}>{children}</p>;
}

/* ============================================ */
/* STATUS PILL                                  */
/* ============================================ */

export type StatusKind =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand"
  | "running"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "failed"
  | "paused"
  | "pending"
  | "processing"
  | "active"       // ⭐ ADD (used by AdminPage for active keys)
  | "unused"
  | "expired"
  | "revoked"
  | "retrying";    // ⭐ ADD (used by RunTable for retrying runs)

const STATUS_STYLES: Record<StatusKind, { bg: string; text: string; dot: string; pulse?: boolean }> = {
  success: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  danger: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  info: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  neutral: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  brand: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },

  running: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", pulse: true },
  processing: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", pulse: true },
  scheduled: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  cancelled: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  failed: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  paused: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  pending: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },

    // AdminPage key statuses
  active: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  unused: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  expired: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  revoked: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },

  // RunTable retrying status
  retrying: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", pulse: true },
};

export function StatusPill({
  kind,
  children,
  dot = true,
  className = "",
}: {
  kind: StatusKind;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const styles = STATUS_STYLES[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles.bg} ${styles.text} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${styles.dot} ${styles.pulse ? "animate-pulse" : ""}`}
        />
      )}
      {children}
    </span>
  );
}

/* ============================================ */
/* INPUT                                        */
/* ============================================ */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className = "", ...props },
  ref
) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-700">{label}</label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={`${leftIcon ? "pl-9" : ""} ${rightSlot ? "pr-12" : ""} ${className}`}
          {...props}
        />
        {rightSlot && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
});

/* ============================================ */
/* TEXTAREA                                     */
/* ============================================ */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className = "", ...props },
  ref
) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-700">{label}</label>
      )}
      <textarea ref={ref} className={className} {...props} />
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
});

/* ============================================ */
/* SELECT                                       */
/* ============================================ */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className = "", ...props },
  ref
) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-700">{label}</label>
      )}
      <select ref={ref} className={className} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
});

/* ============================================ */
/* EMPTY STATE                                  */
/* ============================================ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 text-2xl">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ============================================ */
/* LOADING SPINNER                              */
/* ============================================ */

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2", lg: "h-10 w-10 border-[3px]" };
  return (
    <span
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizes[size]}`}
      style={{ color: "currentColor" }}
    />
  );
}

/* ============================================ */
/* SECTION HEADER                               */
/* ============================================ */

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/* ============================================ */
/* STAT CARD                                    */
/* ============================================ */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  trend?: { value: string; up: boolean };
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    brand: "bg-indigo-100 text-indigo-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    info: "bg-sky-100 text-sky-700",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <p className={`mt-2 text-xs font-medium ${trend.up ? "text-emerald-600" : "text-rose-600"}`}>
          {trend.up ? "↑" : "↓"} {trend.value}
        </p>
      )}
    </div>
  );
}

/* ============================================ */
/* TOAST                                        */
/* ============================================ */

export function Toast({
  kind = "info",
  children,
  onClose,
}: {
  kind?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
  onClose?: () => void;
}) {
  const tones = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    danger: "bg-rose-50 border-rose-200 text-rose-900",
  };
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-sm ${tones[kind]}`}>
      <div className="flex-1 text-sm">{children}</div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

/* ============================================ */
/* TABS                                         */
/* ============================================ */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  counts,
}: {
  tabs: Array<{ key: T; label: string; icon?: ReactNode }>;
  active: T;
  onChange: (key: T) => void;
  counts?: Record<T, number>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 gap-1">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {counts && counts[tab.key] !== undefined && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? "bg-indigo-200 text-indigo-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {counts[tab.key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================ */
/* TOGGLE                                       */
/* ============================================ */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="flex-1 min-w-0">
        {label && <p className="text-sm font-medium text-slate-900">{label}</p>}
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/* ============================================ */
/* DIVIDER                                      */
/* ============================================ */

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-slate-200 ${className}`} />;
}

/* ============================================ */
/* INFO BANNER                                  */
/* ============================================ */

export function InfoBanner({
  kind = "info",
  title,
  children,
}: {
  kind?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900", icon: "ℹ" },
    success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", icon: "✓" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", icon: "!" },
    danger: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-900", icon: "✕" },
  };
  const t = tones[kind];
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${t.bg} ${t.border}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold ${t.text}`}>
        {t.icon}
      </span>
      <div className={`flex-1 text-sm ${t.text}`}>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}
