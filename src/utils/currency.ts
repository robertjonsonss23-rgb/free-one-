/* ============================================================
   DISPLAY CURRENCY
   Presentation only. Every amount the API sends is in rupees; these
   helpers decide how that number is shown. Nothing here changes what a
   user is actually charged.
   ============================================================ */

export interface Currency {
  code: string;
  symbol: string;
  /** How many rupees one unit is worth. INR is 1. */
  inrPerUnit: number;
}

export const INR: Currency = { code: "INR", symbol: "₹", inrPerUnit: 1 };

/* Rendering is read from many components, so the active choice lives in a
   tiny module-level store rather than being threaded through every prop. */
let active: Currency = INR;
const listeners = new Set<() => void>();

export function getCurrency(): Currency {
  return active;
}

export function setCurrency(next: Currency | null | undefined) {
  const resolved = next && Number(next.inrPerUnit) > 0 ? next : INR;
  if (resolved.code === active.code && resolved.inrPerUnit === active.inrPerUnit) return;
  active = resolved;
  listeners.forEach((fn) => fn());
}

/** Subscribe to currency changes; returns an unsubscribe function. */
export function onCurrencyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Convert a rupee amount into the active currency's units. */
export function fromInr(rupees: number): number {
  const value = Number(rupees) || 0;
  return active.inrPerUnit > 0 ? value / active.inrPerUnit : value;
}

/* Sub-unit currencies (PKR at ~0.3 INR) need no decimals to stay readable,
   while USD/EUR do. Pick a sensible precision from the size of the number. */
function decimalsFor(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1000) return 0;
  return 2;
}

/**
 * Format a RUPEE amount for display in the active currency.
 * `formatMoney(499)` → "₹499.00" or "$6.01" depending on the user's choice.
 */
export function formatMoney(rupees: number, opts?: { decimals?: number }): string {
  const converted = fromInr(rupees);
  const decimals = opts?.decimals ?? decimalsFor(converted);
  const shown = converted.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${active.symbol || active.code + " "}${shown}`;
}

/** Same, but never shows decimals — for compact stats and headings. */
export function formatMoneyShort(rupees: number): string {
  return formatMoney(rupees, { decimals: 0 });
}

/** The active symbol, for labels like "Amount (₹)". */
export function currencySymbol(): string {
  return active.symbol || active.code;
}

/** Convert a user-entered amount in the active currency back to rupees. */
export function toInr(amount: number): number {
  const value = Number(amount) || 0;
  return value * active.inrPerUnit;
}

/* ---- React binding ----
   Components call `useCurrency()` so they re-render when the choice
   changes, then use the module-level `formatMoney` as normal. */
import { useEffect, useState } from "react";

export function useCurrency(): Currency {
  const [, force] = useState(0);
  useEffect(() => onCurrencyChange(() => force((n) => n + 1)), []);
  return active;
}
