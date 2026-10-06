"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  RefreshCw,
  Users,
  WalletCards,
  Database,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  email: string;
  username: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  accounts_count: number;
  automatic_accounts_count: number;
  trades_count: number;
  active: boolean;
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

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

function dateLabel(value: string | null) {
  if (!value) return "Jamais";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminOverviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Erreur admin.");

      setData(json);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-[color:var(--muted)]">
        Chargement des vraies données InvestPro…
      </div>
    );
  }

  return (
    <div className="w-full">
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{
            borderColor: "var(--gold-border)",
            background: "var(--gold-soft)",
            color: "var(--gold)",
          }}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <RealStat icon={<Users size={17} />} label="Membres" value={fmt(data.stats.members_total)} />
            <RealStat icon={<Activity size={17} />} label="Nouveaux 7j" value={fmt(data.stats.new_7d)} />
            <RealStat icon={<CheckCircle2 size={17} />} label="Actifs 30j" value={fmt(data.stats.active_30d)} />
            <RealStat icon={<WalletCards size={17} />} label="Comptes" value={fmt(data.stats.accounts_total)} />
            <RealStat icon={<Database size={17} />} label="Auto sync" value={fmt(data.stats.auto_accounts_total)} />
            <RealStat icon={<BarChart3 size={17} />} label="Trades" value={fmt(data.stats.trades_total)} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className="xl:col-span-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
                <div>
                  <div className="font-semibold text-white">Derniers inscrits</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    Les comptes les plus récemment créés.
                  </div>
                </div>

                <Link
                  href="/dashboard/admin/utilisateurs"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--gold)] no-underline"
                >
                  Voir tous
                  <ArrowRight size={13} />
                </Link>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {data.members.slice(0, 6).map((member) => (
                  <div
                    key={member.id}
                    className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 md:grid-cols-[1.2fr_.7fr_.7fr_.7fr]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {member.username}
                      </div>
                      <div className="mt-1 text-[10px] text-white/30">
                        {member.email}
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <div className="text-[9px] text-white/25">Inscription</div>
                      <div className="mt-1 text-[10px] text-white/55">
                        {dateLabel(member.created_at)}
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <div className="text-[9px] text-white/25">Comptes</div>
                      <div className="mt-1 text-[10px] text-white/55">
                        {member.accounts_count}
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold",
                          member.active
                            ? "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-400"
                            : "border-white/[0.07] bg-white/[0.02] text-white/35",
                        ].join(" ")}
                      >
                        {member.active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="font-semibold text-white">État plateforme</div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                Données live issues de Supabase.
              </div>

              <div className="mt-5 space-y-3">
                <Metric label="Taux actifs 30j" value={`${data.stats.members_total ? Math.round((data.stats.active_30d / data.stats.members_total) * 100) : 0}%`} />
                <Metric label="Comptes / membre" value={`${data.stats.members_total ? (data.stats.accounts_total / data.stats.members_total).toFixed(2) : "0.00"}`} />
                <Metric label="Trades / membre" value={`${data.stats.members_total ? (data.stats.trades_total / data.stats.members_total).toFixed(2) : "0.00"}`} />
                <Metric label="Part auto-sync" value={`${data.stats.accounts_total ? Math.round((data.stats.auto_accounts_total / data.stats.accounts_total) * 100) : 0}%`} />
              </div>

              <div className="mt-5 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 text-[10px] leading-5 text-[color:var(--gold)]">
                Les anciens chiffres mock ont été retirés de l’Overview.
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RealStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[10px] text-[color:var(--muted)]">{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
      <span className="text-[10px] text-white/35">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
