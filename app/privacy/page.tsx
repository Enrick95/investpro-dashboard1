"use client";

import Image from "next/image";
import { useLocale } from "@/components/i18n/LocaleProvider";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import Link from "next/link";

export default function PrivacyPage() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-3xl p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
        <div className="mb-6 flex justify-end"><LanguageSwitcher /></div>
        <div className="flex items-center gap-4">
          <Image
            src="/logo.webp" // ou /logo.webp
            alt={t("InvestPro Trading")}
            width={52}
            height={52}
            className="rounded-2xl"
          />
          <div>
            <h1 className="text-2xl font-semibold">{t("Politique de ")}<span className="text-[color:var(--gold)]">{t("confidentialité")}</span>
            </h1>
            <p className="text-sm text-[color:var(--muted)] mt-1">{t("Version démo — à personnaliser avant mise en production.")}</p>
          </div>
        </div>

        <div className="mt-8 space-y-5 text-sm text-white/80 leading-relaxed">
          <section>
            <h2 className="text-white font-semibold">{t("1. Données collectées")}</h2>
            <p className="mt-2 text-[color:var(--muted)]">{t("En mode démo, les données (journal, profil) sont stockées dans votre navigateur (localStorage). En production, elles pourront être stockées sur serveur.")}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold">{t("2. Utilisation")}</h2>
            <p className="mt-2 text-[color:var(--muted)]">{t("Les données servent à afficher vos performances, rapports, et préférences.")}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold">{t("3. Partage")}</h2>
            <p className="mt-2 text-[color:var(--muted)]">{t("Aucune donnée n’est vendue. Le partage (ex: classement) dépend d’une action volontaire de l’utilisateur.")}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold">{t("4. Sécurité")}</h2>
            <p className="mt-2 text-[color:var(--muted)]">{t("Des mesures de sécurité seront mises en place en production (auth forte, chiffrement, logs).")}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold">{t("5. Contact")}</h2>
            <p className="mt-2 text-[color:var(--muted)]">{t("Pour toute question liée à la confidentialité, utilisez la page “Nous contacter”.")}</p>
          </section>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/login"
            className="px-5 py-3 rounded-2xl bg-[color:var(--gold)] text-black font-semibold hover:bg-[color:var(--gold-2)] transition"
          >{t("Retour à la connexion")}</Link>
        </div>
      </div>
    </div>
  );
}
