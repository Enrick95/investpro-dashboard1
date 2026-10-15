"use client";

import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Bell, ChartColumn, ChartNoAxesCombined, LockKeyhole, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import s from "./vip.module.css";

/** Shared Orbit presentation. Account, invitation and approval logic stay in each journey. */
export default function VipOnboardingShell({ children, existingMember = false }: { children: ReactNode; existingMember?: boolean }) {
  const { t } = useLocale();
  return <main className={s.page}>
    <div className={s.window}>
      <header className={s.header}><Link href="/" className={s.brand}><ChartColumn aria-hidden="true" /><span>{t("investpro")}<small>{t("TRADING VIP")}</small></span></Link><div className={s.headerActions}><span className={s.private}><LockKeyhole size={14} aria-hidden="true" />{existingMember ? t("Rattachement VIP") : t("Sur invitation")}</span><LanguageSwitcher /></div></header>
      <section className={s.hero}>
        <div className={s.scene} aria-hidden="true"><div className={s.halo} /><div className={`${s.orbit} ${s.orbitOne}`}><span /></div><div className={`${s.orbit} ${s.orbitTwo}`}><span /></div><div className={`${s.orbit} ${s.orbitThree}`} /><div className={s.scan} /></div>
        <span className={s.eyebrow}>{existingMember ? t("DÉJÀ MEMBRE DU CANAL TELEGRAM") : t("INVESTPRO TRADING VIP ™")}</span>
        <h1>{t("Votre VIP.")}<br /><em>{existingMember ? t("Votre espace personnel.") : t("Une autre dimension.")}</em></h1>
        <p>{existingMember ? t("Retrouvez vos analyses, vos signaux et vos outils InvestPro au même endroit. Rattachez votre accès actuel en quelques étapes.") : t("Vos analyses, vos signaux et votre communauté, réunis dans votre espace personnel InvestPro.")}</p>
        <div className={s.invited}><ShieldCheck size={16} aria-hidden="true" />{existingMember ? t("Votre adhésion actuelle est rattachée après vérification par l’équipe.") : t("Votre invitation vous est remise après validation de votre adhésion.")}</div>
        <div className={s.platforms}><span>{t("iPhone")}</span><span>{t("Android")}</span><span>{t("Ordinateur")}</span></div>
      </section>
      {children}
      <section className={s.benefits} aria-label={t("Votre espace VIP")}><article><ChartNoAxesCombined /><h2>{t("Analyses & signaux")}</h2><p>{t("Le contexte, les niveaux et les mises à jour au même endroit.")}</p></article><article><Bell /><h2>{t("Alertes sur téléphone")}</h2><p>{t("Choisissez de recevoir une notification lors d’une nouvelle publication.")}</p></article><article><MessageCircle /><h2>{t("Votre canal privé")}</h2><p>{t("Retrouvez InvestPro Trading VIP ™ sur Telegram depuis votre espace.")}</p></article></section>
      <section className={s.devices} aria-labelledby="vip-devices-title"><div className={s.deviceHeading}><span className={s.eyebrow}>{t("VOTRE APPLICATION VIP")}</span><h2 id="vip-devices-title">{t("Votre espace VIP, en application.")}</h2><p>{t("Installez InvestPro sur votre iPhone ou votre téléphone Android, Samsung inclus.")}</p></div><div className={s.deviceGrid}><article><h3><Smartphone size={19} /> {t("iPhone · Safari")}</h3><ol><li>{t("Ouvrez InvestPro dans")}{" "}<b>{t("Safari")}</b>.</li><li>{t("Touchez")}{" "}<b>{t("Partager → Sur l’écran d’accueil")}</b>.</li><li>{t("Activez")}{" "}<b>{t("Ouvrir comme app web")}</b> {t("si proposé, puis")}{" "}<b>{t("Ajouter")}</b>.</li></ol></article><article><h3><Smartphone size={19} /> {t("Android · Chrome")}</h3><ol><li>{t("Ouvrez InvestPro dans")}{" "}<b>{t("Chrome")}</b>.</li><li>{t("Menu")}{" "}<b>{t("⋮ → Installer et créer un raccourci")}</b> {t("ou")}{" "}<b>{t("Installer l’application")}</b>.</li><li>{t("Confirmez avec")}{" "}<b>{t("Installer")}</b>.</li></ol><p><b>{t("Samsung Internet :")}</b> {t("touchez l’icône d’installation si elle apparaît. Sinon, utilisez Chrome.")}</p></article></div><p className={s.deviceAfter}><Bell size={16} /> {t("Ouvrez ensuite l’icône InvestPro pour autoriser les alertes. Sur iPhone : iOS 16.4 ou ultérieur. Les nouvelles publications nécessitent Internet.")}</p></section>
      <footer className={s.footer}><span>{t("INVESTPRO · CERCLE PRIVÉ")}</span>{existingMember ? <Link href="/vip">{t("Vous avez une invitation ? Activer mon accès")}{" "}<ArrowRight size={14} /></Link> : <Link href="/vip/deja-membre">{t("Déjà membre Telegram ? Rattacher mon accès")}{" "}<ArrowRight size={14} /></Link>}<Link href="/dashboard">{t("Retrouver mon espace InvestPro")}{" "}<ArrowRight size={14} /></Link></footer>
    </div>
  </main>;
}
