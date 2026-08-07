"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import GoldSelect from "../../../components/ui/GoldSelect";

import { pushNotif } from "../../../lib/notifyStore";
import {
  Mt5Account,
  MtPlatform,
  MT5_EVT,
  loadMt5Accounts,
  removeMt5Account,
  upsertMt5Account,
} from "../../../lib/mt5Store";

/* =========================================================
   ✅ BROKERS séparés MT4 / MT5
========================================================= */

type BrokerPreset = { broker: string; servers: string[] };

const BROKER_PRESETS_MT4: BrokerPreset[] = [
  // 👇 Mets tes serveurs MT4 ici
  // { broker: "FTMO Global Markets Ltd", servers: ["FTMO-MT4-Server", "FTMO-MT4-Demo"] },
];

/* =========================================================
   BROKERS + SERVERS (MT5)
========================================================= */
const BROKER_PRESETS_MT5 = [
  // MetaQuotes Ltd.
  {
    broker: "MetaQuotes Ltd.",servers: ["MetaQuotes-Demo"],
  },

  // BLUEBERRY MARKETS EXEMPLE
  {
    broker: "Blueberry Markets Pty Ltd",servers: ["BlueberryMarkets-Live","BlueberryMarkets-Live02","BlueberryMarkets-Demo","BlueberryMarkets-Demo02",],
  },
  {
    broker: "Blueberry Markets (V) Ltd",servers: ["BlueberryMarketsV-Live3"],
  },
  {
    broker: "Blueberry Markets (SVG) LLC",servers: ["BlueberryMarketsSVG-Live"],
  },

  // RAISE GLOBAL
  {
    broker: "Raise Global SA (Pty) Ltd",servers: ["RaiseGlobal-Live"],
  },
  {
    broker: "Raise Global SA (Pty) Limited",servers: ["RaiseGlobalSA-LIVE"],
  },

  // FTMO
  {
    broker: "FTMO Global Markets Ltd",servers: ["FTMO-Server","FTMO-Server2","FTMO-Server3","FTMO-Server4","FTMO-Server5","FTMO-Demo","FTMO-Demo2",],
  },

  // Fusion Markets
  {
    broker: "Fusion Markets Pty Ltd",servers: ["FusionMarkets-Live", "FusionMarkets-Demo"],
  },
  {
    broker: "Fusion Markets International Ltd",servers: ["FusionMarketInternational-MT5_2"],
  },

  // VT Markets
  {
    broker: "VT Markets Pty Ltd",servers: ["VTMarkets-Live","VTMarkets-Live 2","VTMarkets-Live 3","VTMarkets-Live 4", "VTMarkets-Live 5","VTMarkets-Live 6","VTMarkets-Demo",],
  },

  // FundingPips
  {
    broker: "FundingPips Corp",servers: ["FundingPips-SIM"],
  },
  {
    broker: "FundingPips Corp (2)",servers: ["FundingPips2-SIM"],
  },

  // PuPrime
  {
    broker: "Pu Prime Ltd",servers: ["PuPrime-Live","PuPrime-Live2","PuPrime-Live 4","PuPrime-Live 5","PuPrime-Live 6","PuPrime-Demo",],
  },
  {
    broker: "PuPrime Trading Pty Ltd",servers: ["PuPrimeTrading-Live"],
  },

  // Notesco (IronFX)
  {
    broker: "Notesco Limited",servers: ["IronFX-Real1", "IronFX-Demo1"],
  },

  // RoboForex
  {
    broker: "RoboForex Ltd",servers: ["RoboForex-Pro", "RoboForex-ECN"],
  },

  // Vantage
  {
    broker: "Vantage Fx Pty Ltd.",servers: ["VantageFX-Live","VantageFX-Live 3","VantageFX-Live 4","VantageFX-Live 5","VantageFX-Live 6","VantageFX-Live 7","VantageFX-Live 8","VantageFX-Live 9","VantageFX-Live 10","VantageFX-Live 11","VantageFX-Live 12","VantageFX-Live 14","VantageFX-Live 15","VantageFX-Live 17","VantageFX-Live 19","VantageFX-Live 21","VantageFX-Demo",],
  },

  // Eightcap
  {
    broker: "Eightcap Pty Ltd",servers: ["Eightcap-Live", "Eightcap-Demo"],
  },
  {
    broker: "Eightcap Global Limited",servers: ["EightcapGlobal-Live"],
  },
  {
    broker: "Eightcap EU Ltd",servers: ["EightcapEU-Live"],
  },

  // IC Markets variants
  {
    broker: "IC Markets (EU) Ltd",servers: ["ICMarketsEU-MT5-5", "ICMarketsEU-Demo"],
  },
  {
    broker: "Ic Markets Ltd",servers: ["ICMarketsInternational-Demo","ICMarketsInternational-MT5","ICMarketsInternational-MT5-4","ICMarketsInternational-MT5-2",],
  },
  {
    broker: "IC Markets Group Ltd",servers: ["ICMarketsGRP-MT5", "ICMarketsGRP-Demo"],
  },
  {
    broker: "IC Markets (KE) limited",servers: ["ICMarketsKE-MT5-7", "ICMarketsKE-Demo"],
  },
  {
    broker: "International Capital Markets Pty. Ltd.",servers: ["ICMarkets-MT5", "ICMarkets-MT5-2", "ICMarkets-MT5-4", "ICMarkets-Demo"],
  },

  // OANDA
  {
    broker: "OANDA Corporation",servers: ["OANDA-Live-1","OANDA-Demo-1","OANDA-Prop Trader","Oanda-Japan MT5 Live","Oanda-Japan MT5 Demo"],
  },
  {
    broker: "Oanda Europe Limited",servers: ["OANDA_UK-Demo-1", "OANDA_UK-Live-1"],
  },
  {
    broker: "Oanda Asia Pacific Pte Ltd",servers: ["OANDA_SG-Demo-1", "OANDA_SG-Live-1"],
  },
  {
    broker: "OANDA (Canada) Corporation ULC",servers: ["OANDA_Canada-Demo-1"],
  },
  {
    broker: "OANDA Global Markets Limited",servers: ["OANDA_Global-Demo-1", "OANDA_Global-Live-1"],
  },
  {
    broker: "OANDA TMS Brokers S.A.",servers: ["OANDATMS-MT5"],
  },

  // AvaTrade
  {
    broker: "Ava Trade Markets Ltd.",servers: ["AvaTradeMarkets-Demo 1-MT5", "AvaTradeMarkets-Real 1-MT5"],
  },

  // --- ADD NEW BROKERS/SERVERS ABOVE THIS LINE ---
];

