"use client";

import { ArrowLeftRight, ChevronDown } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { DISPLAY_CURRENCIES, type DisplayCurrency, useDisplayCurrency } from "@/lib/currency";
import styles from "./DisplayCurrencySelect.module.css";

export default function DisplayCurrencySelect({ compact = false }: { compact?: boolean }) {
  const { t: tr } = useLocale();
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();

  return (
    <label className={styles.control} title={tr("Devise d’affichage des totaux")}>
      <ArrowLeftRight size={14} className={styles.icon} aria-hidden="true" />
      {!compact && <span className={styles.label}>{tr("Devise")}</span>}
      <span className={styles.picker}>
        <select
          aria-label={tr("Devise d’affichage des totaux")}
          className={styles.select}
          value={displayCurrency}
          onChange={(event) => setDisplayCurrency(event.target.value as DisplayCurrency)}
        >
          {DISPLAY_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className={styles.chevron} aria-hidden="true" />
      </span>
    </label>
  );
}
