"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, RefreshCw } from "lucide-react";
import { VipApiError, vipDate, vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { validateVipAccessRequest, vipParisPaymentDate } from "@/lib/vip/access-requests";
import type { VipAccessRequest, VipMembership } from "@/lib/vip/types";
import s from "./intake.module.css";
import orbit from "../vip.module.css";
import VipOnboardingShell from "../VipOnboardingShell";

type Payload = { user: { email: string }; request: VipAccessRequest | null; membership: VipMembership | null; active: boolean };
const next = encodeURIComponent("/vip/deja-membre");
const blank = { firstName: "", lastName: "", telegramUsername: "", type: "", affiliationBroker: "", paidOn: "" };

export default function ExistingMemberIntake() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await vipRequest<Payload>("/api/vip/requests", { signal });
      if (!signal?.aborted) { setData(result); setError(""); }
    } catch (cause) {
      if (!signal?.aborted) {
        setData(null);
        setError(cause instanceof VipApiError && cause.status === 401 ? "" : cause instanceof Error ? cause.message : "Votre demande est indisponible.");
      }
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // Initial session lookup follows a cancellable network request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateVipAccessRequest(form);
    if (!validation.ok) { setError(validation.error); return; }
    setBusy(true); setError("");
    try {
      await vipRequest("/api/vip/requests", { method: "POST", body: JSON.stringify(form) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La demande n’a pas pu être envoyée."); }
    finally { setBusy(false); }
  }
  const pending = data?.request?.status === "pending";
  return <VipOnboardingShell existingMember>
    <section className={`${orbit.invitation} ${s.intakePanel}`} aria-labelledby="vip-existing-title">
      <div><span className={orbit.kicker}>{t("VOTRE ACCÈS ACTUEL")}</span><h2 id="vip-existing-title">{t("Retrouvez votre orbite.")}</h2><p>{t("Vous êtes déjà dans le canal VIP. Reliez votre adhésion à votre compte InvestPro pour retrouver votre espace personnel.")}</p></div>
      <ol className={orbit.journey}><li><span>01</span><div><b>{t("Votre compte InvestPro")}</b><small>{t("Créez votre compte ou connectez-vous avec celui que vous avez déjà.")}</small></div></li><li><span>02</span><div><b>{t("Votre accès actuel")}</b><small>{t("Après connexion, indiquez votre identité et choisissez affiliation avec votre broker ou abonnement.")}</small></div></li><li><span>03</span><div><b>{t("Une vérification par l’équipe")}</b><small>{t("Nous confirmons votre accès. Vous retrouvez ensuite le VIP depuis votre compte.")}</small></div></li></ol>
      <section className={s.card} aria-labelledby="intake-title">
        {loading ? <p role="status">{t("Vérification de votre compte…")}</p> : data?.membership ? <>
          <span className={s.status}><Check size={18} /> {data.active ? t("Votre accès est prêt") : t("Votre compte est déjà rattaché")}</span>
          <h2 id="intake-title">{data.active ? t("Bienvenue dans votre espace.") : t("Retrouvez votre accès existant.")}</h2>
          <p>{data.active ? t("Votre compte est déjà relié au VIP. Vous pouvez ouvrir votre espace personnel.") : t("Votre accès doit être renouvelé ou réactivé par l’équipe. Une nouvelle inscription n’est pas nécessaire.")}</p>
          <Link href="/dashboard/vip" className={s.primary}>{t("Ouvrir mon espace VIP")}{" "}<ArrowRight size={17} /></Link>
        </> : pending ? <>
          <span className={s.status}><Clock3 size={18} /> {t("Vérification en cours")}</span><h2 id="intake-title">{t("Votre demande est reçue.")}</h2>
          <p>{t("L’équipe vérifie votre accès actuel. Après validation, vous recevrez un e-mail avec le lien de votre espace VIP, ainsi qu’une notification sur cet appareil si vous avez activé les alertes. Aucun code supplémentaire n’est nécessaire.")}</p>
          <dl className={s.details}><div><dt>{t("Compte")}</dt><dd>{data.user.email}</dd></div><div><dt>{t("Telegram")}</dt><dd>{data.request!.telegram_username ? `@${data.request!.telegram_username}` : t("Non renseigné")}</dd></div><div><dt>{t("Origine déclarée")}</dt><dd>{data.request!.type === "abonnement" ? t("Abonnement") : `${t("Affiliation")} · ${vipAffiliationBrokerLabel(data.request!.affiliation_broker) || t("Broker à confirmer")}`}</dd></div>{data.request!.type === "abonnement" && <div><dt>{t("Dernier paiement déclaré")}</dt><dd>{vipDate(data.request!.paid_on, locale)}</dd></div>}<div><dt>{t("Demande envoyée")}</dt><dd>{vipDate(data.request!.created_at, locale)}</dd></div></dl>
          <button type="button" className={s.secondary} onClick={() => void load()}><RefreshCw size={16} /> {t("Vérifier mon accès")}</button>
        </> : data ? <>
          <h2 id="intake-title">{t("Rattacher mon accès VIP.")}</h2><p className={s.account}>{t("Compte :")}{" "}{data.user.email}</p>
          {data.request?.status === "denied" && <p className={s.notice}>{t("Votre précédente demande n’a pas été validée. Contactez l’équipe sur Telegram, puis corrigez vos informations si nécessaire.")}</p>}
          <form className={s.form} onSubmit={submit}>
            <div className={s.names}><label>{t("Prénom")}<input value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} autoComplete="given-name" maxLength={80} required /></label><label>{t("Nom")}<input value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} autoComplete="family-name" maxLength={80} required /></label></div>
            <label>{t("Pseudo Telegram · facultatif")}<input value={form.telegramUsername} onChange={event => setForm({ ...form, telegramUsername: event.target.value })} placeholder={t("@monpseudo")} autoComplete="off" spellCheck={false} maxLength={33} /><small>{t("Si vous avez un @pseudo, il aide l’équipe à vous retrouver dans Telegram.")}</small></label>
            <label>{t("Comment avez-vous rejoint le VIP ?")}<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value, affiliationBroker: "", paidOn: "" })} required><option value="" disabled>{t("Choisir mon mode d’accès")}</option><option value="affiliation">{t("Affiliation avec un broker")}</option><option value="abonnement">{t("Abonnement")}</option></select></label>
            {form.type === "affiliation" && <label>{t("Broker de votre affiliation")}<select value={form.affiliationBroker} onChange={event => setForm({ ...form, affiliationBroker: event.target.value })} required><option value="" disabled>{t("Choisir mon broker")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}<option value="unknown">{t("Je ne sais plus · à vérifier")}</option></select><small>{t("L’équipe confirme le broker avant d’activer l’accès.")}</small></label>}
            {form.type === "abonnement" && <><label>{t("Date du dernier paiement")}<input type="date" value={form.paidOn} max={vipParisPaymentDate()} onChange={event => setForm({ ...form, paidOn: event.target.value })} required /><small>{t("Le paiement déjà effectué qui couvre votre mois actuel.")}</small></label><p className={s.notice}>{t("L’équipe vérifie votre paiement avant de valider l’accès. Le mois d’abonnement est calculé automatiquement à partir de cette date.")}</p></>}
            <p className={s.fine}>{t("Ces informations servent à retrouver votre adhésion existante. L’accès privé s’ouvre après validation par l’équipe.")}</p>
            <button className={s.primary} disabled={busy}>{busy ? t("Envoi…") : t("Envoyer ma demande")}<ArrowRight size={17} /></button>
          </form>
        </> : <>
          <h2 id="intake-title">{t("Commencez par votre compte.")}</h2><p>{t("Créez votre compte et confirmez votre e-mail. Vous reviendrez ensuite ici pour choisir affiliation avec votre broker ou abonnement. Déjà inscrit ? Connectez-vous avec votre compte actuel.")}</p>
          <div className={s.auth}><Link className={s.primary} href={`/signup?next=${next}`}>{t("Créer mon compte")}{" "}<ArrowRight size={17} /></Link><Link className={s.secondary} href={`/login?next=${next}`}>{t("J’ai déjà un compte")}</Link></div>
        </>}
        {error && <div className={s.error} role="alert">{t(error)}<button type="button" onClick={() => void load()}>{t("Réessayer")}</button></div>}
      </section>
    </section>
  </VipOnboardingShell>;
}
