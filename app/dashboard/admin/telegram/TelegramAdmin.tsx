"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Bot, CalendarClock, ExternalLink, Flame, MessageCircle, RefreshCw, Search, Send, Snowflake, Sparkles, Sun, UserPlus, Users } from "lucide-react";
import { useAdminPreviewNavigation } from "@/components/admin/AdminPreviewNavigation";
import AdminPhoneAlerts from "@/components/admin/AdminPhoneAlerts";
import { vipRequest, type VipMembership } from "@/lib/vip/client";
import type { VipAccessRequest } from "@/lib/vip/types";
import { vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { TELEGRAM_ADMIN_VIEWS, type TelegramAdminView } from "@/app/admin-preview/admin-tool-access";
import s from "./TelegramAdmin.module.css";
import AgentTelegram from "./AgentTelegram";
import BotConnection from "./BotConnection";

type Application = {
  id: string; status: "submitted" | "approved" | "denied" | "claimed";
  first_name: string; last_name: string; email: string; telegram_username: string; phone_whatsapp: string;
  affiliation_broker: string; created_at: string; approval_email_sent_at: string | null; claimed_user_id: string | null;
};
type Data = { members: VipMembership[]; requests: VipAccessRequest[]; applications: Application[]; inviteUrl: string | null };
type Temperature = "hot" | "warm" | "cold" | "revive";
type Lead = { key: string; name: string; detail: string; since: string; temperature: Temperature; telegram?: string | null; phone?: string | null; email?: string };

const DAY = 86400000;
const TABS: { view: TelegramAdminView; label: string; Icon: typeof Send }[] = [
  { view: "overview", label: "Vue d’ensemble", Icon: Send },
  { view: "new", label: "Nouveaux membres", Icon: UserPlus },
  { view: "members", label: "Membres", Icon: Users },
  { view: "subscriptions", label: "Abonnements", Icon: CalendarClock },
  { view: "relances", label: "Relances & prospects", Icon: Flame },
  { view: "agent", label: "Agent Telegram", Icon: Sparkles },
  { view: "activity", label: "Activité du canal", Icon: Activity },
  { view: "bot", label: "Réglages du bot", Icon: Bot },
];

function fullName(first?: string | null, last?: string | null) { return [first, last].filter(Boolean).join(" ").trim() || "Nom à renseigner"; }
function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(date);
}
function daysUntil(value: string | null, now: number) { return value ? Math.ceil((new Date(value).getTime() - now) / DAY) : null; }
function ago(value: string, now: number) {
  const days = Math.floor((now - new Date(value).getTime()) / DAY);
  return days <= 0 ? "aujourd’hui" : days === 1 ? "hier" : `il y a ${days} j`;
}
function memberState(member: VipMembership, now: number): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (member.status === "suspended") return { label: "Suspendu", tone: "muted" };
  const left = daysUntil(member.expires_at, now);
  if (left === null) return { label: "Actif · sans échéance", tone: "ok" };
  if (left < 0) return { label: `Expiré depuis ${-left} j`, tone: "bad" };
  if (left <= 7) return { label: left === 0 ? "Expire aujourd’hui" : `Expire dans ${left} j`, tone: "warn" };
  return { label: "Actif", tone: "ok" };
}
function waLink(phone?: string | null) { return phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null; }
function tgLink(handle?: string | null) { return handle ? `https://t.me/${encodeURIComponent(handle.replace(/^@/, ""))}` : null; }

