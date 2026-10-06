"use client";

import HostedSyncPanel from "./HostedSyncPanel";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  KeyRound,
  Laptop,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";

type Connection = {
  platform: "MT4" | "MT5";
  id: string;
  account_id: number;
  login: string;
  server: string;
  revoked: boolean;
  last_sync: string | null;
  warnings: string[];
};

export default function MetaSyncPanel() {
  return (
    <div className="space-y-4">
      <HostedSyncPanel />
      <LocalSyncPanel />
    </div>
  );
}

function LocalSyncPanel() {
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Connection[]>([]);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const [platform, setPlatform] = useState("MT4");
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [capital, setCapital] = useState("");
  const [type, setType] = useState("demo");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/metasync/connect", {
        cache: "no-store",
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error);

      setEnabled(Boolean(json.enabled));
      setRows(json.connections ?? []);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Connecteur local indisponible.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function submit(action = "pair", id?: string) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/metasync/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id,
          platform,
          login,
          server,
          currency: currency.toUpperCase(),
          initial_balance: Number(capital.replace(",", ".")),
          account_type: type,
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error);

      if (json.token) setToken(json.token);
      await load();
    } catch (e: any) {
      setError(e?.message || "Impossible de créer la clé.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled && !error) return null;

  return (
    <details className="group overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-black/20 text-white/45">
            <Laptop size={16} />
          </div>

          <div>
            <div className="text-xs font-semibold text-white">
              Installation locale MetaTrader
            </div>
            <div className="mt-1 text-[9px] text-white/30">
              Mode pilote / connecteur Windows avancé
            </div>
          </div>
        </div>

        <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[8px] font-semibold text-white/35">
          AVANCÉ
        </span>
      </summary>

      <section className="border-t border-white/[0.06] p-4 md:p-5">
        <div className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck
              size={14}
              className="mt-0.5 shrink-0 text-[color:var(--gold)]"
            />
            <p className="text-[10px] leading-5 text-white/45">
              Associe un terminal Windows déjà connecté. Aucun mot de passe MetaTrader
              n’est saisi ici : InvestPro génère une clé de synchronisation.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-[10px] text-red-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {enabled ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Plateforme">
                <select
                  className="ip-local-input"
                  value={platform}
                  onChange={(event) => {
                    setPlatform(event.target.value);
                    setToken("");
                  }}
                >
                  <option value="MT4">MetaTrader 4</option>
                  <option value="MT5">MetaTrader 5</option>
                </select>
              </Field>

              <Field label="Numéro du compte">
                <input
                  className="ip-local-input"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="Ex. 12345678"
                />
              </Field>

              <Field label="Serveur exact du broker">
                <input
                  className="ip-local-input"
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  placeholder="Ex. FusionMarkets-Live"
                />
              </Field>

              <Field label="Devise">
                <input
                  className="ip-local-input"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  placeholder="EUR"
                />
              </Field>

              <Field label="Capital de départ">
                <input
                  className="ip-local-input"
                  inputMode="decimal"
                  value={capital}
                  onChange={(event) => setCapital(event.target.value)}
                  placeholder="10000"
                />
              </Field>

              <Field label="Type">
                <select
                  className="ip-local-input"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="demo">Démo</option>
                  <option value="real">Réel</option>
                  <option value="prop">Prop firm</option>
                </select>
              </Field>
            </div>

            <button
              disabled={busy}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-[10px] font-semibold text-[color:var(--gold)] disabled:opacity-50"
              onClick={() => void submit()}
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <KeyRound size={13} />
              )}
              Créer / renouveler ma clé
            </button>

            {token ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-300">
                  <CheckCircle2 size={13} />
                  Clé prête
                </div>

                <p className="mt-2 text-[9px] leading-4 text-white/35">
                  Copie cette clé maintenant. Elle ne sera plus affichée après rechargement.
                </p>

                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="Clé de synchronisation"
                    readOnly
                    type="password"
                    value={token}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-black/25 px-3 text-xs text-white"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(token)
                        .catch(() =>
                          setError(
                            "Copie automatique indisponible : sélectionne la clé dans le champ."
                          )
                        );
                    }}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/55"
                  >
                    <Clipboard size={14} />
                  </button>
                </div>
              </div>
            ) : null}

            {rows.length ? (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {rows.map((connection) => {
                  const old =
                    !connection.last_sync ||
                    Date.now() - Date.parse(connection.last_sync) > 180000;

                  return (
                    <div
                      key={connection.id}
                      className="rounded-xl border border-white/[0.07] bg-black/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold text-white">
                            {connection.platform} · {connection.login}
                          </div>
                          <div className="mt-1 text-[8px] text-white/30">
                            {connection.server}
                          </div>
                        </div>

                        <span
                          className={[
                            "rounded-full border px-2 py-1 text-[8px] font-semibold",
                            connection.revoked
                              ? "border-white/[0.07] bg-white/[0.03] text-white/30"
                              : old
                                ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-300"
                                : "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400",
                          ].join(" ")}
                        >
                          {connection.revoked
                            ? "Déconnecté"
                            : old
                              ? "À vérifier"
                              : "Actif"}
                        </span>
                      </div>

                      <div className="mt-2 text-[8px] text-white/30">
                        {connection.last_sync
                          ? `Dernière réception : ${new Date(
                              connection.last_sync
                            ).toLocaleString("fr-FR")}`
                          : "En attente du connecteur"}
                      </div>

                      {connection.warnings?.map((warning) => (
                        <div
                          key={warning}
                          className="mt-1 text-[8px] text-amber-200"
                        >
                          {warning}
                        </div>
                      ))}

                      {!connection.revoked ? (
                        <button
                          disabled={busy}
                          onClick={() => void submit("revoke", connection.id)}
                          className="mt-3 inline-flex items-center gap-1.5 text-[8px] font-semibold text-red-300/70"
                        >
                          <Unplug size={10} />
                          Révoquer la clé
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}

        <style jsx>{`
          .ip-local-input {
            margin-top: 0.5rem;
            height: 2.65rem;
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.25);
            padding: 0 0.75rem;
            font-size: 0.72rem;
            color: white;
            outline: none;
          }

          .ip-local-input:focus {
            border-color: var(--gold-border);
          }
        `}</style>
      </section>
    </details>
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
      <span className="text-[9px] font-medium text-white/40">{label}</span>
      {children}
    </label>
  );
}
