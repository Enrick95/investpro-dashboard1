"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Gauge,
  Layers3,
  Link2,
  Loader2,
  LockKeyhole,
  Pause,
  Plus,
  Send,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Unplug,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SthStatus } from "@/lib/sth/client";

type Receiver = {
  id: string;
  alias: string;
  platform: "MT4" | "MT5";
  login: string;
  server: string;
  status: "connected" | "paused" | "error";
  is_primary: boolean;
  config: Record<string, unknown> | null;
  last_connected_at: string | null;
  created_at: string;
};

type SelectedMaster = Record<string, { on: boolean; lots: string }>;
type RiskMode = "fixed" | "mirror" | "balance" | "equity" | "percent";
type LooseAccount = Record<string, unknown>;

type ActivationRequest = {
  id: string;
  alias: string;
  broker: string;
  platform: "MT4" | "MT5";
  login: string;
  server: string;
  status: "pending" | "processing" | "activated" | "rejected";
  admin_note: string;
  provider_user_id: string;
  created_at: string;
  activated_at: string | null;
};

type BrokerServerPreset = {
  broker: string;
  servers: string[];
};

const BROKER_SERVER_PRESETS: Record<"MT4" | "MT5", BrokerServerPreset[]> = {
  MT4: [
    {
      broker: "Axi",
      servers: [
        "Axi-US02-Live",
        "Axi-US03-Demo",
        "Axi-US03-Live",
        "Axi-US05-Live",
        "Axi-US06-Live",
        "Axi-US07-Live",
        "Axi-US09-Live",
        "Axi-US10-Live",
        "Axi-US12-Live",
        "Axi-US15-Live",
        "Axi-US16-Live",
        "Axi-US17-Live",
        "Axi-US18-Live",
        "Axi-US888-Demo",
        "Axi-US888-Live",
      ],
    },
    {
      broker: "FTMO",
      servers: ["FTMO-Demo2", "FTMO-Server", "FTMO-Server2", "FTMO-Server3"],
    },
    {
      broker: "Fusion Markets",
      servers: ["FusionMarkets-Demo", "FusionMarkets-Live", "FusionMarkets-Live 3"],
    },
    {
      broker: "PU Prime",
      servers: ["PUPrime-Live 5", "PUPrime-Live5", "PUPrime-Demo"],
    },
  ],
  MT5: [
    {
      broker: "Axi",
      servers: [
        "Axi-US50-Demo",
        "Axi-US50-Live",
        "Axi-US51-Live",
        "Axi-US52-Live",
        "Axi-US53-Live",
        "Axi-US54-Live",
        "Axi-US88-Live",
      ],
    },
    {
      broker: "FTMO",
      servers: [
        "FTMO-Demo",
        "FTMO-Demo2",
        "FTMO-Server",
        "FTMO-Server2",
        "FTMO-Server3",
        "FTMO-Server4",
        "FTMO-Server5",
      ],
    },
    {
      broker: "Fusion Markets",
      servers: [
        "FusionMarkets-Demo",
        "FusionMarkets-Live",
        "FusionMarketsAU-Demo",
        "FusionMarketsAU-Live",
        "FusionMarketsInternational-MT5_2",
        "MegaFusionGroupPty-Trade",
      ],
    },
    {
      broker: "PU Prime",
      servers: [
        "PuPrime-Live",
        "PuPrime-Live2",
        "PuPrime-Live 4",
        "PuPrime-Live 5",
        "PuPrime-Live 6",
        "PuPrime-Live7",
        "PuPrime-Demo",
        "PuPrimeTrading-Live",
      ],
    },
    {
      broker: "Blueberry Markets",
      servers: [
        "BlueberryMarkets-Live",
        "BlueberryMarkets-Live02",
        "BlueberryMarkets-Demo",
        "BlueberryMarkets-Demo02",
        "BlueberryMarketsV-Live3",
        "BlueberryMarketsSVG-Live",
      ],
    },
    {
      broker: "Raise Global",
      servers: ["RaiseGlobal-Live", "RaiseGlobalSA-LIVE"],
    },
    {
      broker: "VT Markets",
      servers: [
        "VTMarkets-Live",
        "VTMarkets-Live 2",
        "VTMarkets-Live 3",
        "VTMarkets-Live 4",
        "VTMarkets-Live 5",
        "VTMarkets-Live 6",
        "VTMarkets-Demo",
      ],
    },
    {
      broker: "FundingPips",
      servers: ["FundingPips-SIM", "FundingPips2-SIM"],
    },
    {
      broker: "IronFX / Notesco",
      servers: ["IronFX-Real1", "IronFX-Demo1"],
    },
    {
      broker: "RoboForex",
      servers: ["RoboForex-Pro", "RoboForex-ECN"],
    },
    {
      broker: "Vantage",
      servers: [
        "VantageFX-Live",
        "VantageFX-Live 3",
        "VantageFX-Live 4",
        "VantageFX-Live 5",
        "VantageFX-Live 6",
        "VantageFX-Live 7",
        "VantageFX-Live 8",
        "VantageFX-Live 9",
        "VantageFX-Live 10",
        "VantageFX-Live 11",
        "VantageFX-Live 12",
        "VantageFX-Live 14",
        "VantageFX-Live 15",
        "VantageFX-Live 17",
        "VantageFX-Live 19",
        "VantageFX-Live 21",
        "VantageFX-Demo",
      ],
    },
    {
      broker: "Eightcap",
      servers: [
        "Eightcap-Live",
        "Eightcap-Demo",
        "EightcapGlobal-Live",
        "EightcapEU-Live",
      ],
    },
    {
      broker: "IC Markets",
      servers: [
        "ICMarketsEU-MT5-5",
        "ICMarketsEU-Demo",
        "ICMarketsInternational-Demo",
        "ICMarketsInternational-MT5",
        "ICMarketsInternational-MT5-4",
        "ICMarketsInternational-MT5-2",
        "ICMarketsGRP-MT5",
        "ICMarketsGRP-Demo",
        "ICMarketsKE-MT5-7",
        "ICMarketsKE-Demo",
        "ICMarkets-MT5",
        "ICMarkets-MT5-2",
        "ICMarkets-MT5-4",
        "ICMarkets-Demo",
      ],
    },
    {
      broker: "OANDA",
      servers: [
        "OANDA-Live-1",
        "OANDA-Demo-1",
        "OANDA-Prop Trader",
        "Oanda-Japan MT5 Live",
        "Oanda-Japan MT5 Demo",
        "OANDA_UK-Demo-1",
        "OANDA_UK-Live-1",
        "OANDA_SG-Demo-1",
        "OANDA_SG-Live-1",
        "OANDA_Canada-Demo-1",
        "OANDA_Global-Demo-1",
        "OANDA_Global-Live-1",
        "OANDATMS-MT5",
      ],
    },
    {
      broker: "AvaTrade",
      servers: ["AvaTradeMarkets-Demo 1-MT5", "AvaTradeMarkets-Real 1-MT5"],
    },
    {
      broker: "MetaQuotes",
      servers: ["MetaQuotes-Demo"],
    },
  ],
};

