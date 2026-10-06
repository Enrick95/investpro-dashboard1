"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  WalletCards,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Payload = {
  member: {
    id: string;
    email: string;
    username: string;
    plan: string;
    xp: number;
    avatar_url: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    banned_until: string | null;
    email_confirmed_at: string | null;
    phone: string | null;
    provider: string;
  };
  accounts: any[];
  trades: any[];
  preferences: any | null;
  trading_plan: any | null;
  metrics: {
    accounts_count: number;
    automatic_accounts_count: number;
    trades_count: number;
    closed_trades_count: number;
    winrate: number;
    total_r: number;
  };
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminMemberPage() {
  const params = useParams<{ id: string }>();
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

      const response = await fetch(`/api/admin/member/${params.id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Impossible de charger ce membre.");

      setData(json);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger ce membre.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-[color:var(--muted)]">
        Chargement de la fiche membre…
      </div>
    );
  }

  return (
    <div className="w-full pb-10">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link
          href="/dashboard/admin/utilisateurs"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--muted)] no-underline hover:text-white"
        >
          <ArrowLeft size={14} />
          Retour aux utilisateurs
        </Link>

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

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                  <User size={24} />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold text-white">
                      {data.member.username}
                    </h1>

                    <span className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2 py-1 text-[9px] font-bold uppercase text-[color:var(--gold)]">
                      {data.member.plan}
                    </span>

                    {data.member.banned_until ? (
                      <span className="rounded-full border border-red-500/20 bg-red-500/[0.06] px-2 py-1 text-[9px] font-semibold text-red-300">
                        Suspendu
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.06] px-2 py-1 text-[9px] font-semibold text-emerald-400">
                        Actif
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/35">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail size={11} />
                      {data.member.email}
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays size={11} />
                      Inscrit le {dateLabel(data.member.created_at)}
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <Activity size={11} />
                      Dernière connexion {dateLabel(data.member.last_sign_in_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                <div className="text-[9px] uppercase tracking-[0.12em] text-white/25">
                  Identifiant membre
                </div>
                <div className="mt-1 max-w-[320px] break-all font-mono text-[10px] text-white/55">
                  {data.member.id}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat icon={<WalletCards size={16} />} label="Comptes" value={data.metrics.accounts_count} />
            <Stat icon={<Database size={16} />} label="Auto-sync" value={data.metrics.automatic_accounts_count} />
            <Stat icon={<BarChart3 size={16} />} label="Trades" value={data.metrics.trades_count} />
            <Stat icon={<CheckCircle2 size={16} />} label="Trades clôturés" value={data.metrics.closed_trades_count} />
            <Stat icon={<Activity size={16} />} label="Winrate" value={`${data.metrics.winrate}%`} />
            <Stat icon={<CircleDollarSign size={16} />} label="Résultat" value={`${data.metrics.total_r > 0 ? "+" : ""}${data.metrics.total_r}R`} />
          </section>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Informations du compte">
              <Info label="E-mail confirmé" value={data.member.email_confirmed_at ? "Oui" : "Non"} />
              <Info label="Connexion" value={data.member.provider || "email"} />
              <Info label="XP" value={String(data.member.xp)} />
              <Info label="Téléphone" value={data.member.phone || "Non renseigné"} />
              <Info label="Langue" value={data.preferences?.language || "—"} />
              <Info label="Fuseau horaire" value={data.preferences?.timezone || "—"} />
            </Panel>

            <Panel title="Profil trading">
              <Info label="Style" value={data.preferences?.trading_style || "—"} />
              <Info label="Expérience" value={data.preferences?.experience_level || "—"} />
              <Info label="Session favorite" value={data.preferences?.favorite_session || "—"} />
              <Info label="Actif favori" value={data.preferences?.favorite_asset || "—"} />
              <Info label="Risque max" value={data.trading_plan?.max_risk_percent != null ? `${data.trading_plan.max_risk_percent}%` : "—"} />
              <Info label="Trades max / jour" value={data.trading_plan?.max_trades_per_day != null ? String(data.trading_plan.max_trades_per_day) : "—"} />
            </Panel>
          </div>

          <section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] p-4">
              <div className="font-semibold text-white">Comptes de trading</div>
              <div className="mt-1 text-[10px] text-white/30">
                {data.accounts.length} compte{data.accounts.length !== 1 ? "s" : ""} détecté{data.accounts.length !== 1 ? "s" : ""}.
              </div>
            </div>

            <div className="divide-y divide-white/[0.05]">
              {data.accounts.length ? (
                data.accounts.map((account) => (
                  <div key={account.id} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
                    <Info label="Nom" value={account.name || account.label || account.account_name || "Compte"} />
                    <Info label="Broker / Prop firm" value={account.broker || account.prop_firm || account.server || "—"} />
                    <Info label="Type" value={account.platform || account.account_type || "—"} />
                    <Info label="Connexion" value={account.connection_type || "manual"} />
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-white/25">
                  Aucun compte de trading.
                </div>
              )}
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] p-4">
              <div className="font-semibold text-white">Activité trading récente</div>
              <div className="mt-1 text-[10px] text-white/30">
                Jusqu’aux 25 derniers trades.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.05] text-[9px] uppercase tracking-[0.11em] text-white/25">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Actif</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">R</th>
                    <th className="px-4 py-3 font-semibold">Résultat</th>
                    <th className="px-4 py-3 font-semibold">Risque</th>
                  </tr>
                </thead>

                <tbody>
                  {data.trades.length ? (
                    data.trades.map((trade) => (
                      <tr key={trade.id} className="border-b border-white/[0.045] last:border-0">
                        <td className="px-4 py-3 text-[10px] text-white/45">
                          {dateLabel(trade.trade_date)}
                        </td>
                        <td className="px-4 py-3 text-[11px] font-semibold text-white">
                          {trade.symbol || "—"}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-white/45">
                          {trade.status || "—"}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-white/55">
                          {trade.result_r != null ? `${Number(trade.result_r).toFixed(2)}R` : "—"}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-white/55">
                          {trade.result_amount != null ? Number(trade.result_amount).toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-white/55">
                          {trade.risk_percent != null ? `${Number(trade.risk_percent).toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-white/25">
                        Aucun trade enregistré.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-4 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--gold)]">
              <ShieldCheck size={15} />
              Admin V3 en lecture seule
            </div>
            <p className="mt-2 text-[10px] leading-5 text-white/40">
              Les actions sensibles (suspendre, réactiver, changer le plan) seront ajoutées ensuite avec confirmation pour éviter toute mauvaise manipulation.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="grid h-8 w-8 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[9px] text-white/28">{label}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="font-semibold text-white">{title}</div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 px-3 py-3">
      <div className="text-[8px] uppercase tracking-[0.1em] text-white/22">
        {label}
      </div>
      <div className="mt-1 break-words text-[10px] font-medium text-white/65">
        {value}
      </div>
    </div>
  );
}
