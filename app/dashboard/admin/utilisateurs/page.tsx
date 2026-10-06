"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  email: string;
  username: string;
  plan: string;
  xp: number;
  avatar_url: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  accounts_count: number;
  automatic_accounts_count: number;
  trades_count: number;
  last_trade_at: string | null;
  active: boolean;
  banned_until: string | null;
};

type Payload = {
  stats: {
    members_total: number;
    new_7d: number;
    active_30d: number;
    accounts_total: number;
    auto_accounts_total: number;
    trades_total: number;
  };
  members: Member[];
};

function dateLabel(value: string | null) {
  if (!value) return "Jamais";

  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "new">("all");

  async function load(silent = false) {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/admin/overview", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const json = await response.json();

      if (response.status === 403) {
        setError("Ton compte n’est pas autorisé à accéder au back-office.");
        return;
      }

      if (!response.ok) {
        throw new Error(json?.error || "Impossible de charger le back-office.");
      }

      setPayload(json);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Impossible de charger le back-office.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members = useMemo(() => {
    const base = payload?.members || [];
    const q = query.trim().toLowerCase();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return base.filter((member) => {
      if (
        q &&
        !`${member.username} ${member.email}`.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (filter === "active" && !member.active) return false;

      if (
        filter === "new" &&
        (!member.created_at ||
          new Date(member.created_at).getTime() < sevenDaysAgo)
      ) {
        return false;
      }

      return true;
    });
  }, [payload, query, filter]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050605] text-white">
        <div className="mx-auto flex min-h-screen max-w-[1500px] items-center justify-center px-5">
          <div className="text-sm text-white/40">Chargement du back-office…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050605] text-white">
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-[color:var(--gold)]">
              <ShieldCheck size={11} />
              Administration InvestPro
            </div>

            <h1 className="mt-3 text-2xl font-semibold">
              Utilisateurs <span className="text-[color:var(--gold)]">InvestPro</span>
            </h1>

            <p className="mt-1 text-sm text-white/35">
              Gestion et suivi des membres inscrits sur InvestPro.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/dashboard/admin"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 text-xs font-semibold text-white/60 no-underline hover:text-white"
            >
              <ArrowLeft size={14} />
              Overview
            </Link>

            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {payload ? (
          <>
            <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat icon={<Users size={17} />} label="Membres" value={payload.stats.members_total} />
              <Stat icon={<Activity size={17} />} label="Nouveaux 7j" value={payload.stats.new_7d} />
              <Stat icon={<CheckCircle2 size={17} />} label="Actifs 30j" value={payload.stats.active_30d} />
              <Stat icon={<WalletCards size={17} />} label="Comptes" value={payload.stats.accounts_total} />
              <Stat icon={<Database size={17} />} label="Auto sync" value={payload.stats.auto_accounts_total} />
              <Stat icon={<BarChart3 size={17} />} label="Trades" value={payload.stats.trades_total} />
            </section>

            <section className="mt-5 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0d0f0d]">
              <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Membres inscrits</h2>
                  <p className="mt-1 text-[10px] text-white/30">
                    {members.length} résultat{members.length !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Pseudo ou e-mail…"
                      className="h-10 w-full min-w-[250px] rounded-xl border border-white/[0.07] bg-black/20 pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-[color:var(--gold-border)]"
                    />
                  </div>

                  <div className="flex rounded-xl border border-white/[0.07] bg-black/20 p-1">
                    {[
                      ["all", "Tous"],
                      ["active", "Actifs"],
                      ["new", "Nouveaux"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value as typeof filter)}
                        className={[
                          "rounded-lg px-3 py-2 text-[10px] font-semibold transition",
                          filter === value
                            ? "bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                            : "text-white/35 hover:text-white",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.05] text-[9px] uppercase tracking-[0.11em] text-white/25">
                      <th className="px-5 py-3 font-semibold">Membre</th>
                      <th className="px-4 py-3 font-semibold">Inscription</th>
                      <th className="px-4 py-3 font-semibold">Dernière connexion</th>
                      <th className="px-4 py-3 font-semibold">Comptes</th>
                      <th className="px-4 py-3 font-semibold">Trades</th>
                      <th className="px-4 py-3 font-semibold">Plan</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                    </tr>
                  </thead>

                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.id}
                        className="border-b border-white/[0.045] last:border-0 hover:bg-white/[0.015]"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/dashboard/admin/utilisateurs/${member.id}`}
                            className="font-semibold text-[11px] text-white no-underline hover:text-[color:var(--gold)]"
                          >
                            {member.username}
                          </Link>
                          <div className="mt-1 text-[9px] text-white/28">
                            {member.email}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-[10px] text-white/42">
                          {dateLabel(member.created_at)}
                        </td>

                        <td className="px-4 py-4">
                          <div className="text-[10px] text-white/45">
                            {dateLabel(member.last_sign_in_at)}
                          </div>
                          {member.last_trade_at ? (
                            <div className="mt-1 text-[8px] text-white/22">
                              Dernier trade : {dateLabel(member.last_trade_at)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <div className="text-[11px] font-semibold text-white">
                            {member.accounts_count}
                          </div>
                          <div className="mt-1 text-[8px] text-emerald-400/70">
                            {member.automatic_accounts_count} auto
                          </div>
                        </td>

                        <td className="px-4 py-4 text-[11px] font-semibold">
                          {member.trades_count}
                        </td>

                        <td className="px-4 py-4">
                          <span className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2 py-1 text-[8px] font-bold uppercase text-[color:var(--gold)]">
                            {member.plan || "free"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          {member.banned_until ? (
                            <Status bad label="Suspendu" />
                          ) : member.active ? (
                            <Status label="Actif" />
                          ) : (
                            <Status neutral label="Inactif" />
                          )}
                        </td>
                      </tr>
                    ))}

                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-14 text-center text-xs text-white/30">
                          Aucun membre ne correspond à ta recherche.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-4 flex items-center gap-2 text-[9px] text-white/22">
              <Clock3 size={12} />
              “Actif” = au moins une connexion dans les 30 derniers jours.
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0d0f0d] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          {icon}
        </div>
      </div>

      <div className="mt-4 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-[9px] text-white/28">{label}</div>
    </div>
  );
}

function Status({
  label,
  bad = false,
  neutral = false,
}: {
  label: string;
  bad?: boolean;
  neutral?: boolean;
}) {
  const className = bad
    ? "border-red-500/15 bg-red-500/[0.06] text-red-300"
    : neutral
      ? "border-white/[0.07] bg-white/[0.025] text-white/35"
      : "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-400";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-semibold ${className}`}
    >
      {bad ? <XCircle size={9} /> : <CheckCircle2 size={9} />}
      {label}
    </span>
  );
}
