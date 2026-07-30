import { useEffect, useState } from "react";
import {
  fetchCurrencies,
  saveDisplayCurrency,
  type CurrencyOption,
} from "../utils/api";
import { getCurrency, setCurrency, useCurrency } from "../utils/currency";

/* Lets a user choose which currency prices are SHOWN in. The wallet is
   always held in rupees — this only changes formatting, so switching is
   safe and instant. Hidden entirely when the admin has enabled none. */
export function CurrencyPicker({ compact = false }: { compact?: boolean }) {
  const active = useCurrency();
  const [options, setOptions] = useState<CurrencyOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCurrencies().then((list) => {
      if (!cancelled) setOptions(list);
    });
    return () => { cancelled = true; };
  }, []);

  // Only INR available means the admin hasn't turned any on — show nothing.
  if (options.length <= 1) return null;

  const change = async (code: string) => {
    const picked = options.find((o) => o.code === code);
    if (!picked) return;
    const previous = getCurrency();
    setCurrency(picked);            // instant feedback
    setSaving(true);
    try {
      await saveDisplayCurrency(code);
    } catch {
      setCurrency(previous);        // roll back if the server refused
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? "" : "rounded-lg bg-slate-50 px-3 py-2"}>
      {!compact && (
        <label
          htmlFor="currency-picker"
          className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500"
        >
          Currency
        </label>
      )}
      <select
        id="currency-picker"
        aria-label="Display currency"
        value={active.code}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className={
          compact
            ? "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
            : "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700"
        }
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.symbol ? `${o.symbol} ` : ""}{o.code}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="mt-1 text-[9px] leading-tight text-slate-400">
          Display only — your wallet is held in ₹.
        </p>
      )}
    </div>
  );
}
