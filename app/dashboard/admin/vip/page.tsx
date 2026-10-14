"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, KeyRound, MessageCircle, Plus, RefreshCw, Send, Settings, ShieldCheck, Users } from "lucide-react";
import { vipDate, vipRequest, type VipMembership, type VipPost } from "@/lib/vip/client";
import s from "./VipAdmin.module.css";

type Invitation = { id: string; email: string; type: "affiliation" | "abonnement"; created_at: string; expires_at: string; redeemed_at: string | null; revoked_at: string | null };
type MembersPayload = { members: VipMembership[]; invitations: Invitation[]; settings: { telegramConfigured: boolean } };
type GeneratedInvitation = { code: string; activationUrl: string; invitation: Invitation };
type Tab = "members" | "posts" | "settings";
const blankPost = { category: "signal", title: "", body: "", symbol: "", direction: "", entry: "", stopLoss: "", takeProfit: "", takeProfit2: "", imageUrl: "" };

function accessStatus(member: VipMembership, asOf: number) {
  if (member.status === "suspended") return "Suspendu";
  if (member.expires_at && new Date(member.expires_at).getTime() <= asOf) return "Expiré";
  if (member.expires_at && new Date(member.expires_at).getTime() - asOf <= 3 * 86400000) return "Échéance proche";
  return "VIP actif";
}

