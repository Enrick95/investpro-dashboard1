"use client";

import { useEffect, useState } from "react";

export const DISPLAY_CURRENCIES = ["EUR", "USD", "CHF"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export type CurrencyRates = Record<DisplayCurrency, number>;

type RatesResponse = {
  base: "EUR";
  rates: Partial<Record<DisplayCurrency, number>>;
  date: string | null;
};

const DISPLAY_CURRENCY_KEY = "investpro-display-currency";
const DISPLAY_CURRENCY_EVENT = "investpro-display-currency-change";

export function normalizeCurrency(value: string | null | undefined): DisplayCurrency | null {
  const normalized = String(value || "").trim().toUpperCase().replaceAll(" ", "");
  if (normalized === "EUR" || normalized === "€") return "EUR";
  if (["USD", "US$", "$US", "$"].includes(normalized)) return "USD";
  if (["CHF", "SFR", "FRANC SUISSE"].includes(normalized)) return "CHF";
  return null;
}

export function useDisplayCurrency() {
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>("EUR");

  useEffect(() => {
    const stored = normalizeCurrency(window.localStorage.getItem(DISPLAY_CURRENCY_KEY));
    if (stored) setDisplayCurrencyState(stored);

    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== DISPLAY_CURRENCY_KEY) return;
      const next = normalizeCurrency(event.newValue);
      if (next) setDisplayCurrencyState(next);
    };
    const syncFromPage = (event: Event) => {
      const next = normalizeCurrency((event as CustomEvent<string>).detail);
      if (next) setDisplayCurrencyState(next);
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(DISPLAY_CURRENCY_EVENT, syncFromPage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(DISPLAY_CURRENCY_EVENT, syncFromPage);
    };
  }, []);

  const setDisplayCurrency = (next: DisplayCurrency) => {
    setDisplayCurrencyState(next);
    window.localStorage.setItem(DISPLAY_CURRENCY_KEY, next);
    window.dispatchEvent(new CustomEvent(DISPLAY_CURRENCY_EVENT, { detail: next }));
  };

  return { displayCurrency, setDisplayCurrency };
}

export function useCurrencyRates() {
  const [data, setData] = useState<RatesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/currency-rates", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Exchange rates unavailable");
        return response.json() as Promise<RatesResponse>;
      })
      .then((value) => {
        const usd = Number(value.rates?.USD);
        const chf = Number(value.rates?.CHF);
        if (active && value.base === "EUR" && Number.isFinite(usd) && usd > 0 && Number.isFinite(chf) && chf > 0) {
          setData(value);
        }
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const rates: CurrencyRates | null = data
    ? { EUR: 1, USD: Number(data.rates.USD), CHF: Number(data.rates.CHF) }
    : null;

  return { rates, rateDate: data?.date ?? null, rateLoading: loading };
}

export function convertCurrency(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: DisplayCurrency,
  rates: CurrencyRates | null,
) {
  const from = normalizeCurrency(fromCurrency);
  if (!Number.isFinite(amount) || !from) return null;
  if (from === toCurrency) return amount;
  if (!rates) return null;
  return (amount / rates[from]) * rates[toCurrency];
}

export function formatDisplayCurrency(value: number, currency: DisplayCurrency, locale: "fr" | "en" = "fr") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function rateDateLabel(date: string | null, currency: DisplayCurrency, locale: "fr" | "en" = "fr") {
  const currencyName: Record<DisplayCurrency, string> = {
    EUR: "euro",
    USD: "dollar US",
    CHF: "franc suisse",
  };
  if (!date) {
    const englishNames: Record<DisplayCurrency, string> = { EUR: "euros", USD: "US dollars", CHF: "Swiss francs" };
    return locale === "en" ? `Amounts displayed in ${englishNames[currency]}` : `Montants affichés en ${currencyName[currency]}`;
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  return locale === "en"
    ? `Converted to ${currency} · reference rate dated ${parsed.toLocaleDateString("en-US")}`
    : `Converti en ${currency} · taux de référence du ${parsed.toLocaleDateString("fr-FR")}`;
}
