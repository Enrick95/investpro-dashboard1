"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import ServerRequests from "@/components/metasync/ServerRequests";
import { HostedRequestError, sendHostedMutation } from "@/lib/metasync/hosted-request-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  LockKeyhole,
  PlugZap,
  Server,
  ShieldCheck,
  Unplug,
  Wifi,
} from "lucide-react";

type Broker = {
  id: string;
  label: string;
  platform: string;
  server: string;
};

type Connection = {
  id: string;
  active: boolean;
  status: string;
  capital_auto: boolean;
  capital_reference: number | null;
  capital_method: string | null;
  funding_summary: { inflows: number; outflows: number } | null;
  equity: number | null;
  investpro_mt_connections: {
    login: string;
    platform: string;
    last_sync: string | null;
    warnings: string[];
    currency: string;
    server?: string;
  };
};

export default function HostedSyncPanel({ initialPlatform = "MT5" }: { initialPlatform?: "MT4" | "MT5" }) {
  const { t: translate, locale } = useLocale();

  const [enabled, setEnabled] = useState(false);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [platform, setPlatform] = useState<"MT4" | "MT5">(initialPlatform);
  const [broker, setBroker] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("");
  const [type, setType] = useState("");
  const [syncConsent, setSyncConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [originRejected, setOriginRejected] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setPlatform(initialPlatform);
    setBroker("");
  }, [initialPlatform]);

  const load = useCallback(async () => {
    const response = await fetch("/api/metasync/hosted", { cache: "no-store" });
    const json = await response.json();

    if (!response.ok) throw new Error(json.error);

    setEnabled(Boolean(json.enabled));
    setBrokers(json.brokers ?? []);
    setConnections(json.connections ?? []);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
    const timer = window.setInterval(() => void load().catch(() => {}), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const platformBrokers = useMemo(
    () => brokers.filter((item) => item.platform === platform),
    [brokers, platform]
  );

  async function send(id?: string) {
    setBusy(true);
    setError("");
    setOriginRejected(false);
    setNotice("");

    try {
      await sendHostedMutation(
        id
          ? { action: "stop", id }
          : {
              broker,
              login,
              password,
              currency,
              type,
              syncConsent,
            }
      );

      setPassword("");
      setNotice(
        id
          ? "Déconnexion demandée. L’historique déjà importé reste conservé."
          : "Connexion enregistrée. InvestPro va lancer la synchronisation."
      );

      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      setOriginRejected(e instanceof HostedRequestError && e.code === "MT_REQUEST_ORIGIN");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  const labels: Record<string, string> = {
    queued: "En attente",
    connecting: "Connexion en cours",
    syncing: "Synchronisation active",
    error: "Échec de synchronisation · cause non précisée",
    capacity: "En file d’attente",
    stopped: "Déconnecté",
    ready: "Prêt",
  };

  return (
    <section
      data-investpro-hosted="true"
      className="overflow-hidden rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]"
    >
      <div className="border-b border-white/[0.06] p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-400">
              <Wifi size={11} />
              {translate("Connexion hébergée")}</div>

            <h2 className="mt-3 text-xl font-semibold text-white">
              {translate("Connecter un compte")}{" "}<span className="text-[color:var(--gold)]">{translate("MT4 / MT5")}</span>
            </h2>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-white/40">
              {translate("Rien à installer sur ton ordinateur. InvestPro conserve les identifiants chiffrés et synchronise les données du compte côté serveur.")}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Pill icon={<ShieldCheck size={11} />} text={translate("Lecture seule InvestPro")} />
            <Pill icon={<LockKeyhole size={11} />} text={translate("Chiffrement serveur")} />
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.06] px-5 py-4 md:px-6">
        <ServerRequests platformDefault={platform} />
      </div>

      <div className="grid grid-cols-1 gap-px bg-white/[0.05] xl:grid-cols-[1.05fr_.95fr]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="bg-[color:var(--panel)] p-5 md:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={translate("Plateforme")}>
              <select
                className="ip-connection-input"
                value={platform}
                onChange={(event) => {
                  setPlatform(event.target.value as "MT4" | "MT5");
                  setBroker("");
                }}
              >
                <option value="MT5">{translate("MetaTrader 5")}</option>
                <option value="MT4">{translate("MetaTrader 4")}</option>
              </select>
            </Field>

            <Field label={translate("Broker / serveur")}>
              <select
                required
                className="ip-connection-input"
                value={broker}
                onChange={(event) => setBroker(event.target.value)}
              >
                <option value="">{translate("Choisir un serveur")}</option>
                {platformBrokers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.server}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={translate("Numéro du compte")}>
              <input
                required
                inputMode="numeric"
                pattern="[0-9]+"
                autoComplete="off"
                className="ip-connection-input"
                value={login}
                onChange={(event) => setLogin(event.target.value.trim())}
                placeholder={translate("Ex. 12345678")}
              />
            </Field>

            <Field label={translate("Mot de passe MetaTrader")}>
              <input
                required
                type="password"
                maxLength={128}
                autoComplete="new-password"
                className="ip-connection-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={translate("Mot de passe du compte")}
              />
            </Field>

            <Field label={translate("Devise")}>
              <select
                required
                className="ip-connection-input"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="" disabled>{translate("Choisir votre devise")}</option>
                <option value="USD">{translate("USD — Dollar américain")}</option>
                <option value="EUR">{translate("EUR — Euro")}</option>
                <option value="CHF">{translate("CHF — Franc suisse")}</option>
                <option value="GBP">{translate("GBP — Livre sterling")}</option>
                <option value="CAD">{translate("CAD — Dollar canadien")}</option>
                <option value="AUD">{translate("AUD — Dollar australien")}</option>
                <option value="JPY">{translate("JPY — Yen japonais")}</option>
                <option value="NZD">{translate("NZD — Dollar néo-zélandais")}</option>
                <option value="SGD">{translate("SGD — Dollar de Singapour")}</option>
                <option value="HKD">{translate("HKD — Dollar de Hong Kong")}</option>
                <option value="ZAR">{translate("ZAR — Rand sud-africain")}</option>
                <option value="USC">{translate("USC — Centime de dollar américain (compte cent)")}</option>
              </select>
              <span className="mt-2 block text-[10px] leading-4 text-white/40">
                {translate("Choisissez la devise affichée dans MetaTrader, même si vous habitez dans un autre pays.")}</span>
            </Field>

            <Field label={translate("Type de compte")}>
              <select
                required
                className="ip-connection-input"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="" disabled>{translate("Choisir le type de compte")}</option>
                <option value="real">{translate("Réel")}</option>
                <option value="demo">{translate("Démo")}</option>
                <option value="prop">{translate("Prop firm")}</option>
              </select>
              <span className="mt-2 block text-[10px] leading-4 text-white/40">
                {translate("Réel : vos fonds. Démo : fonds virtuels. Prop firm : challenge ou compte financé.")}</span>
            </Field>
          </div>

          {platformBrokers.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] leading-5 text-amber-200">
              {translate("Aucun serveur")}{" "}{platform} {" "}{translate("n’est encore enregistré côté InvestPro. Utilise l’installation locale pilote ou contacte le support pour ajouter le serveur.")}</div>
          ) : null}

          <label className="mt-5 flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[10px] leading-5 text-white/45">
            <input
              required
              type="checkbox"
              checked={syncConsent}
              onChange={(event) => setSyncConsent(event.target.checked)}
              className="mt-1"
            />
            <span>
              {translate("Je suis autorisé à connecter ce compte et j’autorise InvestPro à conserver mes identifiants chiffrés afin de synchroniser les données du compte.")}</span>
          </label>

          <button
            disabled={busy || !broker}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <PlugZap size={14} />
            )}
            {busy ? translate("Connexion en cours…") : translate("Connecter mon compte")}
          </button>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-[10px] text-red-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <div>
                <p>{translate(error)}</p>
                {originRejected && <a href="https://investprotrading.fr/dashboard/connexions/metatrader" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  {translate("Ouvrir InvestPro officiel")}
                </a>}
              </div>
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3 text-[10px] text-emerald-300">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              {translate(notice)}
            </div>
          ) : null}
        </form>

        <div className="bg-[color:var(--panel)] p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                {translate("Connexions MetaTrader")}</div>
              <div className="mt-1 text-[9px] text-white/30">
                {connections.length} {" "}{translate("connexion")}{connections.length !== 1 ? translate("s") : ""} {" "}{translate("enregistrée")}{connections.length !== 1 ? translate("s") : ""}
              </div>
            </div>

            <div className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
              <Server size={15} />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {connections.length ? (
              connections.map((connection) => {
                const mt = connection.investpro_mt_connections;
                const old =
                  !mt.last_sync ||
                  Date.now() - Date.parse(mt.last_sync) > 180000;

                const statusText =
                  connection.active &&
                  connection.status === "syncing" &&
                  old
                    ? translate("Synchronisation interrompue")
                    : labels[connection.status] || "En attente";

                const healthy =
                  connection.active &&
                  connection.status === "syncing" &&
                  !old;

                return (
                  <div
                    key={connection.id}
                    className="rounded-2xl border border-white/[0.07] bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold text-white">
                            {mt.platform} · {mt.login}
                          </div>

                          <span
                            className={[
                              "rounded-full border px-2 py-0.5 text-[8px] font-semibold",
                              healthy
                                ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400"
                                : connection.active
                                  ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-300"
                                  : "border-white/[0.07] bg-white/[0.03] text-white/35",
                            ].join(" ")}
                          >
                            {translate(statusText)}
                          </span>
                        </div>

                        <div className="mt-1 text-[9px] text-white/30">
                          {mt.server || translate("Serveur MetaTrader")} · {mt.currency}
                        </div>
                      </div>

                      <div
                        className={[
                          "h-2 w-2 rounded-full",
                          healthy
                            ? "bg-emerald-400"
                            : connection.active
                              ? "bg-amber-300"
                              : "bg-white/25",
                        ].join(" ")}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Metric
                        label={translate("Dernière réception")}
                        value={
                          mt.last_sync
                            ? new Date(mt.last_sync).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : translate("En attente")
                        }
                      />
                      <Metric
                        label={translate("Capital référence")}
                        value={
                          Number(connection.capital_reference) > 0
                            ? `${Number(connection.capital_reference).toLocaleString("fr-FR")} ${mt.currency}`
                            : "Auto"
                        }
                      />
                    </div>

                    {mt.warnings?.map((warning) => (
                      <div
                        key={warning}
                        className="mt-2 text-[9px] leading-4 text-amber-200"
                      >
                        {warning}
                      </div>
                    ))}

                    {connection.active ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void send(connection.id)}
                        className="mt-3 inline-flex items-center gap-2 text-[9px] font-semibold text-red-300/75 hover:text-red-300"
                      >
                        <Unplug size={11} />
                        {translate("Déconnecter")}</button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/15 p-8 text-center">
                <Server size={20} className="mx-auto text-white/20" />
                <div className="mt-3 text-xs font-semibold text-white/45">
                  {translate("Aucun compte hébergé")}</div>
                <p className="mt-1 text-[9px] leading-4 text-white/25">
                  {translate("Le premier compte connecté apparaîtra ici avec son statut de synchronisation.")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ip-connection-input {
          margin-top: 0.5rem;
          height: 2.75rem;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.25);
          padding: 0 0.75rem;
          font-size: 0.75rem;
          color: white;
          outline: none;
        }

        .ip-connection-input:focus {
          border-color: var(--gold-border);
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { t: translate } = useLocale();

  return (
    <label className="block">
      <span className="text-[10px] font-medium text-white/45">{translate(label)}</span>
      {children}
    </label>
  );
}

function Pill({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  const { t: translate } = useLocale();

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[8px] text-white/40">
      <span className="text-[color:var(--gold)]">{icon}</span>
      {translate(text)}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { t: translate } = useLocale();

  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
      <div className="text-[8px] uppercase tracking-[0.08em] text-white/22">
        {translate(label)}
      </div>
      <div className="mt-1 truncate text-[10px] font-semibold text-white/60">
        {value}
      </div>
    </div>
  );
}
