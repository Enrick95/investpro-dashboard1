"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, KeyRound, MessageCircle, Pencil, Plus, RefreshCw, Send, Settings, ShieldCheck, Users } from "lucide-react";
import { vipDate, vipRequest, type VipMembership, type VipPost } from "@/lib/vip/client";
import type { VipAccessRequest, VipInvitation } from "@/lib/vip/types";
import VipAccessRequestsAdmin from "./VipAccessRequestsAdmin";
import { VIP_AFFILIATION_BROKERS, validateVipIdentity, vipAffiliationBrokerLabel, type VipAffiliationBroker } from "@/lib/vip/identity";
import s from "./VipAdmin.module.css";

type Broker = VipAffiliationBroker;
type Origin = "" | Broker | "abonnement";
type Invitation = VipInvitation;
type MembersPayload = { members: VipMembership[]; invitations: Invitation[]; settings: { telegramConfigured: boolean } };
type GeneratedInvitation = { code: string; activationUrl: string; invitation: Invitation };
type Tab = "members" | "requests" | "posts" | "settings";
const blankPost = { category: "signal", title: "", body: "", symbol: "", direction: "", entry: "", stopLoss: "", takeProfit: "", takeProfit2: "", imageUrl: "" };
const brokers = VIP_AFFILIATION_BROKERS;
type Identity = { first_name?: string | null; last_name?: string | null; affiliation_broker?: Broker | null; type: "affiliation" | "abonnement" };
function memberName(identity: Identity, tr: (value: string) => string = value => value) { return [identity.first_name, identity.last_name].filter(Boolean).join(" ").trim() || tr("Nom à renseigner"); }
function originLabel(identity: Identity, tr: (value: string) => string = value => value) { return identity.type === "abonnement" ? tr("Abonnement mensuel") : `${tr("Affiliation")} · ${vipAffiliationBrokerLabel(identity.affiliation_broker) || tr("Broker à renseigner")}`; }
function searchable(value: string) { return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(); }

function accessStatus(member: VipMembership, asOf: number) {
  if (member.status === "suspended") return "Suspendu";
  if (member.expires_at && new Date(member.expires_at).getTime() <= asOf) return "Expiré";
  if (member.expires_at && new Date(member.expires_at).getTime() - asOf <= 3 * 86400000) return "Échéance proche";
  return "VIP actif";
}

