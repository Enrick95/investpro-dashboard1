"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import HostedSyncPanel from "@/components/metasync/HostedSyncPanel";
import type { VipMembership } from "@/lib/vip/types";
import { RISK_CHOICES, type MemberAccount, type VipMember } from "./vipMember";
import VipMemberCard from "./VipMemberCard";
import s from "./VipEspace.module.css";

type Props = {
  banner: ReactNode;
  membership: VipMembership | null;
  member: VipMember;
  alertsOn: boolean;
  alertsAvailable: boolean;
  onEnableAlerts: () => void;
  busy: boolean;
  onRenew: () => void;
  languageControl?: ReactNode;
  accountTools?: ReactNode;
  onTelegram: () => void;
};

/** Everything about the member, inside the VIP: access and renewal, the lot settings, trading accounts, alerts and settings. */
export default function VipCompte({ banner, membership, member, alertsOn, alertsAvailable, onEnableAlerts, busy, onRenew, languageControl, accountTools, onTelegram }: Props) {
  const { t, locale } = useLocale();
  const tag = locale === "en" ? "en-US" : "fr-FR";
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    try { await createClient().auth.signOut(); }
    finally { window.location.assign("/login?next=%2Fdashboard%2Fvip"); }
  }

  const name = [membership?.first_name, membership?.last_name].filter(Boolean).join(" ").trim();
  const initial = (membership?.first_name || membership?.email || "V").trim().charAt(0).toUpperCase();
  const expires = membership?.expires_at ? new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(membership.expires_at)) : null;
  const requested = Boolean(membership?.renewal_requested_at);
  const percent = new Intl.NumberFormat(tag);
  const balance = (account: MemberAccount) => {
    if (typeof account.current_balance !== "number") return "—";
    try { return new Intl.NumberFormat(tag, { style: "currency", currency: account.currency || "EUR", maximumFractionDigits: 0 }).format(account.current_balance); }
    catch { return new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(account.current_balance); }
  };

  return <div className={s.page}>
    {membership ? <header className={s.memberHead}>
      <VipMemberCard firstName={membership.first_name} lastName={membership.last_name} number={membership.member_number} since={membership.started_at} active={membership.status !== "suspended"} />
      <div className={s.memberStatus}>
        <span className={s.small}>{membership.status === "suspended" ? t("VIP suspendu") : `${t("VIP actif")} · ${expires ? `${t("jusqu’au")} ${expires}` : t("sans échéance")}`}</span>
        {membership.type === "abonnement" ? <button type="button" className={s.primary} onClick={onRenew} disabled={busy || requested}>{requested ? t("Demande transmise") : t("Renouveler")}</button> : null}
      </div>
    </header> : <header className={s.profile}>
      <span className={s.avatar} aria-hidden="true">{initial}</span>
      <div className={s.profileText}>
        <b>{name || t("Membre VIP")}</b>
        <span className={s.small}>{t("Aperçu de l’équipe")}</span>
      </div>
    </header>}
    {requested ? <p className={s.small}>{t("Renouvellement demandé · en attente de vérification par l’équipe.")}</p> : null}
    {banner}

    <article className={s.sizing} aria-labelledby="vip-sizing">
      <h2 id="vip-sizing" className={s.sectionTitle}>{t("Mon calcul de lot")}</h2>
      <p className={s.small}>{t("Risque par trade")}</p>
      <div className={s.seg} role="group" aria-label={t("Risque par trade")}>
        {RISK_CHOICES.map(choice => <button key={choice} type="button" aria-pressed={member.risk === choice} className={member.risk === choice ? s.segOn : undefined} onClick={() => member.setRisk(choice)}>{`${percent.format(choice)} %`}</button>)}
      </div>
      {member.accounts.length > 1 ? <label className={s.row}>
        <span>{t("Compte utilisé")}</span>
        <select className={s.select} value={member.account?.id ?? ""} onChange={(event: { target: { value: string } }) => member.setAccount(Number(event.target.value))}>
          {member.accounts.map(account => <option key={account.id} value={account.id}>{`${account.name} · ${balance(account)}`}</option>)}
        </select>
      </label> : member.account ? <div className={s.row}><span>{t("Compte utilisé")}</span><span className={s.muted}>{`${member.account.name} · ${balance(member.account)}`}</span></div> : null}
      <p className={s.small}>{t("Ton lot est calculé sur chaque signal avec ce compte et ce risque.")}</p>
    </article>

    <section className={s.section} aria-labelledby="vip-accounts">
      <div className={s.sectionHead}>
        <h2 id="vip-accounts" className={s.sectionTitle}>{t("Comptes de trading")}</h2>
        <button type="button" className={s.secondary} onClick={() => setAdding(open => !open)} aria-expanded={adding}>{adding ? t("Fermer") : t("Ajouter")}</button>
      </div>
      {adding ? <div className={s.connect}>
        <button type="button" className={s.connectClose} onClick={() => { setAdding(false); member.reload(); }} aria-label={t("Fermer la connexion")}><X size={18} aria-hidden="true" /></button>
        <HostedSyncPanel initialPlatform="MT5" />
      </div> : null}
      {member.status === "loading" ? <p className={s.small} role="status">{t("Chargement de tes comptes…")}</p>
        : member.status === "error" && !member.accounts.length ? <p className={s.small} role="alert">{t("Tes comptes sont indisponibles pour le moment.")}</p>
          : member.accounts.length ? <ul className={s.rows}>
            {member.accounts.map(account => <li key={account.id} className={`${s.row} ${s.rowTall}`}>
              <span><b>{account.name}</b><span className={s.rowSub}>{[account.platform, account.broker, account.connection_type === "automatic" ? t("synchro automatique") : t("saisie manuelle")].filter(Boolean).join(" · ")}</span></span>
              <b className={s.num}>{balance(account)}</b>
            </li>)}
          </ul> : <p className={s.small}>{t("Aucun compte pour l’instant. Ajoute ton compte MetaTrader pour voir ton lot sur chaque signal et remplir ton journal.")}</p>}
    </section>

    <section className={s.section} aria-labelledby="vip-settings">
      <h2 id="vip-settings" className={s.sectionTitle}>{t("Réglages")}</h2>
      <ul className={s.rows}>
        <li className={s.row}>
          <span>{t("Alertes sur ce téléphone")}</span>
          {alertsOn ? <span className={s.gain}>{t("Activées")}</span>
            : alertsAvailable ? <button type="button" className={s.secondary} onClick={onEnableAlerts} disabled={busy}>{t("Activer")}</button>
              : <span className={s.muted}>{t("Indisponibles ici")}</span>}
        </li>
        <li className={s.row}><button type="button" className={s.rowButton} onClick={onTelegram}><span>{t("Canal Telegram")}</span><ChevronRight size={18} aria-hidden="true" /></button></li>
        {languageControl ? <li className={s.row}><span>{t("Langue")}</span>{languageControl}</li> : null}
      </ul>
    </section>

    {accountTools ? <section className={s.section}>{accountTools}</section> : null}

    <button type="button" className={s.signOut} onClick={() => void signOut()} disabled={leaving}>{t("Se déconnecter")}</button>
  </div>;
}
