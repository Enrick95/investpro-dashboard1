"use client";

import { Languages } from "lucide-react";
import { useLocale } from "./LocaleProvider";
import { isLocale } from "@/lib/i18n/locale";
import s from "./LanguageSwitcher.module.css";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return <label className={s.switcher}>
    <Languages size={15} aria-hidden="true" />
    <select aria-label="Langue / Language" value={locale} onChange={event => { if (isLocale(event.target.value)) setLocale(event.target.value); }}>
      <option value="fr">FR</option><option value="en">EN</option>
    </select>
  </label>;
}
