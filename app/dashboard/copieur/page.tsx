"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
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
  Target,
  Unplug,
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

type RiskSettings = {
  mode: RiskMode;
  fixed_lots: number;
  mirror_multiplier: number;
  balance_multiplier: number;
  equity_multiplier: number;
  risk_percent: number;
  copy_sl: boolean;
  copy_tp: boolean;
  copy_pending: boolean;
  copy_modifications: boolean;
  slippage_pips: number;
  max_lots: number;
  drawdown_enabled: boolean;
  max_drawdown_percent: number;
  symbol_mapping: string;
};

const DEFAULT_RISK_SETTINGS: RiskSettings = {
  mode: "fixed",
  fixed_lots: 0.01,
  mirror_multiplier: 1,
  balance_multiplier: 1,
  equity_multiplier: 1,
  risk_percent: 1,
  copy_sl: true,
  copy_tp: true,
  copy_pending: true,
  copy_modifications: true,
  slippage_pips: 2,
  max_lots: 100,
  drawdown_enabled: false,
  max_drawdown_percent: 5,
  symbol_mapping: "",
};

function riskModeLabel(mode: RiskMode) {
  if (mode === "mirror") return "Copier lots envoyeur";
  if (mode === "balance") return "Risque par solde";
  if (mode === "equity") return "Risque par equity";
  if (mode === "percent") return "Risque en %";
  return "Lots fixes";
}
type LooseAccount = Record<string, unknown>;
type HostedAccountSync = {
  active?: boolean;
  status?: string;
  equity?: number | null;
  investpro_mt_connections?: {
    account_id?: number;
    login?: string;
    server?: string;
    platform?: string;
    currency?: string;
    last_sync?: string | null;
  } | null;
};
type HostedBroker = { id: string; platform: string; server: string; label: string };

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
  provider_master_id: string;
  removal_status: "" | "pending" | "processing" | "completed" | "rejected";
};