function buildLeads(data: Data, now: number): Lead[] {
  const leads: Lead[] = [];
  for (const request of data.requests) {
    if (request.status !== "pending") continue;
    const waiting = !!request.completion_requested_at && !request.completion_submitted_at;
    const age = (now - new Date(request.created_at).getTime()) / DAY;
    leads.push({ key: "r" + request.id, name: fullName(request.first_name, request.last_name), detail: waiting ? "Dossier à compléter · relancer le membre" : "Demande VIP en attente de ta validation", since: request.created_at, temperature: waiting ? (age > 7 ? "cold" : "warm") : "hot", telegram: request.telegram_username, phone: request.phone_whatsapp, email: request.email });
  }
  for (const app of data.applications) {
    if (app.status === "submitted") leads.push({ key: "a" + app.id, name: fullName(app.first_name, app.last_name), detail: "Nouveau dossier à vérifier", since: app.created_at, temperature: "hot", telegram: app.telegram_username, phone: app.phone_whatsapp, email: app.email });
    else if (app.status === "approved" && !app.claimed_user_id) {
      const age = (now - new Date(app.approval_email_sent_at || app.created_at).getTime()) / DAY;
      leads.push({ key: "a" + app.id, name: fullName(app.first_name, app.last_name), detail: "Validé mais compte pas encore créé", since: app.approval_email_sent_at || app.created_at, temperature: age > 7 ? "cold" : "warm", telegram: app.telegram_username, phone: app.phone_whatsapp, email: app.email });
    }
  }
  for (const member of data.members) {
    const left = daysUntil(member.expires_at, now);
    if (member.status === "suspended" || left === null) continue;
    if (left < 0) leads.push({ key: "m" + member.user_id, name: fullName(member.first_name, member.last_name), detail: `Abonnement expiré depuis ${-left} j`, since: member.expires_at as string, temperature: "revive", email: member.email });
    else if (left <= 7) leads.push({ key: "m" + member.user_id, name: fullName(member.first_name, member.last_name), detail: left === 0 ? "Abonnement qui expire aujourd’hui" : `Abonnement qui expire dans ${left} j`, since: member.expires_at as string, temperature: "hot", email: member.email });
  }
  return leads;
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) { return <span className={s.pill} data-tone={tone}>{children}</span>; }
function Contact({ lead }: { lead: Pick<Lead, "telegram" | "phone" | "email"> }) {
  const tg = tgLink(lead.telegram), wa = waLink(lead.phone);
  return <div className={s.contact}>
    {tg && <a href={tg} target="_blank" rel="noreferrer" className={s.chip} data-kind="tg"><Send size={13} aria-hidden="true" />@{lead.telegram?.replace(/^@/, "")}</a>}
    {wa && <a href={wa} target="_blank" rel="noreferrer" className={s.chip} data-kind="wa"><MessageCircle size={13} aria-hidden="true" />WhatsApp</a>}
    {!tg && !wa && lead.email && <a href={`mailto:${lead.email}`} className={s.chip}>{lead.email}</a>}
  </div>;
}
function Soon({ children }: { children: ReactNode }) { return <p className={s.soon}><Sparkles size={14} aria-hidden="true" />{children}</p>; }

