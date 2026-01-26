"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

type Account = {
  id: string;
  name: string;
  broker: string;
  balance: number;
  currency: string;
  status: "Actif" | "Inactif";
};

function Pill({ children }: { children: string }) {
  return (
    <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-white/5 text-[color:var(--muted)]">
      {children}
    </span>
  );
}

function Row({
  label,
  right,
}: {
  label: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-[color:var(--muted)]">{label}</div>
      <div>{right}</div>
    </div>
  );
}

export default function CopieurPage() {
  // Mock accounts (plus tard: viendra de la DB / API)
  const accounts: Account[] = useMemo(
    () => [
      { id: "m1", name: "Master MT5", broker: "IC Markets", balance: 5000, currency: "USD", status: "Actif" },
      { id: "f1", name: "Follower 1", broker: "FTMO", balance: 10000, currency: "USD", status: "Actif" },
      { id: "f2", name: "Follower 2", broker: "Pepperstone", balance: 2500, currency: "USD", status: "Actif" },
    ],
    []
  );

  const [masterId, setMasterId] = useState("m1");
  const [followers, setFollowers] = useState<Record<string, boolean>>({
    f1: true,
    f2: false,
  });

  const [mode, setMode] = useState<"risk" | "mult">("risk");
  const [riskPercent, setRiskPercent] = useState("1");
  const [multiplier, setMultiplier] = useState("1.0");

  const [copySLTP, setCopySLTP] = useState(true);
  const [maxLot, setMaxLot] = useState("2.0");

  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "Système prêt (démo). Configure Master + Followers.",
  ]);

  const master = accounts.find((a) => a.id === masterId);
  const followerList = accounts.filter((a) => a.id !== masterId);

  function toggleFollower(id: string) {
    setFollowers((p) => ({ ...p, [id]: !p[id] }));
  }

  function pushLog(line: string) {
    setLogs((p) => [line, ...p].slice(0, 30));
  }

  function start() {
    setRunning(true);
    pushLog("Copieur démarré (démo). En attente de trades...");
  }

  function stop() {
    setRunning(false);
    pushLog("Copieur arrêté (démo).");
  }

  function simulateTrade() {
    if (!running) return;

    const activeFollowers = Object.entries(followers)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    if (activeFollowers.length === 0) {
      pushLog("⚠️ Aucun follower actif. Trade ignoré.");
      return;
    }

    const mm =
      mode === "risk"
        ? `MM: Risque ${riskPercent}% (max lot ${maxLot})`
        : `MM: x${multiplier} (max lot ${maxLot})`;

    pushLog(`📩 Trade reçu du master (${master?.name}) • EURUSD BUY • ${mm} • SL/TP: ${copySLTP ? "ON" : "OFF"}`);

    activeFollowers.forEach((fid) => {
      const f = accounts.find((a) => a.id === fid);
      pushLog(`✅ Copié sur ${f?.name} (${f?.broker})`);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Copieur de positions <span className="text-[color:var(--gold)]">BETA</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Mode démo pour l’instant. VPS/MT5 sera branché ensuite.
          </p>
        </div>

        <div className="flex gap-3">
          {running ? (
            <Button variant="danger" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button onClick={start}>Start</Button>
          )}
          <Button variant="secondary" onClick={simulateTrade} disabled={!running}>
            Simuler un trade
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Config */}
        <Card className="xl:col-span-2">
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Configuration</div>
              <div className="flex gap-2">
                <Pill>VPS: OFF</Pill>
                <Pill>MT5: OFF</Pill>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CardSubCard>
                <div className="text-sm font-semibold">Master</div>
                <div className="text-xs text-[color:var(--muted)] mt-1">
                  Compte source (les trades viennent de lui)
                </div>

                <select
                  value={masterId}
                  onChange={(e) => setMasterId(e.target.value)}
                  className="mt-4 w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                             text-white outline-none focus:border-[color:var(--gold-border)]
                             focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} • {a.broker} • {a.balance} {a.currency}
                    </option>
                  ))}
                </select>
              </CardSubCard>

              <CardSubCard>
                <div className="text-sm font-semibold">Followers</div>
                <div className="text-xs text-[color:var(--muted)] mt-1">
                  Comptes qui reçoivent la copie
                </div>

                <div className="mt-4 space-y-2">
                  {followerList.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => toggleFollower(a.id)}
                      className={[
                        "w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition",
                        followers[a.id]
                          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                          : "border-[color:var(--border)] bg-black/20 hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="text-left">
                        <div className="font-semibold">{a.name}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {a.broker} • {a.balance} {a.currency}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">
                        {followers[a.id] ? (
                          <span className="text-[color:var(--gold)]">ON</span>
                        ) : (
                          <span className="text-[color:var(--muted)]">OFF</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardSubCard>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CardSubCard>
                <div className="text-sm font-semibold">Money management</div>
                <div className="text-xs text-[color:var(--muted)] mt-1">
                  Choisis comment dimensionner les lots sur les followers
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setMode("risk")}
                    className={[
                      "px-3 py-2 rounded-xl border text-sm transition",
                      mode === "risk"
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-white"
                        : "border-[color:var(--border)] bg-black/20 text-[color:var(--muted)] hover:bg-white/5",
                    ].join(" ")}
                  >
                    Risque %
                  </button>
                  <button
                    onClick={() => setMode("mult")}
                    className={[
                      "px-3 py-2 rounded-xl border text-sm transition",
                      mode === "mult"
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-white"
                        : "border-[color:var(--border)] bg-black/20 text-[color:var(--muted)] hover:bg-white/5",
                    ].join(" ")}
                  >
                    Multiplicateur
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mode === "risk" ? (
                    <label className="block">
                      <div className="text-sm text-white/70 mb-2">Risque (%) / trade</div>
                      <input
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(e.target.value)}
                        placeholder="Ex: 1"
                        className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                                   outline-none focus:border-[color:var(--gold-border)]
                                   focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                      />
                    </label>
                  ) : (
                    <label className="block">
                      <div className="text-sm text-white/70 mb-2">Multiplicateur (x)</div>
                      <input
                        value={multiplier}
                        onChange={(e) => setMultiplier(e.target.value)}
                        placeholder="Ex: 1.0"
                        className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                                   outline-none focus:border-[color:var(--gold-border)]
                                   focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                      />
                    </label>
                  )}

                  <label className="block">
                    <div className="text-sm text-white/70 mb-2">Lot max</div>
                    <input
                      value={maxLot}
                      onChange={(e) => setMaxLot(e.target.value)}
                      placeholder="Ex: 2.0"
                      className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                                 outline-none focus:border-[color:var(--gold-border)]
                                 focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={copySLTP}
                      onChange={(e) => setCopySLTP(e.target.checked)}
                      className="accent-[color:var(--gold)]"
                    />
                    Copier SL/TP
                  </label>
                </div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-sm font-semibold">Résumé</div>
                <div className="text-xs text-[color:var(--muted)] mt-1">
                  Ce qui sera appliqué (démo)
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <Row
                    label="Master"
                    right={<span className="font-semibold">{master?.name ?? "—"}</span>}
                  />
                  <Row
                    label="Followers actifs"
                    right={
                      <span className="font-semibold text-[color:var(--gold)]">
                        {Object.values(followers).filter(Boolean).length}
                      </span>
                    }
                  />
                  <Row
                    label="MM"
                    right={
                      <span className="font-semibold">
                        {mode === "risk" ? `Risque ${riskPercent}%` : `x${multiplier}`}
                      </span>
                    }
                  />
                  <Row
                    label="Copie SL/TP"
                    right={
                      <span className="font-semibold">
                        {copySLTP ? (
                          <span className="text-[color:var(--success)]">ON</span>
                        ) : (
                          <span className="text-[color:var(--danger)]">OFF</span>
                        )}
                      </span>
                    }
                  />
                  <Row label="Lot max" right={<span className="font-semibold">{maxLot}</span>} />
                  <div className="pt-2 text-xs text-[color:var(--muted)]">
                    * Le copier réel sera branché via VPS (agent MT5) plus tard.
                  </div>
                </div>
              </CardSubCard>
            </div>
          </CardBody>
        </Card>

        {/* Logs */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Logs</div>
              <Pill>{running ? "RUNNING" : "STOPPED"}</Pill>
            </div>

            <div className="mt-4 space-y-2">
              {logs.map((l, i) => (
                <div
                  key={i}
                  className="text-xs text-[color:var(--muted)] border border-[color:var(--border)] bg-black/20 rounded-xl p-3"
                >
                  {l}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
