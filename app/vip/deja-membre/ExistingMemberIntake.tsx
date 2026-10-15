"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChartColumn, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { VipApiError, vipDate, vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { validateVipAccessRequest } from "@/lib/vip/access-requests";
import type { VipAccessRequest, VipMembership } from "@/lib/vip/types";
import s from "./intake.module.css";

type Payload = { user: { email: string }; request: VipAccessRequest | null; membership: VipMembership | null; active: boolean };
const next = encodeURIComponent("/vip/deja-membre");
const blank = { firstName: "", lastName: "", telegramUsername: "", type: "", affiliationBroker: "" };

export default function ExistingMemberIntake() {
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
  return <main className={s.page}><div className={s.window}>
    <header className={s.header}><Link href="/vip" className={s.brand}><ChartColumn size={29} /><span>investpro<small>TRADING VIP</small></span></Link><span className={s.secure}><ShieldCheck size={14} /> Accès vérifié</span></header>
    <section className={s.hero}><span className={s.eyebrow}>DÉJÀ MEMBRE DU CANAL TELEGRAM</span><h1>Votre VIP.<br /><em>Votre espace personnel.</em></h1><p>Retrouvez vos analyses, vos signaux et vos outils InvestPro au même endroit. Rattachez votre accès actuel en quelques étapes.</p></section>
    <div className={s.layout}>
      <ol className={s.steps}><li><span>01</span><div><b>Votre compte InvestPro</b><p>Créez votre compte ou connectez-vous avec celui que vous avez déjà.</p></div></li><li><span>02</span><div><b>Votre accès actuel</b><p>Indiquez votre identité et comment vous avez rejoint le VIP. Votre pseudo Telegram peut aider à vous retrouver.</p></div></li><li><span>03</span><div><b>Une vérification par l’équipe</b><p>Nous confirmons votre accès. Vous retrouvez ensuite le VIP depuis votre compte.</p></div></li></ol>
      <section className={s.card} aria-labelledby="intake-title">
        {loading ? <p role="status">Vérification de votre compte…</p> : data?.membership ? <>
          <span className={s.status}><Check size={18} /> {data.active ? "Votre accès est prêt" : "Votre compte est déjà rattaché"}</span>
          <h2 id="intake-title">{data.active ? "Bienvenue dans votre espace." : "Retrouvez votre accès existant."}</h2>
          <p>{data.active ? "Votre compte est déjà relié au VIP. Vous pouvez ouvrir votre espace personnel." : "Votre accès doit être renouvelé ou réactivé par l’équipe. Une nouvelle inscription n’est pas nécessaire."}</p>
          <Link href="/dashboard/vip" className={s.primary}>Ouvrir mon espace VIP <ArrowRight size={17} /></Link>
        </> : pending ? <>
          <span className={s.status}><Clock3 size={18} /> Vérification en cours</span><h2 id="intake-title">Votre demande est reçue.</h2>
          <p>L’équipe vérifie votre accès actuel. La validation apparaîtra ici ; aucun code supplémentaire n’est nécessaire.</p>
          <dl className={s.details}><div><dt>Compte</dt><dd>{data.user.email}</dd></div><div><dt>Telegram</dt><dd>{data.request!.telegram_username ? `@${data.request!.telegram_username}` : "Non renseigné"}</dd></div><div><dt>Origine déclarée</dt><dd>{data.request!.type === "abonnement" ? "Abonnement" : `Affiliation · ${vipAffiliationBrokerLabel(data.request!.affiliation_broker) || "Broker à confirmer"}`}</dd></div><div><dt>Demande envoyée</dt><dd>{vipDate(data.request!.created_at)}</dd></div></dl>
          <button type="button" className={s.secondary} onClick={() => void load()}><RefreshCw size={16} /> Vérifier mon accès</button>
        </> : data ? <>
          <h2 id="intake-title">Rattacher mon accès VIP.</h2><p className={s.account}>Compte : {data.user.email}</p>
          {data.request?.status === "denied" && <p className={s.notice}>Votre précédente demande n’a pas été validée. Contactez l’équipe sur Telegram, puis corrigez vos informations si nécessaire.</p>}
          <form className={s.form} onSubmit={submit}>
            <div className={s.names}><label>Prénom<input value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} autoComplete="given-name" maxLength={80} required /></label><label>Nom<input value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} autoComplete="family-name" maxLength={80} required /></label></div>
            <label>Pseudo Telegram · facultatif<input value={form.telegramUsername} onChange={event => setForm({ ...form, telegramUsername: event.target.value })} placeholder="@monpseudo" autoComplete="off" spellCheck={false} maxLength={33} /><small>Si vous avez un @pseudo, il aide l’équipe à vous retrouver dans Telegram.</small></label>
            <label>Comment avez-vous rejoint le VIP ?<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value, affiliationBroker: "" })} required><option value="" disabled>Choisir mon mode d’accès</option><option value="affiliation">Affiliation avec un broker</option><option value="abonnement">Abonnement</option></select></label>
            {form.type === "affiliation" && <label>Broker de votre affiliation<select value={form.affiliationBroker} onChange={event => setForm({ ...form, affiliationBroker: event.target.value })} required><option value="" disabled>Choisir mon broker</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}<option value="unknown">Je ne sais plus · à vérifier</option></select><small>L’équipe confirme le broker avant d’activer l’accès.</small></label>}
            {form.type === "abonnement" && <p className={s.notice}>L’équipe reprend la date de fin de votre abonnement actuel après vérification de votre règlement.</p>}
            <p className={s.fine}>Ces informations servent à retrouver votre adhésion existante. L’accès privé s’ouvre après validation par l’équipe.</p>
            <button className={s.primary} disabled={busy}>{busy ? "Envoi…" : "Envoyer ma demande"}<ArrowRight size={17} /></button>
          </form>
        </> : <>
          <h2 id="intake-title">Commencez par votre compte.</h2><p>Conservez votre compte InvestPro si vous êtes déjà inscrit. Vous reviendrez ici pour renseigner votre accès VIP.</p>
          <div className={s.auth}><Link className={s.primary} href={`/signup?next=${next}`}>Créer mon compte <ArrowRight size={17} /></Link><Link className={s.secondary} href={`/login?next=${next}`}>J’ai déjà un compte</Link></div>
        </>}
        {error && <div className={s.error} role="alert">{error}<button type="button" onClick={() => void load()}>Réessayer</button></div>}
      </section>
    </div>
    <footer className={s.footer}>INVESTPRO TRADING VIP ™ <span>iPhone · Android · Ordinateur</span></footer>
  </div></main>;
}
