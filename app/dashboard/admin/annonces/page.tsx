"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { BellRing, Send, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Announcement = { id: string; title: string; message: string; href: string; recipient_count: number; push_recipient_count: number; created_at: string };

export default function AdminAnnouncementsPage() {
  const { t: tr, locale } = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [href, setHref] = useState("/dashboard/journal");
  const [recipientCount, setRecipientCount] = useState(0);
  const [pushCount, setPushCount] = useState(0);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/announcements", { headers: await headers(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Chargement impossible."));
      setRecipientCount(Number(data.recipientCount || 0));
      setPushCount(Number(data.pushSubscriptionCount || 0));
      setHistory(data.announcements || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Chargement impossible.")); }
    finally { setLoading(false); }
  }, [headers, tr]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    if (!window.confirm((tr("Envoyer cette annonce à ") + (recipientCount) + tr(" membres ? Une notification push sera également envoyée aux personnes qui l’ont activée.")))) return;
    setSending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: crypto.randomUUID(), title, message, href }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Envoi impossible."));
      setNotice((tr("Annonce enregistrée pour ") + (data.recipientCount) + tr(" membres. Push envoyé à ") + (data.pushSent) + tr(" appareil(s)") + (data.pushFailed ? ` · ${data.pushFailed}${tr(" échec(s)")}` : "") + "."));
      setTitle(""); setMessage("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Envoi impossible.")); }
    finally { setSending(false); }
  }

  return <main className="mx-auto max-w-5xl space-y-6">
    <header><div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--gold)]"><Sparkles size={14} />{tr(" Communication InvestPro")}</div><h1 className="mt-3 text-2xl font-bold text-white">{tr("Annonces aux membres")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{tr("Partage une information importante ou dirige les membres vers une rubrique du site.")}</p></header>
    {error ? <p role="status" className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-sm text-red-200">{tr(error)}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-sm text-emerald-200">{tr(notice)}</p> : null}
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border border-white/[0.08] bg-[color:var(--panel)] p-5">
        <div><label htmlFor="announcement-title" className="text-xs font-semibold text-white/70">{tr("Titre")}</label><input id="announcement-title" required maxLength={90} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tr("Ex. Nouveauté dans ton journal")} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[color:var(--gold-border)]"/><div className="mt-1 text-right text-[10px] text-white/35">{title.length}/90</div></div>
        <div><label htmlFor="announcement-message" className="text-xs font-semibold text-white/70">{tr("Message")}</label><textarea id="announcement-message" required maxLength={400} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={tr("Écris un message clair et utile…")} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white outline-none focus:border-[color:var(--gold-border)]"/><div className="mt-1 text-right text-[10px] text-white/35">{message.length}/400</div></div>
        <div><label htmlFor="announcement-href" className="text-xs font-semibold text-white/70">{tr("Lien InvestPro")}</label><input id="announcement-href" required value={href} onChange={(event) => setHref(event.target.value)} placeholder={tr("/dashboard/journal")} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[color:var(--gold-border)]"/><p className="mt-1 text-[10px] text-white/35">{tr("Chemin interne uniquement, par exemple /dashboard/journal ou /dashboard/classement.")}</p></div>
        <div className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 text-xs leading-5 text-white/65"><BellRing size={15} className="mr-2 inline text-[color:var(--gold)]"/>{tr("L’annonce apparaîtra dans InvestPro pour les membres. Le push sera envoyé uniquement aux ")}{pushCount}{tr(" abonnements actifs ayant été autorisés sur leur appareil.")}</div>
        <button type="submit" disabled={sending || loading || !title.trim() || !message.trim()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-sm font-bold text-black disabled:opacity-50"><Send size={16}/>{sending ? tr("Envoi en cours…") : (tr("Vérifier et envoyer à ") + (recipientCount) + tr(" membres"))}</button>
      </form>
      <section className="rounded-2xl border border-white/[0.08] bg-[color:var(--panel)] p-5"><h2 className="text-sm font-semibold text-white">{tr("Aperçu")}</h2><div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--gold)]"><BellRing size={14}/>{tr(" InvestPro")}</div><h3 className="mt-3 text-sm font-semibold text-white">{title || tr("Titre de l’annonce")}</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/60">{message || tr("Ton message apparaîtra ici.")}</p><div className="mt-3 truncate text-[10px] text-[color:var(--gold)]">{href}</div></div><p className="mt-4 text-xs leading-5 text-white/40">{tr("Un écran de confirmation s’affiche avant l’envoi. Chaque annonce est conservée dans l’historique ci-dessous.")}</p></section>
    </div>
    <section className="rounded-2xl border border-white/[0.08] bg-[color:var(--panel)] p-5"><h2 className="text-sm font-semibold text-white">{tr("Historique des annonces")}</h2>{loading ? <p className="mt-4 text-xs text-white/40">{tr("Chargement…")}</p> : history.length ? <div className="mt-4 space-y-2">{history.map((item) => <article key={item.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-white">{item.title}</h3><time className="text-[10px] text-white/35">{new Date(item.created_at).toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</time></div><p className="mt-1 text-xs leading-5 text-white/55">{item.message}</p><p className="mt-2 text-[10px] text-white/35">{item.recipient_count}{tr(" membres · ")}{item.push_recipient_count}{tr(" abonnements push au moment de l’envoi · ")}{item.href}</p></article>)}</div> : <p className="mt-4 text-xs text-white/40">{tr("Aucune annonce envoyée pour l’instant.")}</p>}</section>
  </main>;
}
