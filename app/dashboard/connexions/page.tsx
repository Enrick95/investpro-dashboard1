"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Server,
  ServerCog,
  ShieldCheck,
  WalletCards,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type TradingAccount = {
  id: number;
  name: string | null;
  platform: string | null;
  broker: string | null;
  currency: string | null;
  current_balance: number | null;
  connection_type: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type FutureConnection = {
  id: number;
  trading_account_id: number;
  provider: string;
  external_account_id: string;
  external_account_name: string | null;
  status: string | null;
  last_sync_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type MetaConnection = {
  id: string;
  account_id: number;
  login: string;
  server: string;
  platform: "MT4" | "MT5";
  currency: string;
  revoked: boolean;
  last_sync: string | null;
  warnings: string[] | null;
};

type HostedConnection = {
  id: string;
  active: boolean;
  status: string;
  updated_at: string | null;
  equity?: number | null;
  capital_reference?: number | null;
  investpro_mt_connections?: {
    login?: string;
    server?: string;
    platform?: string;
    last_sync?: string | null;
    account_id?: number;
    warnings?: string[] | null;
    currency?: string;
  } | null;
};

type Tone = "ok" | "warn" | "danger" | "neutral";

function relativeDate(value?: string | null, locale: "fr" | "en" = "fr") {
  if (!value) return locale === "en" ? "Never" : "Jamais";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "—";

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return locale === "en" ? "Just now" : "À l’instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return locale === "en" ? minutes + " min ago" : "Il y a " + minutes + " min";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "en" ? hours + " h ago" : "Il y a " + hours + " h";
  const days = Math.floor(hours / 24);
  return locale === "en" ? days + " d ago" : "Il y a " + days + " j";
}

function exactDate(value?: string | null, locale: "fr" | "en" = "fr") {
  if (!value) return locale === "en" ? "No synchronisation" : "Aucune synchronisation";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncHealth(value?: string | null) {
  if (!value) {
    return {
      key: "waiting",
      label: "En attente",
      tone: "neutral" as Tone,
      detail: "Aucune synchronisation reçue",
    };
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000)
  );

  if (minutes <= 5) {
    return {
      key: "online",
      label: "En ligne",
      tone: "ok" as Tone,
      detail: "Synchronisation récente",
    };
  }

  if (minutes <= 60) {
    return {
      key: "delayed",
      label: "À surveiller",
      tone: "warn" as Tone,
      detail: "Synchronisation ancienne",
    };
  }

  return {
    key: "stale",
    label: "À vérifier",
    tone: "danger" as Tone,
    detail: "Aucune réception récente",
  };
}

function money(value?: number | null, currency = "USD") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${Number(value).toLocaleString("fr-FR")} ${currency || ""}`.trim();
  }
}

function toneClasses(tone: Tone) {
  if (tone === "ok")
    return "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400";
  if (tone === "warn")
    return "border-amber-500/20 bg-amber-500/[0.06] text-amber-300";
  if (tone === "danger")
    return "border-red-500/20 bg-red-500/[0.06] text-red-300";
  return "border-white/[0.08] bg-white/[0.03] text-white/45";
}

export default function ConnectionsPage() {
  const { t: translate, locale } = useLocale();

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [syncingProjectX, setSyncingProjectX] = useState(false);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [futures, setFutures] = useState<FutureConnection[]>([]);
  const [meta, setMeta] = useState<MetaConnection[]>([]);
  const [hosted, setHosted] = useState<HostedConnection[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return null;
    }

    return session.access_token;
  }, [supabase]);

  const load = useCallback(async () => {
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

      const [accountResult, futuresResult, localResult, hostedResult] =
        await Promise.all([
          supabase
            .from("trading_accounts")
            .select(
              "id,name,platform,broker,currency,current_balance,connection_type,updated_at,created_at"
            )
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false }),

          supabase
            .from("futures_connections")
            .select(
              "id,trading_account_id,provider,external_account_id,external_account_name,status,last_sync_at,updated_at,created_at"
            )
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false }),

          fetch("/api/metasync/connect", { cache: "no-store" })
            .then(async (response) => {
              const json = await response.json().catch(() => ({}));
              return response.ok ? json : { connections: [] };
            })
            .catch(() => ({ connections: [] })),

          fetch("/api/metasync/hosted", { cache: "no-store" })
            .then(async (response) => {
              const json = await response.json().catch(() => ({}));
              return response.ok ? json : { connections: [] };
            })
            .catch(() => ({ connections: [] })),
        ]);

      if (accountResult.error) throw accountResult.error;

      setAccounts((accountResult.data as TradingAccount[]) || []);
      setFutures(
        futuresResult.error
          ? []
          : ((futuresResult.data as FutureConnection[]) || [])
      );
      setMeta(Array.isArray(localResult?.connections) ? localResult.connections : []);
      setHosted(
        Array.isArray(hostedResult?.connections) ? hostedResult.connections : []
      );
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les connexions.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [Number(account.id), account])),
    [accounts]
  );

  const projectXRows = futures.filter(
    (row) => String(row.provider || "").toLowerCase() === "projectx"
  );

  const activeMeta = meta.filter((row) => !row.revoked);
  const autoAccounts = accounts.filter(
    (account) =>
      String(account.connection_type || "").toLowerCase() === "automatic"
  );

  const mtLastSync = activeMeta
    .map((row) => row.last_sync)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const pxLastSync = projectXRows
    .map((row) => row.last_sync_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const latestSync = [mtLastSync, pxLastSync]
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const metaWarnings = activeMeta.reduce(
    (sum, row) => sum + (Array.isArray(row.warnings) ? row.warnings.length : 0),
    0
  );

  const health = syncHealth(latestSync);

  const connectedCount =
    activeMeta.length +
    projectXRows.filter(
      (row) => String(row.status || "").toLowerCase() === "connected"
    ).length;

  async function syncProjectX() {
    try {
      setSyncingProjectX(true);
      setNotice("");
      setError("");

      const token = await getToken();
      if (!token) return;

      const response = await fetch("/api/futures/projectx/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ days: 90 }),
      });

      const json = await response.json();

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Synchronisation ProjectX impossible.");
      }

      setNotice(
        translate("ProjectX synchronisé : {accounts} compte(s) mis à jour · {trades} trade(s) traité(s).").replace("{accounts}", String(Number(json.updated || 0))).replace("{trades}", String(Number(json.imported || 0)))
      );

      await load();
    } catch (e: any) {
      setError(e?.message || "Synchronisation ProjectX impossible.");
    } finally {
      setSyncingProjectX(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-7">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[color:var(--gold)] opacity-[0.08] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 left-[15%] h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.03] blur-[110px]" />

        <div className="relative grid gap-6 xl:grid-cols-[1.35fr_.65fr] xl:items-end">
          <div>
            <h1 className="text-3xl font-semibold text-white md:text-4xl">
              {translate("Ton trading,")}{" "}<span className="text-[color:var(--gold)]">{translate("connecté à InvestPro")}</span>
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
              {translate("Connecte MT4, MT5, TradeLocker, cTrader ou ProjectX une seule fois. InvestPro centralise les comptes, surveille la synchronisation et alimente progressivement le Journal et les Rapports.")}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <SecurityPill icon={<ShieldCheck size={12} />} text={translate("Lecture seule côté InvestPro")} />
              <SecurityPill icon={<LockKeyhole size={12} />} text={translate("Identifiants chiffrés côté serveur")} />
              <SecurityPill icon={<Database size={12} />} text={translate("Journal connecté")} />
            </div>
          </div>

          <div className="rounded-[22px] border border-white/[0.07] bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-white/30">
                  {translate("État global")}</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {translate(health.label)}
                </div>
              </div>

              <div
                className={`grid h-11 w-11 place-items-center rounded-2xl border ${toneClasses(
                  health.tone
                )}`}
              >
                {health.tone === "ok" ? <Wifi size={18} /> : <WifiOff size={18} />}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniStat label={translate("Connexions")} value={String(connectedCount)} />
              <MiniStat label={translate("Auto-sync")} value={String(autoAccounts.length)} />
              <MiniStat label={translate("Dernière sync")} value={relativeDate(latestSync, locale)} />
              <MiniStat label={translate("Alertes")} value={String(metaWarnings)} />
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
          {translate(error)}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">
          {translate(notice)}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Cable size={17} />}
          label={translate("Connexions actives")}
          value={String(connectedCount)}
          sub={translate("MT4 / MT5 / TradeLocker / cTrader / Futures")}
        />
        <Stat
          icon={<WalletCards size={17} />}
          label={translate("Comptes InvestPro")}
          value={String(accounts.length)}
          sub={translate("{count} automatique(s)").replace("{count}", String(autoAccounts.length))}
        />
        <Stat
          icon={<Clock3 size={17} />}
          label={translate("Dernière activité")}
          value={relativeDate(latestSync, locale)}
          sub={exactDate(latestSync, locale)}
          tone={health.tone}
        />
        <Stat
          icon={<ShieldCheck size={17} />}
          label={translate("Sécurité")}
          value="Lecture seule"
          sub={translate("Aucun ordre envoyé")}
          tone="ok"
        />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {translate("Plateformes disponibles")}</h2>
            <p className="mt-1 text-[10px] text-white/35">
              {translate("Choisis une plateforme pour connecter ou gérer tes comptes.")}</p>
          </div>

          <button
            type="button"
            onClick={load}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[10px] font-semibold text-white/55 hover:text-white"
          >
            <RefreshCw size={12} />
            {translate("Actualiser")}</button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProviderCard
            eyebrow={translate("CFD / FOREX")}
            title={translate("MetaTrader 5")}
            subtitle={translate("{count} compte(s) actif(s)").replace("{count}", String(activeMeta.filter((x) => x.platform === "MT5").length))}
            description={translate("Balance, equity et historique vers InvestPro via le connecteur MetaSync.")}
            icon={<Server size={22} />}
            status={
              activeMeta.some((x) => x.platform === "MT5") ? "connected" : "ready"
            }
            href="/dashboard/connexions/metatrader?platform=mt5"
            cta={
              activeMeta.some((x) => x.platform === "MT5")
                ? translate("Gérer MT5")
                : translate("Connecter MT5")
            }
          />

          <ProviderCard
            eyebrow={translate("CFD / FOREX")}
            title={translate("MetaTrader 4")}
            subtitle={translate("{count} compte(s) actif(s)").replace("{count}", String(activeMeta.filter((x) => x.platform === "MT4").length))}
            description={translate("Même expérience InvestPro pour les brokers et prop firms encore sur MT4.")}
            icon={<Server size={22} />}
            status={
              activeMeta.some((x) => x.platform === "MT4") ? "connected" : "ready"
            }
            href="/dashboard/connexions/metatrader?platform=mt4"
            cta={
              activeMeta.some((x) => x.platform === "MT4")
                ? translate("Gérer MT4")
                : translate("Connecter MT4")
            }
          />

          <ProviderCard
            eyebrow={translate("CFD / MULTI-ASSETS")}
            title={translate("TradeLocker")}
            subtitle={translate("API officielle REST")}
            description={translate("Connexion sécurisée TradeLocker avec détection des comptes et stockage chiffré côté serveur.")}
            icon={<ServerCog size={22} />}
            status="ready"
            href="/dashboard/comptes?connect=tradelocker"
            cta="Connecter TradeLocker"
          />

          <ProviderCard
            eyebrow={translate("CFD / FOREX")}
            title={translate("cTrader")}
            subtitle={translate("Open API · OAuth 2.0")}
            description={translate("Autorisation lecture seule via cTrader Open API. Synchronisation continue préparée pour worker dédié.")}
            icon={<Cable size={22} />}
            status="ready"
            href="/dashboard/comptes?connect=ctrader"
            cta="Connecter cTrader"
          />

          <ProviderCard
            eyebrow={translate("FUTURES")}
            title={translate("ProjectX / TopstepX")}
            subtitle={String(projectXRows.length) + " " + translate("connexion(s)")}
            description={translate("Comptes Futures, balance et import des trades clôturés dans le Journal.")}
            icon={<Zap size={22} />}
            status={projectXRows.length ? "connected" : "ready"}
            href="/dashboard/comptes?connect=projectx"
            cta={projectXRows.length ? translate("Gérer ProjectX") : translate("Connecter ProjectX")}
            extra={
              projectXRows.length ? (
                <button
                  type="button"
                  onClick={syncProjectX}
                  disabled={syncingProjectX}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] text-[10px] font-semibold text-emerald-300 disabled:opacity-50"
                >
                  {syncingProjectX ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {translate("Synchroniser maintenant")}</button>
              ) : null
            }
          />

          <ProviderCard
            eyebrow={translate("FUTURES")}
            title={translate("Tradovate / Rithmic")}
            subtitle={translate("Préparation API")}
            description={translate("Le design et le parcours sont prêts. L’activation dépend des accès API disponibles.")}
            icon={<Activity size={22} />}
            status="waiting"
            href="/dashboard/comptes?connect=futures"
            cta="Voir les plateformes"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.02]">
          <div className="border-b border-white/[0.06] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {translate("Comptes connectés")}</h2>
                <p className="mt-1 text-[9px] text-white/30">
                  {translate("Vue consolidée de tes connexions automatiques.")}</p>
              </div>

              <Link
                href="/dashboard/comptes"
                className="inline-flex items-center gap-2 text-[10px] font-semibold text-[color:var(--gold)] no-underline"
              >
                {translate("Mes comptes")}<ArrowRight size={12} />
              </Link>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {autoAccounts.length ? (
              autoAccounts.map((account) => {
                const px = projectXRows.find(
                  (row) => Number(row.trading_account_id) === Number(account.id)
                );
                const mt = activeMeta.find(
                  (row) => Number(row.account_id) === Number(account.id)
                );
                const lastSync = px?.last_sync_at || mt?.last_sync || account.updated_at;
                const currentHealth = syncHealth(lastSync);

                return (
                  <div
                    key={account.id}
                    className="grid gap-4 p-4 md:grid-cols-[1.4fr_.8fr_.8fr_auto] md:items-center md:p-5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-xs font-semibold text-white">
                          {account.name || (translate("Compte ") + (account.id) + "")}
                        </div>
                        <span className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2 py-0.5 text-[8px] font-semibold text-[color:var(--gold)]">
                          {translate("AUTO-SYNC")}</span>
                      </div>

                      <div className="mt-1 text-[9px] text-white/30">
                        {px
                          ? `ProjectX · ${px.external_account_id}`
                          : mt
                            ? `${mt.platform} · ${mt.login} · ${mt.server}`
                            : `${account.platform || translate("Plateforme")} · ${account.broker || translate("Broker")}`}
                      </div>
                    </div>

                    <div>
                      <div className="text-[8px] uppercase tracking-[0.1em] text-white/25">
                        {translate("Balance")}</div>
                      <div className="mt-1 text-xs font-semibold text-white">
                        {money(account.current_balance, account.currency || "USD")}
                      </div>
                    </div>

                    <div>
                      <div className="text-[8px] uppercase tracking-[0.1em] text-white/25">
                        {translate("Dernière sync")}</div>
                      <div className="mt-1 text-[10px] text-white/55">
                        {relativeDate(lastSync, locale)}
                      </div>
                    </div>

                    <span
                      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${toneClasses(
                        currentHealth.tone
                      )}`}
                    >
                      <span
                        className={[
                          "h-1.5 w-1.5 rounded-full",
                          currentHealth.tone === "ok"
                            ? "bg-emerald-400"
                            : currentHealth.tone === "warn"
                              ? "bg-amber-300"
                              : currentHealth.tone === "danger"
                                ? "bg-red-400"
                                : "bg-white/30",
                        ].join(" ")}
                      />
                      {translate(currentHealth.label)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="p-10 text-center">
                <Cable size={24} className="mx-auto text-[color:var(--gold)]" />
                <div className="mt-3 text-sm font-semibold text-white">
                  {translate("Aucun compte automatique")}</div>
                <p className="mx-auto mt-2 max-w-sm text-[10px] leading-5 text-white/35">
                  {translate("Connecte MT4, MT5, TradeLocker, cTrader ou ProjectX pour faire apparaître tes comptes ici.")}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2">
              <Gauge size={15} className="text-[color:var(--gold)]" />
              <h2 className="text-sm font-semibold text-white">
                {translate("Santé de la synchronisation")}</h2>
            </div>

            <div className="mt-4 space-y-3">
              <HealthLine
                label={translate("MetaTrader")}
                value={activeMeta.length ? activeMeta.length + " " + translate("connexion(s)") : translate("Non connecté")}
                tone={activeMeta.length ? syncHealth(mtLastSync).tone : "neutral"}
              />
              <HealthLine
                label={translate("ProjectX")}
                value={projectXRows.length ? projectXRows.length + " " + translate("connexion(s)") : translate("Non connecté")}
                tone={
                  projectXRows.length ? syncHealth(pxLastSync).tone : "neutral"
                }
              />
              <HealthLine
                label={translate("Warnings MT")}
                value={metaWarnings ? metaWarnings + " " + translate("alerte(s)") : translate("Aucune")}
                tone={metaWarnings ? "warn" : "ok"}
              />
              <HealthLine
                label={translate("Comptes auto")}
                value={String(autoAccounts.length)}
                tone={autoAccounts.length ? "ok" : "neutral"}
              />
            </div>
          </section>

          <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-black/20 text-[color:var(--gold)]">
                <Database size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {translate("Une connexion, tout InvestPro")}</div>
                <p className="mt-1 text-[10px] leading-5 text-white/45">
                  {translate("Une fois synchronisé, le compte alimente Mes comptes, le Journal, le calendrier de performance et les Rapports sans recréer le compte manuellement.")}</p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function ProviderCard({
  eyebrow,
  title,
  subtitle,
  description,
  icon,
  status,
  href,
  cta,
  extra,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  status: "connected" | "ready" | "waiting";
  href: string;
  cta: string;
  extra?: React.ReactNode;
}) {
  const { t: translate } = useLocale();

  const badge =
    status === "connected"
      ? {
          text: translate("CONNECTÉ"),
          className:
            "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-400",
        }
      : status === "ready"
        ? {
            text: translate("PRÊT"),
            className:
              "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
          }
        : {
            text: translate("BIENTÔT"),
            className:
              "border-white/[0.07] bg-white/[0.03] text-white/35",
          };

  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5 transition hover:-translate-y-1 hover:border-[color:var(--gold-border)]">
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[color:var(--gold)] opacity-[0.04] blur-[55px] transition group-hover:opacity-[0.09]" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
            {icon}
          </div>

          <span
            className={`rounded-full border px-2.5 py-1 text-[8px] font-bold ${badge.className}`}
          >
            {translate(badge.text)}
          </span>
        </div>

        <div className="mt-5 text-[8px] font-bold uppercase tracking-[0.15em] text-[color:var(--gold)]">
          {eyebrow}
        </div>
        <div className="mt-1 text-base font-semibold text-white">{translate(title)}</div>
        <div className="mt-1 text-[9px] text-white/30">{subtitle}</div>

        <p className="mt-3 min-h-[60px] text-[10px] leading-5 text-white/40">
          {translate(description)}
        </p>

        <Link
          href={href}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[10px] font-semibold text-[color:var(--gold)] no-underline"
        >
          {translate(cta)}
          <ArrowRight size={12} />
        </Link>

        {extra}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
}) {
  const { t: translate } = useLocale();

  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.02] p-4">
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl border ${
          tone === "neutral"
            ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
            : toneClasses(tone)
        }`}
      >
        {icon}
      </div>
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-[9px] font-medium text-white/45">{translate(label)}</div>
      <div className="mt-1 truncate text-[8px] text-white/25" title={sub}>
        {sub}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const { t: translate } = useLocale();

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[8px] uppercase tracking-[0.1em] text-white/25">
        {translate(label)}
      </div>
      <div className="mt-1 truncate text-[11px] font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function SecurityPill({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  const { t: translate } = useLocale();

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[9px] text-white/45">
      <span className="text-[color:var(--gold)]">{icon}</span>
      {translate(text)}
    </span>
  );
}

function HealthLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const { t: translate } = useLocale();

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
      <span className="text-[10px] text-white/45">{translate(label)}</span>
      <span
        className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${toneClasses(
          tone
        )}`}
      >
        {value}
      </span>
    </div>
  );
}