type CopierConfigRequest = {
  id: string;
  receiver_id: string;
  status: "pending" | "processing" | "applied" | "rejected";
  admin_note?: string | null;
  updated_at: string;
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
      servers: ["FusionMarkets-Demo", "FusionMarkets-Demo 2", "FusionMarkets-Live", "FusionMarkets-Live 3", "FusionMarkets-Live3"],
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
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function accountNumber(row: LooseAccount) {
  return String(row.login ?? row.account_number ?? row.external_account_id ?? row.external_id ?? row.name ?? "");
}

function isExplicitReceiver(receiver: Receiver, masterRequests: ActivationRequest[]) {
  if (receiver.config?.activation_source === "admin_social_trade_hub") return false;
  const matchingMaster = masterRequests.find((request) =>
    Boolean(request.provider_master_id) &&
    receiver.login === request.login &&
    receiver.platform === request.platform &&
    receiver.server.trim().toLowerCase() === request.server.trim().toLowerCase()
  );
  if (!matchingMaster?.activated_at) return true;
  return Date.parse(receiver.created_at) > Date.parse(matchingMaster.activated_at);
}

function matchingAccount(accounts: LooseAccount[], target: { login: string; platform: string; server: string }, hostedSyncs: HostedAccountSync[] = []) {
  const serverKey = target.server.trim().toLowerCase();
  const synced = hostedSyncs.filter((row) => {
    const connection = row.investpro_mt_connections;
    return row.active !== false && connection &&
      String(connection.login || "").trim() === target.login.trim() &&
      String(connection.platform || "").toUpperCase() === target.platform.toUpperCase() &&
      String(connection.server || "").trim().toLowerCase() === serverKey;
  }).sort((a, b) => Date.parse(b.investpro_mt_connections?.last_sync || "") - Date.parse(a.investpro_mt_connections?.last_sync || ""));
  const syncedConnection = synced[0]?.investpro_mt_connections;
  if (syncedConnection) {
    const account = accounts.find((row) => Number(row.id) === Number(syncedConnection.account_id));
    if (account) {
      const hasSnapshot = Boolean(syncedConnection.last_sync) || synced[0].equity != null;
      return {
        ...account,
        ...(synced[0].status === "error" && !hasSnapshot
          ? { current_balance: null, balance: null, equity: null, current_equity: null }
          : {}),
        currency: account.currency || syncedConnection.currency,
        current_equity: synced[0].status === "error" && !hasSnapshot
          ? null
          : synced[0].equity ?? account.current_equity ?? account.equity,
        sync_last_seen: syncedConnection.last_sync,
      };
    }
    // Hosted MetaSync can already have a fresh equity snapshot before a local
    // account row is linked. Keep that verified snapshot visible without
    // inventing a balance or creating a second credential/connection record.
    if (synced[0].equity != null) return {
      current_balance: null,
      current_equity: synced[0].equity,
      currency: syncedConnection.currency,
      sync_last_seen: syncedConnection.last_sync,
    };
  }

  const candidates = accounts.filter((row) => {
    const platform = String(row.platform || "").toUpperCase();
    return accountNumber(row) === target.login && (!platform || platform === target.platform);
  });
  const serverFor = (row: LooseAccount) => String(row.server ?? row.server_name ?? row.broker_server ?? "").trim().toLowerCase();
  const exactServer = candidates.filter((row) => serverFor(row) === target.server.trim().toLowerCase());
  if (exactServer.length === 1) return exactServer[0];
  return candidates.length === 1 && !serverFor(candidates[0]) ? candidates[0] : undefined;
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
  const [message, setMessage] = useState("Chargement d’InvestPro Copier…");
  const [checked, setChecked] = useState("");
  const [maxLots, setMaxLots] = useState(0.1);

  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [accounts, setAccounts] = useState<LooseAccount[]>([]);
  const [hostedAccountSyncs, setHostedAccountSyncs] = useState<HostedAccountSync[]>([]);
  const [hostedBrokers, setHostedBrokers] = useState<HostedBroker[]>([]);
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
  const [syncConsent, setSyncConsent] = useState(false);
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [accountType, setAccountType] = useState<"real" | "demo" | "prop">("real");

  const [riskSettings, setRiskSettings] = useState<RiskSettings>(DEFAULT_RISK_SETTINGS);
  const [configurationRequests, setConfigurationRequests] = useState<CopierConfigRequest[]>([]);
  const [configurationRequestNote, setConfigurationRequestNote] = useState("");
  const [riskSavedAt, setRiskSavedAt] = useState<string>("");
  const [riskBusy, setRiskBusy] = useState(false);
  const [masterConsent, setMasterConsent] = useState(false);
  const [masterSaveState, setMasterSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [riskSaveState, setRiskSaveState] = useState<"idle" | "saving" | "saved" | "pending" | "failed">("idle");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectConsent, setDisconnectConsent] = useState(false);
  const [removeReceiverId, setRemoveReceiverId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState("");
  const [activationRequests, setActivationRequests] = useState<ActivationRequest[]>([]);
  const [selectedRemovalId, setSelectedRemovalId] = useState("");
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalMessage, setRemovalMessage] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [masterSyncConsent, setMasterSyncConsent] = useState(false);
  const [masterSyncCurrency, setMasterSyncCurrency] = useState("");
  const [masterSyncType, setMasterSyncType] = useState<"" | "real" | "demo" | "prop">("");
  const [masterSyncBusy, setMasterSyncBusy] = useState(false);
  const [masterSyncMessage, setMasterSyncMessage] = useState("");
  const [requestServerChoice, setRequestServerChoice] = useState("");
  const [saveBarState, setSaveBarState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [saveBarMessage, setSaveBarMessage] = useState("Configuration non enregistrée");
  const [showStats, setShowStats] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [masterQuickValue, setMasterQuickValue] = useState("0.01");
  const [requestForm, setRequestForm] = useState({
    alias: "",
    broker: "",
    platform: "MT5" as "MT4" | "MT5",
    login: "",
    server: "",
    password: "",
    note: "",
    syncConsent: false,
    syncCurrency: "USD",
    syncType: "demo" as "real" | "demo" | "prop",
  });

  const latestMasterRequests = useMemo(() => {
    const seen = new Set<string>();
    const visible: ActivationRequest[] = [];
    for (const request of activationRequests) {
      const key = `${request.platform}:${request.login}:${request.server.trim().toLowerCase()}`;
      // Keep the newest state per account. A completed removal disappears
      // from the dashboard while its audit record remains stored.
      if (seen.has(key)) continue;
      seen.add(key);
      if (request.removal_status !== "completed") visible.push(request);
    }
    return visible;
  }, [activationRequests]);
  const approvedMaster = latestMasterRequests.find((r) => r.status === "activated" && Boolean(r.provider_master_id) && !["pending", "processing", "completed"].includes(r.removal_status)) || null;
  const approvedMasterReceiver = approvedMaster
    ? receivers.find((receiver) => isExplicitReceiver(receiver, latestMasterRequests) && receiver.login === approvedMaster.login && receiver.platform === approvedMaster.platform && receiver.server === approvedMaster.server) || null
    : null;
  const virtualReceivers = useMemo(() => {
    const rows: Array<Receiver & { legacy?: boolean }> = receivers.filter((receiver) => isExplicitReceiver(receiver, latestMasterRequests)).map((r) => ({ ...r }));
    if (legacyConnected) {
      rows.unshift({
        id: "legacy",
        alias: "Compte connecté existant",
        platform: "MT5",
        login: "Historique",
        server: "InvestPro Copier Engine",
        status: "connected",
        is_primary: true,
        config: {},
        last_connected_at: null,
        created_at: "",
        legacy: true,
      });
    }
    return rows;
  }, [receivers, legacyConnected, latestMasterRequests]);

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

  async function requestMasterRemoval() {
    if (!selectedRemovalId || removalBusy) return;
    if (!window.confirm("Demander le retrait de ce compte Master ? Il restera actif jusqu’à la vérification de l’équipe InvestPro.")) return;
    setRemovalBusy(true);
    setRemovalMessage("");
    try {
      const response = await fetch("/api/copier/request", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_removal", requestId: selectedRemovalId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible d’envoyer la demande de retrait.");
      setRemovalMessage(data.message || "Demande de retrait envoyée.");
      setSelectedRemovalId("");
      await loadActivationRequests();
    } catch (cause) {
      setRemovalMessage(cause instanceof Error ? cause.message : "Impossible d’envoyer la demande de retrait.");
    } finally { setRemovalBusy(false); }
  }

  async function startMasterSync() {
    if (!approvedMaster || masterSyncBusy) return;
    if (!masterSyncConsent || !/^[A-Z]{3}$/.test(masterSyncCurrency.trim().toUpperCase()) || !masterSyncType) {
      setMasterSyncMessage("Confirme l’autorisation, la devise et le type exact du compte.");
      return;
    }
    setMasterSyncBusy(true);
    setMasterSyncMessage("");
    try {
      const response = await fetch("/api/copier/master-sync", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: approvedMaster.id,
          currency: masterSyncCurrency.trim().toUpperCase(),
          type: masterSyncType,
          syncConsent: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de lancer MetaSync.");
      setMasterSyncMessage(data.alreadyConnected
        ? "Une connexion MetaSync existe déjà pour ce compte. Actualise Mes comptes pour vérifier son état."
        : "MetaSync est lancé. Le solde et l’equity apparaîtront après la première synchronisation.");
      setMasterSyncConsent(false);
      await loadRows();
    } catch (cause) {
      setMasterSyncMessage(cause instanceof Error ? cause.message : "Impossible de lancer MetaSync.");
    } finally {
      setMasterSyncBusy(false);
    }
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
    if (form.syncConsent && !/^[A-Z]{3}$/.test(form.syncCurrency.trim().toUpperCase())) {
      setError(true);
      setMessage("Indique la devise réelle du compte (par exemple USD ou EUR) pour configurer MetaSync.");
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
          syncCurrency: form.syncConsent ? form.syncCurrency.trim().toUpperCase() : null,
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
        syncConsent: false,
        syncCurrency: "USD",
        syncType: "demo",
      });
      setRequestServerChoice("");
      setRequestOpen(false);
      setRequestSuccess(data.message || "Votre demande d’activation de compte Master a bien été envoyée ! Notre équipe va procéder à sa vérification. Vous recevrez une notification dès que votre compte sera activé.");
      setMessage(
        data.message ||
          "Votre demande a été envoyée. Son statut sera actualisé dans votre espace InvestPro."
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
    const [r1, r2, hostedResponse] = await Promise.all([
      supabase.from("copier_receivers").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
      supabase.from("trading_accounts").select("*").eq("user_id", user.id),
      fetch("/api/metasync/hosted", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null).catch(() => null),
    ]);
    if (!r1.error) setReceivers((r1.data || []) as Receiver[]);
    if (!r2.error) setAccounts((r2.data || []) as LooseAccount[]);
    setHostedAccountSyncs(Array.isArray(hostedResponse?.connections) ? hostedResponse.connections as HostedAccountSync[] : []);
    setHostedBrokers(Array.isArray(hostedResponse?.brokers) ? hostedResponse.brokers as HostedBroker[] : []);
    const configResponse = await fetch("/api/copier/config-request", { cache: "no-store" });
    if (configResponse.ok) {
      const configData = await configResponse.json();
      setConfigurationRequests((configData.requests || []) as CopierConfigRequest[]);
    }
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
      setMessage("InvestPro Copier actualisé.");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Connexion indisponible.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  // Keep displayed balances aligned with the existing MetaSync snapshots while
  // the Copier page stays open. No new connector or account is created here.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [accountsResponse, hostedResponse] = await Promise.all([
          supabase.from("trading_accounts").select("*").eq("user_id", user.id),
          fetch("/api/metasync/hosted", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null).catch(() => null),
        ]);
        if (!accountsResponse.error) setAccounts((accountsResponse.data || []) as LooseAccount[]);
        setHostedAccountSyncs(Array.isArray(hostedResponse?.connections) ? hostedResponse.connections as HostedAccountSync[] : []);
    setHostedBrokers(Array.isArray(hostedResponse?.brokers) ? hostedResponse.brokers as HostedBroker[] : []);
      })().catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [supabase]);

  async function selectReceiver(id: string) {
    if (selectedReceiverId === id) {
      setSelectedReceiverId(null);
      setSelectedStatus(null);
      setSelectedMasters({});
      setMasterConsent(false);
      setRiskModalOpen(false);
      return;
    }
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

  function openAddReceiver() {
    setPassword("");
    setConsent(false);
    setSyncConsent(false);
    setAddOpen(true);
  }

  function closeAddReceiver() {
    setPassword("");
    setConsent(false);
    setSyncConsent(false);
    setAddOpen(false);
  }

  async function addReceiver() {
    const effectiveServer =
      serverChoice === "__OTHER__" ? customServer.trim() : serverChoice.trim();

    if (!alias.trim() || !/^\d{1,15}$/.test(login) || !effectiveServer || !password || !consent) {
      setError(true);
      setMessage("Complète les informations du compte et confirme l’autorisation.");
      return;
    }
    if (syncConsent && !/^[A-Z]{3}$/.test(accountCurrency.trim().toUpperCase())) {
      setError(true);
      setMessage("Indique le code devise réel du compte (par exemple USD ou EUR) pour configurer MetaSync.");
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const data = await post({ action: "connect", alias: alias.trim(), platform, login, server: effectiveServer, password, consent: true });
      let syncNotice = "";
      if (syncConsent) {
        const normalizedServer = effectiveServer.trim().toLowerCase();
        const existingHosted = hostedAccountSyncs.find((row) => {
          const connection = row.investpro_mt_connections;
          return connection && connection.login?.trim() === login.trim() &&
            connection.platform?.toUpperCase() === platform &&
            connection.server?.trim().toLowerCase() === normalizedServer;
        });
        const existingAccount = accounts.some((row) => {
          const rowPlatform = String(row.platform || "").toUpperCase();
          const rowServer = String(row.server ?? row.server_name ?? row.broker_server ?? "").trim().toLowerCase();
          return accountNumber(row).trim() === login.trim() && rowPlatform === platform && rowServer === normalizedServer;
        });
        if (existingHosted?.active !== false && existingHosted?.status === "error") {
          const hostedBroker = hostedBrokers.find((item) => item.platform.toUpperCase() === platform && item.server.trim().toLowerCase() === normalizedServer);
          if (!hostedBroker) {
            syncNotice = "MetaSync avait échoué et ce serveur n’est plus disponible dans le catalogue. Aucun solde n’a été confirmé.";
          } else {
            try {
              const syncResponse = await fetch("/api/metasync/hosted", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ broker: hostedBroker.id, login, password, currency: accountCurrency.trim().toUpperCase(), type: accountType, syncConsent: true }),
              });
              const syncData = await syncResponse.json().catch(() => ({}));
              syncNotice = syncResponse.ok
                ? "La synchronisation MetaSync en échec a été relancée avec les identifiants saisis. Le solde s’affichera après une première réponse valide du serveur."
                : `Le receveur est connecté, mais MetaSync n’a pas pu être relancé : ${syncData.error || "réessaie plus tard"}`;
            } catch {
              syncNotice = "Le receveur est connecté, mais la relance MetaSync n’a pas été confirmée. Vérifie le statut dans InvestPro Copier.";
            }
          }
        } else if (existingHosted || existingAccount) {
          syncNotice = existingHosted?.active === false
            ? "La connexion MetaSync existe déjà mais est arrêtée ; réactive-la dans Mes comptes pour actualiser le solde."
            : "La connexion MetaSync déjà présente sera réutilisée pour le solde.";
        } else {
          const hostedBroker = hostedBrokers.find((item) => item.platform.toUpperCase() === platform && item.server.trim().toLowerCase() === normalizedServer);
          if (!hostedBroker) {
            syncNotice = "Ce serveur n’est pas encore pris en charge par MetaSync ; le receveur est connecté, mais son solde ne pourra pas être synchronisé automatiquement.";
          } else {
            try {
              const syncResponse = await fetch("/api/metasync/hosted", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  broker: hostedBroker.id,
                  login,
                  password,
                  currency: accountCurrency.trim().toUpperCase(),
                  type: accountType,
                  syncConsent: true,
                }),
              });
              const syncData = await syncResponse.json().catch(() => ({}));
              syncNotice = syncResponse.ok
                ? "MetaSync est lancé ; le solde et l’equity apparaîtront après la première synchronisation."
                : `Le receveur est connecté, mais MetaSync n’a pas pu démarrer : ${syncData.error || "réessaie depuis Mes comptes"}`;
            } catch {
              syncNotice = "Le receveur est connecté, mais la demande MetaSync n’a pas été confirmée. Vérifie Mes comptes avant de réessayer.";
            }
          }
        }
      }
      setPassword("");
      setConsent(false);
      setSyncConsent(false);
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
      setMessage(syncNotice ? `Nouveau compte receveur connecté. ${syncNotice}` : "Nouveau compte receveur connecté.");
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
    setMasterSaveState("idle");
  }

  function changeLots(id: string, lots: string) {
    setSelectedMasters((cur) => ({ ...cur, [id]: { ...(cur[id] || { on: false }), lots } }));
    setMasterConsent(false);
    setMasterSaveState("idle");
  }

  async function saveRiskSettings() {
    if (!selectedReceiverId || selectedReceiverId === "legacy") {
      setError(true);
      setMessage(
        "Les réglages avancés nécessitent un compte receveur InvestPro. Le compte historique doit d’abord être ajouté comme receveur."
      );
      return;
    }

    setRiskBusy(true);
    setRiskSaveState("saving");
    setError(false);

    try {
      const response = await fetch("/api/copier/settings", {
        method: "PATCH",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiverId: selectedReceiverId,
          settings: riskSettings,
          masters: (selectedStatus?.masterAccountsList || []).filter((m) => selectedMasters[m.id]?.on).map((m) => ({ id: m.id, name: m.name, lots: Number(selectedMasters[m.id]?.lots || 0.01) })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossible d’enregistrer le Risk Engine.");
      }

      setRiskSavedAt(new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }));

      await loadRows();
      setRiskSaveState(data.requestStatus === "pending" ? "pending" : "saved");

      if (riskSettings.mode === "fixed") {
        setMessage(
          "Risk Engine enregistré. Le mode Lots fixes reste synchronisé avec le moteur de copie InvestPro."
        );
      } else {
        setMessage(
          "Votre demande de réglage est en attente de traitement par l’équipe InvestPro. Le réglage actuellement actif reste en place jusqu’à confirmation."
        );
      }
    } catch (cause) {
      setRiskSaveState("failed");
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Impossible d’enregistrer le Risk Engine."
      );
    } finally {
      setRiskBusy(false);
    }
  }

  async function saveMasters() {
    if (!selectedReceiverId) return;
    setBusy(true);
    setMasterSaveState("saving");
    setError(false);
    try {
      const masters = (Object.entries(selectedMasters) as Array<[string, { on: boolean; lots: string }]>).filter(([, v]) => v.on).map(([id, v]) => ({ id, lots: Number(v.lots) }));
      const data = await post({ action: "masters", receiverId: selectedReceiverId, consent: masterConsent, masters });
      if (data.status) applyStatus(data.status);
      setMasterSaveState("saved");
      setMessage("Configuration confirmée par le moteur de copie.");
    } catch (cause) {
      setMasterSaveState("failed");
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function removeReceiver() {
    const id = removeReceiverId;
    if (!id || id === "legacy" || !disconnectConsent || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError("");
    try {
      // La route serveur déconnecte le moteur et supprime le compte dans une seule opération contrôlée.
      const response = await fetch(`/api/copier/receivers/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: await authHeaders(),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Impossible de supprimer le receveur.");
      setReceivers((list) => list.filter((r) => r.id !== id));
      if (selectedReceiverId === id) {
        setSelectedReceiverId(null);
        setSelectedStatus(null);
        setSelectedMasters({});
      }
      setRemoveReceiverId(null);
      setDisconnectConsent(false);
      await loadRows();
      setMessage("Receveur déconnecté et retiré de ton espace InvestPro.");
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setRemoveBusy(false);
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

  useEffect(() => {
    if (!selectedReceiver || selectedReceiver.id === "legacy") {
      setRiskSettings(DEFAULT_RISK_SETTINGS);
      setRiskSavedAt("");
      return;
    }

    const config = (selectedReceiver.config || {}) as Record<string, unknown>;
    const saved = (config.risk_engine || {}) as Partial<RiskSettings>;

    setRiskSettings({
      ...DEFAULT_RISK_SETTINGS,
      ...saved,
      mode:
        saved.mode &&
        ["fixed", "mirror", "balance", "equity", "percent"].includes(saved.mode)
          ? saved.mode
          : "fixed",
    });
    setRiskSavedAt("");
  }, [selectedReceiverId, receivers]);

  useEffect(() => {
    const latest = configurationRequests.find((request) => request.receiver_id === selectedReceiverId);
    setConfigurationRequestNote(latest?.status === "rejected" ? String(latest.admin_note || "") : "");
    if (!latest) {
      setRiskSaveState("idle");
      return;
    }
    if (latest.status === "pending" || latest.status === "processing") setRiskSaveState("pending");
    else if (latest.status === "applied") {
      setRiskSaveState("saved");
      setRiskSavedAt(new Date(latest.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    }
    else setRiskSaveState("failed");
  }, [configurationRequests, selectedReceiverId]);

  function statsFor(receiver: Receiver) {
    const row = matchingAccount(accounts, receiver, hostedAccountSyncs);
    const currency = String(row?.currency || "USD");
    return {
      balance: stat(row, ["current_balance", "balance"]),
      equity: stat(row, ["equity", "current_equity"]),
      pnl: stat(row, ["daily_pnl", "pnl_today", "today_pnl"]),
      open: stat(row, ["open_positions", "positions_open", "open_trades"]),
      currency,
      lastSync: typeof row?.sync_last_seen === "string" ? row.sync_last_seen : null,
    };
  }

  const masterAccountRow = approvedMaster ? matchingAccount(accounts, approvedMaster, hostedAccountSyncs) : undefined;
  const masterSyncFailed = Boolean(approvedMaster && hostedAccountSyncs.some((row) => {
    const connection = row.investpro_mt_connections;
    return row.active !== false && row.status === "error" && connection &&
      connection.login?.trim() === approvedMaster.login.trim() &&
      connection.platform?.toUpperCase() === approvedMaster.platform &&
      connection.server?.trim().toLowerCase() === approvedMaster.server.trim().toLowerCase() &&
      !connection.last_sync && row.equity == null;
  }));
  const masterBalance = stat(masterAccountRow, ["current_balance", "balance"]);
  const masterEquity = stat(masterAccountRow, ["equity", "current_equity"]);
  const masterPnl = stat(masterAccountRow, ["daily_pnl", "pnl_today", "today_pnl"]);
  const masterCurrency = String(masterAccountRow?.currency || "USD");

  const selectedStats = selectedReceiver && selectedReceiver.id !== "legacy"
    ? statsFor(selectedReceiver)
    : { balance: null, equity: null, pnl: null, open: null, currency: "USD" };

  const connectedCount = virtualReceivers.filter((receiver) => receiver.status === "connected").length;
  const errorCount = virtualReceivers.filter((receiver) => receiver.status === "error").length;
  const totalOpenPositions = virtualReceivers.reduce((sum, receiver) => {
    if (receiver.id === "legacy") return sum;
    const s = statsFor(receiver);
    return sum + (Number(s.open) || 0);
  }, 0);

  async function saveAll() {
    if (!selectedReceiverId) return;
    if (!masterConsent) {
      setError(true);
      setMessage("Coche la confirmation avant d’enregistrer la configuration.");
      setSaveBarState("failed");
      setSaveBarMessage("Confirmation requise avant enregistrement");
      return;
    }
    setSaveBarState("saving");
    setSaveBarMessage("Enregistrement en cours…");
    setBusy(true);
    setRiskBusy(true);
    setError(false);
    try {
      const masters = (Object.entries(selectedMasters) as Array<[string, { on: boolean; lots: string }]>).filter(([, v]) => v.on).map(([id, v]) => ({ id, lots: Number(v.lots || 0.01) }));
      if (riskSettings.mode === "fixed") {
        const data = await post({ action: "masters", receiverId: selectedReceiverId, consent: true, masters });
        if (data.ok === false) throw new Error(data.error || "La liaison Master n’a pas été confirmée.");
        if (data.status) applyStatus(data.status);
      }
      if (selectedReceiverId !== "legacy") {
        const response = await fetch("/api/copier/settings", {
          method: "PATCH",
          headers: { ...(await authHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverId: selectedReceiverId,
            settings: riskSettings,
            masters: (selectedStatus?.masterAccountsList || []).filter((m) => selectedMasters[m.id]?.on).map((m) => ({ id: m.id, name: m.name, lots: Number(selectedMasters[m.id]?.lots || 0.01) })),
          }),
        });
        const result = await response.json();
        if (!response.ok || result.ok === false) throw new Error(result.error || "Impossible d’enregistrer les réglages de copie.");
        setRiskSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
        setRiskSaveState(result.requestStatus === "pending" ? "pending" : "saved");
      }
      setSaveBarState("saved");
      setRiskModalOpen(false);
      const pending = riskSettings.mode !== "fixed";
      setSaveBarMessage(pending ? "Demande enregistrée · traitement InvestPro en attente" : "Configuration confirmée pour le mode lots fixes");
      setMessage(pending ? "Votre demande de réglage est en attente de traitement par l’équipe InvestPro. Le réglage actuellement actif reste en place jusqu’à confirmation." : "Configuration des lots fixes envoyée au moteur de copie.");
      await loadRows();
    } catch (cause) {
      setSaveBarState("failed");
      setSaveBarMessage("Échec de l’enregistrement");
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
      setRiskBusy(false);
    }
  }

  function applyQuickModeToSelectedMasters(value: string) {
    setMasterQuickValue(value);
    setSelectedMasters((current) => {
      const next = { ...current };
      for (const master of selectedStatus?.masterAccountsList || []) {
        next[master.id] = {
          ...(next[master.id] || { on: false }),
          lots: value,
        };
      }
      return next;
    });
  }

  return (
    <>
      <main className="mx-auto max-w-[1600px] space-y-5 pb-32">
        <section className="space-y-4 md:hidden">
          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="inline-flex rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold text-[color:var(--gold)]">Gestion des comptes MetaTrader</div>
            <div className="mt-3 flex items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-white">InvestPro Copier</h1><p className="mt-1 text-[11px] leading-5 text-white/45">Configure ta copie en trois étapes simples.</p></div><button type="button" onClick={() => void refresh()} disabled={busy} aria-label="Actualiser les comptes" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/65 disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></button></div>
            <div className={cn("mt-3 flex items-center gap-2 rounded-xl border px-3 py-2", enabled ? "border-emerald-500/15 bg-emerald-500/[0.04]" : "border-amber-500/15 bg-amber-500/[0.035]")}><span className={cn("h-2 w-2 shrink-0 rounded-full", enabled ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.6)]" : "bg-amber-400")} /><span className={cn("min-w-0 flex-1 truncate text-[10px] font-semibold", enabled ? "text-emerald-200" : "text-amber-200")}>{enabled ? "Moteur de copie disponible" : "Moteur de copie indisponible"}</span><span className="shrink-0 text-[8px] text-white/35">{checked ? `Vérifié ${checked}` : "En attente"}</span></div>
            {error ? <div role="alert" className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.055] px-3 py-2 text-[10px] leading-5 text-red-300">{message}</div> : null}
            {requestSuccess ? <div role="status" className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[10px] leading-5 text-emerald-300">{requestSuccess}</div> : null}
          </section>

          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="inline-flex rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold text-[color:var(--gold)]">Parcours mobile simplifié</div><h2 className="mt-3 text-xl font-semibold text-white">Configuration guidée</h2><p className="mt-1 text-[11px] leading-5 text-white/45">Vérifie ton Master, choisis le receveur, puis règle le risque.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">{[{ number: "1", label: "Master", done: Boolean(approvedMaster), active: !approvedMaster }, { number: "2", label: "Receveur", done: Boolean(selectedReceiver), active: Boolean(approvedMaster && !selectedReceiver) }, { number: "3", label: "Risque", done: riskSaveState === "saved", active: Boolean(approvedMaster && selectedReceiver && riskSaveState !== "saved") }].map((step) => <div key={step.number} className={cn("min-w-0 rounded-xl border p-2.5", step.done ? "border-emerald-500/20 bg-emerald-500/[0.045]" : step.active ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.07] bg-black/15")}><span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold", step.done ? "bg-emerald-400/15 text-emerald-300" : step.active ? "bg-[color:var(--gold)] text-black" : "bg-white/[0.06] text-white/40")}>{step.done ? <Check size={14} /> : step.number}</span><div className="mt-2 truncate text-[10px] font-semibold text-white">{step.label}</div><div className={cn("mt-0.5 text-[8px]", step.done ? "text-emerald-300/70" : step.active ? "text-[color:var(--gold)]" : "text-white/35")}>{step.done ? "Prêt" : step.active ? "En cours" : "À faire"}</div></div>)}</div>
          </section>

          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--gold)]">1. Compte Master</div><p className="mt-1 text-[10px] text-white/40">Compte source à copier.</p></div><State active={Boolean(approvedMaster)} label={approvedMaster ? "Approuvé" : "À valider"} /></div>
            {approvedMaster ? <div className="mt-3 rounded-[17px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="break-words text-base font-semibold leading-tight text-white">{approvedMaster.alias}</div><div className="mt-1 text-[9px] leading-4 text-white/45">#{approvedMaster.login} · {approvedMaster.platform} · {approvedMaster.server}</div></div>{approvedMasterReceiver ? <ReceiverStatusBadge status={approvedMasterReceiver.status} /> : <span className="shrink-0 rounded-full border border-white/[0.08] px-2 py-1 text-[7px] font-semibold text-white/40">État inconnu</span>}</div><div className="mt-3 grid grid-cols-3 gap-2">{[["Solde", masterBalance == null ? "—" : money(masterBalance, masterCurrency)], ["Equity", masterEquity == null ? "—" : money(masterEquity, masterCurrency)], ["P&L jour", masterPnl == null ? "—" : money(masterPnl, masterCurrency)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-white/[0.06] bg-black/20 p-2"><div className="text-[7px] uppercase tracking-wide text-white/35">{label}</div><div className="mt-1 break-words text-[9px] font-semibold leading-snug text-white">{value}</div></div>)}</div><div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-2 text-[9px] text-white/50"><span className={cn("h-1.5 w-1.5 rounded-full", approvedMasterReceiver?.status === "connected" ? "bg-emerald-400" : approvedMasterReceiver?.status === "error" ? "bg-red-400" : "bg-amber-400")} />{approvedMasterReceiver?.status === "connected" ? "Master connecté" : approvedMasterReceiver?.status === "paused" ? "Connexion en pause" : approvedMasterReceiver?.status === "error" ? "Connexion à vérifier" : "Connexion Master à confirmer"}</div></div> : <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3"><p className="text-[10px] leading-5 text-white/50">Ajoute ton compte source. Il apparaîtra ici après validation par l’équipe InvestPro.</p><button type="button" onClick={() => setRequestOpen(true)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 text-[10px] font-semibold text-[color:var(--gold)]"><Plus size={14} /> Ajouter un compte Master</button></div>}
          </section>

          <section className="scroll-mt-4 rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--gold)]">2. Compte receveur</div><p className="mt-1 text-[10px] leading-5 text-white/40">Le compte qui recevra les trades copiés.</p></div><span className="shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 text-[8px] font-semibold text-white/45">{selectedReceiver ? "Sélectionné" : "À choisir"}</span></div>
            {selectedReceiver ? <div className="mt-3 rounded-[17px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="break-words text-base font-semibold text-white">{selectedReceiver.alias}</div><div className="mt-1 text-[9px] text-white/45">#{selectedReceiver.login} · {selectedReceiver.platform}</div></div><ReceiverStatusBadge status={selectedReceiver.status} /></div><div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-white/45"><span className="truncate">{selectedReceiver.server}</span><span>{selectedStats.balance == null ? "Solde —" : money(selectedStats.balance, selectedStats.currency)}</span></div></div> : <div className="mt-3 rounded-xl border border-dashed border-white/[0.12] bg-black/15 p-3 text-[10px] text-white/45">Aucun receveur sélectionné.</div>}
            {virtualReceivers.length > 1 ? <div className="mt-2 space-y-2">{virtualReceivers.filter((receiver) => receiver.id !== selectedReceiverId).map((receiver) => <button type="button" key={receiver.id} onClick={() => void selectReceiver(receiver.id)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/15 px-3 text-left"><span className="min-w-0"><span className="block truncate text-[10px] font-semibold text-white/80">{receiver.alias}</span><span className="mt-0.5 block text-[8px] text-white/40">#{receiver.login} · {receiver.platform}</span></span><ReceiverStatusBadge status={receiver.status} /></button>)}</div> : null}
            <div className="mt-3 flex gap-2"><button type="button" onClick={openAddReceiver} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-3 text-[10px] font-semibold text-black"><Plus size={14} /> Ajouter un compte receveur</button>{selectedReceiver && selectedReceiver.id !== "legacy" ? <button type="button" aria-label="Retirer ce receveur" onClick={() => { setRemoveReceiverId(selectedReceiver.id); setDisconnectConsent(false); setRemoveError(""); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 text-red-300"><Unplug size={15} /></button> : null}</div>
          </section>

          {selectedReceiver ? <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--gold)]">3. Configurer le risque</div><p className="mt-1 text-[10px] leading-5 text-white/40">Choisis comment les trades seront copiés.</p></div><span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-semibold", riskSaveState === "saved" ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300" : riskSaveState === "pending" ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-200" : "border-white/[0.08] text-white/40")}>{riskSaveState === "saved" ? "Enregistré" : riskSaveState === "pending" ? "En attente" : "À faire"}</span></div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[17px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3"><div className="min-w-0"><div className="text-[13px] font-semibold text-white">{riskModeLabel(riskSettings.mode)}</div><div className="mt-1 text-[9px] leading-4 text-white/45">{riskSettings.mode === "fixed" ? "Volume identique défini par stratégie" : "Calcul des lots selon le mode choisi"}</div></div>{riskSettings.mode === "fixed" ? <div className="shrink-0 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-right"><div className="text-[11px] font-bold text-white">{masterQuickValue} lots</div></div> : <span className="shrink-0 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-[10px] font-semibold text-white">×{riskSettings.mirror_multiplier}</span>}</div>
            {selectedStatus?.masterAccountsList.length ? <div className="mt-3"><div className="mb-2 text-[9px] font-semibold text-white/55">Sources disponibles</div><div className="space-y-2">{selectedStatus.masterAccountsList.map((master, index) => { const current = selectedMasters[master.id] || { on: false, lots: masterQuickValue || "0.01" }; return <div key={master.id} className={cn("flex items-center gap-2 rounded-xl border p-2.5", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]/60" : "border-white/[0.07] bg-black/15")}><button type="button" aria-label={`${current.on ? "Désactiver" : "Activer"} ${master.name}`} onClick={() => toggleMaster(master.id)} className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/45")}>{current.on ? <Check size={14} /> : null}</button><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold text-white">{master.name}</div><div className="mt-0.5 text-[8px] text-white/40">Master {String(index + 1).padStart(2, "0")} · {current.on ? "Sélectionné" : "Non sélectionné"}</div></div>{riskSettings.mode === "fixed" ? <div className="w-[84px]"><input aria-label={`Lots pour ${master.name}`} type="number" min="0.001" max={maxLots} step="any" value={current.lots} disabled={!current.on} onChange={(e) => changeLots(master.id, e.target.value)} className="ip-field disabled:opacity-35" /></div> : null}</div>; })}</div></div> : <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-3 text-[9px] leading-4 text-white/45">{error ? "Les sources ne sont pas disponibles pour le moment." : "Les sources apparaîtront après la vérification du compte."}</div>}
            <label className="mt-3 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/15 p-3 text-[9px] leading-4 text-white/55"><input type="checkbox" checked={masterConsent} onChange={(e) => { setMasterConsent(e.target.checked); setSaveBarState("idle"); setSaveBarMessage("Configuration non enregistrée"); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#d4a934]" />Je confirme le compte Master sélectionné ainsi que la configuration choisie.</label>
            <button type="button" disabled={!selectedReceiver || activeMasters.length === 0 || !masterConsent || !selectedStatus || error} onClick={() => setRiskModalOpen(true)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-3 text-[10px] font-semibold text-black disabled:opacity-40"><Settings2 size={14} /> Continuer : régler les paramètres</button><p className="mt-2 text-center text-[9px] text-white/35">{saveBarMessage}</p>
          </section> : <section className="rounded-[22px] border border-white/[0.07] bg-[color:var(--panel)] p-4"><div className="text-[10px] font-semibold text-white/75">3. Configurer le risque</div><p className="mt-1 text-[9px] text-white/40">Sélectionne d’abord un compte receveur.</p></section>}

          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4"><div className="text-[10px] font-semibold text-white/75">État du parcours</div><div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/[0.06] bg-black/15 p-3"><div className="text-[8px] uppercase text-white/35">Connexion receveur</div><div className="mt-1 text-[9px] font-semibold text-white/70">{selectedReceiver ? selectedReceiver.status === "connected" ? "Connecté" : selectedReceiver.status === "paused" ? "En pause" : "À vérifier" : "À configurer"}</div></div><div className="rounded-xl border border-white/[0.06] bg-black/15 p-3"><div className="text-[8px] uppercase text-white/35">Dernière vérification</div><div className="mt-1 truncate text-[9px] font-semibold text-white/70">{checked || "En attente"}</div></div></div></section>
        </section>
        {latestMasterRequests.length > 0 ? <section className="rounded-[22px] border border-white/[0.07] bg-[color:var(--panel)] p-4 md:hidden">
          <div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-white">Suivi des demandes Master</h2><button type="button" onClick={() => void loadActivationRequests()} className="text-[9px] font-semibold text-[color:var(--gold)]">Actualiser</button></div>
          <div className="mt-3 space-y-2">{latestMasterRequests.map((request) => { const removalPending = ["pending", "processing"].includes(request.removal_status); const removed = request.removal_status === "completed"; const canRemove = request.status === "activated" && Boolean(request.provider_master_id) && !removalPending && !removed; const label = removed ? "Retiré" : removalPending ? "Retrait en cours" : request.status === "activated" ? "Activé" : request.status === "rejected" ? "Refusé" : request.status === "processing" ? "Vérification" : "En attente"; return <div key={request.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-[10px] font-semibold text-white">{request.alias} · {request.platform} {request.login}</div><div className="mt-1 truncate text-[8px] text-white/40">{request.server}</div></div><div className="flex shrink-0 items-center gap-2">{canRemove ? <input type="checkbox" aria-label={`Sélectionner ${request.alias} pour demander son retrait`} checked={selectedRemovalId === request.id} onChange={(event) => setSelectedRemovalId(event.target.checked ? request.id : "")} className="h-4 w-4 accent-[#d4a934]" /> : null}<span className={cn("rounded-full border px-2 py-1 text-[8px] font-semibold", removed || removalPending ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-200" : request.status === "activated" ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300" : request.status === "rejected" ? "border-red-500/20 bg-red-500/[0.05] text-red-300" : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]")}>{label}</span></div></div></div>; })}</div>
          {selectedRemovalId ? <button type="button" disabled={removalBusy} onClick={() => void requestMasterRemoval()} className="mt-3 min-h-10 w-full rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 text-[9px] font-semibold text-red-200 disabled:opacity-50">{removalBusy ? "Envoi…" : "Demander le retrait du compte sélectionné"}</button> : null}{removalMessage ? <p role="status" className="mt-2 text-[9px] leading-4 text-white/60">{removalMessage}</p> : null}
        </section> : null}
        <div className="hidden space-y-5 md:block">
        <section id="copier-overview" className="scroll-mt-24 overflow-hidden rounded-[26px] border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="relative p-4 md:p-6">
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-300/[0.035] blur-3xl" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--gold)]">Pilotage des comptes</div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-[38px]">InvestPro Copier</h1>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-white/50 md:text-sm">Surveille tes receveurs, vérifie les liaisons Master et accède rapidement aux réglages de risque.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 text-xs font-semibold text-white/75 transition hover:bg-white/[0.05] disabled:opacity-50"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Actualiser</button>
                <button type="button" onClick={() => setRequestOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]/80"><Send size={14} /> Ajouter un compte Master</button>
              </div>
            </div>

            <div className={cn("relative mt-5 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between", enabled ? "border-emerald-500/15 bg-emerald-500/[0.045]" : "border-amber-500/15 bg-amber-500/[0.035]")}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                  {enabled ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/50 motion-reduce:animate-none" /> : null}
                  <span className={cn("relative h-2 w-2 rounded-full", enabled ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.65)]" : "bg-amber-400")} />
                </span>
                <div className="min-w-0">
                  <div className={cn("text-xs font-semibold", enabled ? "text-emerald-200" : "text-amber-200")}>{enabled ? "Moteur de copie disponible" : "Moteur de copie indisponible"}</div>
                  <div className="mt-0.5 truncate text-[10px] text-white/45">{error ? "Synchronisation à vérifier" : errorCount > 0 ? `${errorCount} connexion${errorCount > 1 ? "s" : ""} à vérifier` : `${connectedCount} receveur${connectedCount > 1 ? "s" : ""} connecté${connectedCount > 1 ? "s" : ""} · ${activeMasters.length} liaison${activeMasters.length > 1 ? "s" : ""} Master active${activeMasters.length > 1 ? "s" : ""}`}</div>
                </div>
              </div>
              <div className="shrink-0 text-[10px] text-white/40">{checked ? `Vérifié ${checked}` : "En attente de la première vérification"}</div>
            </div>

            {requestSuccess ? <div role="status" className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-xs text-emerald-300"><CheckCircle2 className="mr-2 inline-block h-4 w-4" />{requestSuccess}<button className="ml-3 underline underline-offset-2" onClick={() => setRequestSuccess("")}>Fermer</button></div> : null}
            {error ? <div role="alert" className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.055] px-3 py-2.5 text-xs text-red-300">{message}</div> : null}

            <div className="relative mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
              <HeroStatCard icon={<Layers3 size={17} />} label="Comptes receveurs" value={String(virtualReceivers.length)} sub={`${virtualReceivers.length - connectedCount - errorCount} en pause`} />
              <HeroStatCard icon={<Link2 size={17} />} label="Connectés" value={String(connectedCount)} sub={errorCount > 0 ? `${errorCount} à vérifier` : "État des connexions"} accent={errorCount > 0 ? `${errorCount} alerte${errorCount > 1 ? "s" : ""}` : undefined} accentPositive={false} />
              <HeroStatCard icon={<Activity size={17} />} label="Positions ouvertes" value={String(totalOpenPositions)} sub="Tous les receveurs" />
              <HeroStatCard icon={<ShieldCheck size={17} />} label="Masters actifs" value={String(activeMasters.length)} sub={selectedReceiver ? `Pour ${selectedReceiver.alias}` : "Sélectionne un receveur"} />
            </div>
          </div>
        </section>

        {latestMasterRequests.length > 0 ? (
          <section className="rounded-[22px] border border-white/[0.07] bg-[color:var(--panel)] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Suivi des demandes Master</h2>
                <p className="mt-1 text-[10px] text-white/40">Retrouve ici leur état et les informations utiles.</p>
              </div>
              <button type="button" onClick={() => void loadActivationRequests()} className="text-[10px] font-semibold text-[color:var(--gold)]">Actualiser</button>
            </div>
            <div className="mt-3 space-y-2">
              {latestMasterRequests.map((request) => {
                const removalPending = ["pending", "processing"].includes(request.removal_status);
                const removed = request.removal_status === "completed";
                const label = removed ? "Retiré" : removalPending ? "Retrait en cours" : request.status === "activated" ? "Activé" : request.status === "rejected" ? "Refusé" : request.status === "processing" ? "En cours de vérification" : "En attente";
                const style = removed || removalPending ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-200" : request.status === "activated" ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300" : request.status === "rejected" ? "border-red-500/20 bg-red-500/[0.05] text-red-300" : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";
                const canRequestRemoval = request.status === "activated" && Boolean(request.provider_master_id) && !removalPending && !removed;
                return <div key={request.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-3"><div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{request.alias} · {request.platform} {request.login}</div><div className="mt-1 text-[9px] text-white/40">{request.server} · demande du {new Date(request.created_at).toLocaleDateString("fr-FR")}</div></div>{canRequestRemoval ? <input type="checkbox" aria-label={`Sélectionner ${request.alias} pour demander son retrait`} checked={selectedRemovalId === request.id} onChange={(event) => setSelectedRemovalId(event.target.checked ? request.id : "")} className="h-4 w-4 shrink-0 accent-[#d4a934]" /> : null}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${style}`}>{label}</span>
                  </div>
                  {request.status === "rejected" && request.admin_note ? <p className="mt-2 text-[10px] leading-5 text-red-200/75">Motif : {request.admin_note}</p> : null}
                </div>;
              })}
            </div>
            {selectedRemovalId ? <button type="button" disabled={removalBusy} onClick={() => void requestMasterRemoval()} className="mt-3 min-h-10 w-full rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 text-[10px] font-semibold text-red-200 disabled:opacity-50">{removalBusy ? "Envoi…" : "Demander le retrait du compte sélectionné"}</button> : null}
            {removalMessage ? <p role="status" className="mt-2 text-[10px] leading-5 text-white/60">{removalMessage}</p> : null}
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_.9fr]">
          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/40">Performance · aujourd’hui</div><h2 className={cn("mt-2 text-2xl font-semibold tracking-tight", Number(selectedStats.pnl) > 0 ? "text-emerald-300" : Number(selectedStats.pnl) < 0 ? "text-red-300" : "text-white")}>{selectedStats.pnl == null ? "—" : money(selectedStats.pnl, selectedStats.currency)}</h2><p className="mt-1 text-[10px] text-white/40">Résultat du receveur sélectionné · {selectedReceiver?.alias || "aucun compte sélectionné"}</p></div>
              <div className="grid grid-cols-2 gap-2 sm:min-w-[230px]"><MiniMetric label="Solde" value={selectedStats.balance == null ? "—" : money(selectedStats.balance, selectedStats.currency)} /><MiniMetric label="Equity" value={selectedStats.equity == null ? "—" : money(selectedStats.equity, selectedStats.currency)} /></div>
            </div>
            <div className="mt-4 border-t border-white/[0.06] pt-3"><div className="mb-2 text-[9px] uppercase tracking-[0.1em] text-white/35">P&amp;L du jour par receveur</div>{virtualReceivers.length === 0 ? <div className="py-3 text-[10px] text-white/40">Aucun compte receveur.</div> : <div className="space-y-2">{virtualReceivers.map((receiver) => { const item = receiver.id === "legacy" ? { pnl: null, currency: "USD" } : statsFor(receiver); const amount = item.pnl == null ? null : Number(item.pnl); const maxAbs = Math.max(1, ...virtualReceivers.map((entry) => { const value = entry.id === "legacy" ? null : statsFor(entry).pnl; return value == null ? 0 : Math.abs(Number(value)); })); const width = amount == null || !Number.isFinite(amount) ? 0 : Math.max(3, Math.abs(amount) / maxAbs * 100); return <div key={receiver.id} className="grid grid-cols-[minmax(90px,.75fr)_1.6fr_auto] items-center gap-3"><span className="truncate text-[10px] text-white/60">{receiver.alias}</span><span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><span className={cn("block h-full rounded-full", amount == null ? "bg-white/15" : amount >= 0 ? "bg-emerald-400/75" : "bg-red-400/75")} style={{ width: `${width}%` }} /></span><span className={cn("min-w-[80px] text-right text-[10px] tabular-nums", amount == null ? "text-white/40" : amount > 0 ? "text-emerald-300" : amount < 0 ? "text-red-300" : "text-white/60")}>{amount == null ? "—" : money(amount, item.currency)}</span></div>; })}</div>}</div>
          </section>
          <section className="relative overflow-hidden rounded-[22px] border border-emerald-500/15 bg-[color:var(--panel)] p-4 md:p-5">
            <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-cyan-300/[0.06] blur-2xl" />
            <div className="relative flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-white">Protection &amp; risque</div><div className="mt-1 text-[10px] text-white/40">Réglages du receveur sélectionné</div></div><span className={cn("rounded-full border px-2.5 py-1 text-[8px] font-semibold", riskSaveState === "saved" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300" : riskSaveState === "failed" ? "border-red-500/20 bg-red-500/[0.05] text-red-300" : "border-white/[0.08] bg-white/[0.03] text-white/45")}>{riskSaveState === "saved" ? "Confirmé" : riskSaveState === "pending" ? "En attente" : riskSaveState === "failed" ? "Refusé / échec" : "À vérifier"}</span></div>
            <div className={cn("mt-4 flex items-center gap-3 rounded-xl border p-3", riskSaveState === "pending" ? "border-amber-500/15 bg-amber-500/[0.045]" : riskSaveState === "saved" ? "border-emerald-500/15 bg-emerald-500/[0.045]" : "border-white/[0.07] bg-black/15")}>
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", riskSaveState === "pending" ? "bg-amber-500/[0.08] text-amber-300" : riskSaveState === "saved" ? "bg-emerald-500/10 text-emerald-300" : riskSaveState === "failed" ? "bg-red-500/10 text-red-300" : "bg-white/[0.04] text-white/45")}>{riskSaveState === "pending" ? <Clock3 size={16} /> : riskSaveState === "saved" ? <ShieldCheck size={16} /> : riskSaveState === "failed" ? <AlertTriangle size={16} /> : <Activity size={16} />}</span>
              <div><div className={cn("text-[11px] font-semibold", riskSaveState === "pending" ? "text-amber-200" : riskSaveState === "saved" ? "text-emerald-200" : riskSaveState === "failed" ? "text-red-200" : "text-white/70")}>{riskSaveState === "pending" ? "Demande en cours de traitement" : riskSaveState === "saved" ? "Réglage actif confirmé" : riskSaveState === "failed" ? "Demande refusée ou échec" : "État du réglage"}</div><div className="mt-0.5 text-[9px] text-white/45">{riskSaveState === "pending" ? "Le réglage confirmé précédemment reste actif." : riskSaveState === "saved" ? `Dernière confirmation${riskSavedAt ? ` · ${riskSavedAt}` : ""}.` : riskSaveState === "failed" ? configurationRequestNote || "Consulte la notification InvestPro ou contacte l’équipe pour connaître la suite." : "Les réglages seront indiqués ici après leur enregistrement."}</div></div>
            </div>
            <div className="mt-3 space-y-0.5"><div className="flex justify-between gap-3 border-t border-white/[0.06] py-2 text-[10px]"><span className="text-white/45">Mode de calcul</span><strong className="text-white/75">{riskModeLabel(riskSettings.mode)}</strong></div><div className="flex justify-between gap-3 border-t border-white/[0.06] py-2 text-[10px]"><span className="text-white/45">Volume maximum</span><strong className="text-white/75">{riskSettings.max_lots} lots</strong></div></div>
            <button type="button" disabled={!selectedReceiver || selectedReceiver.id === "legacy"} onClick={() => setRiskModalOpen(true)} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 text-[10px] font-semibold text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]/80 disabled:cursor-not-allowed disabled:opacity-40"><Settings2 size={13} /> Régler le risque</button>
          </section>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.7fr]">
          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-6">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-semibold text-white">Compte Master (source)</div><div className="mt-1 text-[10px] text-white/35">Compte sélectionné pour piloter la copie</div></div><State active={Boolean(approvedMaster)} label={approvedMaster ? "Approuvé" : "À approuver"} /></div>
            <div className="mt-4 rounded-[18px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 md:mt-5 md:rounded-[22px] md:p-4">
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="break-words text-lg font-semibold leading-tight text-white md:text-2xl">{approvedMaster?.alias || "Aucun Master approuvé"}</div><div className="mt-1 text-[10px] text-white/40 md:text-[11px]">{approvedMaster ? `#${approvedMaster.login} • ${approvedMaster.server}` : "La demande de Master doit être approuvée par un administrateur."}</div></div><button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/70 md:h-10 md:w-10"><Settings2 size={15} /></button></div>
              <div className="mt-3 grid grid-cols-3 gap-2 md:mt-5 md:gap-3">{[["Equity", masterEquity == null ? "—" : money(masterEquity, masterCurrency)], ["Solde", masterBalance == null ? "En attente de sync" : money(masterBalance, masterCurrency)], ["P&L jour", masterPnl == null ? "—" : money(masterPnl, masterCurrency)]].map(([label, value], index) => <div key={label} className="min-w-0 rounded-lg border border-white/[0.06] bg-black/20 p-2 md:rounded-xl md:p-3"><div className="text-[7px] uppercase tracking-[0.06em] text-white/30 md:text-[9px] md:tracking-[0.08em]">{label}</div><div className={cn("mt-1 break-words text-[10px] font-semibold leading-snug md:mt-2 md:text-lg", index === 2 && Number(masterPnl) > 0 ? "text-emerald-400" : index === 2 && Number(masterPnl) < 0 ? "text-red-400" : "text-white")}>{value}</div></div>)}</div>
              {approvedMaster && masterBalance == null ? <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3 text-[10px] leading-5 text-white/55">
                <div className={cn("font-semibold", masterSyncFailed ? "text-red-300" : "text-amber-200")}>{masterSyncFailed ? "Échec de la synchronisation MetaSync" : "Solde non synchronisé"}</div>
                <p className="mt-1">{masterSyncFailed ? "Aucun solde n’a été confirmé par le connecteur. Relance MetaSync ici ; le système reprendra les identifiants chiffrés du Master et n’affichera pas un zéro trompeur." : "Autorise MetaSync pour relier ce Master approuvé à la synchronisation des soldes. Tes identifiants déjà chiffrés seront transmis côté serveur ; ils ne seront jamais affichés ni journalisés."}</p>
                <label className="mt-3 flex cursor-pointer items-start gap-2"><input type="checkbox" checked={masterSyncConsent} onChange={(event) => setMasterSyncConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" /><span>J’autorise InvestPro à créer une connexion MetaSync pour ce compte et à conserver ses identifiants chiffrés afin de synchroniser le solde et l’equity.</span></label>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block"><span className="mb-1 block text-[9px] text-white/45">Devise exacte</span><input className="ip-field" maxLength={3} value={masterSyncCurrency} onChange={(event) => setMasterSyncCurrency(event.target.value.toUpperCase())} placeholder="USD, EUR…" /></label>
                  <label className="block"><span className="mb-1 block text-[9px] text-white/45">Type de compte</span><select className="ip-field" value={masterSyncType} onChange={(event) => setMasterSyncType(event.target.value as typeof masterSyncType)}><option value="">Choisir</option><option value="real">Réel</option><option value="demo">Démo</option><option value="prop">Prop firm</option></select></label>
                </div>
                {masterSyncMessage ? <p role="status" className="mt-2 text-[9px] leading-4 text-white/70">{masterSyncMessage}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={masterSyncBusy || !masterSyncConsent || !/^[A-Z]{3}$/.test(masterSyncCurrency.trim()) || !masterSyncType} onClick={() => void startMasterSync()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] px-3 font-semibold text-emerald-200 disabled:opacity-40">{masterSyncBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Synchroniser ce Master</button><a href="/dashboard/comptes" className="inline-flex min-h-9 items-center rounded-lg border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 font-semibold text-[color:var(--gold)]">Ouvrir Mes comptes</a></div>
              </div> : null}
            </div>

          </section>

          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div id="copier-receivers" className="scroll-mt-24 text-lg font-semibold text-white">Comptes receveurs ({virtualReceivers.length})</div><div className="mt-1 text-[11px] text-white/40">Sélectionnez un compte pour configurer ses paramètres de copie.</div></div><button onClick={openAddReceiver} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black"><Plus size={15} /> Ajouter un compte receveur</button></div>
            <div className="mt-5 overflow-hidden rounded-[20px] border border-white/[0.07]">
              <div className="hidden grid-cols-[56px_1.7fr_.7fr_.8fr_.9fr_.9fr_.8fr_.75fr_.9fr] gap-3 border-b border-white/[0.06] bg-black/25 px-4 py-3 text-[9px] font-bold uppercase tracking-[0.08em] text-white/30 xl:grid"><div></div><div>Nom du compte</div><div>Plateforme</div><div>Statut</div><div>Solde</div><div>Equity</div><div>P&L jour</div><div>Ouverts</div><div>Actions</div></div>
              {virtualReceivers.length === 0 ? <div className="p-10 text-center text-white/40">Aucun receveur pour le moment.</div> : virtualReceivers.map((receiver) => {
                const s = receiver.id === "legacy" ? { balance: null, equity: null, pnl: null, open: null, currency: "USD", lastSync: null } : statsFor(receiver);
                const hostedSyncError = hostedAccountSyncs.some((row) => {
                  const connection = row.investpro_mt_connections;
                  return row.active !== false && row.status === "error" && connection &&
                    connection.login?.trim() === receiver.login.trim() &&
                    connection.platform?.toUpperCase() === receiver.platform &&
                    connection.server?.trim().toLowerCase() === receiver.server.trim().toLowerCase() &&
                    !connection.last_sync && row.equity == null;
                });
                const selected = selectedReceiverId === receiver.id;
                return <div key={receiver.id} className={cn("grid grid-cols-1 gap-3 border-b border-white/[0.05] px-4 py-4 last:border-0 xl:grid-cols-[56px_1.7fr_.7fr_.8fr_.9fr_.9fr_.8fr_.75fr_.9fr] xl:items-center", selected ? "bg-[color:var(--gold-soft)]" : "bg-black/10 hover:bg-white/[0.02]") }><div className="flex items-center"><button onClick={() => void selectReceiver(receiver.id)} className={cn("flex h-6 w-6 items-center justify-center rounded-md border text-[10px]", selected ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/50")}>{selected ? <Check size={13} /> : null}</button></div><button onClick={() => void selectReceiver(receiver.id)} className="text-left"><div className="text-sm font-semibold text-white">{receiver.alias}</div><div className="mt-1 text-[10px] text-white/35">#{receiver.login}{s.lastSync ? ` · MetaSync ${new Date(s.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>{hostedSyncError ? <div className="mt-1 text-[9px] leading-4 text-red-300">MetaSync en échec · aucun solde confirmé. Vérifie les identifiants et le serveur puis relance l’ajout.</div> : null}</button><div className="text-[11px] font-semibold text-[color:var(--gold)]">{receiver.platform}</div><div><ReceiverStatusBadge status={receiver.status} /></div><div className="text-[11px] text-white/70">{money(s.balance, s.currency)}</div><div className="text-[11px] text-white/70">{money(s.equity, s.currency)}</div><div className={cn("text-[11px] font-medium", Number(s.pnl) > 0 ? "text-emerald-400" : Number(s.pnl) < 0 ? "text-red-400" : "text-white/60")}>{s.pnl == null ? "—" : money(s.pnl, s.currency)}</div><div className="text-[11px] text-white/70">{s.open == null ? "—" : String(s.open)}</div><div className="flex items-center gap-2"><button onClick={() => { setShowStats(true); void selectReceiver(receiver.id); }} aria-label={`Statistiques de ${receiver.alias}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white xl:h-8 xl:w-8 xl:rounded-lg"><Activity size={14} /></button><button onClick={() => void selectReceiver(receiver.id)} aria-label={`Configurer ${receiver.alias}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white xl:h-8 xl:w-8 xl:rounded-lg"><Settings2 size={14} /></button>{receiver.id !== "legacy" ? <button onClick={() => { setRemoveReceiverId(receiver.id); setDisconnectConsent(false); setRemoveError(""); }} aria-label={`Retirer ${receiver.alias}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 xl:h-8 xl:w-8 xl:rounded-lg"><Unplug size={14} /></button> : null}</div></div>;
              })}
            </div>
            {virtualReceivers.some((receiver) => receiver.id !== "legacy" && (() => { const stats = statsFor(receiver); return stats.balance == null || stats.equity == null; })()) ? <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3 text-[10px] leading-5 text-white/55 sm:flex-row sm:items-center sm:justify-between"><span>Les comptes receveurs reprennent automatiquement les soldes disponibles dans MetaSync. Si un chiffre manque, relie ce même compte dans Mes comptes.</span><a href="/dashboard/comptes" className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 font-semibold text-[color:var(--gold)]">Ouvrir Mes comptes</a></div> : null}
          </section>
        </section>

        {selectedReceiver ? (
          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div id="copier-masters" className="scroll-mt-24 text-lg font-semibold text-white">Réseau de copie</div>
                <div className="mt-1 text-[11px] text-white/40">Vérifie le compte source, le receveur et leur état de liaison.</div>
              </div>
              {selectedReceiver.id !== "legacy" ? <button type="button" onClick={() => { setRemoveReceiverId(selectedReceiver.id); setDisconnectConsent(false); setRemoveError(""); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 text-[11px] font-semibold text-red-300"><Unplug size={13} /> Retirer ce receveur</button> : null}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
              <div className="rounded-[18px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">Compte Master · source</div><div className="flex items-center gap-2"><State active={Boolean(approvedMaster)} label={approvedMaster ? "Validé" : "À configurer"} />{approvedMasterReceiver ? <ReceiverStatusBadge status={approvedMasterReceiver.status} /> : approvedMaster ? <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[8px] font-semibold text-white/45">État inconnu</span> : null}</div></div>
                <div className="mt-3 text-lg font-semibold text-white">{approvedMaster?.alias || "Aucun Master validé"}</div>
                <div className="mt-1 text-[10px] text-white/50">{approvedMaster ? `#${approvedMaster.login} · ${approvedMaster.platform} · ${approvedMaster.server}` : "Demande de Master à faire approuver."}</div>
                <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3 text-[10px] text-white/50"><ShieldCheck size={14} className="text-[color:var(--gold)]" />{approvedMasterReceiver?.status === "connected" ? `Connecté${approvedMasterReceiver.last_connected_at ? ` · ${new Date(approvedMasterReceiver.last_connected_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}` : approvedMasterReceiver?.status === "paused" ? "Connexion en pause" : approvedMasterReceiver?.status === "error" ? "Connexion à vérifier" : approvedMaster ? "Master validé · état de connexion non remonté" : "Aucune source approuvée"}</div>
              </div>

              <div className="flex min-h-16 flex-col items-center justify-center gap-1.5 px-3 text-center md:min-w-[145px]">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-full border", error ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-300" : enabled && activeMasters.length > 0 && selectedStatus?.isTradingAccountConnected ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300" : "border-white/[0.08] bg-white/[0.03] text-white/40")}><ChevronDown size={18} className="md:-rotate-90" /></span>
                <span className={cn("text-[9px] font-semibold", error ? "text-amber-300" : enabled && activeMasters.length > 0 && selectedStatus?.isTradingAccountConnected ? "text-emerald-300" : "text-white/55")}>{error ? "Statut indisponible" : enabled && activeMasters.length > 0 && selectedStatus?.isTradingAccountConnected ? "Copie active" : activeMasters.length > 0 ? "Liaison configurée" : selectedStatus ? "Liaison à configurer" : "En attente de vérification"}</span>
                <span className="text-[8px] leading-4 text-white/35">{error ? message : selectedStatus ? `${activeMasters.length} Master${activeMasters.length > 1 ? "s" : ""} associé${activeMasters.length > 1 ? "s" : ""}` : "Connexion non vérifiable sur cet environnement"}</span>
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">Compte receveur</div><ReceiverStatusBadge status={selectedReceiver.status} /></div>
                <div className="mt-3 text-lg font-semibold text-white">{selectedReceiver.alias}</div>
                <div className="mt-1 text-[10px] text-white/50">#{selectedReceiver.login} · {selectedReceiver.platform} · {selectedReceiver.server}</div>
        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3 text-[10px] text-white/50"><Activity size={14} className={selectedReceiver.status === "connected" ? "text-emerald-300" : "text-white/35"} />{selectedStatus ? selectedStatus.isTradingAccountConnected ? "Connexion confirmée par le moteur de copie" : "Connexion non confirmée par le moteur de copie" : selectedReceiver.status === "connected" ? "Connecté dans InvestPro · vérification indisponible" : "En attente de connexion"}</div>
              </div>
            </div>

            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">Liaisons Master disponibles</div><div className="mt-1 text-[10px] text-white/40">Choisis les sources que ce receveur doit suivre.</div></div>{!selectedStatus || error ? <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] px-3 text-[10px] font-semibold text-white/65 disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Vérifier</button> : null}</div>
              <div className="mt-3 space-y-3">
                {!selectedStatus || error ? (
                  <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.035] p-4 text-[10px] leading-5 text-amber-100/70">{error ? `Impossible de confirmer les liaisons : ${message}` : "Les liaisons seront affichées dès que le statut du moteur sera disponible."}</div>
                ) : selectedStatus.masterAccountsList.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-[10px] leading-5 text-white/45">Aucune liaison Master n’est disponible pour ce receveur.</div>
                ) : selectedStatus.masterAccountsList.map((master, index) => {
                  const current = selectedMasters[master.id] || { on: false, lots: masterQuickValue || "0.01" };
                  return <div key={master.id} className={cn("rounded-[18px] border p-4 transition", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.07] bg-black/20")}>
                    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[44px_minmax(0,1fr)_auto_120px]">
                      <button type="button" aria-label={`${current.on ? "Désactiver" : "Activer"} ${master.name}`} onClick={() => toggleMaster(master.id)} className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/50")}>{current.on ? <Check size={15} /> : null}</button>
                      <div><div className="text-sm font-semibold text-white">{master.name}</div><div className="mt-1 text-[10px] text-white/40">MASTER {String(index + 1).padStart(2, "0")} · {current.on ? "Liaison active" : "Non relié"}</div></div>
                      <div className="text-right md:text-left"><div className="text-[9px] text-white/40">Mode</div><div className="mt-1 text-[10px] font-semibold text-[color:var(--gold)]">{riskModeLabel(riskSettings.mode)}</div></div>
                      {riskSettings.mode === "fixed" ? <Field label="Lots"><input type="number" min="0.001" max={maxLots} step="any" value={current.lots} disabled={!current.on} onChange={(e) => changeLots(master.id, e.target.value)} className="ip-field disabled:opacity-35" /></Field> : <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-[10px] text-white/45">Géré automatiquement</div>}
                    </div>
                  </div>;
                })}
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[11px] leading-5 text-white/55"><input type="checkbox" checked={masterConsent} onChange={(e) => { setMasterConsent(e.target.checked); setSaveBarState("idle"); setSaveBarMessage("Configuration non enregistrée"); }} className="mt-0.5 h-4 w-4 accent-[#d4a934]" /> Je confirme le compte Master sélectionné.</label>
              <div className="mt-4 flex justify-end"><button type="button" disabled={!selectedReceiver || activeMasters.length === 0 || !masterConsent || !selectedStatus || error} onClick={() => setRiskModalOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 py-3 text-xs font-semibold text-black disabled:opacity-40"><Settings2 size={15} /> Continuer : configurer le risque</button></div>
            </div>
          </section>
        ) : <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 text-sm text-white/50">Ajoute un compte receveur pour commencer.</section>}

        {selectedReceiver && riskModalOpen && typeof document !== "undefined" ? createPortal(<div className="fixed inset-0 z-[10000] flex min-h-full items-start justify-center overflow-y-auto bg-black/80 px-3 py-6 backdrop-blur-sm md:px-8 md:py-8"><div className="my-auto w-full max-w-[1120px]">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--gold-border)] bg-[#101310] p-4"><div><div className="font-semibold text-white">Configurer le risque de copie</div><div className="mt-1 text-xs text-white/50">{approvedMaster?.alias || "Master"} → {selectedReceiver.alias} : un seul enregistrement final</div></div><button onClick={() => setRiskModalOpen(false)} className="rounded-xl border border-white/10 p-2 text-white" aria-label="Fermer"><X size={18}/></button></div>
          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xl font-semibold text-white">Paramètres de copie — {selectedReceiver.alias}</div><p className="mt-1 text-[11px] text-white/40">Configurez la stratégie de copie et les paramètres de gestion du risque pour ce compte receveur.</p></div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-semibold text-emerald-400"><CheckCircle2 size={12} /> Compte sélectionné</span><button onClick={() => setShowStats((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-[10px] font-semibold text-[color:var(--gold)]"><Activity size={13} /> {showStats ? "Masquer les statistiques" : "Voir les statistiques"}</button></div></div><div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2"><section className="hidden rounded-[22px] border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-bold text-black">1</span><div><div className="text-base font-semibold text-white">Choisir le receveur</div><div className="mt-1 text-[10px] text-white/35">Compte qui recevra les trades</div></div></div><div className="mt-4 rounded-[18px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">{selectedReceiver.alias}</div><div className="mt-1 text-[10px] text-white/35">#{selectedReceiver.login} · {selectedReceiver.platform} · {selectedReceiver.server}</div></div><State active={selectedReceiver.status === "connected"} label={selectedReceiver.status === "connected" ? "Connecté" : selectedReceiver.status === "paused" ? "Pause" : "Erreur"} /></div><select value={selectedReceiverId || ""} onChange={(e) => void selectReceiver(e.target.value)} className="ip-field mt-4">{virtualReceivers.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.alias} — {receiver.login}</option>)}</select><div className="mt-3 text-[10px] text-white/35">Tu peux changer de receveur ici pour configurer un autre compte sans quitter la page.</div></div></section><section className="rounded-[22px] border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-bold text-black">2</span><div><div className="text-base font-semibold text-white">Régler le risque</div><div className="mt-1 text-[10px] text-white/35">Choisissez la méthode de calcul des lots.</div></div></div><div className="mt-4 space-y-3"><InlineRiskOption active={riskSettings.mode === "fixed"} label="Lots fixes" desc="Volume identique défini par stratégie" onClick={() => setRiskSettings((v) => ({ ...v, mode: "fixed" }))}><input type="number" min="0.001" step="0.001" value={masterQuickValue} onChange={(e) => applyQuickModeToSelectedMasters(e.target.value)} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "mirror"} label="Copier les lots du Master" desc="Même lot que le master avec multiplicateur" onClick={() => setRiskSettings((v) => ({ ...v, mode: "mirror" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.mirror_multiplier} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "mirror", mirror_multiplier: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "balance"} label="Risque par solde" desc="Sizing basé sur le ratio de balance" onClick={() => setRiskSettings((v) => ({ ...v, mode: "balance" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.balance_multiplier} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "balance", balance_multiplier: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "equity"} label="Risque par equity" desc="Sizing basé sur le ratio d’equity" onClick={() => setRiskSettings((v) => ({ ...v, mode: "equity" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.equity_multiplier} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "equity", equity_multiplier: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "percent"} label="Risque en %" desc="Pourcentage de capital risqué par trade" onClick={() => setRiskSettings((v) => ({ ...v, mode: "percent" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.risk_percent} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "percent", risk_percent: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption></div></section><section className="rounded-[22px] border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-bold text-black">3</span><div><div className="text-base font-semibold text-white">Paramètres avancés</div><div className="mt-1 text-[10px] text-white/35">Protection, exécution et filtres.</div></div></div><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><RiskNumber label="Slippage max" value={riskSettings.slippage_pips} min={0} max={1000} step={1} suffix="pips" onChange={(value) => setRiskSettings((v) => ({ ...v, slippage_pips: value }))} /><RiskNumber label="Lots maximum" value={riskSettings.max_lots} min={0.01} max={1000} step={0.01} suffix="lots" onChange={(value) => setRiskSettings((v) => ({ ...v, max_lots: value }))} /><RiskNumber label="Multiplicateur des lots" value={riskSettings.mirror_multiplier} min={0.1} max={20} step={0.1} suffix="x" onChange={(value) => setRiskSettings((v) => ({ ...v, mirror_multiplier: value }))} /><RiskNumber label="Risque en %" value={riskSettings.risk_percent} min={0.1} max={20} step={0.1} suffix="%" onChange={(value) => setRiskSettings((v) => ({ ...v, risk_percent: value }))} /></div><div className="mt-4 space-y-3"><ToggleSetting label="Copier uniquement certains symboles" description="Préparez un filtrage personnalisé par symboles." checked={Boolean(riskSettings.symbol_mapping)} onChange={(checked) => setRiskSettings((v) => ({ ...v, symbol_mapping: checked ? v.symbol_mapping || "XAUUSD=GOLD" : "" }))} /><ToggleSetting label="Heures de trading autorisées" description="Option avancée de filtrage horaire." checked={riskSettings.drawdown_enabled} onChange={(checked) => setRiskSettings((v) => ({ ...v, drawdown_enabled: checked }))} /></div><Field label="Configuration / notes avancées"><textarea value={riskSettings.symbol_mapping} onChange={(e) => setRiskSettings((v) => ({ ...v, symbol_mapping: e.target.value }))} className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-black/25 p-3 text-[11px] leading-5 text-white outline-none focus:border-[color:var(--gold-border)]" placeholder={`Ex. XAUUSD=GOLD\nUS30=DJ30`} /></Field></section></div></section><div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[color:var(--gold-border)] bg-[#101310] p-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={masterConsent} onChange={(e) => setMasterConsent(e.target.checked)} /> Je confirme la configuration de la copie</label><button disabled={busy || riskBusy || !masterConsent} onClick={() => void saveAll()} className="rounded-xl bg-[color:var(--gold)] px-5 py-3 text-sm font-bold text-black disabled:opacity-40">{saveBarState === "saving" ? "Enregistrement…" : "Enregistrer et terminer"}</button></div></div></div>, document.body) : null}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-1"><section className="hidden rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-lg font-semibold text-white">Liaisons Master</div><div className="mt-1 text-[11px] text-white/35">Active les masters que ce receveur doit copier.</div></div>{selectedReceiver && selectedReceiver.id !== "legacy" ? <button onClick={() => { setRemoveReceiverId(selectedReceiver.id); setDisconnectConsent(false); setRemoveError(""); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 text-[11px] font-semibold text-red-300"><Unplug size={13} /> Retirer ce receveur</button> : null}</div><div className="mt-5 space-y-3">{(selectedStatus?.masterAccountsList || []).length === 0 ? <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-6 text-[11px] text-white/40">Aucune liaison master disponible pour le moment.</div> : (selectedStatus?.masterAccountsList || []).map((master, index) => { const current = selectedMasters[master.id] || { on: false, lots: masterQuickValue || "0.01" }; return <div key={master.id} className={cn("rounded-[18px] border p-4 transition", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.07] bg-black/20")}><div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr_auto_auto] md:items-center"><button onClick={() => toggleMaster(master.id)} className={cn("flex h-7 w-7 items-center justify-center rounded-md border", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/50")}>{current.on ? <Check size={14} /> : null}</button><div><div className="text-sm font-semibold text-white">{master.name}</div><div className="mt-1 text-[10px] text-white/35">MASTER {String(index + 1).padStart(2, "0")} · {current.on ? "Actif" : "Pause"}</div></div><div className="text-[10px] text-white/50">Mode</div><div className="text-[11px] font-semibold text-[color:var(--gold)]">{riskModeLabel(riskSettings.mode)}</div></div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_110px] md:items-end"><div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] text-white/40">Cette liaison utilisera les paramètres du bloc “Régler le risque”.</div>{riskSettings.mode === "fixed" ? <Field label="Lots"><input type="number" min="0.001" max={maxLots} step="any" value={current.lots} disabled={!current.on} onChange={(e) => changeLots(master.id, e.target.value)} className="ip-field disabled:opacity-35" /></Field> : <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-[10px] text-white/45">Géré automatiquement</div>}<State active={current.on} label={current.on ? "Actif" : "Pause"} /></div></div>; })}</div><label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[11px] leading-5 text-white/55"><input type="checkbox" checked={masterConsent} onChange={(e) => { setMasterConsent(e.target.checked); setSaveBarState("idle"); setSaveBarMessage("Configuration non enregistrée"); }} className="mt-0.5 h-4 w-4 accent-[#d4a934]" /> Je confirme les stratégies et volumes sélectionnés.</label></section><section className="space-y-5"><section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-5"><div className="text-sm font-semibold text-white">Activité &amp; état du système</div><div className="mt-1 text-[10px] text-white/40">Derniers états connus, sans inventer d’évènements de trading.</div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3"><div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/[0.08] text-cyan-200"><RefreshCw size={14} /></span><div><div className="text-[10px] font-semibold text-white/80">Vérification des comptes</div><div className="mt-1 text-[9px] text-white/40">{checked || "En attente de synchronisation"}</div></div></div><div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/[0.08] text-emerald-300"><ShieldCheck size={14} /></span><div><div className="text-[10px] font-semibold text-white/80">Réglages de risque</div><div className="mt-1 text-[9px] text-white/40">{riskSaveState === "saved" ? `Enregistrés${riskSavedAt ? ` · ${riskSavedAt}` : ""}` : riskSaveState === "pending" ? "Validation en attente" : "État non confirmé"}</div></div></div><div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><Link2 size={14} /></span><div><div className="text-[10px] font-semibold text-white/80">Liaisons Master</div><div className="mt-1 text-[9px] text-white/40">{activeMasters.length} liaison{activeMasters.length > 1 ? "s" : ""} active{activeMasters.length > 1 ? "s" : ""}</div></div></div></div></section>{showStats ? <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="text-lg font-semibold text-white">Statistiques du compte sélectionné</div><div className="mt-4 grid grid-cols-2 gap-3"><Summary label="Solde" value={selectedStats.balance == null ? "—" : money(selectedStats.balance, selectedStats.currency)} /><Summary label="Equity" value={selectedStats.equity == null ? "—" : money(selectedStats.equity, selectedStats.currency)} /><Summary label="P&L jour" value={selectedStats.pnl == null ? "—" : money(selectedStats.pnl, selectedStats.currency)} green={Number(selectedStats.pnl) > 0} /><Summary label="Positions ouvertes" value={selectedStats.open == null ? "—" : String(selectedStats.open)} /></div></section> : null}</section></section>

        </div>
      </main>

      {removeReceiverId && (() => {
        const target = receivers.find((r) => r.id === removeReceiverId);
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Supprimer un receveur">
            <div className="w-full max-w-lg rounded-[24px] border border-red-500/30 bg-[#0b0d0b] p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-white">Supprimer ce receveur ?</h2><button disabled={removeBusy} onClick={() => { setRemoveReceiverId(null); setDisconnectConsent(false); }} aria-label="Fermer" className="rounded-lg p-2 text-white/60"><X size={18}/></button></div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/80"><strong>{target?.alias || "Compte receveur"}</strong><div className="mt-1 text-xs text-white/45">{target?.platform} · {target?.login} · {target?.server}</div></div>
              <p className="mt-4 text-sm leading-6 text-white/60">La copie sera d’abord déconnectée du moteur. Ce receveur sera ensuite retiré de la liste InvestPro. Tu pourras le rajouter plus tard via « Ajouter un compte receveur ».</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-white/80"><input type="checkbox" className="mt-1 accent-red-500" checked={disconnectConsent} disabled={removeBusy} onChange={(e) => setDisconnectConsent(e.target.checked)} />Je confirme la déconnexion et la suppression de ce compte receveur.</label>
              {removeError ? <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{removeError}<span className="mt-1 block text-xs">Aucun compte n’est retiré de la liste tant que l’opération n’est pas entièrement confirmée.</span></p> : null}
              <div className="mt-6 flex justify-end gap-3"><button disabled={removeBusy} onClick={() => { setRemoveReceiverId(null); setDisconnectConsent(false); }} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70">Annuler</button><button disabled={!disconnectConsent || removeBusy} onClick={() => void removeReceiver()} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{removeBusy ? <Loader2 size={15} className="animate-spin"/> : <Unplug size={15}/>}Déconnecter et supprimer</button></div>
            </div>
          </div>
        );
      })()}

      {requestOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/[0.06] p-5 md:p-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[8px] font-bold uppercase text-[color:var(--gold)]">
                  <Send size={11} /> Ajout à InvestPro Copier
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  Ajouter mon compte à InvestPro Copier
                </h2>
                <p className="mt-1 max-w-xl text-[10px] leading-5 text-white/35">
                  Envoie les informations MT4/MT5 à l’équipe InvestPro. Nous
                  activons le compte dans notre infrastructure de copie, puis il apparaîtra
                  automatiquement dans InvestPro Copier.
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
                      effectuer l’activation technique du compte.
                    </p>
                  </div>
                </div>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4 text-[10px] leading-5 text-white/60">
                <input type="checkbox" checked={requestForm.syncConsent} onChange={(e) => setRequestForm((v) => ({ ...v, syncConsent: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-500" />
                <span>Pour afficher automatiquement le solde après approbation, j’autorise aussi InvestPro à créer la connexion MetaSync et à conserver mes identifiants chiffrés si le serveur est pris en charge. Cette autorisation est facultative.</span>
              </label>
              {requestForm.syncConsent ? <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 sm:grid-cols-2">
                <Field label="Devise du compte"><input className="ip-field" required maxLength={3} value={requestForm.syncCurrency} onChange={(e) => setRequestForm((v) => ({ ...v, syncCurrency: e.target.value.toUpperCase() }))} placeholder="USD" /></Field>
                <Field label="Type de compte"><select className="ip-field" required value={requestForm.syncType} onChange={(e) => setRequestForm((v) => ({ ...v, syncType: e.target.value as "real" | "demo" | "prop" }))}><option value="real">Réel</option><option value="demo">Démo</option><option value="prop">Prop firm</option></select></Field>
                {(() => { const selectedServer = (requestServerChoice === "__OTHER__" ? requestForm.server : requestServerChoice).trim().toLowerCase(); const supported = hostedBrokers.some((item) => item.platform.toUpperCase() === requestForm.platform && item.server.trim().toLowerCase() === selectedServer); return <p className={cn("sm:col-span-2 text-[9px] leading-5", supported ? "text-emerald-300/70" : "text-amber-200/70")}>{supported ? "Serveur compatible : MetaSync démarrera lorsque l’équipe aura approuvé le Master." : "Ce serveur n’est pas dans le catalogue MetaSync. La demande Master pourra être envoyée, mais son solde ne sera pas synchronisé automatiquement."}</p>; })()}
              </div> : null}

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

      {addOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/75 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-sm md:items-center md:overflow-hidden md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="add-receiver-title" className="my-auto flex max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_24px)] w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-2xl md:max-h-[90vh] md:rounded-[26px]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] bg-[#0b0d0b] p-4 md:p-6"><div className="min-w-0"><div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[8px] font-bold uppercase text-[color:var(--gold)]"><Plus size={11} /> Nouveau receveur</div><h2 id="add-receiver-title" className="mt-3 text-xl font-semibold text-white">Ajouter un compte</h2><p className="mt-1 text-[10px] leading-5 text-white/35">Connexion uniquement. Aucun lot ni risque à régler ici.</p></div><button onClick={closeAddReceiver} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-white/45" aria-label="Fermer"><X size={17} /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(20px+env(safe-area-inset-bottom))] md:p-6">
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
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] leading-5 text-white/50"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d4a934]" />J’autorise InvestPro à transmettre ces identifiants au moteur de copie pour établir et maintenir la connexion.</label>
              <label className="mt-3 flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4 text-[10px] leading-5 text-white/55"><input type="checkbox" checked={syncConsent} onChange={(e) => setSyncConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" /><span>Pour afficher automatiquement le solde et l’equity, j’autorise aussi InvestPro à créer la connexion MetaSync et à conserver mes identifiants chiffrés, si le serveur est pris en charge. Cette autorisation est facultative.</span></label>
              {syncConsent ? <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 sm:grid-cols-2">
                <Field label="Devise du compte"><input className="ip-field" required maxLength={3} pattern="[A-Z]{3}" value={accountCurrency} onChange={(e) => setAccountCurrency(e.target.value.toUpperCase())} placeholder="USD" /></Field>
                <Field label="Type de compte"><select className="ip-field" required value={accountType} onChange={(e) => setAccountType(e.target.value as "real" | "demo" | "prop")}><option value="real">Réel</option><option value="demo">Démo</option><option value="prop">Prop firm</option></select></Field>
                {(() => { const selectedServer = (serverChoice === "__OTHER__" ? customServer : serverChoice).trim().toLowerCase(); const supported = hostedBrokers.some((item) => item.platform.toUpperCase() === platform && item.server.trim().toLowerCase() === selectedServer); return <p className={cn("sm:col-span-2 text-[9px] leading-5", supported ? "text-emerald-300/70" : "text-amber-200/70")}>{supported ? "Serveur compatible : la synchronisation démarrera après l’ajout." : "Ce serveur n’apparaît pas encore dans le catalogue MetaSync. Le compte pourra être ajouté au Copier, mais son solde ne sera pas synchronisé automatiquement."}</p>; })()}
              </div> : null}
              <div className="mt-5 flex items-center justify-between gap-3"><div className="max-w-md text-[8px] leading-4 text-white/30">Le mot de passe n’est pas écrit dans copier_receivers. MetaSync ne le reçoit que si tu coches l’autorisation ci-dessus et que le serveur est compatible.</div><button disabled={busy || !consent} onClick={() => void addReceiver()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Connecter ce compte</button></div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      <style jsx global>{`.ip-field{height:42px;width:100%;min-width:0;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.28);padding:0 12px;color:white;font-size:12px;outline:none}.ip-field:focus{border-color:var(--gold-border)}.ip-field::placeholder{color:rgba(255,255,255,.22)}.ip-field option{background:#0b0d0b;color:white}`}</style>
    </>
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
function Risk({
  active = false,
  label,
  desc,
  onClick,
}: {
  active?: boolean;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
        active
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.06] bg-black/20 hover:bg-white/[0.02]"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border",
          active
            ? "border-[color:var(--gold-border)] text-[color:var(--gold)]"
            : "border-white/[0.07] text-white/30"
        )}
      >
        <Target size={13} />
      </div>
      <div className="flex-1">
        <div className="text-[10px] font-semibold text-white">{label}</div>
        <div className="mt-0.5 text-[8px] text-white/30">{desc}</div>
      </div>
      {active ? (
        <CheckCircle2 size={14} className="text-emerald-400" />
      ) : null}
    </button>
  );
}

function RiskNumber({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => {
            const n = Number(event.target.value);
            onChange(Number.isFinite(n) ? n : min);
          }}
          className="ip-field pr-14"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-white/30">
          {suffix}
        </span>
      </div>
    </Field>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-left"
    >
      <div>
        <div className="text-[9px] font-semibold text-white/70">{label}</div>
        <div className="mt-1 text-[8px] leading-4 text-white/30">
          {description}
        </div>
      </div>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition",
          checked
            ? "border-emerald-500/30 bg-emerald-500/20"
            : "border-white/[0.08] bg-white/[0.03]"
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition",
            checked
              ? "left-[22px] bg-emerald-400"
              : "left-[4px] bg-white/35"
          )}
        />
      </span>
    </button>
  );
}
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
function HeroStatCard({ icon, label, value, sub, accent, accentPositive }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: string; accentPositive?: boolean }) { return <div className="rounded-[16px] border border-white/[0.07] bg-black/25 p-3 sm:rounded-[20px] sm:p-4"><div className="flex items-start gap-2 sm:gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] sm:h-12 sm:w-12 sm:rounded-2xl">{icon}</div><div className="min-w-0 flex-1"><div className="text-[9px] leading-tight text-white/40 sm:text-[10px]">{label}</div><div className="mt-1 text-xl font-semibold leading-tight text-white sm:text-3xl">{value}</div><div className="mt-1 flex flex-wrap items-center gap-1 sm:gap-2"><span className="text-[9px] leading-tight text-white/35 sm:text-[10px]">{sub}</span>{accent ? <span className={cn("text-[9px] font-semibold sm:text-[10px]", accentPositive ? "text-emerald-400" : "text-[color:var(--gold)]")}>{accent}</span> : null}</div></div></div></div>; }
function MiniMetric({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) { return <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-[0.08em] text-white/30">{label}</div><div className={cn("mt-2 text-lg font-semibold", positive ? "text-emerald-400" : negative ? "text-red-400" : "text-white")}>{value}</div></div>; }
function ReceiverStatusBadge({ status }: { status: Receiver['status'] }) { const styles = status === 'connected' ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400' : status === 'paused' ? 'border-white/[0.08] bg-white/[0.03] text-white/55' : 'border-red-500/20 bg-red-500/[0.05] text-red-300'; const label = status === 'connected' ? 'Connecté' : status === 'paused' ? 'Pause' : 'Erreur'; return <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase', styles)}>{label}</span>; }
function InlineRiskOption({ active, label, desc, onClick, children }: { active: boolean; label: string; desc: string; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn("grid w-full grid-cols-[auto_1fr_132px] items-center gap-3 rounded-xl border p-3 text-left transition", active ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.06] bg-black/20 hover:bg-white/[0.02]")}><span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", active ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/15 text-transparent")}>{active ? <Check size={12} /> : '•'}</span><span className="min-w-0"><span className="block text-[11px] font-semibold text-white">{label}</span><span className="mt-0.5 block text-[9px] text-white/35">{desc}</span></span><span onClick={(e) => e.stopPropagation()}>{children}</span></button>; }
