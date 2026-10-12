"use client";

import { useEffect, useState } from "react";

type UsdEurRate = {
  rate: number;
  date: string | null;
};

export function useUsdEurRate() {
  const [data, setData] = useState<UsdEurRate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/currency-rates/usd-eur", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Exchange rate unavailable");
        return response.json() as Promise<UsdEurRate>;
      })
      .then((value) => {
        if (active && Number.isFinite(value.rate) && value.rate > 0) setData(value);
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

  return { usdToEur: data?.rate ?? null, rateDate: data?.date ?? null, rateLoading: loading };
}

export function convertToEur(amount: number, currency: string | null | undefined, usdToEur: number | null) {
  const normalized = String(currency || "").trim().toUpperCase();
  if (!Number.isFinite(amount)) return null;
  if (normalized === "EUR") return amount;
  if (normalized === "USD" && usdToEur !== null) return amount * usdToEur;
  return null;
}

export function formatEur(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function rateDateLabel(date: string | null) {
  if (!date) return "Montants affichés en EUR";
  const parsed = new Date(`${date}T12:00:00Z`);
  return `Converti en EUR · taux de référence du ${parsed.toLocaleDateString("fr-FR")}`;
}
