import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Bell, ChartColumn, ChartNoAxesCombined, LockKeyhole, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import s from "./vip.module.css";

/** Shared Orbit presentation. Account, invitation and approval logic stay in each journey. */
export default function VipOnboardingShell({ children, existingMember = false }: { children: ReactNode; existingMember?: boolean }) {
  return <main className={s.page}>
    <div className={s.window}>
      <header className={s.header}><Link href="/" className={s.brand}><ChartColumn aria-hidden="true" /><span>investpro<small>TRADING VIP</small></span></Link><span className={s.private}><LockKeyhole size={14} aria-hidden="true" />{existingMember ? "Rattachement VIP" : "Sur invitation"}</span></header>
      <section className={s.hero}>
        <div className={s.scene} aria-hidden="true"><div className={s.halo} /><div className={`${s.orbit} ${s.orbitOne}`}><span /></div><div className={`${s.orbit} ${s.orbitTwo}`}><span /></div><div className={`${s.orbit} ${s.orbitThree}`} /><div className={s.scan} /></div>
        <span className={s.eyebrow}>{existingMember ? "DÉJÀ MEMBRE DU CANAL TELEGRAM" : "INVESTPRO TRADING VIP ™"}</span>
        <h1>Votre VIP.<br /><em>{existingMember ? "Votre espace personnel." : "Une autre dimension."}</em></h1>
        <p>{existingMember ? "Retrouvez vos analyses, vos signaux et vos outils InvestPro au même endroit. Rattachez votre accès actuel en quelques étapes." : "Vos analyses, vos signaux et votre communauté, réunis dans votre espace personnel InvestPro."}</p>
        <div className={s.invited}><ShieldCheck size={16} aria-hidden="true" />{existingMember ? "Votre adhésion actuelle est rattachée après vérification par l’équipe." : "Votre invitation vous est remise après validation de votre adhésion."}</div>
        <div className={s.platforms}><span>iPhone</span><span>Android</span><span>Ordinateur</span></div>
      </section>
      {children}
      <section className={s.benefits} aria-label="Votre espace VIP"><article><ChartNoAxesCombined /><h2>Analyses & signaux</h2><p>Le contexte, les niveaux et les mises à jour au même endroit.</p></article><article><Bell /><h2>Alertes sur téléphone</h2><p>Choisissez de recevoir une notification lors d’une nouvelle publication.</p></article><article><MessageCircle /><h2>Votre canal privé</h2><p>Retrouvez InvestPro Trading VIP ™ sur Telegram depuis votre espace.</p></article></section>
      <section className={s.devices} aria-labelledby="vip-devices-title"><div className={s.deviceHeading}><span className={s.eyebrow}>VOTRE APPLICATION VIP</span><h2 id="vip-devices-title">Votre espace VIP, en application.</h2><p>Installez InvestPro sur votre iPhone ou votre téléphone Android, Samsung inclus.</p></div><div className={s.deviceGrid}><article><h3><Smartphone size={19} /> iPhone · Safari</h3><ol><li>Ouvrez InvestPro dans <b>Safari</b>.</li><li>Touchez <b>Partager → Sur l’écran d’accueil</b>.</li><li>Activez <b>Ouvrir comme app web</b> si proposé, puis <b>Ajouter</b>.</li></ol></article><article><h3><Smartphone size={19} /> Android · Chrome</h3><ol><li>Ouvrez InvestPro dans <b>Chrome</b>.</li><li>Menu <b>⋮ → Installer et créer un raccourci</b> ou <b>Installer l’application</b>.</li><li>Confirmez avec <b>Installer</b>.</li></ol><p><b>Samsung Internet :</b> touchez l’icône d’installation si elle apparaît. Sinon, utilisez Chrome.</p></article></div><p className={s.deviceAfter}><Bell size={16} /> Ouvrez ensuite l’icône InvestPro pour autoriser les alertes. Sur iPhone : iOS 16.4 ou ultérieur. Les nouvelles publications nécessitent Internet.</p></section>
      <footer className={s.footer}><span>INVESTPRO · CERCLE PRIVÉ</span>{existingMember ? <Link href="/vip">Vous avez une invitation ? Activer mon accès <ArrowRight size={14} /></Link> : <Link href="/vip/deja-membre">Déjà membre Telegram ? Rattacher mon accès <ArrowRight size={14} /></Link>}<Link href="/dashboard">Retrouver mon espace InvestPro <ArrowRight size={14} /></Link></footer>
    </div>
  </main>;
}