export default function VipAdminPage() {
  const [tab, setTab] = useState<Tab>("members");
  const [data, setData] = useState<MembersPayload | null>(null);
  const [asOf, setAsOf] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"affiliation" | "abonnement">("affiliation");
  const [generated, setGenerated] = useState<GeneratedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [post, setPost] = useState(blankPost);
  const [search, setSearch] = useState("");
  const load = useCallback(async (signal?: AbortSignal, includeSettings = false) => {
    try {
      const [members, settings] = await Promise.all([
        vipRequest<MembersPayload>("/api/admin/vip/members", { signal }),
        includeSettings ? vipRequest<{ telegramInviteUrl: string | null }>("/api/admin/vip/settings", { signal }) : Promise.resolve(null),
      ]);
      if (signal?.aborted) return;
      setError(""); setData(members); setAsOf(Date.now()); if (settings) setTelegramUrl(settings.telegramInviteUrl || "");
    } catch (cause) { if (!signal?.aborted) { setError(cause instanceof Error ? cause.message : "Impossible de charger l’administration VIP."); setData(null); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // The initial authenticated fetch updates state after network I/O, with cancellation on unmount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal, true); return () => controller.abort(); }, [load]);
  async function action(actionName: string, values: Record<string, string>) {
    setBusy(`${actionName}-${values.userId || values.id || ""}`); setMessage(""); setError("");
    try { await vipRequest("/api/admin/vip/members", { method: "POST", body: JSON.stringify({ action: actionName, ...values }) }); setMessage(actionName === "renew" ? "Renouvellement confirmé après votre vérification du paiement." : "L’accès a été mis à jour."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de modifier cet accès."); }
    finally { setBusy(""); }
  }
  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy("invite"); setMessage(""); setError(""); setGenerated(null); setCopied(false);
    try {
      const result = await vipRequest<GeneratedInvitation>("/api/admin/vip/members", { method: "POST", body: JSON.stringify({ action: "invite", email: email.trim(), type }) });
      setGenerated({ ...result, activationUrl: new URL(result.activationUrl, window.location.origin).toString() });
      setMessage("Invitation personnelle créée. Transmettez le lien au membre sur Telegram."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de créer l’invitation."); }
    finally { setBusy(""); }
  }
  async function copyInvitation() {
    if (!generated) return;
    try { await navigator.clipboard.writeText(generated.activationUrl); setCopied(true); }
    catch { setMessage("La copie automatique est indisponible. Sélectionnez et copiez le lien affiché."); }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); setBusy("settings"); setMessage(""); setError("");
    try { await vipRequest("/api/admin/vip/settings", { method: "POST", body: JSON.stringify({ telegramInviteUrl: telegramUrl.trim() }) }); setMessage("Le lien privé Telegram a été enregistré."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer le lien."); }
    finally { setBusy(""); }
  }
  async function publish(event: FormEvent) {
    event.preventDefault(); setBusy("publish"); setMessage(""); setError("");
    try {
      const levels: Record<string, number> = {};
      for (const key of ["entry", "stopLoss", "takeProfit", "takeProfit2"] as const) {
        if (!post[key].trim()) continue;
        const value = Number(post[key].replace(",", "."));
        if (!Number.isFinite(value) || value <= 0) throw new Error("Les niveaux doivent être des nombres positifs.");
        levels[key] = value;
      }
      await vipRequest<{ post: VipPost }>("/api/admin/vip/posts", { method: "POST", body: JSON.stringify({ category: post.category, title: post.title.trim(), body: post.body.trim(), symbol: post.symbol.trim() || undefined, direction: post.direction || undefined, levels, imageUrl: post.imageUrl.trim() || undefined }) });
      setPost(blankPost); setMessage("Votre publication est disponible dans le canal privé.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La publication a échoué."); }
    finally { setBusy(""); }
  }
  const members = data?.members.filter((member) => member.email.toLowerCase().includes(search.trim().toLowerCase())) || [];
  return <div className={s.admin}>
    <header className={s.heading}><div><span className={s.eyebrow}>ADMINISTRATION INVESTPRO</span><h1>Votre cercle.<br /><em>Des accès clairs.</em></h1><p>Invitez vos membres, publiez vos contenus et suivez les échéances.</p></div><Link className={s.secondary} href="/dashboard/vip">Voir l’espace VIP <ArrowUpRight size={16} /></Link></header>
    {loading ? <div className={s.empty} role="status">Chargement de l’administration VIP…</div> : <>
      {error && <p className={s.error} role="alert">{error}</p>}{message && <p className={s.message} role="status">{message}</p>}
      {data ? <>
        <nav className={s.tabs} aria-label="Administration VIP">{[{ key: "members", title: "Membres", Icon: Users }, { key: "posts", title: "Publications", Icon: Send }, { key: "settings", title: "Paramètres", Icon: Settings }].map(({ key, title, Icon }) => <button type="button" aria-pressed={tab === key} key={key} onClick={() => setTab(key as Tab)}><Icon size={16} />{title}</button>)}<button type="button" className={s.reload} aria-label="Actualiser les accès" onClick={() => void load()} disabled={Boolean(busy)}><RefreshCw size={16} /></button></nav>
        {tab === "members" && <>
          <div className={s.summary}><div><span>Membres</span><b>{data.members.length}</b></div><div><span>À renouveler</span><b>{data.members.filter((member) => member.renewal_requested_at).length}</b></div><div><span>Invitations en attente</span><b>{data.invitations.filter((invitation) => !invitation.redeemed_at && !invitation.revoked_at && new Date(invitation.expires_at).getTime() > asOf).length}</b></div></div>
          <section className={s.card}><div className={s.cardHeading}><KeyRound size={19} /><h2>Préparer une invitation personnelle</h2></div><div className={s.invitationKinds}><span><b>AFF · Affiliation</b> Sans échéance automatique.</span><span><b>ABO · Abonnement</b> Un mois après activation.</span></div><form onSubmit={invite} className={s.inviteForm}><label>E-mail du compte invité<input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail du membre" required /></label><label>Origine de l’accès<select value={type} onChange={(event) => setType(event.target.value as "affiliation" | "abonnement")}><option value="affiliation">Affiliation · AFF</option><option value="abonnement">Abonnement · ABO</option></select></label><button className={s.primary} disabled={Boolean(busy)}><Plus size={16} />{busy === "invite" ? "Création…" : "Générer l’invitation"}</button></form><p className={s.fine}>Le code est individuel, lié à cet e-mail et utilisable une seule fois. Vous transmettez l’invitation manuellement.</p>
            {generated && <div className={s.generated}><b>Invitation prête pour {generated.invitation.email}</b><label>Lien d’activation<input value={generated.activationUrl} readOnly onFocus={(event) => event.target.select()} /></label><code>{generated.code}</code><button type="button" className={s.secondary} onClick={copyInvitation}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Lien copié" : "Copier le lien personnel"}</button><small>Validité : {vipDate(generated.invitation.expires_at)}. Conservez ce lien pour le transmettre au membre.</small></div>}
          </section>
          <section className={s.card}><div className={s.listHeading}><h2>Les accès de vos membres</h2><label className={s.search}><span className={s.srOnly}>Rechercher un membre par e-mail</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un e-mail…" type="search" /></label></div><div className={s.members}>{members.length ? members.map((member) => <article className={s.member} key={member.user_id}><div className={s.memberHeading}><div><h3>{member.email}</h3><small>{member.type === "affiliation" ? "Affiliation · AFF" : "Abonnement · ABO"}</small></div><span className={s.badge} data-status={accessStatus(member, asOf)}>{accessStatus(member, asOf)}</span></div><dl className={s.dates}><div><dt>Activation</dt><dd>{vipDate(member.started_at)}</dd></div><div><dt>Fin d’accès</dt><dd>{vipDate(member.expires_at)}</dd></div></dl>{member.renewal_requested_at && <p className={s.renewal}>Renouvellement demandé le {vipDate(member.renewal_requested_at)}. Règlement à vérifier manuellement.</p>}<div className={s.actions}><button type="button" className={s.secondary} onClick={() => void action(member.status === "suspended" ? "resume" : "suspend", { userId: member.user_id })} disabled={Boolean(busy)}>{member.status === "suspended" ? "Réactiver l’accès" : "Suspendre l’accès"}</button>{member.type === "abonnement" && <button type="button" className={s.primary} onClick={() => void action("renew", { userId: member.user_id })} disabled={Boolean(busy)}><ShieldCheck size={15} />Confirmer le paiement et renouveler</button>}</div></article>) : <div className={s.empty}>{search ? "Aucun membre ne correspond à cette recherche." : "Vos membres apparaîtront après activation de leur invitation."}</div>}</div></section>
          {data.invitations.length > 0 && <section className={s.card}><h2>Invitations</h2><div className={s.invitations}>{data.invitations.map((invitation) => <div className={s.invitationRow} key={invitation.id}><div><b>{invitation.email}</b><small>{invitation.type === "affiliation" ? "AFF" : "ABO"} · {vipDate(invitation.created_at)} · {invitation.revoked_at ? "Révoquée" : invitation.redeemed_at ? "Activée" : new Date(invitation.expires_at).getTime() <= asOf ? "Expirée" : "En attente"}</small></div>{!invitation.revoked_at && !invitation.redeemed_at && <button type="button" className={s.secondary} disabled={Boolean(busy)} onClick={() => void action("revokeInvitation", { id: invitation.id })}>Révoquer</button>}</div>)}</div></section>}
          <p className={s.manual}><MessageCircle size={18} /><span>Telegram reste manuel : l’équipe valide l’entrée et retire les membres du canal séparément. La fin d’accès InvestPro ne retire personne de Telegram.</span></p>
        </>}
        {tab === "posts" && <section className={s.card}><div className={s.cardHeading}><Send size={20} /><h2>Publier dans le cercle privé</h2></div><form onSubmit={publish} className={s.postForm}><div className={s.fields}><label>Type de publication<select value={post.category} onChange={(event) => setPost({ ...post, category: event.target.value })}><option value="signal">Signal</option><option value="analysis">Analyse</option><option value="followup">Suivi</option><option value="partnership">Partenariat</option></select></label><label>Titre<input value={post.title} onChange={(event) => setPost({ ...post, title: event.target.value })} required maxLength={160} placeholder="Titre de votre publication" /></label></div><label>Votre message<textarea value={post.body} onChange={(event) => setPost({ ...post, body: event.target.value })} rows={7} required maxLength={12000} placeholder="Le contexte, le scénario ou votre mise à jour…" /></label><details className={s.optional}><summary>Ajouter un actif, des niveaux ou une image</summary><div className={s.fields}><label>Actif<input value={post.symbol} onChange={(event) => setPost({ ...post, symbol: event.target.value.toUpperCase() })} maxLength={30} placeholder="Ex. XAUUSD" /></label><label>Sens<select value={post.direction} onChange={(event) => setPost({ ...post, direction: event.target.value })}><option value="">Non précisé</option><option value="buy">Achat</option><option value="sell">Vente</option></select></label></div><div className={s.levelFields}>{[["entry", "Entrée"], ["stopLoss", "Stop loss"], ["takeProfit", "Objectif 1"], ["takeProfit2", "Objectif 2"]].map(([key, label]) => <label key={key}>{label}<input value={post[key as keyof typeof blankPost]} onChange={(event) => setPost({ ...post, [key]: event.target.value })} inputMode="decimal" placeholder="Facultatif" /></label>)}</div><label>Image · lien HTTPS<input type="url" value={post.imageUrl} onChange={(event) => setPost({ ...post, imageUrl: event.target.value })} placeholder="https://…" /></label></details><button className={s.primary} disabled={Boolean(busy)}><Send size={16} />{busy === "publish" ? "Publication…" : "Publier dans le canal VIP"}</button><p className={s.fine}>La publication est réservée aux membres autorisés. Les niveaux décrivent votre scénario ; aucune opération de trading n’est exécutée.</p></form></section>}
        {tab === "settings" && <section className={s.card}><div className={s.cardHeading}><Settings size={20} /><h2>Votre canal Telegram</h2></div><p className={s.fine}>{data.settings.telegramConfigured ? "Le lien privé du canal est configuré." : "Le lien privé n’est pas encore configuré. Aucun faux lien n’est présenté aux membres."}</p><form onSubmit={saveSettings} className={s.settingsForm}><label>Lien d’invitation privé<input type="url" value={telegramUrl} onChange={(event) => setTelegramUrl(event.target.value)} placeholder="https://t.me/…" autoComplete="off" /></label><p className={s.fine}>Ce lien est affiché uniquement aux membres VIP actifs. La validation des entrées et sorties reste manuelle sur Telegram.</p><button className={s.primary} disabled={Boolean(busy)}>{busy === "settings" ? "Enregistrement…" : "Enregistrer le lien privé"}</button></form></section>}
      </> : <div className={s.empty}><button type="button" className={s.secondary} onClick={() => void load(undefined, true)}>Réessayer <RefreshCw size={16} /></button></div>}
    </>}
  </div>;
}
