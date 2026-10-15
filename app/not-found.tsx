"use client";
import { useLocale } from "@/components/i18n/LocaleProvider";

import Link from "next/link";
export default function NotFound(){
  const { t } = useLocale();
return <main className="grid min-h-screen place-items-center bg-[#060706] p-6 text-white"><div className="max-w-xl text-center"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#efbd54]">{t("404 · InvestPro")}</div><h1 className="mt-4 text-4xl font-semibold">{t("Cette page n’existe pas.")}</h1><p className="mt-3 text-sm text-white/45">{t("Retourne à ton espace ou à la page d’accueil.")}</p><div className="mt-6 flex justify-center gap-3"><Link href="/" className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white">{t("Accueil")}</Link><Link href="/dashboard" className="rounded-xl bg-[#efbd54] px-4 py-3 text-sm font-semibold text-black">{t("Ouvrir InvestPro")}</Link></div></div></main>}
