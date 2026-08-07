"use client";

import React, { useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

// ✅ Nouveau: blocage maintenance piloté par la page Admin
import MaintenanceGate from "../../../components/admin/MaintenanceGate";

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

function Row({ label, right }: { label: string; right: React.ReactNode }) {
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
  const [logs, setLogs] = useState<string[]>(["Système prêt (démo). Configure Master + Followers."]);

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

    pushLog(
      `📩 Trade reçu du master (${master?.name}) • EURUSD BUY • ${mm} • SL/TP: ${copySLTP ? "ON" : "OFF"}`
    );

    activeFollowers.forEach((fid) => {
      const f = accounts.find((a) => a.id === fid);
      pushLog(`✅ Copié sur ${f?.name} (${f?.broker})`);
    });
  }

  return (
    <MaintenanceGate kind="copieur">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-2xl font-semibold">Copieur</div>
            <div className="text-sm opacity-70">Démo locale (UI + logique mock)</div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={simulateTrade} disabled={!running}>
              Simuler un trade
            </Button>

            {!running ? (
              <Button onClick={start}>Démarrer</Button>
            ) : (
              <Button variant="ghost" onClick={stop}>
                Arrêter
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardBody className="space-y-4">
              <div className="text-lg font-semibold">Configuration</div>

              <CardSubCard className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-semibold">Master</div>
                  <Pill>{master?.status || "—"}</Pill>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {accounts
                    .filter((a) => a.id.startsWith("m"))
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setMasterId(a.id)}
                        className={[
                          "text-left rounded-2xl border p-4 transition",
                          a.id === masterId
                            ? "border-[color:var(--gold)] bg-[color:var(--panel-2)]"
                            : "border-white/10 bg-white/5 hover:bg-white/7",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">{a.name}</div>
                          <Pill>{a.broker}</Pill>
                        </div>
                        <div className="mt-2 text-sm opacity-80">
                          Balance: {a.balance.toLocaleString("fr-FR")} {a.currency}
                        </div>
                      </button>
                    ))}
                </div>
              </CardSubCard>

              <CardSubCard className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Followers</div>
                  <Pill>
                    {Object.values(followers).filter(Boolean).length}/{followerList.length} actifs
                  </Pill>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {followerList.map((a) => {
                    const on = !!followers[a.id];
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleFollower(a.id)}
                        className={[
                          "text-left rounded-2xl border p-4 transition",
                          on ? "border-[color:var(--gold)] bg-[color:var(--panel-2)]" : "border-white/10 bg-white/5 hover:bg-white/7",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">{a.name}</div>
                          <Pill>{a.broker}</Pill>
                        </div>
                        <div className="mt-2 text-sm opacity-80">
                          Balance: {a.balance.toLocaleString("fr-FR")} {a.currency}
                        </div>
                        <div className="mt-2 text-xs opacity-70">{on ? "✅ Actif" : "⏸️ Inactif"}</div>
                      </button>
                    );
                  })}
                </div>
              </CardSubCard>

              <CardSubCard className="space-y-3">
                <div className="font-semibold">Money Management</div>

                <Row
                  label="Mode"
                  right={
                    <div className="flex gap-2">
                      <Button variant={mode === "risk" ? "default" : "ghost"} onClick={() => setMode("risk")}>
                        Risque %
                      </Button>
                      <Button variant={mode === "mult" ? "default" : "ghost"} onClick={() => setMode("mult")}>
                        Multiplicateur
                      </Button>
                    </div>
                  }
                />

                {mode === "risk" ? (
                  <Row
                    label="Risque (%)"
                    right={
                      <input
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(e.target.value)}
                        className="w-[140px] rounded-xl bg-[var(--panel-2)] border border-[var(--border)] px-3 py-2 outline-none"
                      />
                    }
                  />
                ) : (
                  <Row
                    label="Multiplicateur"
                    right={
                      <input
                        value={multiplier}
                        onChange={(e) => setMultiplier(e.target.value)}
                        className="w-[140px] rounded-xl bg-[var(--panel-2)] border border-[var(--border)] px-3 py-2 outline-none"
                      />
                    }
                  />
                )}

                <Row
                  label="Copier SL/TP"
                  right={
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={copySLTP} onChange={(e) => setCopySLTP(e.target.checked)} />
                      <span className="opacity-80">{copySLTP ? "ON" : "OFF"}</span>
                    </label>
                  }
                />

                <Row
                  label="Lot max"
                  right={
                    <input
                      value={maxLot}
                      onChange={(e) => setMaxLot(e.target.value)}
                      className="w-[140px] rounded-xl bg-[var(--panel-2)] border border-[var(--border)] px-3 py-2 outline-none"
                    />
                  }
                />
              </CardSubCard>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <div className="text-lg font-semibold">Logs</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 h-[520px] overflow-auto">
                {logs.map((l, i) => (
                  <div key={i} className="text-sm opacity-85 py-1 border-b border-white/5 last:border-b-0">
                    {l}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </MaintenanceGate>
  );
}