function presetsFor(platform: MtPlatform): BrokerPreset[] {
  if (platform === "MT4") return BROKER_PRESETS_MT4.length ? BROKER_PRESETS_MT4 : BROKER_PRESETS_MT5;
  return BROKER_PRESETS_MT5;
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm text-white/70 mb-2">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type ?? "text"}
        className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                   text-white placeholder:text-white/30 outline-none
                   focus:border-[color:var(--gold-border)]
                   focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
      />
    </label>
  );
}

type AddForm = {
  platform: MtPlatform;
  label: string;
  broker: string;
  server: string | "__OTHER__" | "";
  serverOther: string;
  login: string;
  password: string;
};

export default function ComptesPage() {
  const [mtAccounts, setMtAccounts] = useState<Mt5Account[]>(() => loadMt5Accounts());
  const [open, setOpen] = useState(false);

  // ✅ refresh quand le store change (et multi-onglets)
  useEffect(() => {
    const onEvt = () => setMtAccounts(loadMt5Accounts());
    window.addEventListener(MT5_EVT as any, onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener(MT5_EVT as any, onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, []);

  const [form, setForm] = useState<AddForm>(() => {
    const p: MtPlatform = "MT5";
    const list = presetsFor(p);
    return {
      platform: p,
      label: "",
      broker: list[0]?.broker ?? "",
      server: list[0]?.servers?.[0] ?? "",
      serverOther: "",
      login: "",
      password: "",
    };
  });

  const activePresets = useMemo(() => presetsFor(form.platform), [form.platform]);

  const brokerPreset = useMemo(
    () => activePresets.find((b) => b.broker === form.broker) ?? activePresets[0],
    [activePresets, form.broker]
  );

  const brokerOptions = useMemo(
    () => activePresets.map((b) => ({ value: b.broker, label: b.broker })),
    [activePresets]
  );

  const serverOptions = useMemo(() => {
    const base = (brokerPreset?.servers ?? []).map((s) => ({ value: s, label: s }));
    return [...base, { value: "__OTHER__", label: "Autre (écrire le serveur)" }];
  }, [brokerPreset]);

  const totals = useMemo(() => {
    const connected = mtAccounts.filter((a) => a.status === "CONNECTED").length;
    const bal = mtAccounts.reduce((s, a) => s + (a.snapshot?.balance ?? 0), 0);
    const prof = mtAccounts.reduce((s, a) => s + (a.snapshot?.profit ?? 0), 0);
    return { connected, bal, prof };
  }, [mtAccounts]);

  function addAccount() {
    const label = form.label.trim() || `Compte ${form.login}`;
    const broker = form.broker.trim();
    const server = form.server === "__OTHER__" ? form.serverOther.trim() : String(form.server).trim();
    const login = form.login.trim();

    if (!broker || !server || !login) {
      pushNotif({ kind: "error", title: "Champs manquants", message: "Broker, serveur et login requis." });
      return;
    }

    const acc: Mt5Account = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label,
      broker,
      server,
      login,
      password: form.password,
      status: "DISCONNECTED",
      platform: form.platform,
    };

    setMtAccounts(upsertMt5Account(acc));
    setOpen(false);
    pushNotif({ kind: "success", title: "Compte ajouté", message: `${form.platform} • ${label}` });
  }

  async function testConnection(acc: Mt5Account) {
    const platform = acc.platform ?? "MT5";
    const endpoint = platform === "MT4" ? "/api/mt4/test" : "/api/mt5/test";

    const updated: Mt5Account = { ...acc, status: "DISCONNECTED", lastError: undefined };

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: acc.broker,
          server: acc.server,
          login: acc.login,
          password: acc.password ?? "",
          platform,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Erreur connexion");

      updated.status = "CONNECTED";
      updated.snapshot = j.snapshot;
      pushNotif({ kind: "success", title: "Connexion OK", message: `${platform} • ${acc.label}` });
    } catch (e: any) {
      updated.status = "ERROR";
      updated.lastError = String(e?.message ?? e);
      pushNotif({ kind: "error", title: "Connexion échouée", message: updated.lastError });
    }

    setMtAccounts(upsertMt5Account(updated));
  }

  function removeAcc(id: string) {
    setMtAccounts(removeMt5Account(id));
    pushNotif({ kind: "info", title: "Compte supprimé" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-white">Comptes</div>
          <div className="text-white/60 text-sm mt-1">MetaTrader MT4/MT5 (brokers séparés).</div>
        </div>
        <Button onClick={() => setOpen(true)}>+ Ajouter un compte</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <div className="text-white/60 text-sm">Connectés</div>
            <div className="text-white text-2xl font-semibold mt-1">{totals.connected}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-white/60 text-sm">Balance totale</div>
            <div className="text-white text-2xl font-semibold mt-1">{fmt(totals.bal)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-white/60 text-sm">Profit total</div>
            <div className="text-white text-2xl font-semibold mt-1">{fmt(totals.prof)}</div>
          </CardBody>
        </Card>
      </div>

      {/* Liste comptes */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-white font-semibold">MetaTrader</div>
            <div className="text-white/50 text-sm">{mtAccounts.length} compte(s)</div>
          </div>

          {mtAccounts.length === 0 ? (
            <div className="text-white/50 text-sm">Aucun compte ajouté.</div>
          ) : (
            <div className="space-y-3">
              {mtAccounts.map((a) => {
                const p = a.platform ?? "MT5";
                const bal = a.snapshot?.balance ?? null;
                const eq = a.snapshot?.equity ?? null;
                const pr = a.snapshot?.profit ?? null;
                const cur = a.snapshot?.currency ?? "";

                const profitClass =
                  pr == null ? "text-white/70" : pr > 0 ? "text-emerald-300" : pr < 0 ? "text-red-300" : "text-white/70";

                const statusPill =
                  a.status === "CONNECTED"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                    : a.status === "ERROR"
                    ? "bg-red-500/15 text-red-300 border-red-500/25"
                    : "bg-white/5 text-white/60 border-white/10";

                const statusLabel =
                  a.status === "CONNECTED" ? "Connecté" : a.status === "ERROR" ? "Erreur" : "Déconnecté";

                return (
                  <CardSubCard key={a.id}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-[color:var(--gold-soft)]/15 text-[color:var(--gold)] border border-[color:var(--gold-border)]/30">
                              {p}
                            </span>
                            <div className="text-white font-semibold truncate">{a.label}</div>
                            <span className={`px-2 py-1 rounded-full text-xs border ${statusPill}`}>{statusLabel}</span>
                          </div>

                          <div className="text-white/50 text-sm truncate mt-1">
                            {a.broker} — {a.server} — {a.login}
                          </div>

                          {a.status === "ERROR" && a.lastError ? (
                            <div className="text-red-300 text-xs mt-2">{a.lastError}</div>
                          ) : null}
                        </div>

                        <div className="flex gap-2 shrink-0">
                          <Button variant="ghost" onClick={() => testConnection(a)}>Tester</Button>
                          <Button variant="danger" onClick={() => removeAcc(a.id)}>Suppr.</Button>
                        </div>
                      </div>

                      {a.snapshot ? (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-2xl bg-black/20 border border-white/10 px-3 py-2">
                            <div className="text-[11px] text-white/50">Balance</div>
                            <div className="text-white font-semibold text-sm mt-0.5">
                              {bal == null ? "—" : fmt(bal)} <span className="text-white/40">{cur}</span>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-black/20 border border-white/10 px-3 py-2">
                            <div className="text-[11px] text-white/50">Equity</div>
                            <div className="text-white font-semibold text-sm mt-0.5">
                              {eq == null ? "—" : fmt(eq)} <span className="text-white/40">{cur}</span>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-black/20 border border-white/10 px-3 py-2">
                            <div className="text-[11px] text-white/50">Profit</div>
                            <div className={`font-semibold text-sm mt-0.5 ${profitClass}`}>
                              {pr == null ? "—" : fmt(pr)} <span className="text-white/40">{cur}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-white/40">
                          Aucune donnée — clique sur “Tester” pour récupérer balance/equity/profit.
                        </div>
                      )}
                    </div>
                  </CardSubCard>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Modal Add */}
      <Modal open={open} onClose={() => setOpen(false)} title="Ajouter un compte MetaTrader">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-white/70 mb-2">Plateforme</div>
              <GoldSelect
                value={form.platform}
                onChange={(v) => {
                  const platform = v as MtPlatform;
                  const list = presetsFor(platform);
                  setForm((p) => ({
                    ...p,
                    platform,
                    broker: list[0]?.broker ?? "",
                    server: list[0]?.servers?.[0] ?? "",
                    serverOther: "",
                  }));
                }}
                options={[
                  { value: "MT4", label: "MT4" },
                  { value: "MT5", label: "MT5" },
                ]}
              />
            </div>

            <Input
              label="Nom du compte"
              value={form.label}
              onChange={(v) => setForm((p) => ({ ...p, label: v }))}
              placeholder="Ex: Challenge 50k"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-white/70 mb-2">Broker ({form.platform})</div>
              <GoldSelect
                value={form.broker}
                onChange={(v) => {
                  const preset = activePresets.find((x) => x.broker === v) ?? activePresets[0];
                  setForm((p) => ({
                    ...p,
                    broker: v,
                    server: preset?.servers?.[0] ?? "",
                    serverOther: "",
                  }));
                }}
                options={brokerOptions}
              />
            </div>

            <div>
              <div className="text-sm text-white/70 mb-2">Serveur</div>
              <GoldSelect
                value={String(form.server)}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    server: v as any,
                    serverOther: v === "__OTHER__" ? p.serverOther : "",
                  }))
                }
                options={serverOptions}
              />
            </div>
          </div>

          {form.server === "__OTHER__" ? (
            <Input
              label="Serveur (autre)"
              value={form.serverOther}
              onChange={(v) => setForm((p) => ({ ...p, serverOther: v }))}
              placeholder="Ex: MonBroker-Live01"
            />
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Login"
              value={form.login}
              onChange={(v) => setForm((p) => ({ ...p, login: v }))}
              placeholder="Ex: 12345678"
            />
            <Input
              label="Mot de passe (démo)"
              value={form.password}
              onChange={(v) => setForm((p) => ({ ...p, password: v }))}
              type="password"
              placeholder="(optionnel / démo)"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={addAccount}>Ajouter</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