export default function TelegramAdmin() {
  const navigation = useAdminPreviewNavigation();
  const initial = (TELEGRAM_ADMIN_VIEWS as readonly string[]).includes(navigation?.vipView || "") ? navigation?.vipView as TelegramAdminView : "overview";
  const [view, setView] = useState<TelegramAdminView>(initial);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [search, setSearch] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const [members, requests, applications, settings] = await Promise.all([
        vipRequest<{ members: VipMembership[] }>("/api/admin/vip/members", { signal }),
        vipRequest<{ requests: VipAccessRequest[] }>("/api/admin/vip/requests", { signal }).catch(() => ({ requests: [] as VipAccessRequest[] })),
        vipRequest<{ applications: Application[] }>("/api/admin/vip/member-applications", { signal }).catch(() => ({ applications: [] as Application[] })),
        vipRequest<{ telegramInviteUrl: string | null }>("/api/admin/vip/settings", { signal }).catch(() => ({ telegramInviteUrl: null })),
      ]);
      if (signal?.aborted) return;
      setData({ members: members.members || [], requests: requests.requests || [], applications: applications.applications || [], inviteUrl: settings.telegramInviteUrl });
      setNow(Date.now());
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Données Telegram indisponibles."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  function go(next: TelegramAdminView) {
    setView(next);
    navigation?.onNavigate(`/dashboard/admin?tool=telegram&view=${next}`);
  }

  const leads = useMemo(() => data ? buildLeads(data, now) : [], [data, now]);
  const pendingNew = useMemo(() => data ? [
    ...data.applications.filter(item => item.status === "submitted").map(item => ({ key: "a" + item.id, name: fullName(item.first_name, item.last_name), since: item.created_at, info: vipAffiliationBrokerLabel(item.affiliation_broker as never) || item.affiliation_broker || "Nouveau membre", telegram: item.telegram_username, phone: item.phone_whatsapp, email: item.email, joined: null as string | null })),
    ...data.requests.filter(item => item.status === "pending").map(item => ({ key: "r" + item.id, name: fullName(item.first_name, item.last_name), since: item.created_at, info: item.request_kind === "new" ? "Nouvelle adhésion" : "Déjà membre Telegram", telegram: item.telegram_username, phone: item.phone_whatsapp, email: item.email, joined: item.channel_joined_at || null })),
  ].sort((a, b) => b.since.localeCompare(a.since)) : [], [data]);
  const members = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return (data?.members || []).filter(member => !query || `${member.first_name || ""} ${member.last_name || ""} ${member.email}`.toLocaleLowerCase("fr").includes(query));
  }, [data, search]);
  const renewals = useMemo(() => (data?.members || []).filter(member => member.expires_at && member.status !== "suspended").sort((a, b) => (a.expires_at as string).localeCompare(b.expires_at as string)), [data]);

  const active = data ? data.members.filter(member => member.status === "active" && (!member.expires_at || new Date(member.expires_at).getTime() > now)).length : 0;
  const expiring = renewals.filter(member => { const left = daysUntil(member.expires_at, now); return left !== null && left >= 0 && left <= 7; }).length;
  const expired = renewals.filter(member => { const left = daysUntil(member.expires_at, now); return left !== null && left < 0; }).length;

  return <div className={s.root}>
    <nav className={s.tabs} aria-label="Rubriques Telegram">
      {TABS.map(({ view: tab, label, Icon }) => <button type="button" key={tab} aria-current={view === tab ? "page" : undefined} onClick={() => go(tab)}><Icon size={15} aria-hidden="true" />{label}{tab === "new" && pendingNew.length > 0 && <b className={s.count}>{pendingNew.length}</b>}{tab === "relances" && leads.length > 0 && <b className={s.count}>{leads.length}</b>}</button>)}
    </nav>
    {view === "agent" ? <AgentTelegram /> : <>
    <div className={s.toolbar}><span>{loading ? "Chargement…" : data ? `Mis à jour à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now)}` : ""}</span><button type="button" className={s.ghost} onClick={() => void load()} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Actualiser</button></div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {!data ? !error && <p className={s.muted}>Chargement des données du canal…</p> : <>

      {view === "overview" && <>
        <div className={s.kpis}>
          <article><span>Membres VIP actifs</span><strong>{active}</strong><small>{data.members.length} au total</small></article>
          <article data-tone="tg"><span>Demandes à valider</span><strong>{pendingNew.length}</strong><small>nouveaux + déjà membres</small></article>
          <article data-tone="warn"><span>Échéances sous 7 jours</span><strong>{expiring}</strong><small>à relancer</small></article>
          <article data-tone="bad"><span>Abonnements expirés</span><strong>{expired}</strong><small>à réactiver</small></article>
        </div>
        <div className={s.grid2}>
          <section className={s.card}><header><h3>À faire maintenant</h3><button type="button" className={s.link} onClick={() => go("relances")}>Tout voir</button></header>
            {leads.filter(lead => lead.temperature === "hot").slice(0, 5).map(lead => <div className={s.row} key={lead.key}><div><b>{lead.name}</b><small>{lead.detail}</small></div><Contact lead={lead} /></div>)}
            {!leads.some(lead => lead.temperature === "hot") && <p className={s.muted}>Rien d’urgent. 👌</p>}
          </section>
          <section className={s.card}><header><h3>Le bot</h3><button type="button" className={s.link} onClick={() => go("bot")}>Réglages</button></header>
            <ul className={s.checks}>
              <li data-on="true">Alerte Telegram à chaque nouvelle demande VIP</li>
              <li data-on="true">Notification sur ton téléphone (à activer une fois par appareil)</li>
              <li data-on="true">Rappels J-7 · J-5 · J0 avant échéance</li>
              <li data-on="true">Retrait du canal le lendemain de l’expiration</li>
              <li data-on="true">Résumé chaque matin à 9 h</li>
            </ul>
            <Soon>Tout s’active au moment où le nouveau bot est branché sur le site principal.</Soon>
          </section>
        </div>
      </>}

      {view === "new" && <section className={s.card}>
        <header><h3>Nouveaux membres à accueillir</h3><a className={s.link} href="/dashboard/admin?tool=vip&view=requests">Ouvrir Demandes VIP</a></header>
        <p className={s.muted}>Toutes les personnes qui viennent de faire une demande. La validation se fait toujours dans « Demandes VIP ».</p>
        {pendingNew.length ? pendingNew.map(item => <div className={s.row} key={item.key}>
          <div><b>{item.name}</b><small>{item.info} · reçu {ago(item.since, now)}{item.joined ? " · dans le canal ✓" : ""}</small></div>
          <Contact lead={item} />
        </div>) : <p className={s.empty}>Aucune nouvelle demande en attente.</p>}
      </section>}

      {view === "members" && <section className={s.card}>
        <header><h3>Membres ({members.length})</h3><label className={s.search}><Search size={14} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom ou e-mail…" aria-label="Rechercher un membre" /></label></header>
        <div className={s.table}>
          {members.map(member => { const state = memberState(member, now); return <div className={s.row} key={member.user_id}>
            <div><b>{fullName(member.first_name, member.last_name)}</b><small>{member.email}</small></div>
            <div className={s.meta}><span>{member.type === "abonnement" ? "Abonnement" : "Affiliation · " + (vipAffiliationBrokerLabel(member.affiliation_broker) || "broker ?")}</span><span>Depuis {shortDate(member.started_at)}</span></div>
            <Pill tone={state.tone}>{state.label}</Pill>
          </div>; })}
          {!members.length && <p className={s.empty}>Aucun membre trouvé.</p>}
        </div>
      </section>}

      {view === "subscriptions" && <section className={s.card}>
        <header><h3>Échéances des abonnements</h3></header>
        <div className={s.steps}><span>J-7 rappel</span><span>J-5 rappel</span><span>J0 dernier rappel</span><span data-tone="bad">J+1 retrait du canal</span></div>
        {renewals.length ? renewals.map(member => { const left = daysUntil(member.expires_at, now) as number; const state = memberState(member, now); return <div className={s.row} key={member.user_id}>
          <div><b>{fullName(member.first_name, member.last_name)}</b><small>Échéance le {shortDate(member.expires_at)}{member.renewal_requested_at ? " · renouvellement demandé" : ""}</small></div>
          <div className={s.meter}><i style={{ width: `${Math.max(4, Math.min(100, (left / 30) * 100))}%` }} data-tone={state.tone} /></div>
          <Pill tone={state.tone}>{state.label}</Pill>
        </div>; }) : <p className={s.empty}>Aucun abonnement avec échéance.</p>}
        <Soon>Rappels J-7 / J-5 / J0 envoyés par le bot (ou par e-mail si le membre n’a pas démarré le bot). Retrait du canal le lendemain de l’expiration, puis bouton « Relancer » dans ton Telegram.</Soon>
      </section>}

      {view === "relances" && <>
        <p className={s.muted}>L’agent classe tes contacts tout seul : <b>chaud</b> = à traiter maintenant, <b>tiède</b> = en attente de leur réponse, <b>froid</b> = sans réponse depuis plus de 7 jours, <b>à réactiver</b> = abonnement expiré.</p>
        <div className={s.board}>
          {([["hot", "Chauds", Flame], ["warm", "Tièdes", Sun], ["cold", "Froids", Snowflake], ["revive", "À réactiver", RefreshCw]] as const).map(([temperature, title, Icon]) => {
            const column = leads.filter(lead => lead.temperature === temperature);
            return <section className={s.column} data-temp={temperature} key={temperature}>
              <header><Icon size={15} aria-hidden="true" /><h3>{title}</h3><b>{column.length}</b></header>
              {column.map(lead => <article className={s.lead} key={lead.key}><b>{lead.name}</b><small>{lead.detail}</small><small className={s.since}>{ago(lead.since, now)}</small><Contact lead={lead} /></article>)}
              {!column.length && <p className={s.empty}>Personne ici.</p>}
            </section>;
          })}
        </div>
        <Soon>Relance automatique par le bot (message Telegram personnalisé) : prochaine étape. Pour l’instant, clique sur Telegram ou WhatsApp pour relancer.</Soon>
      </>}

      {view === "activity" && <section className={s.card}>
        <header><h3>Activité récente</h3></header>
        <ol className={s.timeline}>
          {[...data.requests.filter(item => item.channel_joined_at).map(item => ({ at: item.channel_joined_at as string, text: `${fullName(item.first_name, item.last_name)} a rejoint le canal`, tone: "ok" })),
            ...data.requests.map(item => ({ at: item.created_at, text: `${fullName(item.first_name, item.last_name)} a envoyé une demande VIP`, tone: "tg" })),
            ...data.applications.map(item => ({ at: item.created_at, text: `${fullName(item.first_name, item.last_name)} a envoyé un dossier nouveau membre`, tone: "tg" })),
            ...data.members.map(item => ({ at: item.started_at, text: `${fullName(item.first_name, item.last_name)} est devenu membre VIP`, tone: "gold" })),
          ].filter(item => item.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map((item, index) => <li key={index} data-tone={item.tone}><time>{shortDate(item.at)}</time><span>{item.text}</span></li>)}
        </ol>
        <Soon>Les arrivées et départs dans le canal seront enregistrés en direct dès que le bot surveille le canal.</Soon>
      </section>}

      {view === "bot" && <div className={s.grid2}>
        <BotConnection />
        <section className={s.card}><header><h3>Notifications sur ton téléphone</h3></header>
          <p className={s.muted}>Reçois une notification à chaque nouvelle demande VIP. À faire une fois sur chaque téléphone, depuis l’app InvestPro installée sur l’écran d’accueil.</p>
          <AdminPhoneAlerts />
        </section>
        <section className={s.card}><header><h3>Canal VIP</h3></header>
          <p className={s.muted}>Lien d’invitation envoyé aux membres validés :</p>
          {data.inviteUrl ? <a className={s.chip} data-kind="tg" href={data.inviteUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden="true" />{data.inviteUrl.replace(/^https?:\/\//, "")}</a> : <p className={s.empty}>Aucun lien enregistré. Ajoute-le dans Réglages VIP.</p>}
        </section>
        <section className={s.card + " " + s.wide}><header><h3>Automatisations du bot</h3></header>
          <ul className={s.switches}>
            {[["Alerte Telegram à chaque nouvelle demande", true], ["Boutons Valider / Refuser directement dans Telegram", true], ["Arrivées dans le canal via le lien d’invitation", true], ["Réponse automatique à /start et /aide", true], ["Rappels J-7, J-5 et J0 avant échéance", true], ["Retrait du canal le lendemain de l’expiration", true], ["Bouton « Relancer » après un retrait", true], ["Résumé du matin à 9 h", true], ["Agent de relance des prospects", false]].map(([label, on]) => <li key={label as string}><span>{label}</span><i data-on={on ? "true" : undefined}>{on ? "Prêt" : "Bientôt"}</i></li>)}
          </ul>
        </section>
      </div>}
    </>}
    </>}
  </div>;
}
