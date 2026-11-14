"use client";

import Link from "next/link";
import { ArrowRight, Crown, MessageCircle } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

const steps = [
  { title: "Compte source", text: "Le compte avec lequel tu trades. Tu continues comme d’habitude." },
  { title: "Comptes copieurs", text: "Les comptes qui reçoivent les trades, MT4 ou MT5, chez ton broker." },
  { title: "Risque", text: "Un volume par compte : les lots fixes s’appliquent tout de suite, les autres réglages sur demande." },
  { title: "Lancement", text: "La copie tourne sur nos serveurs, 24 h/24. Pause ou arrêt à tout moment, compte par compte." },
];

/**
 * InvestPro Copy pour un compte hors du groupe pilote : au lieu d'un tableau de bord vide et d'un « moteur de copie
 * indisponible », la page explique ce que fait la copie, comment elle se met en place, et comment demander l'accès.
 */
export default function CopierIntro() {
  const { t } = useLocale();
  return <main className="mx-auto flex max-w-[1180px] flex-col gap-6 pb-24">
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-[color:var(--text)]">InvestPro Copy</h1>
        <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--gold)]">
          <span className="h-2 w-2 rounded-full bg-[color:var(--gold)]" aria-hidden="true" />
          {t("Ouverture progressive")}
        </span>
      </div>
      <p className="max-w-[62ch] text-[15px] leading-relaxed text-[color:var(--muted)]">{t("Copie automatiquement les trades d’un compte vers tes autres comptes, avec un volume réglé pour chacun.")}</p>
    </header>

    <section aria-labelledby="copy-etapes" className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-7">
      <h2 id="copy-etapes" className="text-lg font-semibold text-[color:var(--text)]">{t("Comment ça marche")}</h2>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => <li key={step.title} className="flex flex-col gap-2 rounded-2xl border border-[color:var(--border)] p-4">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-sm font-bold text-[color:var(--gold)]" aria-hidden="true">{index + 1}</span>
          <b className="text-[15px] font-semibold text-[color:var(--text)]">{t(step.title)}</b>
          <span className="text-[13px] leading-relaxed text-[color:var(--muted)]">{t(step.text)}</span>
        </li>)}
      </ol>
    </section>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="copy-acces" className="flex flex-col gap-3 rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-7">
        <h2 id="copy-acces" className="text-lg font-semibold text-[color:var(--text)]">{t("La copie ouvre petit à petit")}</h2>
        <p className="text-[14px] leading-relaxed text-[color:var(--muted)]">{t("Un premier groupe de membres l’utilise déjà. Pour en faire partie, écris à l’équipe : elle t’ouvre l’accès et t’aide à relier tes comptes.")}</p>
        <Link href="/dashboard/contact" className="mt-1 inline-flex min-h-[46px] w-fit items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
          <MessageCircle size={16} aria-hidden="true" />{t("Demander l’accès")}<ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <section aria-labelledby="copy-vip" className="flex flex-col gap-3 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-7">
        <h2 id="copy-vip" className="flex items-center gap-2 text-lg font-semibold text-[color:var(--text)]"><Crown size={18} className="text-[color:var(--gold)]" aria-hidden="true" />{t("Membre VIP ?")}</h2>
        <p className="text-[14px] leading-relaxed text-[color:var(--muted)]">{t("Bientôt, tu pourras copier le compte personnel d’Enrick directement depuis ton espace VIP, onglet Copie.")}</p>
        <Link href="/dashboard/vip" className="mt-1 inline-flex min-h-[46px] w-fit items-center gap-2 rounded-xl border border-[color:var(--border)] px-5 text-sm font-semibold text-[color:var(--text)]">
          {t("Ouvrir mon espace VIP")}<ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>

    <p className="text-[12px] leading-relaxed text-[color:var(--muted)]">{t("La copie reproduit aussi les pertes. Les résultats passés ne garantissent pas les résultats futurs.")}</p>
  </main>;
}
