"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Cable,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type TradingAccount = {
  id: string | number;
  name: string | null;
  platform: string | null;
  broker: string | null;
  currency: string | null;
  current_balance: number | null;
  connection_type: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ProviderStatus = "connected" | "configured" | "waiting" | "available" | "manual";

function platformOf(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function relativeDate(value?: string | null) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Indisponible";

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ConnectionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [projectXRows, setProjectXRows] = useState<any[]>([]);
  const [projectXAvailable, setProjectXAvailable] = useState(true);
  const [error, setError] = useState("");

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

      const accountResult = await supabase
        .from("trading_accounts")
        .select(
          "id,name,platform,broker,currency,current_balance,connection_type,updated_at,created_at"
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (accountResult.error) throw accountResult.error;
      setAccounts((accountResult.data as TradingAccount[]) || []);

      // La table ProjectX existe uniquement si le module Futures V1 a été installé.
      const px = await supabase
        .from("projectx_connections")
        .select("*")
        .eq("user_id", user.id);

      if (px.error) {
        setProjectXAvailable(false);
        setProjectXRows([]);
      } else {
        setProjectXAvailable(true);
        setProjectXRows(px.data || []);
      }
    } catch (e: any) {
      console.error("Erreur centre connexions :", e);
      setError(e?.message || "Impossible de charger les connexions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const mtAccounts = accounts.filter((account) =>
    ["MT4", "MT5"].includes(platformOf(account.platform))
  );

  const autoMt = mtAccounts.filter(
    (account) =>
      String(account.connection_type || "").toLowerCase() === "automatic"
  );

  const manualAccounts = accounts.filter(
    (account) =>
      String(account.connection_type || "").toLowerCase() !== "automatic"
  );

  const latestSync = [...autoMt]
    .map((account) => account.updated_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const projectXConnected = projectXRows.length > 0;

  const connectionCount =
    autoMt.length + (projectXConnected ? 1 : 0);

  const providers = [
    {
      id: "metatrader",
      title: "MetaTrader",
      subtitle: "MT4 / MT5",
      description:
        "Synchronisation de tes comptes MetaTrader, balances et trades clôturés vers InvestPro.",
      status: autoMt.length ? ("connected" as ProviderStatus) : ("available" as ProviderStatus),
      statusText: autoMt.length
        ? `${autoMt.length} connexion${autoMt.length > 1 ? "s" : ""} active${autoMt.length > 1 ? "s" : ""}`
        : "Prêt à connecter",
      icon: <Server size={22} />,
      href: "/dashboard/comptes",
      cta: autoMt.length ? "Gérer MetaTrader" : "Connecter MetaTrader",
      info: latestSync ? `Dernière réception : ${relativeDate(latestSync)}` : "Connecteur Windows InvestPro",
    },
    {
      id: "projectx",
      title: "ProjectX",
      subtitle: "Futures",
      description:
        "Connexion Futures en lecture seule : comptes, balance et prochainement historique automatique.",
      status: projectXConnected
        ? ("configured" as ProviderStatus)
        : ("available" as ProviderStatus),
      statusText: projectXConnected ? "Configuré" : "Prêt à tester",
      icon: <Zap size={22} />,
      href: "/dashboard/comptes",
      cta: projectXConnected ? "Voir la connexion" : "Configurer ProjectX",
      info: projectXAvailable
        ? "Module API installé"
        : "Module ProjectX non détecté",
    },
    {
      id: "tradovate",
      title: "Tradovate",
      subtitle: "Futures",
      description:
        "Intégration préparée. L’activation dépend de l’accès API personnel Tradovate.",
      status: "waiting" as ProviderStatus,
      statusText: "En attente API",
      icon: <Activity size={22} />,
      href: "/dashboard/comptes",
      cta: "Voir les comptes",
      info: "Demande API en cours",
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[80px]" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <Cable size={12} />
              Connexions InvestPro
            </div>

            <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
              Centre des <span className="text-[color:var(--gold)]">connexions</span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Retrouve tous tes connecteurs, leur état et la dernière activité au même endroit.
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
          >
            <RefreshCw size={14} />
            Actualiser les statuts
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Wifi size={17} />}
          label="Connexions actives"
          value={String(connectionCount)}
          sub="Synchronisations automatiques"
        />
        <Stat
          icon={<WalletCards size={17} />}
          label="Comptes totaux"
          value={String(accounts.length)}
          sub={`${manualAccounts.length} manuel${manualAccounts.length > 1 ? "s" : ""}`}
        />
        <Stat
          icon={<RefreshCw size={17} />}
          label="Dernière synchro"
          value={relativeDate(latestSync)}
          sub="MetaTrader"
        />
        <Stat
          icon={<ShieldCheck size={17} />}
          label="Mode"
          value="Lecture seule"
          sub="Aucun ordre envoyé"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} {...provider} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Comptes détectés
              </h2>
              <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                Vue rapide des comptes déjà présents dans InvestPro.
              </p>
            </div>

            <Link
              href="/dashboard/comptes"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--gold)]"
            >
              Mes comptes
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {accounts.length ? (
              accounts.map((account) => {
                const automatic =
                  String(account.connection_type || "").toLowerCase() ===
                  "automatic";

                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={[
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                          automatic
                            ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
                            : "border-white/[0.08] bg-white/[0.03] text-white/45",
                        ].join(" ")}
                      >
                        {automatic ? <Wifi size={17} /> : <Database size={17} />}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-white">
                          {account.name || `${account.platform || "Compte"} trading`}
                        </div>
                        <div className="mt-1 truncate text-[9px] text-white/30">
                          {[account.broker, account.platform]
                            .filter(Boolean)
                            .join(" · ") || "Compte InvestPro"}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs font-semibold text-white">
                        {Number(account.current_balance || 0).toLocaleString(
                          "fr-FR",
                          { maximumFractionDigits: 2 }
                        )}{" "}
                        <span className="text-white/35">
                          {account.currency || ""}
                        </span>
                      </div>
                      <div
                        className={[
                          "mt-1 text-[8px] font-semibold uppercase",
                          automatic ? "text-emerald-400" : "text-white/30",
                        ].join(" ")}
                      >
                        {automatic ? "Synchronisé" : "Manuel"}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty
                icon={<WifiOff size={21} />}
                title="Aucun compte détecté"
                text="Ajoute ton premier compte depuis Mes comptes."
              />
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-[color:var(--gold)]" />
              <h2 className="text-sm font-semibold text-white">
                Sécurité des connexions
              </h2>
            </div>

            <div className="mt-4 space-y-3">
              <SecurityRow text="InvestPro n’envoie aucun ordre de trading." />
              <SecurityRow text="Les connecteurs automatiques sont utilisés en lecture seule." />
              <SecurityRow text="Les clés API ne doivent jamais être enregistrées dans le navigateur ou GitHub." />
            </div>
          </section>

          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <div className="flex items-center gap-2">
              <Clock3 size={17} className="text-[color:var(--gold)]" />
              <h2 className="text-sm font-semibold text-white">À venir</h2>
            </div>

            <div className="mt-4 space-y-3">
              <RoadmapRow label="ProjectX" status="Test réel dès qu’un compte est disponible" />
              <RoadmapRow label="Tradovate" status="En attente de validation API" />
              <RoadmapRow label="Rithmic" status="Non prioritaire pour le moment" />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function ProviderCard({
  title,
  subtitle,
  description,
  status,
  statusText,
  icon,
  href,
  cta,
  info,
}: {
  title: string;
  subtitle: string;
  description: string;
  status: ProviderStatus;
  statusText: string;
  icon: React.ReactNode;
  href: string;
  cta: string;
  info: string;
}) {
  const active = status === "connected" || status === "configured";
  const waiting = status === "waiting";

  return (
    <article
      className={[
        "rounded-[22px] border bg-[color:var(--panel)] p-5",
        active
          ? "border-emerald-500/20"
          : waiting
          ? "border-amber-500/20"
          : "border-[color:var(--border)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={[
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            active
              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
              : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
          ].join(" ")}
        >
          {icon}
        </div>

        <StatusPill status={status} text={statusText} />
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold text-white">{title}</div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--gold)]">
          {subtitle}
        </div>
      </div>

      <p className="mt-3 min-h-[48px] text-[10px] leading-5 text-[color:var(--muted)]">
        {description}
      </p>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[9px] text-white/35">
        {info}
      </div>

      <Link
        href={href}
        className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-xs font-semibold text-[color:var(--gold)]"
      >
        {cta}
        <ArrowRight size={13} />
      </Link>
    </article>
  );
}

function StatusPill({
  status,
  text,
}: {
  status: ProviderStatus;
  text: string;
}) {
  const cls =
    status === "connected" || status === "configured"
      ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400"
      : status === "waiting"
      ? "border-amber-500/20 bg-amber-500/[0.07] text-amber-300"
      : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.06em] ${cls}`}
    >
      {text}
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="text-[color:var(--gold)]">{icon}</div>
      <div className="mt-3 text-[9px] text-white/35">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-[8px] text-white/25">{sub}</div>
    </div>
  );
}

function SecurityRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px] leading-5 text-white/55">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
      {text}
    </div>
  );
}

function RoadmapRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-xs font-semibold text-white">{label}</div>
      <div className="mt-1 text-[9px] leading-4 text-white/35">{status}</div>
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/15 p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-[10px] text-white/35">{text}</div>
    </div>
  );
}