function brokerForServer(platform: "MT4" | "MT5", server: string) {
  return (
    BROKER_SERVER_PRESETS[platform].find((group) =>
      group.servers.includes(server)
    )?.broker || ""
  );
}

function cn(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function money(v: unknown, c = "USD") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function accountNumber(row: LooseAccount) {
  return String(row.login ?? row.account_number ?? row.external_account_id ?? row.external_id ?? row.name ?? "");
}

function stat(row: LooseAccount | undefined, keys: string[]) {
  if (!row) return null;
  for (const key of keys) if (row[key] != null) return row[key];
  return null;
}

export default function CopieurPage() {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("Chargement du Copier Engine…");
  const [checked, setChecked] = useState("");
  const [maxLots, setMaxLots] = useState(0.1);

  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [accounts, setAccounts] = useState<LooseAccount[]>([]);
  const [legacyConnected, setLegacyConnected] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<SthStatus | null>(null);
  const [selectedMasters, setSelectedMasters] = useState<SelectedMaster>({});

  const [addOpen, setAddOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [serverChoice, setServerChoice] = useState("");
  const [customServer, setCustomServer] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);

  const [riskMode, setRiskMode] = useState<RiskMode>("fixed");
  const [masterConsent, setMasterConsent] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectConsent, setDisconnectConsent] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [activationRequests, setActivationRequests] = useState<ActivationRequest[]>([]);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestServerChoice, setRequestServerChoice] = useState("");
  const [requestForm, setRequestForm] = useState({
    alias: "",
    broker: "",
    platform: "MT5" as "MT4" | "MT5",
    login: "",
    server: "",
    password: "",
    note: "",
  });

  const virtualReceivers = useMemo(() => {
    const rows: Array<Receiver & { legacy?: boolean }> = receivers.map((r) => ({ ...r }));
    if (legacyConnected) {
      rows.unshift({
        id: "legacy",
        alias: "Compte connecté existant",
        platform: "MT5",
        login: "Historique",
        server: "Social Trade Hub",
        status: "connected",
        is_primary: true,
        config: {},
        last_connected_at: null,
        created_at: "",
        legacy: true,
      });
    }
    return rows;
  }, [receivers, legacyConnected]);

  async function authHeaders(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function loadActivationRequests() {
    const response = await fetch("/api/copier/request", {
      headers: await authHeaders(),
      cache: "no-store",
    });

    if (!response.ok) return;

    const data = await response.json();
    setActivationRequests((data.requests || []) as ActivationRequest[]);
  }

  async function submitActivationRequest() {
    const form = requestForm;
    const effectiveServer =
      requestServerChoice === "__OTHER__"
        ? form.server.trim()
        : requestServerChoice.trim();
    const effectiveBroker =
      requestServerChoice === "__OTHER__"
        ? form.broker.trim()
        : brokerForServer(form.platform, effectiveServer);

    if (
      !form.alias.trim() ||
      !/^\d{1,20}$/.test(form.login.trim()) ||
      !effectiveServer ||
      !form.password
    ) {
      setError(true);
      setMessage("Complète les informations du compte à activer.");
      return;
    }

    setRequestBusy(true);
    setError(false);

    try {
      const response = await fetch("/api/copier/request", {
        method: "POST",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          broker: effectiveBroker,
          server: effectiveServer,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossible d’envoyer la demande.");
      }

      setRequestForm({
        alias: "",
        broker: "",
        platform: "MT5",
        login: "",
        server: "",
        password: "",
        note: "",
      });
      setRequestServerChoice("");
      setRequestOpen(false);
      setMessage(
        data.message ||
          "Demande envoyée. Elle apparaîtra ici dès que l’équipe l’aura activée."
      );
      await loadActivationRequests();
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error ? cause.message : "Demande impossible."
      );
    } finally {
      setRequestBusy(false);
    }
  }

  async function loadRows() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [r1, r2] = await Promise.all([
      supabase.from("copier_receivers").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
      supabase.from("trading_accounts").select("*").eq("user_id", user.id),
    ]);
    if (!r1.error) setReceivers((r1.data || []) as Receiver[]);
    if (!r2.error) setAccounts((r2.data || []) as LooseAccount[]);
  }

  function applyStatus(status: SthStatus) {
    setSelectedStatus(status);
    setSelectedMasters(Object.fromEntries(status.masterAccountsList.map((m) => [m.id, { on: m.userIsSubscribed, lots: String(m.lots) }])));
    setMasterConsent(false);
    setChecked(new Date().toLocaleString("fr-FR"));
  }

  async function fetchStatus(receiverId = "legacy") {
    const response = await fetch(`/api/sth?receiverId=${encodeURIComponent(receiverId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Connexion indisponible.");
    setEnabled(Boolean(data.enabled));
    if (data.maxLots) setMaxLots(Number(data.maxLots));
    if (data.status) applyStatus(data.status);
    return data.status as SthStatus | undefined;
  }

  async function refresh() {
    setBusy(true);
    setError(false);
    try {
      await Promise.all([loadRows(), loadActivationRequests()]);
      const legacy = await fetch("/api/sth?receiverId=legacy", { cache: "no-store" });
      const legacyData = await legacy.json();
      if (legacy.ok) {
        setEnabled(Boolean(legacyData.enabled));
        setLegacyConnected(Boolean(legacyData.status?.isTradingAccountConnected));
        if (legacyData.maxLots) setMaxLots(Number(legacyData.maxLots));
      }

      let target = selectedReceiverId;
      if (!target) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from("copier_receivers").select("id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
          target = data?.id || (legacyData.status?.isTradingAccountConnected ? "legacy" : null);
        }
      }
      if (target) {
        setSelectedReceiverId(target);
        await fetchStatus(target);
      } else {
        setSelectedStatus(null);
        setSelectedMasters({});
      }
      setMessage("Copier Engine actualisé.");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Connexion indisponible.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function selectReceiver(id: string) {
    setSelectedReceiverId(id);
    setBusy(true);
    setError(false);
    try {
      await fetchStatus(id);
      setMessage("Compte receveur chargé.");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Impossible de charger ce compte.");
    } finally {
      setBusy(false);
    }
  }

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/sth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Action refusée.");
    return data;
  }

  async function addReceiver() {
    const effectiveServer =
      serverChoice === "__OTHER__" ? customServer.trim() : serverChoice.trim();

    if (!alias.trim() || !/^\d{1,15}$/.test(login) || !effectiveServer || !password || !consent) {
      setError(true);
      setMessage("Complète les informations du compte et confirme l’autorisation.");
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const data = await post({ action: "connect", alias: alias.trim(), platform, login, server: effectiveServer, password, consent: true });
      setPassword("");
      setConsent(false);
      setAddOpen(false);
      setAlias("");
      setLogin("");
      setServer("");
      setServerChoice("");
      setCustomServer("");
      await loadRows();
      if (data.receiverId) {
        setSelectedReceiverId(data.receiverId);
        if (data.status) applyStatus(data.status);
      }
      setMessage("Nouveau compte receveur connecté.");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  function toggleMaster(id: string) {
    setSelectedMasters((cur) => ({ ...cur, [id]: { ...(cur[id] || { lots: "0.01" }), on: !cur[id]?.on } }));
    setMasterConsent(false);
  }

  function changeLots(id: string, lots: string) {
    setSelectedMasters((cur) => ({ ...cur, [id]: { ...(cur[id] || { on: false }), lots } }));
    setMasterConsent(false);
  }

  async function saveMasters() {
    if (!selectedReceiverId) return;
    setBusy(true);
    setError(false);
    try {
      const masters = (Object.entries(selectedMasters) as Array<[string, { on: boolean; lots: string }]>).filter(([, v]) => v.on).map(([id, v]) => ({ id, lots: Number(v.lots) }));
      const data = await post({ action: "masters", receiverId: selectedReceiverId, consent: masterConsent, masters });
      if (data.status) applyStatus(data.status);
      setMessage("Configuration enregistrée.");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!selectedReceiverId) return;
    setBusy(true);
    setError(false);
    try {
      const data = await post({ action: "disconnect", receiverId: selectedReceiverId, consent: disconnectConsent });
      if (data.status) applyStatus(data.status);
      setDisconnectConsent(false);
      await loadRows();
      setMessage("Compte receveur déconnecté.");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Déconnexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  const activeMasters = selectedStatus?.masterAccountsList.filter((m) => selectedMasters[m.id]?.on) || [];
  const totalLots = activeMasters.reduce((sum, m) => sum + Number(selectedMasters[m.id]?.lots || 0), 0);
  const selectedReceiver = virtualReceivers.find((r) => r.id === selectedReceiverId) || null;

  function statsFor(receiver: Receiver) {
    const row = accounts.find((a) => {
      const p = String(a.platform || "").toUpperCase();
      return accountNumber(a).includes(receiver.login) && (!p || p === receiver.platform);
    });
    const currency = String(row?.currency || "USD");
    return {
      balance: stat(row, ["current_balance", "balance"]),
      equity: stat(row, ["equity", "current_equity", "current_balance", "balance"]),
      pnl: stat(row, ["daily_pnl", "pnl_today", "today_pnl"]),
      open: stat(row, ["open_positions", "positions_open", "open_trades"]),
      currency,
    };
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
        <div className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[color:var(--gold)] opacity-[0.08] blur-[110px]" />
        <div className="relative grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1.25fr_.75fr] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[color:var(--gold)]">
              <Copy size={12} /> Copier Engine · Multi-receveurs
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-[40px]">
              Un trade. <span className="text-[color:var(--gold)]">Plusieurs comptes.</span><br />Une seule interface de contrôle.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/45">
              Connecte plusieurs comptes receveurs, surveille leurs performances et règle la copie seulement après la connexion. Pendant la bêta, les comptes sont illimités.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge icon={<ShieldCheck size={12} />} label="Connexion sécurisée" />
              <Badge icon={<Layers3 size={12} />} label="Multi-comptes" />
              <Badge icon={<SlidersHorizontal size={12} />} label="Risque par receveur" />
              <Badge icon={<Sparkles size={12} />} label="Illimité pendant la bêta" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Moteur" value={selectedStatus?.isTradingAccountConnected ? "En ligne" : "À connecter"} green={Boolean(selectedStatus?.isTradingAccountConnected)} />
            <Metric label="Receveurs" value={String(virtualReceivers.length)} />
            <Metric label="Masters actifs" value={String(activeMasters.length)} />
            <Metric label="Accès bêta" value="Illimité" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                <Activity size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">État du Copier Engine</h2>
                <p className="mt-1 text-[10px] leading-5 text-white/40">Chaque nouveau receveur possède son propre identifiant côté moteur de copie.</p>
                <div className="mt-1 text-[8px] text-white/25">Dernière vérification : {checked || "—"}</div>
              </div>
            </div>
            <button disabled={busy} onClick={() => void refresh()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Actualiser
            </button>
          </div>
          <div className={cn("mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[10px] leading-5", error ? "border-red-500/20 bg-red-500/[0.05] text-red-300" : "border-white/[0.06] bg-black/20 text-white/40")}>
            {error ? <AlertTriangle size={14} /> : <ShieldCheck size={14} className="text-[color:var(--gold)]" />} {message}
          </div>
        </Panel>
        <Panel className="xl:col-span-4">
          <div className="text-xs font-semibold text-white">Offre actuelle</div>
          <div className="mt-4 space-y-2">
            <InfoRow label="Receveurs" value="Illimités · Bêta" />
            <InfoRow label="Mode opérationnel" value="Lots fixes" />
            <InfoRow label="Monétisation" value="Prête pour plus tard" />
          </div>
        </Panel>
      </section>

      <Panel>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Heading eyebrow="RECEVEURS" title="Mes comptes de copie" text="Ajoute autant de comptes que nécessaire pendant la bêta. Les réglages viennent ensuite." icon={<WalletCards size={17} />} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => setRequestOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-5 text-xs font-semibold text-[color:var(--gold)]">
              <Send size={14} /> Ajouter mon compte au copieur
            </button>
            <button onClick={() => setAddOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black">
              <Plus size={15} /> Ajouter un compte receveur
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[20px] border border-white/[0.07]">
          <div className="hidden grid-cols-[1.25fr_.65fr_1fr_.8fr_.8fr_.7fr_.65fr_.8fr] gap-3 border-b border-white/[0.06] bg-black/25 px-4 py-3 text-[8px] font-bold uppercase tracking-[0.08em] text-white/25 lg:grid">
            <div>Compte</div><div>Plateforme</div><div>Serveur</div><div>Solde</div><div>Equity</div><div>P&L jour</div><div>Ouverts</div><div>État</div>
          </div>
          {virtualReceivers.length === 0 ? (
            <div className="p-8 text-center">
              <WalletCards size={26} className="mx-auto text-white/15" />
              <div className="mt-3 text-sm font-semibold text-white">Aucun receveur</div>
              <p className="mt-2 text-[10px] text-white/35">Ajoute ton premier compte pour commencer.</p>
            </div>
          ) : virtualReceivers.map((receiver) => {
            const s = receiver.id === "legacy" ? { balance: null, equity: null, pnl: null, open: null, currency: "USD" } : statsFor(receiver);
            return (
              <button key={receiver.id} onClick={() => void selectReceiver(receiver.id)} className={cn("grid w-full grid-cols-1 gap-3 border-b border-white/[0.05] px-4 py-4 text-left last:border-0 lg:grid-cols-[1.25fr_.65fr_1fr_.8fr_.8fr_.7fr_.65fr_.8fr] lg:items-center", selectedReceiverId === receiver.id ? "bg-[color:var(--gold-soft)]" : "bg-black/10 hover:bg-white/[0.02]")}>
                <div><div className="text-sm font-semibold text-white">{receiver.alias}</div><div className="mt-1 text-[9px] text-white/30">{receiver.login}</div></div>
                <div className="text-[10px] font-semibold text-[color:var(--gold)]">{receiver.platform}</div>
                <div className="truncate text-[10px] text-white/45">{receiver.server}</div>
                <Cell label="Solde" value={money(s.balance, s.currency)} />
                <Cell label="Equity" value={money(s.equity, s.currency)} />
                <Cell label="P&L jour" value={s.pnl == null ? "—" : money(s.pnl, s.currency)} positive={Number(s.pnl) > 0} negative={Number(s.pnl) < 0} />
                <Cell label="Ouverts" value={s.open == null ? "—" : String(s.open)} />
                <div className="flex items-center justify-between gap-2"><State active={receiver.status === "connected"} label={receiver.status === "connected" ? "Connecté" : receiver.status} /><Settings2 size={14} className="text-white/25" /></div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-[8px] leading-4 text-white/25">Solde, equity et P&L sont repris des comptes MetaTrader déjà synchronisés dans InvestPro. Si aucune donnée correspondante n’existe, “—” s’affiche.</div>

        {activationRequests.length > 0 ? (
          <div className="mt-5 rounded-[18px] border border-white/[0.06] bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <Send size={14} className="text-[color:var(--gold)]" />
              <div className="text-[10px] font-semibold text-white">
                Mes demandes d’activation
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {activationRequests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-[10px] font-semibold text-white">
                      {request.alias}
                    </div>
                    <div className="mt-1 text-[8px] text-white/30">
                      {request.platform} · {request.login} · {request.server}
                    </div>
                  </div>
                  <RequestStatus status={request.status} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      {selectedReceiver ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Panel className="xl:col-span-8">
            <Heading eyebrow="CONFIGURATION" title={selectedReceiver.alias} text={`${selectedReceiver.platform} · ${selectedReceiver.login} · ${selectedReceiver.server}`} icon={<SlidersHorizontal size={17} />} />
            <div className="mt-5 space-y-3">
              {(selectedStatus?.masterAccountsList || []).map((master, index) => {
                const current = selectedMasters[master.id] || { on: false, lots: "0.01" };
                return (
                  <div key={master.id} className={cn("rounded-[18px] border p-4", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.07] bg-black/20")}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <button onClick={() => toggleMaster(master.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-black/20 text-[color:var(--gold)]">{current.on ? <Check size={17} /> : <Copy size={17} />}</div>
                        <div><div className="text-sm font-semibold text-white">{master.name}</div><div className="mt-1 text-[8px] text-white/30">MASTER {String(index + 1).padStart(2, "0")} · {current.on ? "Actif" : "Pause"}</div></div>
                      </button>
                      <div className="flex flex-wrap items-end gap-3">
                        <Field label="Mode"><div className="flex h-10 min-w-[130px] items-center rounded-xl border border-white/[0.07] bg-black/25 px-3 text-[10px] font-semibold text-[color:var(--gold)]">Lots fixes</div></Field>
                        <Field label="Lots"><input type="number" min="0.001" max={maxLots} step="any" value={current.lots} disabled={!current.on} onChange={(e) => changeLots(master.id, e.target.value)} className="ip-field w-[110px] disabled:opacity-35" /></Field>
                        <button onClick={() => toggleMaster(master.id)} className={cn("mb-[1px] inline-flex h-10 min-w-[90px] items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-semibold", current.on ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400" : "border-white/[0.08] text-white/45")}>
                          {current.on ? <CheckCircle2 size={13} /> : <Pause size={13} />} {current.on ? "Actif" : "Pause"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] leading-5 text-white/50"><input type="checkbox" checked={masterConsent} onChange={(e) => setMasterConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d4a934]" /> Je confirme les stratégies et volumes sélectionnés.</label>
            <div className="mt-4 flex items-center justify-between gap-3"><div className="text-[9px] text-white/30">{activeMasters.length} master(s) actif(s) · {totalLots.toFixed(2)} lots</div><button disabled={busy || !masterConsent} onClick={() => void saveMasters()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40"><ShieldCheck size={14} /> Enregistrer</button></div>
          </Panel>

          <div className="space-y-4 xl:col-span-4">
            <Panel>
              <Heading eyebrow="RISK ENGINE" title="Gestion du risque" text="C’est ici que se règle le risque, après la connexion du compte." icon={<Gauge size={17} />} />
              <div className="mt-4 space-y-2">
                <Risk active={riskMode === "fixed"} label="Lots fixes" desc="Opérationnel maintenant" onClick={() => setRiskMode("fixed")} />
                <Risk locked label="Copier les lots de l’envoyeur" desc="Préparé pour le moteur InvestPro" onClick={() => setRiskMode("mirror")} />
                <Risk locked label="Risque par solde" desc="Sizing selon la balance" onClick={() => setRiskMode("balance")} />
                <Risk locked label="Risque par equity" desc="Sizing selon l’equity" onClick={() => setRiskMode("equity")} />
                <Risk locked label="Risque en %" desc="Ex. 0,5 %, 1 %, 2 %" onClick={() => setRiskMode("percent")} />
              </div>
            </Panel>
            <Panel>
              <button onClick={() => setAdvancedOpen((v) => !v)} className="flex w-full items-center justify-between text-left"><div className="flex items-center gap-2"><Settings2 size={16} className="text-[color:var(--gold)]" /><div><div className="text-xs font-semibold text-white">Réglages avancés</div><div className="mt-1 text-[9px] text-white/35">Protection & exécution</div></div></div><ChevronDown size={16} className={cn("text-white/35 transition", advancedOpen && "rotate-180")} /></button>
              {advancedOpen ? <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">{["Copier Stop Loss","Copier Take Profit","Ordres en attente","Slippage maximum","Protection drawdown","Mapping des symboles"].map((x) => <Prepared key={x} label={x} />)}</div> : null}
            </Panel>
          </div>
        </section>
      ) : null}

      <Panel>
        <Heading eyebrow="VUE D’ENSEMBLE" title="Copier Engine" text="Architecture prête pour limiter les comptes selon l’abonnement plus tard." icon={<Sparkles size={17} />} />
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><Summary label="Receveurs" value={String(virtualReceivers.length)} /><Summary label="Masters actifs" value={String(activeMasters.length)} /><Summary label="Mode actif" value="Lots fixes" /><Summary label="Limite actuelle" value="Illimité · Bêta" green /></div>
      </Panel>

      {selectedReceiver && selectedStatus?.isTradingAccountConnected ? (
        <Panel>
          <button onClick={() => setDisconnectOpen((v) => !v)} className="flex w-full items-center justify-between text-left"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/[0.04] text-red-300"><Unplug size={17} /></div><div><div className="text-sm font-semibold text-white">Déconnecter ce receveur</div><div className="mt-1 text-[9px] text-white/35">Vérifie les positions ouvertes sur MetaTrader avant l’action.</div></div></div><ChevronDown size={16} className={cn("text-white/35 transition", disconnectOpen && "rotate-180")} /></button>
          {disconnectOpen ? <div className="mt-5 border-t border-white/[0.06] pt-5"><label className="flex items-start gap-3 text-[10px] text-white/50"><input type="checkbox" checked={disconnectConsent} onChange={(e) => setDisconnectConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d4a934]" />Je confirme la déconnexion de ce receveur.</label><button disabled={busy || !disconnectConsent} onClick={() => void disconnect()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300 disabled:opacity-40"><Unplug size={14} /> Déconnecter</button></div> : null}
        </Panel>
      ) : null}

      {requestOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/[0.06] p-5 md:p-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[8px] font-bold uppercase text-[color:var(--gold)]">
                  <Send size={11} /> Ajout au Copier Engine
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  Ajouter mon compte au copieur
                </h2>
                <p className="mt-1 max-w-xl text-[10px] leading-5 text-white/35">
                  Envoie les informations MT4/MT5 à l’équipe InvestPro. Nous
                  activons le compte dans Social Trade Hub, puis il apparaîtra
                  automatiquement dans ton Copier Engine.
                </p>
              </div>
              <button
                onClick={() => setRequestOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-white/45"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5 md:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nom / alias">
                  <input
                    className="ip-field"
                    value={requestForm.alias}
                    onChange={(e) =>
                      setRequestForm((v) => ({ ...v, alias: e.target.value }))
                    }
                    placeholder="Ex. Compte perso"
                  />
                </Field>
                <Field label="Plateforme">
                  <select
                    className="ip-field"
                    value={requestForm.platform}
                    onChange={(e) => {
                      const next = e.target.value as "MT4" | "MT5";
                      setRequestForm((v) => ({
                        ...v,
                        platform: next,
                        broker: "",
                        server: "",
                      }));
                      setRequestServerChoice("");
                    }}
                  >
                    <option value="MT5">MetaTrader 5</option>
                    <option value="MT4">MetaTrader 4</option>
                  </select>
                </Field>
                <Field label="Broker / serveur">
                  <select
                    className="ip-field"
                    value={requestServerChoice}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRequestServerChoice(value);
                      if (value !== "__OTHER__") {
                        setRequestForm((v) => ({
                          ...v,
                          broker: brokerForServer(v.platform, value),
                          server: value,
                        }));
                      } else {
                        setRequestForm((v) => ({
                          ...v,
                          broker: "",
                          server: "",
                        }));
                      }
                    }}
                  >
                    <option value="">Choisir un serveur</option>
                    {BROKER_SERVER_PRESETS[requestForm.platform].map((group) => (
                      <optgroup key={group.broker} label={group.broker}>
                        {group.servers.map((item) => (
                          <option key={item} value={item}>
                            {item} ({requestForm.platform})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__OTHER__">Mon serveur n’est pas dans la liste</option>
                  </select>
                </Field>
                <Field label="Numéro de compte">
                  <input
                    className="ip-field"
                    inputMode="numeric"
                    value={requestForm.login}
                    onChange={(e) =>
                      setRequestForm((v) => ({ ...v, login: e.target.value }))
                    }
                    placeholder="Ex. 16597794"
                  />
                </Field>
                {requestServerChoice === "__OTHER__" ? (
                  <>
                    <Field label="Broker">
                      <input
                        className="ip-field"
                        value={requestForm.broker}
                        onChange={(e) =>
                          setRequestForm((v) => ({
                            ...v,
                            broker: e.target.value,
                          }))
                        }
                        placeholder="Ex. PU Prime"
                      />
                    </Field>
                    <Field label="Serveur exact">
                      <input
                        className="ip-field"
                        value={requestForm.server}
                        onChange={(e) =>
                          setRequestForm((v) => ({
                            ...v,
                            server: e.target.value,
                          }))
                        }
                        placeholder="Ex. PUPrime-Live7"
                      />
                    </Field>
                  </>
                ) : null}
                <Field label="Mot de passe MetaTrader">
                  <input
                    className="ip-field"
                    type="password"
                    autoComplete="new-password"
                    value={requestForm.password}
                    onChange={(e) =>
                      setRequestForm((v) => ({
                        ...v,
                        password: e.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Message / précision (facultatif)">
                    <textarea
                      value={requestForm.note}
                      onChange={(e) =>
                        setRequestForm((v) => ({ ...v, note: e.target.value }))
                      }
                      placeholder="Ex. Compte principal à utiliser pour COPY INVESTPRO…"
                      className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-black/30 p-3 text-xs text-white outline-none focus:border-[color:var(--gold-border)]"
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
                <div className="flex gap-3">
                  <LockKeyhole
                    size={16}
                    className="mt-0.5 shrink-0 text-[color:var(--gold)]"
                  />
                  <div>
                    <div className="text-[10px] font-semibold text-white">
                      Transmission sécurisée
                    </div>
                    <p className="mt-1 text-[9px] leading-5 text-white/35">
                      Le mot de passe est chiffré côté serveur. Seul
                      l’administrateur InvestPro autorisé peut l’afficher pour
                      effectuer l’activation Social Trade Hub.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  disabled={requestBusy}
                  onClick={() => void submitActivationRequest()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40"
                >
                  {requestBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Envoyer ma demande
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/[0.06] p-5 md:p-6"><div><div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[8px] font-bold uppercase text-[color:var(--gold)]"><Plus size={11} /> Nouveau receveur</div><h2 className="mt-3 text-xl font-semibold text-white">Ajouter un compte</h2><p className="mt-1 text-[10px] leading-5 text-white/35">Connexion uniquement. Aucun lot ni risque à régler ici.</p></div><button onClick={() => setAddOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-white/45"><X size={17} /></button></div>
            <div className="p-5 md:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nom / alias"><input className="ip-field" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ex. Prop 100K" /></Field>
                <Field label="Plateforme">
                  <select
                    className="ip-field"
                    value={platform}
                    onChange={(e) => {
                      setPlatform(e.target.value as "MT4" | "MT5");
                      setServerChoice("");
                      setServer("");
                      setCustomServer("");
                    }}
                  >
                    <option value="MT5">MetaTrader 5</option>
                    <option value="MT4">MetaTrader 4</option>
                  </select>
                </Field>
                <Field label="Numéro de compte"><input className="ip-field" inputMode="numeric" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Ex. 3002159" /></Field>
                <Field label="Broker / serveur">
                  <select
                    className="ip-field"
                    value={serverChoice}
                    onChange={(e) => {
                      const value = e.target.value;
                      setServerChoice(value);
                      setServer(value === "__OTHER__" ? "" : value);
                      if (value !== "__OTHER__") setCustomServer("");
                    }}
                  >
                    <option value="">Choisir un serveur</option>
                    {BROKER_SERVER_PRESETS[platform].map((group) => (
                      <optgroup key={group.broker} label={group.broker}>
                        {group.servers.map((item) => (
                          <option key={item} value={item}>
                            {item} ({platform})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__OTHER__">Mon serveur n’est pas dans la liste</option>
                  </select>
                </Field>
                {serverChoice === "__OTHER__" ? (
                  <div className="md:col-span-2">
                    <Field label="Serveur exact">
                      <input
                        className="ip-field"
                        value={customServer}
                        onChange={(e) => setCustomServer(e.target.value)}
                        placeholder="Ex. MonBroker-Live01"
                      />
                    </Field>
                  </div>
                ) : null}
                <div className="md:col-span-2"><Field label="Mot de passe MetaTrader"><input className="ip-field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field></div>
              </div>
              <div className="mt-4 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4"><div className="flex gap-3"><LockKeyhole size={16} className="mt-0.5 text-[color:var(--gold)]" /><div><div className="text-[10px] font-semibold text-white">Le risque se règle après</div><p className="mt-1 text-[9px] leading-5 text-white/35">Lots, risque %, SL/TP, protections et mapping sont séparés de la connexion.</p></div></div></div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] leading-5 text-white/50"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d4a934]" />J’autorise la transmission des identifiants à Social Trade Hub pour établir la connexion.</label>
              <div className="mt-5 flex items-center justify-between gap-3"><div className="text-[8px] text-white/25">Le mot de passe n’est jamais stocké dans copier_receivers.</div><button disabled={busy || !consent} onClick={() => void addReceiver()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Connecter ce compte</button></div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`.ip-field{height:42px;width:100%;min-width:0;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.28);padding:0 12px;color:white;font-size:12px;outline:none}.ip-field:focus{border-color:var(--gold-border)}.ip-field::placeholder{color:rgba(255,255,255,.22)}.ip-field option{background:#0b0d0b;color:white}`}</style>
    </main>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={cn("rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6", className)}>{children}</section>; }
function Badge({ icon, label }: { icon: React.ReactNode; label: string }) { return <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/25 px-3 py-1.5 text-[9px] text-white/45"><span className="text-[color:var(--gold)]">{icon}</span>{label}</span>; }
function Metric({ label, value, green }: { label: string; value: string; green?: boolean }) { return <div className="rounded-[20px] border border-white/[0.07] bg-black/25 p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-white/25">{label}</div><div className={cn("mt-2 text-lg font-semibold", green ? "text-emerald-400" : "text-white")}>{value}</div></div>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3"><span className="text-[9px] text-white/35">{label}</span><span className="text-[9px] font-semibold text-white/65">{value}</span></div>; }
function Heading({ eyebrow, title, text, icon }: { eyebrow: string; title: string; text: string; icon: React.ReactNode }) { return <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">{icon}</div><div><div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">{eyebrow}</div><h2 className="mt-1 text-base font-semibold text-white">{title}</h2><p className="mt-1 text-[10px] leading-5 text-white/35">{text}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block min-w-0"><span className="mb-1.5 block text-[9px] font-medium text-white/40">{label}</span>{children}</label>; }
function Cell({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) { return <div><div className="text-[7px] uppercase text-white/20 lg:hidden">{label}</div><div className={cn("mt-1 text-[10px] font-medium lg:mt-0", positive ? "text-emerald-400" : negative ? "text-red-400" : "text-white/60")}>{value}</div></div>; }
function State({ active, label }: { active: boolean; label: string }) { return <span className={cn("rounded-full border px-2 py-0.5 text-[7px] font-bold uppercase", active ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400" : "border-white/[0.08] text-white/35")}>{label}</span>; }
function Risk({ active = false, locked = false, label, desc, onClick }: { active?: boolean; locked?: boolean; label: string; desc: string; onClick: () => void }) { return <button disabled={locked} onClick={locked ? undefined : onClick} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left", active ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.06] bg-black/20", locked && "cursor-not-allowed opacity-45")}><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] text-white/30">{locked ? <LockKeyhole size={13} /> : <Target size={13} />}</div><div className="flex-1"><div className="text-[10px] font-semibold text-white">{label}</div><div className="mt-0.5 text-[8px] text-white/30">{desc}</div></div>{active ? <CheckCircle2 size={14} className="text-emerald-400" /> : null}</button>; }
function Prepared({ label }: { label: string }) { return <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="text-[9px] font-semibold text-white/55">{label}</div><span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[7px] font-bold uppercase text-white/25">Prévu</span></div>; }
function RequestStatus({ status }: { status: ActivationRequest["status"] }) {
  const labels = {
    pending: "En attente",
    processing: "Activation en cours",
    activated: "Activé",
    rejected: "Refusé",
  } as const;

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase",
        status === "activated"
          ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
          : status === "rejected"
          ? "border-red-500/20 bg-red-500/[0.05] text-red-300"
          : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
      )}
    >
      {labels[status]}
    </span>
  );
}

function Summary({ label, value, green }: { label: string; value: string; green?: boolean }) { return <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-white/25">{label}</div><div className={cn("mt-2 text-sm font-semibold", green ? "text-emerald-400" : "text-white")}>{value}</div></div>; }
