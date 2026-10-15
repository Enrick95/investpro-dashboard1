"use client";
import LocaleProvider, { useLocale } from "@/components/i18n/LocaleProvider";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="fr"><body className="grid min-h-screen place-items-center bg-[#060706] p-6 text-white"><LocaleProvider initialLocale="fr" detectBrowser><ErrorContent reset={reset} /></LocaleProvider></body></html>;
}

function ErrorContent({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return <div className="max-w-xl text-center"><div className="mb-6 flex justify-end"><LanguageSwitcher /></div><div className="text-[10px] uppercase tracking-[.15em] text-[#efbd54]">InvestPro</div><h1 className="mt-4 text-3xl font-semibold">{t("Un problème est survenu.")}</h1><p className="mt-3 text-sm text-white/45">{t("Tes données ne sont pas perdues. Réessaie simplement de charger la page.")}</p><button onClick={reset} className="mt-6 rounded-xl bg-[#efbd54] px-5 py-3 text-sm font-semibold text-black">{t("Réessayer")}</button></div>;
}
