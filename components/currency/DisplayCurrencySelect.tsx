"use client";

import { ArrowLeftRight } from "lucide-react";
import { DISPLAY_CURRENCIES, type DisplayCurrency, useDisplayCurrency } from "@/lib/currency";

const labels: Record<DisplayCurrency, string> = {
  EUR: "EUR · Euro",
  USD: "USD · Dollar US",
  CHF: "CHF · Franc suisse",
};

export default function DisplayCurrencySelect({ compact = false }: { compact?: boolean }) {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();

  return (
    <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-xs text-[color:var(--muted)]">
      <ArrowLeftRight size={14} className="shrink-0 text-[color:var(--gold)]" aria-hidden="true" />
      <span className={compact ? "sr-only" : "whitespace-nowrap"}>Devise d’affichage</span>
      <select
        aria-label="Devise d’affichage des totaux"
        className="min-w-0 cursor-pointer bg-transparent py-2 font-semibold text-white outline-none"
        value={displayCurrency}
        onChange={(event) => setDisplayCurrency(event.target.value as DisplayCurrency)}
      >
        {DISPLAY_CURRENCIES.map((currency) => (
          <option key={currency} value={currency} className="bg-[#11130f] text-white">
            {labels[currency]}
          </option>
        ))}
      </select>
    </label>
  );
}
