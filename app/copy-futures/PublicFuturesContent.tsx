"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import FuturesCopierContent from "../dashboard/copieur-futures/FuturesCopierContent";


export default function PublicFuturesContent() {
  const { t } = useLocale();
  return (
    <main className="min-h-screen bg-[color:var(--bg)] px-4 py-6 text-[color:var(--text)] sm:px-8 sm:py-8">
      <nav
        aria-label={t("Navigation principale")}
        className="mx-auto mb-10 flex w-full max-w-6xl items-center justify-between gap-4"
      >
        <Link href="/" className="text-lg font-semibold tracking-tight">{t("Invest")}<span className="text-[color:var(--gold)]">{t("Pro")}</span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <LanguageSwitcher />
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--gold-border)] px-4 py-2 text-sm font-medium text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]"
        >{t("Se connecter")}</Link>
        </div>
      </nav>
      <FuturesCopierContent />
      <footer className="mx-auto mt-6 flex max-w-6xl flex-wrap gap-x-6 gap-y-3 border-t border-[color:var(--border)] py-6 text-xs text-[color:var(--muted)]">
        <Link href="/">{t("Retour à l’accueil")}</Link>
        <Link href="/cgu">{t("Conditions d’utilisation")}</Link>
      </footer>
    </main>
  );
}