export default function VipAdminPage() {
  const { t: tr, locale } = useLocale();
  const [tab, setTab] = useState<Tab>("members");
  const [data, setData] = useState<MembersPayload | null>(null);
  const [requests, setRequests] = useState<VipAccessRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState("");
  const [asOf, setAsOf] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [origin, setOrigin] = useState<Origin>("");
  const [generated, setGenerated] = useState<GeneratedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [post, setPost] = useState(blankPost);
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState("all");
  const [editing, setEditing] = useState<{ userId: string; firstName: string; lastName: string; affiliationBroker: Broker | "" } | null>(null);
  const load = useCallback(async (signal?: AbortSignal, includeSettings = false) => {
    try {
      const [members, settings, intake] = await Promise.all([
        vipRequest<MembersPayload>("/api/admin/vip/members", { signal }),
        includeSettings ? vipRequest<{ telegramInviteUrl: string | null }>("/api/admin/vip/settings", { signal }) : Promise.resolve(null),
        vipRequest<{ requests: VipAccessRequest[] }>("/api/admin/vip/requests", { signal }).then(value => ({ value, error: "" })).catch(cause => ({ value: null, error: cause instanceof Error ? cause.message : tr("Demandes indisponibles.") })),
      ]);
      if (signal?.aborted) return;
      setError(""); setData(members); setAsOf(Date.now()); if (settings) setTelegramUrl(settings.telegramInviteUrl || "");
      setRequests(intake.value?.requests || null); setRequestsError(intake.error);
    } catch (cause) { if (!signal?.aborted) { setError(cause instanceof Error ? cause.message : tr("Impossible de charger l’administration VIP.")); setData(null); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [tr]);
  // The initial authenticated fetch updates state after network I/O, with cancellation on unmount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal, true); return () => controller.abort(); }, [load]);
  async function action(actionName: string, values: Record<string, string>) {
    setBusy(`${actionName}-${values.userId || values.id || ""}`); setMessage(""); setError("");
    try { await vipRequest("/api/admin/vip/members", { method: "POST", body: JSON.stringify({ action: actionName, ...values }) }); setMessage(actionName === "renew" ? tr("Renouvellement confirmé après votre vérification du paiement.") : tr("L’accès a été mis à jour.")); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("Impossible de modifier cet accès.")); }
    finally { setBusy(""); }
  }
  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy("invite"); setMessage(""); setError(""); setGenerated(null); setCopied(false);
    try {
      if (!origin) throw new Error(tr("Choisissez l’origine de cet accès."));
      const type = origin === "abonnement" ? "abonnement" : "affiliation";
      const validation = validateVipIdentity({ firstName, lastName, affiliationBroker: type === "abonnement" ? null : origin }, type);
      if (!validation.ok) throw new Error(validation.error);
      const result = await vipRequest<GeneratedInvitation>("/api/admin/vip/members", { method: "POST", body: JSON.stringify({ action: "invite", email: email.trim(), firstName: validation.identity.first_name, lastName: validation.identity.last_name, type, affiliationBroker: validation.identity.affiliation_broker }) });
      setGenerated({ ...result, activationUrl: new URL(result.activationUrl, window.location.origin).toString() });
      setFirstName(""); setLastName(""); setEmail(""); setOrigin("");
      setMessage(tr("Invitation personnelle créée. Transmettez le lien au membre sur Telegram.")); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Impossible de créer l’invitation.")); }
    finally { setBusy(""); }
  }
  async function updateIdentity(event: FormEvent, member: VipMembership) {
    event.preventDefault();
    if (!editing || editing.userId !== member.user_id) return;
    setBusy(`identity-${member.user_id}`); setMessage(""); setError("");
    try {
      const validation = validateVipIdentity({ firstName: editing.firstName, lastName: editing.lastName, affiliationBroker: member.type === "affiliation" ? editing.affiliationBroker : null }, member.type);
      if (!validation.ok) throw new Error(validation.error);
      await vipRequest("/api/admin/vip/members", { method: "POST", body: JSON.stringify({ action: "updateIdentity", userId: member.user_id, firstName: validation.identity.first_name, lastName: validation.identity.last_name, affiliationBroker: validation.identity.affiliation_broker }) });
      setEditing(null); setMessage(tr("La fiche du membre a été mise à jour.")); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Impossible de modifier cette fiche.")); }
    finally { setBusy(""); }
  }
  async function copyInvitation() {
    if (!generated) return;
    try { await navigator.clipboard.writeText(generated.activationUrl); setCopied(true); }
    catch { setMessage(tr("La copie automatique est indisponible. Sélectionnez et copiez le lien affiché.")); }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); setBusy("settings"); setMessage(""); setError("");
    try { await vipRequest("/api/admin/vip/settings", { method: "POST", body: JSON.stringify({ telegramInviteUrl: telegramUrl.trim() }) }); setMessage(tr("Le lien privé Telegram a été enregistré.")); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("Impossible d’enregistrer le lien.")); }
    finally { setBusy(""); }
  }
  async function publish(event: FormEvent) {
    event.preventDefault(); setBusy("publish"); setMessage(""); setError("");
    try {
      const levels: Record<string, number> = {};
      for (const key of ["entry", "stopLoss", "takeProfit", "takeProfit2"] as const) {
        if (!post[key].trim()) continue;
        const value = Number(post[key].replace(",", "."));
        if (!Number.isFinite(value) || value <= 0) throw new Error(tr("Les niveaux doivent être des nombres positifs."));
        levels[key] = value;
      }
      await vipRequest<{ post: VipPost }>("/api/admin/vip/posts", { method: "POST", body: JSON.stringify({ category: post.category, title: post.title.trim(), body: post.body.trim(), symbol: post.symbol.trim() || undefined, direction: post.direction || undefined, levels, imageUrl: post.imageUrl.trim() || undefined }) });
      setPost(blankPost); setMessage(tr("Votre publication est disponible dans le canal privé."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("La publication a échoué.")); }
    finally { setBusy(""); }
  }
  const query = searchable(search.trim());
  const members = data?.members.filter((member) => {
    const matchesOrigin = originFilter === "all" || (originFilter === "abonnement" ? member.type === "abonnement" : originFilter === "unknown" ? member.type === "affiliation" && !member.affiliation_broker : member.type === "affiliation" && member.affiliation_broker === originFilter);
    return matchesOrigin && searchable(`${memberName(member, tr)} ${member.email} ${originLabel(member, tr)} ${member.affiliation_broker || ""}`).includes(query);
  }) || [];
  return <div className={s.admin}>
    <header className={s.heading}><div><span className={s.eyebrow}>{tr("ADMINISTRATION INVESTPRO")}</span><h1>{tr("Votre cercle.")}<br /><em>{tr("Des accès clairs.")}</em></h1><p>{tr("Invitez vos membres, publiez vos contenus et suivez les échéances.")}</p></div><Link className={s.secondary} href="/dashboard/vip">{tr("Voir l’espace VIP ")}<ArrowUpRight size={16} /></Link></header>
    {loading ? <div className={s.empty} role="status">{tr("Chargement de l’administration VIP…")}</div> : <>
      {error && <p className={s.error} role="alert">{tr(error)}</p>}{message && <p className={s.message} role="status">{message}</p>}
      {data ? <>
        <nav className={s.tabs} aria-label={tr("Administration VIP")}>{[{ key: "members", title: tr("Membres"), Icon: Users }, { key: "requests", title: (tr("À vérifier") + (requests ? ` · ${requests.length}` : "")), Icon: ShieldCheck }, { key: "posts", title: tr("Publications"), Icon: Send }, { key: "settings", title: tr("Paramètres"), Icon: Settings }].map(({ key, title, Icon }) => <button type="button" aria-pressed={tab === key} key={key} onClick={() => setTab(key as Tab)}><Icon size={16} />{title}</button>)}<button type="button" className={s.reload} aria-label={tr("Actualiser les accès")} onClick={() => void load()} disabled={Boolean(busy)}><RefreshCw size={16} /></button></nav>
        {tab === "requests" && <VipAccessRequestsAdmin requests={requests} error={requestsError} onRefresh={() => load()} />}
        {tab === "members" && <>
          <div className={s.summary}><div><span>{tr("Membres")}</span><b>{data.members.length}</b></div><div><span>{tr("À renouveler")}</span><b>{data.members.filter((member) => member.renewal_requested_at).length}</b></div><div><span>{tr("Invitations en attente")}</span><b>{data.invitations.filter((invitation) => !invitation.redeemed_at && !invitation.revoked_at && new Date(invitation.expires_at).getTime() > asOf).length}</b></div></div>
          <section className={s.card}>
            <div className={s.cardHeading}><KeyRound size={19} /><h2>{tr("Préparer une invitation personnelle")}</h2></div>
            <div className={s.invitationKinds}><span><b>{tr("Affiliation")}</b>{tr(" Le broker d’origine reste associé à la fiche.")}</span><span><b>{tr("Abonnement mensuel")}</b>{tr(" Un mois après activation, sans broker à choisir.")}</span></div>
            <form onSubmit={invite} className={s.inviteForm}>
              <div className={s.nameFields}>
                <label>{tr("Prénom")}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="off" maxLength={80} placeholder={tr("Prénom du membre")} required /></label>
                <label>{tr("Nom")}<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="off" maxLength={80} placeholder={tr("Nom du membre")} required /></label>
              </div>
              <label>{tr("E-mail du compte invité")}<input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={tr("E-mail du membre")} required /></label>
              <label>{tr("Origine de l’accès")}<select value={origin} onChange={(event) => setOrigin(event.target.value as Origin)} required><option value="" disabled>{tr("Choisir l’origine de l’accès")}</option>{brokers.map((broker) => <option key={broker.value} value={broker.value}>{tr("Affiliation · ")}{broker.label}</option>)}<option value="abonnement">{tr("Abonnement mensuel")}</option></select></label>
              <button className={s.primary} disabled={Boolean(busy)}><Plus size={16} />{busy === "invite" ? tr("Création…") : tr("Générer l’invitation")}</button>
            </form>
            <p className={s.fine}>{tr("Le code est individuel, lié à cet e-mail et utilisable une seule fois. Vous transmettez l’invitation manuellement.")}</p>
            {generated && <div className={s.generated}><b>{tr("Invitation prête pour ")}{memberName(generated.invitation, tr)}</b><span className={s.identityMeta}>{generated.invitation.email} · {originLabel(generated.invitation, tr)}</span><label>{tr("Lien d’activation")}<input value={generated.activationUrl} readOnly onFocus={(event) => event.target.select()} /></label><code>{generated.code}</code><button type="button" className={s.secondary} onClick={copyInvitation}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? tr("Lien copié") : tr("Copier le lien personnel")}</button><small>{tr("Validité : ")}{vipDate(generated.invitation.expires_at, locale)}{tr(". Conservez ce lien pour le transmettre au membre.")}</small></div>}
          </section>
          <section className={s.card}>
            <div className={s.listHeading}><h2>{tr("Les accès de vos membres")}</h2><div className={s.listFilters}><label className={s.search}><span className={s.srOnly}>{tr("Rechercher un membre par nom, prénom, e-mail ou broker")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Nom, e-mail ou broker…")} type="search" /></label><label className={s.originFilter}><span className={s.srOnly}>{tr("Filtrer les membres par origine de l’accès")}</span><select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}><option value="all">{tr("Toutes les origines")}</option>{brokers.map((broker) => <option value={broker.value} key={broker.value}>{tr("Affiliation · ")}{broker.label}</option>)}<option value="abonnement">{tr("Abonnement mensuel")}</option><option value="unknown">{tr("Affiliation · Broker à renseigner")}</option></select></label></div></div>
            <div className={s.members}>{members.length ? members.map((member) => <article className={s.member} key={member.user_id}>
              <div className={s.memberHeading}><div><h3>{memberName(member, tr)}</h3><span className={s.memberEmail}>{member.email}</span><small>{originLabel(member, tr)}</small></div><span className={s.badge} data-status={accessStatus(member, asOf)}>{tr(accessStatus(member, asOf))}</span></div>
              <dl className={s.dates}><div><dt>{tr("Activation")}</dt><dd>{vipDate(member.started_at, locale)}</dd></div><div><dt>{tr("Fin d’accès")}</dt><dd>{vipDate(member.expires_at, locale)}</dd></div></dl>
              {member.renewal_requested_at && <p className={s.renewal}>{tr("Renouvellement demandé le ")}{vipDate(member.renewal_requested_at, locale)}{tr(". Règlement à vérifier manuellement.")}</p>}
              {editing?.userId === member.user_id ? <form className={s.identityForm} onSubmit={(event) => void updateIdentity(event, member)}>
                <div className={s.nameFields}><label>{tr("Prénom")}<input value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} maxLength={80} autoComplete="off" required /></label><label>{tr("Nom")}<input value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} maxLength={80} autoComplete="off" required /></label></div>
                {member.type === "affiliation" ? <label>{tr("Broker de l’affiliation")}<select value={editing.affiliationBroker} onChange={(event) => setEditing({ ...editing, affiliationBroker: event.target.value as Broker })} required><option value="" disabled>{tr("Choisir le broker")}</option>{brokers.map((broker) => <option value={broker.value} key={broker.value}>{broker.label}</option>)}</select></label> : <p className={s.fine}>{tr("Origine conservée : abonnement mensuel.")}</p>}
                <div className={s.identityActions}><button className={s.primary} disabled={Boolean(busy)}>{busy === `identity-${member.user_id}` ? tr("Enregistrement…") : tr("Enregistrer la fiche")}</button><button type="button" className={s.secondary} onClick={() => setEditing(null)} disabled={Boolean(busy)}>{tr("Annuler")}</button></div>
              </form> : <button type="button" className={s.editIdentity} onClick={() => setEditing({ userId: member.user_id, firstName: member.first_name || "", lastName: member.last_name || "", affiliationBroker: member.affiliation_broker || "" })} disabled={Boolean(busy)}><Pencil size={14} />{tr("Modifier la fiche")}</button>}
              <div className={s.actions}><button type="button" className={s.secondary} onClick={() => void action(member.status === "suspended" ? "resume" : "suspend", { userId: member.user_id })} disabled={Boolean(busy)}>{member.status === "suspended" ? tr("Réactiver l’accès") : tr("Suspendre l’accès")}</button>{member.type === "abonnement" && <button type="button" className={s.primary} onClick={() => void action("renew", { userId: member.user_id })} disabled={Boolean(busy)}><ShieldCheck size={15} />{tr("Confirmer le paiement et renouveler")}</button>}</div>
            </article>) : <div className={s.empty}>{search || originFilter !== "all" ? tr("Aucun membre ne correspond à ces filtres.") : tr("Vos membres apparaîtront après activation de leur invitation.")}</div>}</div>
          </section>
          {data.invitations.length > 0 && <section className={s.card}><h2>{tr("Invitations")}</h2><div className={s.invitations}>{data.invitations.map((invitation) => <div className={s.invitationRow} key={invitation.id}><div><b>{memberName(invitation, tr)}</b><span className={s.memberEmail}>{invitation.email}</span><small>{originLabel(invitation, tr)} · {vipDate(invitation.created_at, locale)} · {invitation.revoked_at ? tr("Révoquée") : invitation.redeemed_at ? tr("Activée") : new Date(invitation.expires_at).getTime() <= asOf ? tr("Expirée") : tr("En attente")}</small></div>{!invitation.revoked_at && !invitation.redeemed_at && <button type="button" className={s.secondary} disabled={Boolean(busy)} onClick={() => void action("revokeInvitation", { id: invitation.id })}>{tr("Révoquer")}</button>}</div>)}</div></section>}
          <p className={s.manual}><MessageCircle size={18} /><span>{tr("Telegram reste manuel : l’équipe valide l’entrée et retire les membres du canal séparément. La fin d’accès InvestPro ne retire personne de Telegram.")}</span></p>
        </>}
        {tab === "posts" && <section className={s.card}><div className={s.cardHeading}><Send size={20} /><h2>{tr("Publier dans le cercle privé")}</h2></div><form onSubmit={publish} className={s.postForm}><div className={s.fields}><label>{tr("Type de publication")}<select value={post.category} onChange={(event) => setPost({ ...post, category: event.target.value })}><option value="signal">{tr("Signal")}</option><option value="analysis">{tr("Analyse")}</option><option value="followup">{tr("Suivi")}</option><option value="partnership">{tr("Partenariat")}</option></select></label><label>{tr("Titre")}<input value={post.title} onChange={(event) => setPost({ ...post, title: event.target.value })} required maxLength={160} placeholder={tr("Titre de votre publication")} /></label></div><label>{tr("Votre message")}<textarea value={post.body} onChange={(event) => setPost({ ...post, body: event.target.value })} rows={7} required maxLength={12000} placeholder={tr("Le contexte, le scénario ou votre mise à jour…")} /></label><details className={s.optional}><summary>{tr("Ajouter un actif, des niveaux ou une image")}</summary><div className={s.fields}><label>{tr("Actif")}<input value={post.symbol} onChange={(event) => setPost({ ...post, symbol: event.target.value.toUpperCase() })} maxLength={30} placeholder={tr("Ex. XAUUSD")} /></label><label>{tr("Sens")}<select value={post.direction} onChange={(event) => setPost({ ...post, direction: event.target.value })}><option value="">{tr("Non précisé")}</option><option value="buy">{tr("Achat")}</option><option value="sell">{tr("Vente")}</option></select></label></div><div className={s.levelFields}>{[["entry", tr("Entrée")], ["stopLoss", "Stop loss"], ["takeProfit", tr("Objectif 1")], ["takeProfit2", tr("Objectif 2")]].map(([key, label]) => <label key={key}>{label}<input value={post[key as keyof typeof blankPost]} onChange={(event) => setPost({ ...post, [key]: event.target.value })} inputMode="decimal" placeholder={tr("Facultatif")} /></label>)}</div><label>{tr("Image · lien HTTPS")}<input type="url" value={post.imageUrl} onChange={(event) => setPost({ ...post, imageUrl: event.target.value })} placeholder={tr("https://…")} /></label></details><button className={s.primary} disabled={Boolean(busy)}><Send size={16} />{busy === "publish" ? tr("Publication…") : tr("Publier dans le canal VIP")}</button><p className={s.fine}>{tr("La publication est réservée aux membres autorisés. Les niveaux décrivent votre scénario ; aucune opération de trading n’est exécutée.")}</p></form></section>}
        {tab === "settings" && <section className={s.card}><div className={s.cardHeading}><Settings size={20} /><h2>{tr("Votre canal Telegram")}</h2></div><p className={s.fine}>{data.settings.telegramConfigured ? tr("Le lien privé du canal est configuré.") : tr("Le lien privé n’est pas encore configuré. Aucun faux lien n’est présenté aux membres.")}</p><form onSubmit={saveSettings} className={s.settingsForm}><label>{tr("Lien d’invitation privé")}<input type="url" value={telegramUrl} onChange={(event) => setTelegramUrl(event.target.value)} placeholder={tr("https://t.me/…")} autoComplete="off" /></label><p className={s.fine}>{tr("Ce lien est affiché uniquement aux membres VIP actifs. La validation des entrées et sorties reste manuelle sur Telegram.")}</p><button className={s.primary} disabled={Boolean(busy)}>{busy === "settings" ? tr("Enregistrement…") : tr("Enregistrer le lien privé")}</button></form></section>}
      </> : <div className={s.empty}><button type="button" className={s.secondary} onClick={() => void load(undefined, true)}>{tr("Réessayer ")}<RefreshCw size={16} /></button></div>}
    </>}
  </div>;
}
