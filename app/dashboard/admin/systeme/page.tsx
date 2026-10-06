"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  Wifi,
  WifiOff,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Connection = {
  id: string;
  raw_id: string | number;
  source: string;
  kind: string;
  member: {
    id: string;
    username: string;
    email: string;
    plan: string;
  };
  account_name: string;
  account_id: number | null;
  external_account_id: string | number | null;
  broker: string;
  platform: string;
  balance: number | null;
  currency: string;
  status: string;
  connected: boolean;
  last_sync_at: string | null;
  updated_at: string | null;
  warning_count: number;
  warnings: string[];
};

type Payload = {
  stats: {
    connections_total: number;
    connected_total: number;
    projectx_total: number;
    metatrader_total: number;
    automatic_accounts_total: number;
    stale_total: number;
    never_synced_total: number;
    warning_total: number;
  };
  availability: Record<string, boolean>;
  environment: Record<string, boolean>;
  connections: Connection[];
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

function money(value: number | null, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";

  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("fr-FR")} ${currency || ""}`.trim();
  }
}

function statusLabel(status: string, connected: boolean) {
  const normalized = String(status || "").toLowerCase();

  if (!connected || normalized === "revoked") return "Déconnecté";
  if (normalized === "connected") return "Connecté";
  if (normalized === "syncing") return "Synchronisation";
  if (normalized === "ready") return "Prêt";
  if (normalized === "stale") return "À vérifier";
  if (normalized === "error") return "Erreur";
  return status || "Inconnu";
}

function statusClass(status: string, connected: boolean) {
  const normalized = String(status || "").toLowerCase();

  if (!connected || normalized === "revoked") {
    return "border-white/[0.07] bg-white/[0.025] text-white/35";
  }

  if (normalized === "connected" || normalized === "ready" || normalized === "syncing") {
    return "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-400";
  }

  if (normalized === "stale") {
    return "border-amber-500/20 bg-amber-500/[0.06] text-amber-300";
  }

  return "border-red-500/20 bg-red-500/[0.06] text-red-300";
}

export default function AdminSystemPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "projectx" | "metatrader" | "alerts">("all");

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

      const response = await fetch("/api/admin/system", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Impossible de charger l’état système.");
      }

      setData(json);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger l’état système.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];

    return data.connections.filter((connection) => {
      if (filter === "projectx") return connection.source.toLowerCase().includes("projectx");
      if (filter === "metatrader") return !connection.source.toLowerCase().includes("projectx");
      if (filter === "alerts") {
        return (
          connection.warning_count > 0 ||
          connection.status === "stale" ||
          (connection.connected && !connection.last_sync_at)
        );
      }
      return true;
    });
  }, [data, filter]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-[color:var(--muted)]">
        Analyse des connexions InvestPro…
      </div>
    );
  }

  return (
    <div className="w-full pb-10">
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <Server size={11} />
            Admin V5
          </div>

          <h1 className="mt-3 text-2xl font-semibold text-white">
            Système & <span className="text-[color:var(--gold)]">Connexions</span>
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Surveille ProjectX, MetaTrader et l’état des synchronisations depuis un seul écran.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {data ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Stat icon={<Database size={16} />} label="Connexions" value={data.stats.connections_total} />
            <Stat icon={<Wifi size={16} />} label="Connectées" value={data.stats.connected_total} />
            <Stat icon={<WalletCards size={16} />} label="ProjectX" value={data.stats.projectx_total} />
            <Stat icon={<Server size={16} />} label="MetaTrader" value={data.stats.metatrader_total} />
            <Stat icon={<RefreshCw size={16} />} label="Auto-sync" value={data.stats.automatic_accounts_total} />
            <Stat icon={<Clock3 size={16} />} label="Sync ancienne" value={data.stats.stale_total} warn={data.stats.stale_total > 0} />
            <Stat icon={<Activity size={16} />} label="Jamais sync" value={data.stats.never_synced_total} warn={data.stats.never_synced_total > 0} />
            <Stat icon={<TriangleAlert size={16} />} label="Warnings" value={data.stats.warning_total} warn={data.stats.warning_total > 0} />
          </section>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.35fr]">
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 font-semibold text-white">
                <ShieldCheck size={15} className="text-[color:var(--gold)]" />
                Configuration serveur
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Health label="Supabase serveur" ok={data.environment.supabase_service_role} />
                <Health label="Chiffrement Futures" ok={data.environment.futures_credentials_key} />
                <Health label="API ProjectX" ok={data.environment.projectx_api} />
                <Health label="MetaSync Origin" ok={data.environment.metasync_site_origin} />
                <Health label="Pilotes MetaSync" ok={data.environment.metasync_pilot_users} />
                <Health label="Worker hébergé" ok={data.environment.metasync_hosted_worker} optional />
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[10px] leading-5 text-white/35">
                Aucun secret n’est affiché ici : le back-office montre uniquement si les variables nécessaires sont configurées.
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="font-semibold text-white">Disponibilité des services</div>
              <div className="mt-1 text-[10px] text-white/30">
                Vérification des tables utilisées par les connecteurs actuels.
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Health label="ProjectX / Futures" ok={data.availability.futures_connections} />
                <Health label="MetaTrader" ok={data.availability.metatrader_connections} />
                <Health label="MetaTrader hébergé" ok={data.availability.metatrader_hosted} optional />
                <Health label="Comptes InvestPro" ok={data.availability.trading_accounts} />
              </div>

              {(data.stats.stale_total > 0 ||
                data.stats.never_synced_total > 0 ||
                data.stats.warning_total > 0) ? (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
                  <div>
                    <div className="text-xs font-semibold text-amber-200">
                      Attention requise
                    </div>
                    <div className="mt-1 text-[10px] leading-5 text-white/40">
                      Utilise le filtre « Alertes » ci-dessous pour retrouver rapidement les connexions à vérifier.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                  <div className="text-[10px] leading-5 text-emerald-300">
                    Aucun avertissement de synchronisation détecté.
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-white">Connexions utilisateurs</div>
                  <div className="mt-1 text-[10px] text-white/30">
                    ProjectX et MetaTrader actuellement connus par InvestPro.
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "Toutes"],
                    ["projectx", "ProjectX"],
                    ["metatrader", "MetaTrader"],
                    ["alerts", "Alertes"],
                  ] as const).map(([value, label]) => (
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
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.05] text-[9px] uppercase tracking-[0.1em] text-white/25">
                    <th className="px-4 py-3 font-semibold">Membre</th>
                    <th className="px-4 py-3 font-semibold">Connexion</th>
                    <th className="px-4 py-3 font-semibold">Compte</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">Dernière sync</th>
                    <th className="px-4 py-3 font-semibold">Alertes</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.length ? (
                    filtered.map((connection) => (
                      <tr
                        key={connection.id}
                        className="border-b border-white/[0.045] last:border-0"
                      >
                        <td className="px-4 py-3">
                          <div className="text-[11px] font-semibold text-white">
                            {connection.member.username}
                          </div>
                          <div className="mt-1 text-[9px] text-white/28">
                            {connection.member.email}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="text-[11px] font-semibold text-white">
                            {connection.source}
                          </div>
                          <div className="mt-1 text-[9px] text-white/28">
                            {connection.kind}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="max-w-[240px] truncate text-[11px] font-medium text-white/70">
                            {connection.account_name}
                          </div>
                          <div className="mt-1 text-[9px] text-white/28">
                            {connection.broker}
                            {connection.external_account_id != null
                              ? ` · ${connection.external_account_id}`
                              : ""}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-[11px] font-semibold text-white/70">
                          {money(connection.balance, connection.currency)}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold",
                              statusClass(connection.status, connection.connected),
                            ].join(" ")}
                          >
                            {statusLabel(connection.status, connection.connected)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-[10px] text-white/45">
                          {dateLabel(connection.last_sync_at)}
                        </td>

                        <td className="px-4 py-3">
                          {connection.warning_count > 0 ? (
                            <div title={connection.warnings.join("\n")} className="inline-flex items-center gap-1.5 text-[10px] text-amber-300">
                              <AlertTriangle size={12} />
                              {connection.warning_count}
                            </div>
                          ) : connection.connected && !connection.last_sync_at ? (
                            <div className="inline-flex items-center gap-1.5 text-[10px] text-amber-300">
                              <Clock3 size={12} />
                              En attente
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
                              <CheckCircle2 size={12} />
                              OK
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-white/25">
                        Aucune connexion pour ce filtre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  warn = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div
        className={[
          "grid h-8 w-8 place-items-center rounded-xl border",
          warn
            ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"
            : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
        ].join(" ")}
      >
        {icon}
      </div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[9px] text-white/28">{label}</div>
    </div>
  );
}

function Health({
  label,
  ok,
  optional = false,
}: {
  label: string;
  ok: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
      <span className="text-[10px] text-white/45">{label}</span>

      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-semibold",
          ok
            ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400"
            : optional
              ? "border-white/[0.07] bg-white/[0.025] text-white/30"
              : "border-red-500/20 bg-red-500/[0.05] text-red-300",
        ].join(" ")}
      >
        {ok ? <CheckCircle2 size={10} /> : <WifiOff size={10} />}
        {ok ? "OK" : optional ? "Optionnel" : "Manquant"}
      </span>
    </div>
  );
}
