"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import {
  Mt5Account,
  loadMt5Accounts,
  removeMt5Account,
  upsertMt5Account,
} from "../../../lib/mt5Store";

/* =========================================================
   BROKERS + SERVERS (EDIT HERE)
========================================================= */
const BROKER_PRESETS = [

  // MetaQuotes Ltd.
  {
    broker: "MetaQuotes Ltd.",
    servers: [
      "MetaQuotes-Demo",
    ],
  },

  // BLUEBERRY MARKETS EXEMPLE
  {
    broker: "Blueberry Markets Pty Ltd",
    servers: [
      "BlueberryMarkets-Live",
      "BlueberryMarkets-Live02",
      "BlueberryMarkets-Demo",
      "BlueberryMarkets-Demo02",
    ],
  },
  {
    broker: "Blueberry Markets (V) Ltd",
    servers: ["BlueberryMarketsV-Live3"],
  },
  {
    broker: "Blueberry Markets (SVG) LLC",
    servers: ["BlueberryMarketsSVG-Live"],
  },

  // RAISE GLOBAL
  {
    broker: "Raise Global SA (Pty) Ltd",
    servers: ["RaiseGlobal-Live"],
  },

    // RAISE GLOBAL
  {
    broker: "Raise Global SA (Pty) Limited",
    servers: ["RaiseGlobalSA-Live"],
  },

    // FTMO
  {
    broker: "FTMO Global Markets Ltd",
    servers: ["FTMO-Server", "FTMO-Server2","FTMO-Server3", "FTMO-Server4","FTMO-Server5","FTMO-Demo", "FTMO-Demo2"],
  },

  // Fusion Markets
  {
    broker: "Fusion Markets Pty Ltd",
    servers: ["FusionMarkets-Live", "FusionMarkets-Demo",],
  },

  // Fusion Markets
  {
    broker: "Fusion Markets International Ltd",
    servers: ["FusionMarketInternational-MT5_2",],
  },

    // VT Markets
  {
    broker: "VT Markets Pty Ltd",
    servers: ["VTMarkets-Live", "VTMarkets-Live 2","VTMarkets-Live 3", "VTMarkets-Live 4", "VTMarkets-Live 5", "VTMarkets-Live 6", "VTMarkets-Demo",],
  },
  
    // FundingPips Corp
  {
    broker: "FundingPips Corp",
    servers: ["FundingPips-SIM",],
  },

  // FundingPips Corp (2)
  {
    broker: "FundingPips Corp (2)",
    servers: ["FundingPips2-SIM",],
  },

    // PuPrime Ltd
  {
    broker: "Pu Prime Ltd",
    servers: ["PuPrime-Live","PuPrime-Live2", "PuPrime-Live 4","PuPrime-Live 5", "PuPrime-Live 6","PuPrime-Demo",],
  },

  // PuPrime Trading Pty Ltd
  {
    broker: "PuPrime Trading Pty Ltd",
    servers: ["PuPrimeTrading-Live",],
  },

    // Notesco Limited
  {
    broker: "Notesco Limited",
    servers: ["IronFX-Real1", "IronFX-Demo1",],
  },

  // RoboForex Ltd
  {
    broker: "RoboForex Ltd",
    servers: ["RoboForex-Pro", "RoboForex-ECN"],
  },

  // Vantage Fx Pty Ltd.
  {
    broker: "Vantage Fx Pty Ltd.",
    servers: ["VantageFX-Live","VantageFX-Live 3" , "VantageFX-Live 4" , "VantageFX-Live 5" , "VantageFX-Live 6" , "VantageFX-Live 7" , "VantageFX-Live 8" , "VantageFX-Live 9" , "VantageFX-Live 10" , "VantageFX-Live 11" , "VantageFX-Live 12" , "VantageFX-Live 14" , "VantageFX-Live 15" , "VantageFX-Live 17" , "VantageFX-Live 19" , "VantageFX-Live 21" ,"VantageFX-Demo"],
  },

  // Eightcap Pty Ltd
  {
    broker: "Eightcap Pty Ltd",
    servers: ["Eightcap-Live","Eightcap-Demo",],
  },

  // Eightcap Global Limited
  {
    broker: "Eightcap Global Limited",
    servers: ["EightcapGlobal-Live",],
  },

  // Eightcap EU Ltd
  {
    broker: "Eightcap EU Ltd",
    servers: ["EightcapEU-Live",],
  },

  // IC Markets (EU) Ltd
  {
    broker: "IC Markets (EU) Ltd",
    servers: ["ICMarketsEU-MT5-5", "ICMarketsEU-Demo",],
  },

  // Ic Markets Ltd
  {
    broker: "Ic Markets Ltd",
    servers: ["ICMarketsInternational-Demo" ,"ICMarketsInternational-MT5","ICMarketsInternational-MT5-4","ICMarketsInternational-MT5-2"],
  },

  // IC Markets Group Ltd
  {
    broker: "IC Markets Group Ltd",
    servers: ["ICMarketsGRP-MT5", "ICMarketsGRP-Demo"],
  },

  // IC Markets (KE) limited
  {
    broker: "IC Markets (KE) limited",
    servers: ["ICMarketsKE-MT5-7", "ICMarketsKE-Demo"],
  },

  // International Capital Markets Pty. Ltd.
  {
    broker: "International Capital Markets Pty. Ltd.",
    servers: ["ICMarkets-MT5","ICMarkets-MT5-2" , "ICMarkets-MT5-4", "ICMarkets-Demo"],
  },

  // OANDA Corporation
  {
    broker: "OANDA Corporation",
    servers: ["OANDA-Live-1", "OANDA-Demo-1" ,"OANDA-Prop Trader" , "Oanda-Japan MT5 Live" , "Oanda-Japan MT5 Demo"],
  },

  // Oanda Europe Limited
  {
    broker: "Oanda Europe Limited",
    servers: ["OANDA_UK-Demo-1", "OANDA_UK-Live-1"],
  },

  // Oanda Asia Pacific Pte Ltd
  {
    broker: "Oanda Asia Pacific Pte Ltd",
    servers: ["OANDA_SG-Demo-1", "OANDA_SG-Live-1"],
  },

  // OANDA (Canada) Corporation ULC
  {
    broker: "OANDA (Canada) Corporation ULC",
    servers: ["OANDA_Canada-Demo-1"],
  },  

  // OANDA Global Markets Limited
  {
    broker: "OANDA Global Markets Limited",
    servers: ["OANDA_Global-Demo-1", "OANDA_Global-Live-1"],
  },

  // OANDA TMS Brokers S.A.
  {
    broker: "OANDA TMS Brokers S.A.",
    servers: ["OANDATMS-MT5"],
  },
  
  // Ava Trade Markets Ltd.
  {
    broker: "Ava Trade Markets Ltd.",
    servers: ["AvaTradeMarkets-Demo 1-MT5", "AvaTradeMarkets-Real 1-MT5"],
  },
  // --- ADD NEW BROKERS/SERVERS ABOVE THIS LINE ---

] as const;

