"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  Cable,
  CheckCircle2,
  Clock3,
  Headphones,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  type: "trade" | "account" | "support" | "connection";
  title: string;
  text: string;
  date: string;
  href: string;
  tone: "gold" | "good" | "warn" | "neutral";
};

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconFor(type: EventRow["type"]) {
  if (type === "trade") return <BookOpen size={15} />;
  if (type === "account") return <WalletCards size={15} />;
  if (type === "support") return <Headphones size={15} />;
  return <Cable size={15} />;
}

function toneClass(tone: EventRow["tone"]) {
  if (tone === "good")
    return "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400";
  if (tone === "warn")
    return "border-amber-500/20 bg-amber-500/[0.05] text-amber-300";
  if (tone === "gold")
    return "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";
  return "border-white/[0.07] bg-white/[0.03] text-white/45";
}

export default function ActivityCenterPage() {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | EventRow["type"]>("all");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const [tradesResult, accountsResult, ticketsResult, futuresResult, mtResult] =
        await Promise.all([
          supabase
            .from("trading_journal")
            .select("id,trade_date,symbol,status,result_amount,result_r,created_at")
            .eq("user_id", user.id)
            .order("trade_date", { ascending: false })
            .limit(40),

          supabase
            .from("trading_accounts")
            .select("id,name,platform,broker,connection_type,created_at,updated_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(30),

          supabase
            .from("support_tickets")
            .select("id,subject,status,admin_reply,created_at,answered_at,updated_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20),

          supabase
            .from("futures_connections")
            .select("id,provider,status,external_account_name,created_at,last_sync_at,updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(20),

          supabase
            .from("investpro_mt_connections")
            .select("id,platform,login,server,revoked,last_sync,created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      const rows: EventRow[] = [];

      for (const trade of tradesResult.data || []) {
        const result = Number(trade.result_amount || 0);
        rows.push({
          id: `trade-${trade.id}`,
          type: "trade",
          title: `${trade.symbol || "Trade"} · ${String(trade.status || "enregistré")}`,
          text:
            result > 0
              ? `Résultat +${result.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`
              : result < 0
                ? `Résultat ${result.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`
                : "Trade ajouté au Journal",
          date: trade.trade_date || trade.created_at,
          href: "/dashboard/journal",
          tone: result > 0 ? "good" : result < 0 ? "warn" : "neutral",
        });
      }

      for (const account of accountsResult.data || []) {
        rows.push({
          id: `account-${account.id}`,
          type: "account",
          title: account.name || `Compte ${account.id}`,
          text: `${
            account.connection_type === "automatic" ? "Compte Auto-sync" : "Compte manuel"
          } · ${account.platform || account.broker || "InvestPro"}`,
          date: account.created_at || account.updated_at,
          href: "/dashboard/comptes",
          tone: account.connection_type === "automatic" ? "gold" : "neutral",
        });
      }

      for (const ticket of ticketsResult.data || []) {
        rows.push({
          id: `support-${ticket.id}`,
          type: "support",
          title: ticket.admin_reply
            ? "Réponse du support"
            : `Support · ${ticket.subject || "Demande"}`,
          text: ticket.admin_reply
            ? ticket.subject || "L’équipe InvestPro a répondu."
            : `Statut : ${ticket.status || "open"}`,
          date:
            ticket.answered_at ||
            ticket.updated_at ||
            ticket.created_at,
          href: "/dashboard/contact",
          tone: ticket.admin_reply ? "good" : "neutral",
        });
      }

      for (const connection of futuresResult.data || []) {
        rows.push({
          id: `futures-${connection.id}`,
          type: "connection",
          title: `${connection.provider || "Futures"} · ${
            connection.external_account_name || "Compte"
          }`,
          text:
            String(connection.status || "").toLowerCase() === "connected"
              ? "Connexion active"
              : `Statut : ${connection.status || "inconnu"}`,
          date:
            connection.last_sync_at ||
            connection.updated_at ||
            connection.created_at,
          href: "/dashboard/connexions",
          tone:
            String(connection.status || "").toLowerCase() === "connected"
              ? "good"
              : "warn",
        });
      }

      for (const connection of mtResult.data || []) {
        rows.push({
          id: `mt-${connection.id}`,
          type: "connection",
          title: `${connection.platform || "MetaTrader"} · ${connection.login || ""}`,
          text: connection.revoked
            ? "Connexion révoquée"
            : `${connection.server || "Serveur"} · synchronisation ${
                connection.last_sync ? "active" : "en attente"
              }`,
          date: connection.last_sync || connection.created_at,
          href: "/dashboard/connexions",
          tone: connection.revoked ? "warn" : "good",
        });
      }

      setEvents(
        rows
          .filter((row) => row.date)
          .sort(
            (a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
          )
          .slice(0, 120)
      );
    } catch (e: any) {
      setError(e?.message || "Impossible de charger l’activité.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((event) => event.type === filter),
    [events, filter]
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[color:var(--gold)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[80px]" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <Activity size={12} />
              Centre d’activité
            </div>

            <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
              Tout ce qui se passe dans <span className="text-[color:var(--gold)]">InvestPro</span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Trades, comptes, connexions et support réunis dans une seule timeline.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
          >
            <RefreshCw size={13} />
            Actualiser
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tout"],
                ["trade", "Trades"],
                ["account", "Comptes"],
                ["connection", "Connexions"],
                ["support", "Support"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={[
                  "rounded-xl border px-3 py-2 text-[10px] font-semibold",
                  filter === value
                    ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                    : "border-white/[0.07] bg-black/20 text-white/40",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {visible.length ? (
            visible.map((event) => (
              <Link
                key={event.id}
                href={event.href}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-3 p-4 no-underline transition hover:bg-white/[0.02] md:p-5"
              >
                <div
                  className={`grid h-10 w-10 place-items-center rounded-xl border ${toneClass(
                    event.tone
                  )}`}
                >
                  {iconFor(event.type)}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    {event.title}
                  </div>
                  <div className="mt-1 truncate text-[9px] text-white/35">
                    {event.text}
                  </div>
                </div>

                <div className="inline-flex items-center gap-1 text-[8px] text-white/25">
                  <Clock3 size={10} />
                  {dateLabel(event.date)}
                </div>
              </Link>
            ))
          ) : (
            <div className="p-12 text-center">
              <CheckCircle2 size={24} className="mx-auto text-[color:var(--gold)]" />
              <div className="mt-3 text-sm font-semibold text-white">
                Aucune activité pour ce filtre
              </div>
              <p className="mt-1 text-[10px] text-white/30">
                Les prochains événements apparaîtront ici.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
