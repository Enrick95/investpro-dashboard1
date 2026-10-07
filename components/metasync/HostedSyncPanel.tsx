"use client";

import ServerRequests from "./ServerRequests";
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

export default function HostedSyncPanel() {
  const [enabled, setEnabled] = useState(false);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [platform, setPlatform] = useState("MT5");
  const [broker, setBroker] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [type, setType] = useState("prop");
  const [syncConsent, setSyncConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    setNotice("");

    try {
      const response = await fetch("/api/metasync/hosted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
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
        ),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error);

      setPassword("");
      setNotice(
        id
          ? "Déconnexion demandée. L’historique déjà importé reste conservé."
          : "Connexion enregistrée. InvestPro va lancer la synchronisation."
      );

      await load();
    } catch (e: any) {
      setError(e?.message || "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  const labels: Record<string, string> = {
    queued: "En attente",
    connecting: "Connexion en cours",
    syncing: "Synchronisation active",
    error: "À vérifier",
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
              Connexion hébergée
            </div>

            <h2 className="mt-3 text-xl font-semibold text-white">
              Connecter un compte <span className="text-[color:var(--gold)]">MT4 / MT5</span>
            </h2>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-white/40">
              Rien à installer sur ton ordinateur. InvestPro conserve les identifiants chiffrés
              et synchronise les données du compte côté serveur.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Pill icon={<ShieldCheck size={11} />} text="Lecture seule InvestPro" />
            <Pill icon={<LockKeyhole size={11} />} text="Chiffrement serveur" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-white/[0.05] xl:grid-cols-[1.05fr_.95fr]">
        <div className="min-w-0 bg-[color:var(--panel)]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="bg-[color:var(--panel)] p-5 md:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Plateforme">
              <select
                className="ip-connection-input"
                value={platform}
                onChange={(event) => {
                  setPlatform(event.target.value);
                  setBroker("");
                }}
              >
                <option value="MT5">MetaTrader 5</option>
                <option value="MT4">MetaTrader 4</option>
              </select>
            </Field>

            <Field label="Broker / serveur">
              <select
                required
                className="ip-connection-input"
                value={broker}
                onChange={(event) => setBroker(event.target.value)}
              >
                <option value="">Choisir un serveur</option>
                {platformBrokers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.server}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Numéro du compte">
              <input
                required
                inputMode="numeric"
                pattern="[0-9]+"
                autoComplete="off"
                className="ip-connection-input"
                value={login}
                onChange={(event) => setLogin(event.target.value.trim())}
                placeholder="Ex. 12345678"
              />
            </Field>

            <Field label="Mot de passe MetaTrader">
              <input
                required
                type="password"
                maxLength={128}
                autoComplete="new-password"
                className="ip-connection-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mot de passe du compte"
              />
            </Field>

            <Field label="Devise">
              <input
                required
                maxLength={3}
                pattern="[A-Z]{3}"
                className="ip-connection-input"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                placeholder="USD"
              />
            </Field>

            <Field label="Type de compte">
              <select
                className="ip-connection-input"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="real">Réel</option>
                <option value="demo">Démo</option>
                <option value="prop">Prop firm</option>
              </select>
            </Field>
          </div>

          {platformBrokers.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] leading-5 text-amber-200">
              Aucun serveur {platform} n’est encore enregistré côté InvestPro.
              Demande son ajout avec « Mon serveur est absent » ci-dessous.
            </div>
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
              Je suis autorisé à connecter ce compte et j’autorise InvestPro à conserver
              mes identifiants chiffrés afin de synchroniser les données du compte.
            </span>
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
            {busy ? "Connexion en cours…" : "Connecter mon compte"}
          </button>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-[10px] text-red-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3 text-[10px] text-emerald-300">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              {notice}
            </div>
          ) : null}
        </form>
        <div className="px-5 pb-5 md:px-6 md:pb-6"><ServerRequests platformDefault={platform}/></div>
        </div>

        <div className="bg-[color:var(--panel)] p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Connexions MetaTrader
              </div>
              <div className="mt-1 text-[9px] text-white/30">
                {connections.length} connexion{connections.length !== 1 ? "s" : ""} enregistrée{connections.length !== 1 ? "s" : ""}
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
                    ? "Synchronisation interrompue"
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
                            {statusText}
                          </span>
                        </div>

                        <div className="mt-1 text-[9px] text-white/30">
                          {mt.server || "Serveur MetaTrader"} · {mt.currency}
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
                        label="Dernière réception"
                        value={
                          mt.last_sync
                            ? new Date(mt.last_sync).toLocaleString("fr-FR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "En attente"
                        }
                      />
                      <Metric
                        label="Capital référence"
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
                        Déconnecter
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/15 p-8 text-center">
                <Server size={20} className="mx-auto text-white/20" />
                <div className="mt-3 text-xs font-semibold text-white/45">
                  Aucun compte hébergé
                </div>
                <p className="mt-1 text-[9px] leading-4 text-white/25">
                  Le premier compte connecté apparaîtra ici avec son statut de synchronisation.
                </p>
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
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-white/45">{label}</span>
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
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[8px] text-white/40">
      <span className="text-[color:var(--gold)]">{icon}</span>
      {text}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
      <div className="text-[8px] uppercase tracking-[0.08em] text-white/22">
        {label}
      </div>
      <div className="mt-1 truncate text-[10px] font-semibold text-white/60">
        {value}
      </div>
    </div>
  );
}