type BrokerName = (typeof BROKER_PRESETS)[number]["broker"];

function Input({
  label,
  value,
  onChange,
  placeholder,
  type,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-sm text-white/70 mb-2">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        type={type ?? "text"}
        readOnly={readOnly}
        className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                   text-white placeholder:text-white/30 outline-none
                   focus:border-[color:var(--gold-border)]
                   focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm text-white/70 mb-2">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                   text-white outline-none
                   focus:border-[color:var(--gold-border)]
                   focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
      >
        {children}
      </select>
    </label>
  );
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default function ComptesPage() {
  const [accounts, setAccounts] = useState<Mt5Account[]>(() => loadMt5Accounts());
  const [open, setOpen] = useState(false);

  const defaultBroker = BROKER_PRESETS[0]?.broker ?? ("" as BrokerName);
  const defaultServer = BROKER_PRESETS[0]?.servers?.[0] ?? "";

  const [form, setForm] = useState({
    label: "",
    broker: defaultBroker as BrokerName,
    server: defaultServer,
    serverOther: "",
    login: "",
    password: "",
  });

  const selectedPreset = useMemo(() => {
    return BROKER_PRESETS.find((b) => b.broker === form.broker) ?? BROKER_PRESETS[0];
  }, [form.broker]);

  const serverOptions = selectedPreset?.servers ?? [];

  function onBrokerChange(b: BrokerName) {
    const preset = BROKER_PRESETS.find((x) => x.broker === b) ?? BROKER_PRESETS[0];
    setForm((p) => ({
      ...p,
      broker: b,
      server: preset.servers[0] ?? "",
      serverOther: "",
    }));
  }

  const totals = useMemo(() => {
    const connected = accounts.filter((a) => a.status === "CONNECTED").length;
    const totalBalance = accounts.reduce((s, a) => s + (a.snapshot?.balance ?? 0), 0);
    const totalProfit = accounts.reduce((s, a) => s + (a.snapshot?.profit ?? 0), 0);
    return { connected, totalBalance, totalProfit };
  }, [accounts]);

  function resetForm() {
    const b = BROKER_PRESETS[0]?.broker ?? ("" as BrokerName);
    const s = BROKER_PRESETS[0]?.servers?.[0] ?? "";
    setForm({
      label: "",
      broker: b as BrokerName,
      server: s,
      serverOther: "",
      login: "",
      password: "",
    });
  }

  function addAccount() {
    const label = form.label.trim() || `Compte ${form.login}`;
    const broker = form.broker;
    const server = form.server === "__OTHER__" ? form.serverOther.trim() : form.server.trim();
    const login = form.login.trim();

    if (!broker || !server || !login) return;

    const acc: Mt5Account = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label,
      broker,
      server,
      login,
      password: form.password, // demo only
      status: "DISCONNECTED",
    };

    const next = upsertMt5Account(acc);
    setAccounts(next);
    setOpen(false);
    resetForm();
  }

  async function testConnection(acc: Mt5Account) {
    const updated: Mt5Account = { ...acc, status: "DISCONNECTED", lastError: undefined };

    try {
      const r = await fetch("/api/mt5/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: acc.broker,
          server: acc.server,
          login: acc.login,
          password: acc.password ?? "",
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Erreur connexion");

      updated.status = "CONNECTED";
      updated.snapshot = j.snapshot;
    } catch (e: any) {
      updated.status = "ERROR";
      updated.lastError = String(e?.message ?? e);
    }

    const next = upsertMt5Account(updated);
    setAccounts(next);
  }

  function remove(id: string) {
    const next = removeMt5Account(id);
    setAccounts(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Comptes <span className="text-[color:var(--gold)]">MT5</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Ajoute tes comptes MT5. Serveurs proposés selon le broker.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            + Ajouter un compte MT5
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Comptes connectés</div>
          <div className="mt-2 text-xl font-bold text-[color:var(--gold)]">{totals.connected}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Balance totale</div>
          <div className="mt-2 text-xl font-bold text-white">{fmt(totals.totalBalance)}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Profit total</div>
          <div
            className={[
              "mt-2 text-xl font-bold",
              totals.totalProfit >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]",
            ].join(" ")}
          >
            {fmt(totals.totalProfit)}
          </div>
        </CardSubCard>
      </div>

      {/* Accounts list */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Mes comptes</div>
            <div className="text-xs text-[color:var(--muted)]">* Test connexion (bridge local)</div>
          </div>

          <div className="mt-4 space-y-3">
            {accounts.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">
                Aucun compte MT5. Clique sur “Ajouter un compte MT5”.
              </div>
            ) : (
              accounts.map((a) => (
                <CardSubCard
                  key={a.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="min-w-[260px]">
                    <div className="font-semibold text-white">
                      {a.label}{" "}
                      <span className="text-xs text-[color:var(--muted)]">• {a.broker}</span>
                    </div>
                    <div className="text-xs text-[color:var(--muted)] mt-1">
                      Login: {a.login} • Server: {a.server}
                    </div>

                    {a.status === "ERROR" && a.lastError ? (
                      <div className="mt-2 text-xs text-[color:var(--danger)]">{a.lastError}</div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs min-w-[260px]">
                    <div className="text-right">
                      <div className="text-[color:var(--muted)]">Balance</div>
                      <div className="text-white/90">{a.snapshot ? fmt(a.snapshot.balance) : "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[color:var(--muted)]">Equity</div>
                      <div className="text-white/90">{a.snapshot ? fmt(a.snapshot.equity) : "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[color:var(--muted)]">Profit</div>
                      <div
                        className={(a.snapshot?.profit ?? 0) >= 0
                          ? "text-[color:var(--success)] font-semibold"
                          : "text-[color:var(--danger)] font-semibold"}
                      >
                        {a.snapshot ? fmt(a.snapshot.profit) : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={[
                        "text-[10px] px-2 py-0.5 rounded-full border",
                        a.status === "CONNECTED"
                          ? "border-[color:var(--success)]/25 bg-[color:var(--success)]/10 text-[color:var(--success)]"
                          : a.status === "ERROR"
                          ? "border-[color:var(--danger)]/25 bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
                          : "border-white/10 bg-white/5 text-[color:var(--muted)]",
                      ].join(" ")}
                    >
                      {a.status}
                    </span>

                    <Button variant="secondary" onClick={() => testConnection(a)}>
                      Tester
                    </Button>

                    <Button variant="danger" onClick={() => remove(a.id)}>
                      Supprimer
                    </Button>
                  </div>
                </CardSubCard>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {/* Add account modal */}
      <Modal
        open={open}
        title="Ajouter un compte MT5"
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={addAccount}>Ajouter</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nom du compte"
            value={form.label}
            onChange={(v) => setForm((p) => ({ ...p, label: v }))}
            placeholder="Ex: Master MT5"
          />

          <Select
            label="Broker"
            value={form.broker}
            onChange={(v) => onBrokerChange(v as BrokerName)}
          >
            {BROKER_PRESETS.map((b) => (
              <option key={b.broker} value={b.broker}>
                {b.broker}
              </option>
            ))}
          </Select>

          <Select
            label="Serveur MT5 (selon broker)"
            value={form.server}
            onChange={(v) => setForm((p) => ({ ...p, server: v }))}
          >
            {serverOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__OTHER__">Autre…</option>
          </Select>

          {form.server === "__OTHER__" ? (
            <Input
              label="Serveur (autre)"
              value={form.serverOther}
              onChange={(v) => setForm((p) => ({ ...p, serverOther: v }))}
              placeholder="Ex: BlueberryMarkets-Live05"
            />
          ) : null}

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
            placeholder="(démo)"
            type="password"
          />

          <div className="text-xs text-[color:var(--muted)]">
            * En prod : le mot de passe ne sera pas stocké ici. Il sera géré par l’agent MT5 sur VPS.
          </div>
        </div>
      </Modal>
    </div>
  );
}
