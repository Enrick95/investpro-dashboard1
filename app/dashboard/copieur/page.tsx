"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  Send,
  RefreshCw,
  Settings2,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SthStatus } from "@/lib/sth/client";
import CopierIntro from "@/components/copier/CopierIntro";
import { buildCopierAccountMetrics, aggregateCopierPnl, type HostedCopierAccountSync } from "@/lib/copier/account-metrics";
import { loadCopierDaySnapshot } from "@/lib/copier/day-result-loader";
import { aggregateCopierDayResult, type CopierDaySnapshot } from "@/lib/copier/day-result";
import { sendHostedMutation } from "@/lib/metasync/hosted-request-client";
import { connectionStateLabel, type ConnectionState } from "@/lib/copier/connection-network";

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
  if (mode === "mirror") return "Multiplicateur";
  if (mode === "balance") return "Proportionnel au solde";
  if (mode === "equity") return "Proportionnel à l’equity";
  if (mode === "percent") return "% de risque par trade";
  return "Lots fixes";
}
type LooseAccount = Record<string, unknown>;
type HostedAccountSync = HostedCopierAccountSync;
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
  created_at?: string;
  requested_config?: { risk?: Partial<RiskSettings> } | null;
};

type Tone = "green" | "amber" | "red" | "neutral" | "gold";

const RISK_MODES: RiskMode[] = ["fixed", "mirror", "balance", "equity", "percent"];

// Panneau « Régler la copie » : seuls les lots fixes sont appliqués directement par le moteur de copie,
// les autres modes partent en demande à l'équipe.
const COPY_MODES: Array<{ mode: RiskMode; label: string; description: string; input: string }> = [
  { mode: "fixed", label: "Lots fixes", description: "Le même volume sur chaque trade copié.", input: "Lots par trade" },
  { mode: "mirror", label: "Multiplicateur", description: "Le volume du compte source multiplié par ton coefficient : × 1 copie le même volume.", input: "Coefficient" },
  { mode: "balance", label: "Proportionnel au solde", description: "Le volume suit la taille de ton compte par rapport au compte source.", input: "Coefficient" },
  { mode: "equity", label: "Proportionnel à l’equity", description: "Comme le solde, mais calculé sur l’equity, positions ouvertes comprises.", input: "Coefficient" },
  { mode: "percent", label: "% de risque par trade", description: "Une part de ton solde risquée à chaque trade. Le trade du compte source doit avoir un stop loss.", input: "% du solde par trade" },
];

const CONFIG_REQUEST_STATUS: Record<CopierConfigRequest["status"], { label: string; tone: Tone }> = {
  pending: { label: "En attente", tone: "amber" },
  processing: { label: "En traitement", tone: "amber" },
  applied: { label: "Appliqué", tone: "green" },
  rejected: { label: "Refusé", tone: "red" },
};

// Les protections ne passent pas par le moteur de copie automatiquement : une protection modifiée part en demande
// à l'équipe, même en lots fixes. Même règle que la route /api/copier/settings.
const PROTECTION_KEYS = ["copy_sl", "copy_tp", "copy_pending", "copy_modifications", "slippage_pips", "max_lots", "drawdown_enabled", "max_drawdown_percent", "symbol_mapping"] as const;

function protectionsDiffer(saved: RiskSettings, next: RiskSettings) {
  return PROTECTION_KEYS.some((key) => {
    if (key === "max_lots" && next.mode === "fixed") return false;
    if (key === "max_drawdown_percent" && !saved.drawdown_enabled && !next.drawdown_enabled) return false;
    if (key === "symbol_mapping") return String(saved.symbol_mapping || "").trim() !== String(next.symbol_mapping || "").trim();
    return Number(saved[key]) !== Number(next[key]);
  });
}

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

function formatMoney(v: unknown, c = "USD", locale: "fr" | "en" = "fr") {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function localizeCopierMessage(message: string, translate: (message: string) => string): string {
  for (const prefix of ["Compte copieur déjà relié.", "Compte copieur relié à nouveau. Vérifie son réglage avec « Régler ».", "Compte copieur relié. Règle maintenant son volume avec « Régler »."]) {
    if (message.startsWith(prefix + " ")) return translate(prefix) + " " + localizeCopierMessage(message.slice(prefix.length + 1), translate);
  }
  for (const prefix of ["Le receveur est connecté, mais MetaSync n’a pas pu être relancé :", "Le receveur est connecté, mais MetaSync n’a pas pu démarrer :"]) {
    if (message.startsWith(prefix + " ")) return translate(prefix) + " " + translate(message.slice(prefix.length + 1));
  }
  return translate(message);
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

export default function CopieurPage() {
  const { locale, t: translate } = useLocale();
  const money = (value: unknown, currency = "USD") => formatMoney(value, currency, locale);

  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [engineChecked, setEngineChecked] = useState(false);
  const [error, setError] = useState(false);
  // Hors pilote, le moteur répond 403 : la page présente alors InvestPro Copy au lieu d'un tableau de bord vide.
  const [pilotDenied, setPilotDenied] = useState(false);
  const [message, setMessage] = useState("Chargement d’InvestPro Copier…");
  const [checked, setChecked] = useState("");
  const [maxLots, setMaxLots] = useState(0.1);

  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [accounts, setAccounts] = useState<LooseAccount[]>([]);
  const [hostedAccountSyncs, setHostedAccountSyncs] = useState<HostedAccountSync[]>([]);
  const [hostedBrokers, setHostedBrokers] = useState<HostedBroker[]>([]);
  const [dailySnapshot, setDailySnapshot] = useState<CopierDaySnapshot | null>(null);
  const [dailyReadFailed, setDailyReadFailed] = useState(false);
  const [financialRefreshing, setFinancialRefreshing] = useState(false);
  const [financialRefreshError, setFinancialRefreshError] = useState(false);
  const financialRequest = useRef<Promise<void> | null>(null);
  const financialEpoch = useRef(0);
  const [legacyConnected, setLegacyConnected] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<SthStatus | null>(null);
  const [selectedMasters, setSelectedMasters] = useState<SelectedMaster>({});
  const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionState>>({});
  const [connectionNow, setConnectionNow] = useState(0);
  const [networkChecking, setNetworkChecking] = useState(false);
  const selectedReceiverRef = useRef<string | null>(null);
  const connectionStatesRef = useRef<Record<string, ConnectionState>>({});
  const connectionRequests = useRef(new Map<string, Promise<SthStatus | undefined>>());
  const connectionVersions = useRef<Record<string, number>>({});
  const networkCheckingRef = useRef(false);
  const networkReceiverIdsRef = useRef<string[]>([]);

  const setActiveReceiver = useCallback((id: string | null) => {
    selectedReceiverRef.current = id;
    setSelectedReceiverId(id);
  }, []);

  const updateConnectionState = useCallback((id: string, patch: Partial<ConnectionState>) => {
    const next = { ...connectionStatesRef.current, [id]: { ...connectionStatesRef.current[id], ...patch } };
    connectionStatesRef.current = next;
    setConnectionStates(next);
  }, []);

  const confirmConnection = useCallback((id: string, status: SthStatus) => {
    connectionVersions.current[id] = (connectionVersions.current[id] || 0) + 1;
    const now = Date.now();
    updateConnectionState(id, { snapshot: { status, checkedAt: now }, checking: false, error: false });
    setConnectionNow(now);
  }, [updateConnectionState]);

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
  const [accountCurrency, setAccountCurrency] = useState("");
  const [accountType, setAccountType] = useState<"real" | "demo" | "prop" | "">("");

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
  const [settingsLoading, setSettingsLoading] = useState(false);
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
    const requests = (data.requests || []) as ActivationRequest[];
    setActivationRequests(requests);
    return requests;
  }

  async function requestMasterRemoval() {
    if (!selectedRemovalId || removalBusy) return;
    if (!window.confirm(translate("Demander le retrait de ce compte source ? Il reste actif jusqu’à la vérification de l’équipe InvestPro."))) return;
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
      setMessage("Complète les informations du compte source : nom, numéro, serveur et mot de passe principal.");
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
      setRequestSuccess(data.message || "Ta demande de compte source est envoyée. L’équipe la vérifie et tu es prévenu dès que le compte est activé.");
      setMessage(
        data.message ||
          "Ta demande de compte source est envoyée. L’équipe la vérifie et tu es prévenu dès que le compte est activé."
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

  const loadFinancialRows = useCallback((): Promise<void> => {
    if (financialRequest.current) return financialRequest.current;
    const epoch = financialEpoch.current;
    const request = (async () => {
      setFinancialRefreshing(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || financialEpoch.current !== epoch) return;
        const [accountResult, hostedResult, dayResult] = await Promise.all([
          supabase.from("trading_accounts").select("*").eq("user_id", user.id),
          fetch("/api/metasync/hosted", { cache: "no-store", signal: AbortSignal.timeout(15000) })
            .then(async response => response.ok ? response.json() : null).catch(() => null),
          loadCopierDaySnapshot(supabase, user.id)
            .then(snapshot => ({ snapshot })).catch(() => ({ snapshot: null })),
        ]);
        if (financialEpoch.current !== epoch) return;
        const hostedAvailable = Array.isArray(hostedResult?.connections);
        if (!accountResult.error && hostedAvailable) {
          // Keep the matched balance and hosted observation together on failures.
          setAccounts((accountResult.data || []) as LooseAccount[]);
          setHostedAccountSyncs(hostedResult.connections as HostedAccountSync[]);
          if (Array.isArray(hostedResult.brokers)) setHostedBrokers(hostedResult.brokers as HostedBroker[]);
          if (dayResult.snapshot) setDailySnapshot(dayResult.snapshot);
        }
        setFinancialRefreshError(Boolean(accountResult.error) || !hostedAvailable);
        setDailyReadFailed(Boolean(accountResult.error) || !hostedAvailable || !dayResult.snapshot);
        setConnectionNow(Date.now());
      } catch {
        if (financialEpoch.current === epoch) { setFinancialRefreshError(true); setDailyReadFailed(true); }
      } finally {
        if (financialEpoch.current === epoch) setFinancialRefreshing(false);
      }
    })().finally(() => {
      if (financialRequest.current === request) financialRequest.current = null;
    });
    financialRequest.current = request;
    return request;
  }, [supabase]);

  async function loadRows() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [r1] = await Promise.all([
      supabase.from("copier_receivers").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
      loadFinancialRows(),
    ]);
    if (!r1.error) setReceivers((r1.data || []) as Receiver[]);
    const configResponse = await fetch("/api/copier/config-request", { cache: "no-store" });
    if (configResponse.ok) {
      const configData = await configResponse.json();
      setConfigurationRequests((configData.requests || []) as CopierConfigRequest[]);
    }
    return r1.error ? receivers : (r1.data || []) as Receiver[];
  }

  const applyStatus = useCallback((status: SthStatus, receiverId = selectedReceiverRef.current) => {
    if (!receiverId) return;
    confirmConnection(receiverId, status);
    if (selectedReceiverRef.current !== receiverId) return;
    setSelectedStatus(status);
    setSelectedMasters(Object.fromEntries(status.masterAccountsList.map((m) => [m.id, { on: m.userIsSubscribed, lots: String(m.lots) }])));
    setMasterConsent(false);
    setChecked(new Date().toLocaleString(locale === "en" ? "en-US" : "fr-FR"));
  }, [confirmConnection, locale]);

  const readConnection = useCallback((receiverId: string): Promise<SthStatus | undefined> => {
    const running = connectionRequests.current.get(receiverId);
    if (running) return running;
    const version = (connectionVersions.current[receiverId] || 0) + 1;
    connectionVersions.current[receiverId] = version;
    updateConnectionState(receiverId, { checking: true, error: false });
    const request = (async () => {
      try {
        const response = await fetch(`/api/sth?receiverId=${encodeURIComponent(receiverId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Connexion indisponible.");
        if (!data.status || typeof data.status.isTradingAccountConnected !== "boolean" || !Array.isArray(data.status.masterAccountsList)) throw new Error("Connexion indisponible.");
        if (connectionVersions.current[receiverId] !== version) return undefined;
        const status = data.status as SthStatus;
        const now = Date.now();
        updateConnectionState(receiverId, { snapshot: { status, checkedAt: now }, checking: false, error: false });
        setConnectionNow(now);
        if (selectedReceiverRef.current === receiverId) {
          setEnabled(Boolean(data.enabled));
          if (data.maxLots) setMaxLots(Number(data.maxLots));
        }
        return status;
      } catch (cause) {
        if (connectionVersions.current[receiverId] === version) updateConnectionState(receiverId, { checking: false, error: true });
        throw cause;
      } finally {
        connectionRequests.current.delete(receiverId);
      }
    })();
    connectionRequests.current.set(receiverId, request);
    return request;
  }, [updateConnectionState]);

  const fetchStatus = useCallback(async (receiverId = "legacy") => {
    const status = await readConnection(receiverId);
    if (status) applyStatus(status, receiverId);
    return status;
  }, [readConnection, applyStatus]);

  const verifyNetwork = useCallback(async (force = true) => {
    if (networkCheckingRef.current) return;
    const ids = [...networkReceiverIdsRef.current];
    if (ids.length === 0) return;
    networkCheckingRef.current = true;
    setNetworkChecking(true);
    try {
      // Read each account once, sequentially, without resetting any unsaved risk settings.
      for (const id of ids) {
        if (!networkReceiverIdsRef.current.includes(id)) continue;
        const state = connectionStatesRef.current[id];
        if (!force && state?.snapshot && !state.error && Date.now() - state.snapshot.checkedAt < 45_000) continue;
        await readConnection(id).catch(() => undefined);
      }
    } finally {
      networkCheckingRef.current = false;
      setNetworkChecking(false);
      setConnectionNow(Date.now());
    }
  }, [readConnection]);

  const networkReceiverKey = virtualReceivers.map((receiver) => receiver.id).join(",");
  useEffect(() => {
    networkReceiverIdsRef.current = networkReceiverKey ? networkReceiverKey.split(",") : [];
    if (!engineChecked) return;
    void verifyNetwork(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setConnectionNow(Date.now());
      void verifyNetwork(false);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [networkReceiverKey, engineChecked, verifyNetwork]);

  async function refresh() {
    let refreshReceiverId = selectedReceiverRef.current;
    setBusy(true);
    setError(false);
    setEngineChecked(false);
    try {
      const [loadedReceivers, loadedRequests] = await Promise.all([loadRows(), loadActivationRequests()]);
      const legacy = await fetch("/api/sth?receiverId=legacy", { cache: "no-store" });
      const legacyData = await legacy.json();
      setPilotDenied(legacy.status === 403 && !(loadedReceivers || []).length && !(loadedRequests || []).length);
      if (legacy.ok) {
        setEnabled(Boolean(legacyData.enabled));
        setLegacyConnected(Boolean(legacyData.status?.isTradingAccountConnected));
        if (legacyData.maxLots) setMaxLots(Number(legacyData.maxLots));
      }

      const explicitReceivers = (loadedReceivers || []).filter((receiver) => isExplicitReceiver(receiver, loadedRequests || latestMasterRequests));
      let target = selectedReceiverRef.current;
      if (target !== "legacy" && !explicitReceivers.some((receiver) => receiver.id === target)) target = null;
      if (!target) target = explicitReceivers[0]?.id || (legacyData.status?.isTradingAccountConnected ? "legacy" : null);
      if (target) {
        refreshReceiverId = target;
        setActiveReceiver(target);
        setSelectedStatus(null);
        await fetchStatus(target);
      } else {
        setActiveReceiver(null);
        setSelectedStatus(null);
        setSelectedMasters({});
      }
      if (selectedReceiverRef.current === refreshReceiverId) setMessage("InvestPro Copier actualisé.");
    } catch (cause) {
      if (selectedReceiverRef.current === refreshReceiverId) {
        setError(true);
        setMessage(cause instanceof Error ? cause.message : "Connexion indisponible.");
      }
    } finally {
      setEngineChecked(true);
      if (selectedReceiverRef.current === refreshReceiverId) setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  // A single read is shared by refresh buttons and polling. Failures retain the
  // last confirmed snapshot; freshness is based on the broker observation time.
  useEffect(() => {
    const refreshFinancials = () => {
      if (document.visibilityState !== "visible") return;
      setConnectionNow(Date.now());
      void loadFinancialRows();
    };
    // Toutes les 60 s (au lieu de 15) : les comptes hébergés sont relus toutes les quelques minutes de toute façon.
    const timer = window.setInterval(refreshFinancials, 60000);
    document.addEventListener("visibilitychange", refreshFinancials);
    window.addEventListener("focus", refreshFinancials);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshFinancials);
      window.removeEventListener("focus", refreshFinancials);
      financialEpoch.current += 1;
      financialRequest.current = null;
    };
  }, [loadFinancialRows]);

  const selectReceiver = useCallback(async (id: string) => {
    if (selectedReceiverId === id) {
      setActiveReceiver(null);
      setSelectedStatus(null);
      setSelectedMasters({});
      setMasterConsent(false);
      setRiskModalOpen(false);
      setBusy(false);
      return;
    }
    setActiveReceiver(id);
    setSelectedStatus(null);
    setSelectedMasters({});
    setMasterConsent(false);
    setRiskModalOpen(false);
    setBusy(true);
    setError(false);
    try {
      await fetchStatus(id);
      if (selectedReceiverRef.current === id) setMessage("Compte receveur chargé.");
    } catch (cause) {
      if (selectedReceiverRef.current === id) {
        setError(true);
        setMessage(cause instanceof Error ? cause.message : "Impossible de charger ce compte.");
      }
    } finally {
      if (selectedReceiverRef.current === id) setBusy(false);
    }
  }, [selectedReceiverId, setActiveReceiver, fetchStatus]);

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
    setAccountCurrency("");
    setAccountType("");
    setAddOpen(true);
  }

  function closeAddReceiver() {
    setPassword("");
    setConsent(false);
    setSyncConsent(false);
    setAccountCurrency("");
    setAccountType("");
    setAddOpen(false);
  }

  async function addReceiver() {
    const effectiveServer =
      serverChoice === "__OTHER__" ? customServer.trim() : serverChoice.trim();

    if (!alias.trim() || !/^\d{1,15}$/.test(login) || !effectiveServer || !password || !consent) {
      setError(true);
      setMessage("Complète les informations du compte copieur et coche l’autorisation.");
      return;
    }
    if (syncConsent && !["EUR", "USD"].includes(accountCurrency.trim().toUpperCase())) {
      setError(true);
      setMessage("Choisis la devise réelle du compte : euro (EUR) ou dollar américain (USD).");
      return;
    }
    if (syncConsent && !["real", "demo", "prop"].includes(accountType)) {
      setError(true);
      setMessage("Choisis le type du compte : réel, démo ou prop firm.");
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const normalizedServer = effectiveServer.trim().toLowerCase();
      const existingReceiver = receivers.find((receiver) =>
        receiver.login.trim() === login.trim() &&
        receiver.platform.toUpperCase() === platform &&
        receiver.server.trim().toLowerCase() === normalizedServer
      );
      // « Reprendre » : un compte noté relié mais que le moteur voit déconnecté est bien reconnecté avec le mot de passe saisi.
      const liveConnected = existingReceiver ? connectionStatesRef.current[existingReceiver.id]?.snapshot?.status.isTradingAccountConnected : undefined;
      const alreadyConnected = existingReceiver?.status === "connected" && liveConnected !== false;
      const connectResult = existingReceiver && alreadyConnected
        ? { receiverId: existingReceiver.id, reusedReceiver: true }
        : await post({
            action: "connect",
            receiverId: existingReceiver?.id,
            alias: alias.trim(),
            platform,
            login,
            server: effectiveServer,
            password,
            consent: true,
          });
      const data = {
        ...connectResult,
        reusedReceiver: Boolean(existingReceiver) || Boolean(connectResult.reusedReceiver),
      };
      let syncNotice = "";
      if (syncConsent) {
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
              await sendHostedMutation({ broker: hostedBroker.id, login, password, currency: accountCurrency.trim().toUpperCase(), type: accountType, syncConsent: true });
              syncNotice = "La synchronisation MetaSync en échec a été relancée avec les identifiants saisis. Le solde s’affichera après une première réponse valide du serveur.";
            } catch {
              syncNotice = "Le compte copieur est relié, mais la relance MetaSync n’a pas été confirmée. Vérifie son état dans Mes comptes.";
            }
          }
        } else if (existingHosted || existingAccount) {
          syncNotice = existingHosted?.active === false
            ? "La connexion MetaSync existe déjà mais est arrêtée ; réactive-la dans Mes comptes pour actualiser le solde."
            : "La connexion MetaSync déjà présente sera réutilisée pour le solde.";
        } else {
          const hostedBroker = hostedBrokers.find((item) => item.platform.toUpperCase() === platform && item.server.trim().toLowerCase() === normalizedServer);
          if (!hostedBroker) {
            syncNotice = "Ce serveur n’est pas encore pris en charge par MetaSync : le compte copieur est relié, mais son solde ne sera pas synchronisé automatiquement.";
          } else {
            try {
              await sendHostedMutation({
                  broker: hostedBroker.id,
                  login,
                  password,
                  currency: accountCurrency.trim().toUpperCase(),
                  type: accountType,
                  syncConsent: true,
                });
              syncNotice = "MetaSync est lancé ; le solde et l’equity apparaîtront après la première synchronisation.";
            } catch {
              syncNotice = "Le compte copieur est relié, mais la demande MetaSync n’a pas été confirmée. Vérifie Mes comptes avant de réessayer.";
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
        setActiveReceiver(data.receiverId);
        setSelectedStatus(null);
        if (data.status) applyStatus(data.status, data.receiverId);
        else await fetchStatus(data.receiverId);
      }
      if (!syncConsent) {
        syncNotice = "Pour afficher aussi son solde dans Mes comptes, relie ce même compte en cochant l’autorisation MetaSync.";
      }
      const receiverMessage = data.reusedReceiver
        ? alreadyConnected ? "Compte copieur déjà relié." : "Compte copieur relié à nouveau. Vérifie son réglage avec « Régler »."
        : "Compte copieur relié. Règle maintenant son volume avec « Régler ».";
      setMessage(syncNotice ? `${receiverMessage} ${syncNotice}` : receiverMessage);
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

      setRiskSavedAt(new Date().toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", {
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
      if (data.status) applyStatus(data.status, selectedReceiverId);
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
      if (!response.ok) throw new Error(result.error || "Impossible de retirer ce compte copieur.");
      setReceivers((list) => list.filter((r) => r.id !== id));
      if (selectedReceiverRef.current === id) {
        setActiveReceiver(null);
        setSelectedStatus(null);
        setSelectedMasters({});
      }
      setRemoveReceiverId(null);
      setDisconnectConsent(false);
      await loadRows();
      setMessage("Compte copieur retiré : la copie est arrêtée sur ce compte.");
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
      if (data.status) applyStatus(data.status, selectedReceiverId);
      setDisconnectConsent(false);
      await loadRows();
      setMessage("Copie en pause sur ce compte. Pour la relancer, clique sur « Reprendre ».");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Déconnexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  const activeMasters = selectedStatus?.masterAccountsList.filter((m) => selectedMasters[m.id]?.on) || [];
  const confirmedMasters = (selectedReceiverId ? connectionStates[selectedReceiverId]?.snapshot?.status.masterAccountsList : [])?.filter((master) => master.userIsSubscribed) || [];
  const selectedReceiver = virtualReceivers.find((r) => r.id === selectedReceiverId) || null;
  const savedRiskEngine = (selectedReceiver?.config?.risk_engine || {}) as Partial<RiskSettings>;

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
      setRiskSavedAt(new Date(latest.updated_at).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" }));
    }
    else setRiskSaveState("failed");
  }, [configurationRequests, selectedReceiverId, locale]);

  const receiverMetrics = useMemo(() => buildCopierAccountMetrics(virtualReceivers, accounts, hostedAccountSyncs, connectionNow), [virtualReceivers, accounts, hostedAccountSyncs, connectionNow]);
  const receiverMetricsById = useMemo(() => new Map(receiverMetrics.map(metric => [metric.receiverId, metric])), [receiverMetrics]);
  function statsFor(receiver: Receiver) {
    const metric = receiverMetricsById.get(receiver.id);
    return {
      balance: metric?.currency ? metric.balance : null,
      equity: metric?.currency ? metric.equity : null,
      pnl: metric?.isFresh && metric.currency ? metric.floatingPnl : null,
      open: metric?.isFresh ? metric.openPositions : null,
      currency: metric?.currency || "USD",
      lastSync: metric?.lastSync ?? null,
      hasSync: metric?.hasSync ?? false,
      syncStatus: metric?.status ?? "missing",
    };
  }

  const masterSyncFailed = Boolean(approvedMaster && hostedAccountSyncs.some((row) => {
    const connection = row.investpro_mt_connections;
    return row.active !== false && row.status === "error" && connection &&
      connection.login?.trim() === approvedMaster.login.trim() &&
      connection.platform?.toUpperCase() === approvedMaster.platform &&
      connection.server?.trim().toLowerCase() === approvedMaster.server.trim().toLowerCase() &&
      !connection.last_sync && row.equity == null;
  }));
  const masterMetric = approvedMaster ? buildCopierAccountMetrics([approvedMaster], accounts, hostedAccountSyncs, connectionNow)[0] : undefined;
  const masterBalance = masterMetric?.currency ? masterMetric.balance : null;
  const masterEquity = masterMetric?.currency ? masterMetric.equity : null;
  const masterPnl = masterMetric?.isFresh && masterMetric.currency ? masterMetric.floatingPnl : null;
  const masterCurrency = masterMetric?.currency || "USD";


  const connectedCount = virtualReceivers.filter((receiver) => connectionStateLabel(connectionStates[receiver.id], connectionNow).kind === "connected").length;
  const errorCount = virtualReceivers.filter((receiver) => ["error", "disconnected", "stale"].includes(connectionStateLabel(connectionStates[receiver.id], connectionNow).kind)).length;
  const totalOpenPositions = aggregateCopierPnl(receiverMetrics).openPositions;

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
      // En lots fixes, une protection modifiée part aussi en demande : la réponse du serveur fait foi.
      let requestPending = riskSettings.mode !== "fixed";
      if (riskSettings.mode === "fixed") {
        const data = await post({ action: "masters", receiverId: selectedReceiverId, consent: true, masters });
        if (data.ok === false) throw new Error(data.error || "Le moteur de copie n’a pas confirmé le compte source.");
        if (data.status) applyStatus(data.status, selectedReceiverId);
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
        setRiskSavedAt(new Date().toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" }));
        requestPending = result.requestStatus === "pending";
        setRiskSaveState(requestPending ? "pending" : "saved");
      }
      setSaveBarState("saved");
      setRiskModalOpen(false);
      setSaveBarMessage(requestPending ? "Demande envoyée à l’équipe" : "Lots fixes enregistrés");
      setMessage(!requestPending
        ? "Lots fixes enregistrés : le moteur de copie les applique aux prochains trades copiés."
        : riskSettings.mode === "fixed"
          ? "Lots fixes appliqués. Tes protections sont envoyées à l’équipe : tu es prévenu dès qu’elles sont actives."
          : "Demande envoyée à l’équipe. Ton réglage actuel reste actif jusqu’à ce qu’elle soit appliquée.");
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

  function masterSelectionLabel(id: string, on: boolean) {
    const saved = confirmedMasters.some((master) => master.id === id);
    return on !== saved ? "Modification à enregistrer" : saved ? "Liaison enregistrée" : "Non relié";
  }

  // ---- Rendu InvestPro Copy : compte source, comptes copieurs, panneau « Régler la copie » ----
  const decimal = (value: number, digits = 2) => (Number.isFinite(value) ? value : 0).toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: digits });
  const lotsText = (value: number) => `${decimal(value)} ${translate(Math.abs(value) >= 2 ? "lots" : "lot")}`;
  const signedMoney = (value: number, currency: string) => `${value > 0 ? "+" : ""}${money(value, currency)}`;
  const shortDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  };
  function modeValue(mode: RiskMode, settings: Partial<RiskSettings>) {
    if (mode === "mirror") return `× ${decimal(Number(settings.mirror_multiplier ?? 1))}`;
    if (mode === "balance") return `× ${decimal(Number(settings.balance_multiplier ?? 1))}`;
    if (mode === "equity") return `× ${decimal(Number(settings.equity_multiplier ?? 1))}`;
    if (mode === "percent") return `${decimal(Number(settings.risk_percent ?? 1))} %`;
    return "";
  }
  function requestedModeText(risk: Partial<RiskSettings> | undefined) {
    const mode = risk?.mode && RISK_MODES.includes(risk.mode) ? risk.mode : null;
    if (!mode) return translate("Réglage particulier");
    if (mode === "fixed") return translate("Protections");
    return `${translate(riskModeLabel(mode))} : ${modeValue(mode, risk || {})}`;
  }

  const copyRows = virtualReceivers.map((receiver) => {
    const state = connectionStates[receiver.id];
    const checking = Boolean(state?.checking);
    // Pendant une relecture, on garde l'état confirmé précédent au lieu de faire clignoter le statut.
    const connection = connectionStateLabel(checking && state?.snapshot ? { ...state, checking: false } : state, connectionNow);
    const subscribed = state?.snapshot?.status.masterAccountsList.filter((master) => master.userIsSubscribed) || [];
    const saved = (receiver.config?.risk_engine || {}) as Partial<RiskSettings>;
    const mode: RiskMode = saved.mode && RISK_MODES.includes(saved.mode) ? saved.mode : "fixed";
    const request = configurationRequests.find((item) => item.receiver_id === receiver.id) || null;
    const requestPending = Boolean(request && ["pending", "processing"].includes(request.status));
    const stats = receiver.id === "legacy" ? null : statsFor(receiver);
    return { receiver, checking, connection, subscribed, saved, mode, request, requestPending, stats };
  });
  type CopyRow = (typeof copyRows)[number];

  function copyStatus(row: CopyRow): { tone: Tone; text: string } {
    switch (row.connection.kind) {
      case "checking": return { tone: "neutral", text: "Vérification…" };
      case "error": return { tone: "amber", text: "Vérification indisponible" };
      case "unknown": return { tone: "neutral", text: "À vérifier" };
      case "stale": return { tone: "amber", text: "À revérifier" };
      case "disconnected": return row.receiver.status === "paused" ? { tone: "amber", text: "En pause" } : { tone: "red", text: "Déconnecté" };
      default: return row.subscribed.length ? { tone: "green", text: "Copie active" } : { tone: "amber", text: "Aucune source copiée" };
    }
  }

  function copySetting(row: CopyRow): { main: string; note: string; tone?: Tone } {
    if (row.requestPending) {
      return { main: translate("Demande en cours"), note: `${requestedModeText(row.request?.requested_config?.risk)} · ${translate("réglage actuel conservé")}`, tone: "amber" };
    }
    if (row.subscribed.length) {
      if (row.mode === "fixed") {
        return {
          main: `${translate("Lots fixes")} · ${lotsText(row.subscribed[0].lots)}`,
          note: row.subscribed.length > 1 ? translate("{count} comptes sources").replace("{count}", String(row.subscribed.length)) : translate("Appliqué par le moteur de copie"),
        };
      }
      return { main: `${translate(riskModeLabel(row.mode))} : ${modeValue(row.mode, row.saved)}`, note: translate("Appliqué par l’équipe") };
    }
    if (row.connection.kind === "connected") return { main: translate("À régler"), note: translate("Choisis le compte source et le volume"), tone: "gold" };
    return { main: "—", note: "" };
  }

  const activeSources = latestMasterRequests.filter((request) => request.status === "activated" && Boolean(request.provider_master_id) && !["pending", "processing", "completed"].includes(request.removal_status));
  const otherSources = activeSources.filter((request) => request.id !== approvedMaster?.id);
  const sourceFor = (masterId: string) => latestMasterRequests.find((request) => request.provider_master_id === masterId);
  const pendingSourceRequest = latestMasterRequests.find((request) => request.status === "pending" || request.status === "processing") || null;
  const rejectedSourceRequest = !approvedMaster && !pendingSourceRequest ? latestMasterRequests.find((request) => request.status === "rejected") || null : null;
  const activeCopyCount = copyRows.filter((row) => row.connection.kind === "connected" && row.subscribed.length > 0).length;
  const attentionCount = copyRows.filter((row) => ["error", "stale"].includes(row.connection.kind) || (row.connection.kind === "disconnected" && row.receiver.status !== "paused")).length;
  // Positions : somme des comptes lus récemment, avec leur nombre, plutôt qu'un tiret dès qu'un compte manque.
  const positionRows = copyRows.filter((row) => row.stats?.open != null);
  const knownPositions = positionRows.reduce((sum, row) => sum + Number(row.stats?.open || 0), 0);
  const daily = aggregateCopierDayResult(receiverMetrics, dailySnapshot, connectionNow);
  const floating = aggregateCopierPnl(receiverMetrics);
  const initialLoading = !engineChecked && receivers.length === 0 && activationRequests.length === 0;
  const needsSetup = !initialLoading && (!approvedMaster || virtualReceivers.length === 0);
  const pageStatus: { tone: Tone; text: string } = !engineChecked
    ? { tone: "neutral", text: "Vérification…" }
    : error ? { tone: "amber", text: "Statut indisponible" }
    : !enabled ? { tone: "amber", text: "Moteur de copie indisponible" }
    : activeCopyCount > 0 ? { tone: "green", text: "Copie active" }
    : needsSetup ? { tone: "gold", text: "À configurer" }
    : { tone: "amber", text: "Copie à régler" };
  const quietMessages = ["Chargement d’InvestPro Copier…", "InvestPro Copier actualisé.", "Compte receveur chargé."];
  const notice = !error && message && !quietMessages.includes(message) && message !== requestSuccess ? message : "";
  const anyModalOpen = addOpen || requestOpen || riskModalOpen || disconnectOpen || Boolean(removeReceiverId);

  const setupSteps: Array<{ title: string; detail: string; state: "done" | "current" | "todo" }> = [
    {
      title: "Compte source",
      detail: approvedMaster ? `${approvedMaster.platform} · #${approvedMaster.login}` : pendingSourceRequest ? translate("En vérification par l’équipe") : translate("Le compte avec lequel tu trades"),
      state: approvedMaster ? "done" : "current",
    },
    {
      title: "Comptes copieurs",
      detail: virtualReceivers.length ? translate(virtualReceivers.length > 1 ? "{count} comptes reliés" : "{count} compte relié").replace("{count}", String(virtualReceivers.length)) : translate("Les comptes qui reçoivent les trades"),
      state: virtualReceivers.length ? "done" : approvedMaster || pendingSourceRequest ? "current" : "todo",
    },
    {
      title: "Risque",
      detail: translate("Le volume de chaque compte"),
      state: copyRows.some((row) => row.subscribed.length > 0) ? "done" : approvedMaster && virtualReceivers.length ? "current" : "todo",
    },
    {
      title: "Lancement",
      detail: translate("Vérification et départ"),
      state: activeCopyCount > 0 ? "done" : copyRows.some((row) => row.subscribed.length > 0) ? "current" : "todo",
    },
  ];
  const currentStepIndex = setupSteps.findIndex((step) => step.state === "current");

  // Panneau « Régler la copie » du compte copieur sélectionné.
  const savedRisk: RiskSettings = { ...DEFAULT_RISK_SETTINGS, ...savedRiskEngine };
  const protectionsChanged = protectionsDiffer(savedRisk, riskSettings);
  const settingsIsRequest = riskSettings.mode !== "fixed" || protectionsChanged;
  const lotsNumber = Number(masterQuickValue);
  const lotsValid = masterQuickValue.trim() !== "" && Number.isFinite(lotsNumber) && lotsNumber > 0 && lotsNumber <= maxLots + 1e-9;
  const modeNumber = riskSettings.mode === "mirror" ? riskSettings.mirror_multiplier : riskSettings.mode === "balance" ? riskSettings.balance_multiplier : riskSettings.mode === "equity" ? riskSettings.equity_multiplier : riskSettings.risk_percent;
  const modeValid = riskSettings.mode === "fixed" ? lotsValid : Number.isFinite(modeNumber) && modeNumber >= 0.1 && modeNumber <= 20;
  const maxLotsValid = riskSettings.mode === "fixed" || (Number.isFinite(riskSettings.max_lots) && riskSettings.max_lots >= 0.01 && riskSettings.max_lots <= 1000);
  const drawdownValid = !riskSettings.drawdown_enabled || (Number.isFinite(riskSettings.max_drawdown_percent) && riskSettings.max_drawdown_percent >= 0.1 && riskSettings.max_drawdown_percent <= 100);
  const settingsRow = copyRows.find((row) => row.receiver.id === selectedReceiverId) || null;
  const settingsBlockReason = settingsLoading || !selectedStatus
    ? translate("Lecture du compte en cours…")
    : activeMasters.length === 0 ? translate("Coche le compte source à copier.")
    : !modeValid ? (riskSettings.mode === "fixed" ? translate("Indique un volume entre 0,01 et {max}.").replace("{max}", lotsText(maxLots)) : translate("Indique une valeur entre 0,1 et 20."))
    : !maxLotsValid ? translate("Indique un volume maximum entre 0,01 et 1 000 lots.")
    : !drawdownValid ? translate("Indique un seuil de perte entre 0,1 et 100 %.")
    : !masterConsent ? translate("Coche la confirmation pour continuer.")
    : "";
  const settingsCanSave = !settingsBlockReason && !busy && !riskBusy;
  const settingsPrimaryLabel = riskSettings.mode !== "fixed" ? "Envoyer la demande" : protectionsChanged ? "Enregistrer et envoyer la demande" : "Enregistrer";
  const settingsNote = riskSettings.mode !== "fixed"
    ? "Ce réglage est appliqué par l’équipe. Ton réglage actuel reste actif en attendant, et tu es prévenu dès que c’est fait."
    : protectionsChanged
      ? "Tes lots fixes s’appliquent tout de suite. Les protections modifiées sont envoyées à l’équipe, qui te prévient dès qu’elles sont actives."
      : "Les lots fixes s’appliquent dès l’enregistrement, sur les prochains trades copiés.";

  function openSettings(id: string) {
    const target = virtualReceivers.find((receiver) => receiver.id === id);
    if (!target || id === "legacy") return;
    const saved = (target.config?.risk_engine || {}) as Partial<RiskSettings>;
    setRiskSettings({ ...DEFAULT_RISK_SETTINGS, ...saved, mode: saved.mode && RISK_MODES.includes(saved.mode) ? saved.mode : "fixed" });
    setError(false);
    setSaveBarState("idle");
    setMasterConsent(false);
    setSettingsLoading(true);
    // Relecture fraîche du compte auprès du moteur, pour afficher les lots réellement appliqués.
    const loading = selectedReceiverRef.current === id
      ? fetchStatus(id).then(() => undefined, (cause) => {
          if (selectedReceiverRef.current !== id) return;
          setError(true);
          setMessage(cause instanceof Error ? cause.message : "Impossible de charger ce compte.");
        })
      : selectReceiver(id);
    setRiskModalOpen(true);
    void loading.finally(() => {
      if (selectedReceiverRef.current !== id) return;
      const current = connectionStatesRef.current[id]?.snapshot?.status.masterAccountsList.find((master) => master.userIsSubscribed);
      setMasterQuickValue(current ? String(current.lots) : "0.01");
      setSettingsLoading(false);
    });
  }

  function closeSettings() {
    setRiskModalOpen(false);
    setMasterConsent(false);
    setSettingsLoading(false);
  }

  function toggleSource(id: string) {
    toggleMaster(id);
    const lots = masterQuickValue;
    setSelectedMasters((current) => ({ ...current, [id]: { ...(current[id] || { on: false }), lots } }));
  }

  function openPause(id: string) {
    if (selectedReceiverRef.current !== id) void selectReceiver(id);
    setError(false);
    setDisconnectConsent(false);
    setDisconnectOpen(true);
  }

  async function confirmPause() {
    await disconnect();
    setDisconnectOpen(false);
  }

  function startAddReceiver() {
    setAlias("");
    setLogin("");
    setServer("");
    setServerChoice("");
    setCustomServer("");
    setError(false);
    openAddReceiver();
  }

  // Reprendre une copie mise en pause : le compte est reconnecté avec son mot de passe principal, saisi à nouveau.
  function resumeReceiver(receiver: Receiver) {
    const preset = BROKER_SERVER_PRESETS[receiver.platform].some((group) => group.servers.includes(receiver.server));
    setAlias(receiver.alias);
    setPlatform(receiver.platform);
    setLogin(receiver.login);
    setServerChoice(preset ? receiver.server : "__OTHER__");
    setServer(preset ? receiver.server : "");
    setCustomServer(preset ? "" : receiver.server);
    setError(false);
    openAddReceiver();
  }

  function openSourceRequest() {
    setError(false);
    setRequestOpen(true);
  }

  const resumeTarget = addOpen
    ? receivers.find((receiver) =>
        receiver.status !== "connected" &&
        receiver.login.trim() === login.trim() &&
        receiver.platform === platform &&
        receiver.server.trim().toLowerCase() === (serverChoice === "__OTHER__" ? customServer : serverChoice).trim().toLowerCase())
    : undefined;

  if (pilotDenied) return <CopierIntro />;

  return (
    <>
      <main className="cp-root mx-auto flex max-w-[1320px] flex-col gap-5 pb-32 text-[color:var(--text)]">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[32px]">InvestPro Copy</h1>
              <span className={cn("cp-pill", `cp-tone-${pageStatus.tone}`)}><span className="cp-dot" aria-hidden="true" />{translate(pageStatus.text)}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--muted)]">
              {checked ? `${translate("Dernière vérification du moteur de copie :")} ${checked}` : !engineChecked ? translate("Vérification du moteur de copie…") : enabled ? translate("Moteur de copie disponible") : translate("Moteur de copie indisponible")}
              {attentionCount > 0 ? ` · ${translate(attentionCount > 1 ? "{count} comptes à vérifier" : "{count} compte à vérifier").replace("{count}", String(attentionCount))}` : ""}
            </p>
          </div>
          {/* Pendant le premier chargement, l'accès pilote n'est pas encore connu : pas d'actions avant la réponse. */}
          {!initialLoading ? <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refresh()} disabled={busy} aria-label={translate("Actualiser")} title={translate("Actualiser")} className="cp-btn cp-btn-icon"><RefreshCw size={16} className={busy ? "animate-spin" : ""} aria-hidden="true" /></button>
            <button type="button" onClick={openSourceRequest} className="cp-btn"><Send size={15} aria-hidden="true" />{translate("Ajouter un compte source")}</button>
            <button type="button" onClick={startAddReceiver} className="cp-btn cp-btn-gold"><Plus size={16} aria-hidden="true" />{translate("Ajouter un compte copieur")}</button>
          </div> : null}
        </header>

        {requestSuccess ? <div role="status" className="cp-banner cp-tone-green"><span className="flex min-w-0 items-start gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{translate(requestSuccess)}</span><button type="button" onClick={() => setRequestSuccess("")} className="cp-link shrink-0">{translate("Fermer")}</button></div> : null}
        {notice ? <div role="status" className="cp-banner"><span className="min-w-0">{localizeCopierMessage(notice, translate)}</span><button type="button" onClick={() => setMessage("")} aria-label={translate("Fermer")} className="cp-link shrink-0"><X size={16} aria-hidden="true" /></button></div> : null}
        {error && !anyModalOpen ? <div role="alert" className="cp-banner cp-tone-red"><span className="flex min-w-0 items-start gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{localizeCopierMessage(message, translate)}</span></div> : null}

        {initialLoading ? <section role="status" className="cp-card flex items-center gap-3 p-6 text-[14px] text-[color:var(--muted)]"><Loader2 size={18} className="animate-spin" aria-hidden="true" />{translate("Chargement de tes comptes…")}</section> : null}

        {needsSetup ? <section aria-labelledby="copy-demarrage" className="cp-card p-5 md:p-6">
          <h2 id="copy-demarrage" className="text-[18px] font-semibold">{translate("Mise en place de la copie")}</h2>
          <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-[color:var(--muted)]">{translate("Copie automatiquement les trades d’un compte vers tes autres comptes, avec un volume réglé pour chacun.")}</p>
          <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {setupSteps.map((step, index) => <li key={step.title} aria-current={index === currentStepIndex ? "step" : undefined} className={cn("flex items-start gap-3 rounded-2xl border p-4", step.state === "current" ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-[color:var(--border)]")}>
              <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold", step.state === "done" ? "cp-step-done" : step.state === "current" ? "bg-[color:var(--gold)] text-[#16120a]" : "border border-[color:var(--border)] text-[color:var(--muted)]")}>{step.state === "done" ? <Check size={15} /> : index + 1}</span>
              <span className="min-w-0">
                <b className="block text-[14px] font-semibold">{translate(step.title)}</b>
                <span className="mt-0.5 block text-[12px] leading-snug text-[color:var(--muted)]">{step.detail}</span>
                <span className="sr-only">{translate(step.state === "done" ? "Terminé" : step.state === "current" ? "Étape en cours" : "À venir")}</span>
              </span>
            </li>)}
          </ol>

          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-5 md:flex-row md:items-center md:justify-between">
            {!approvedMaster && !pendingSourceRequest ? <>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{translate(rejectedSourceRequest ? "Ta demande de compte source n’a pas été validée" : "Ajoute le compte avec lequel tu trades")}</h3>
                <p className="mt-1 max-w-[65ch] text-[13px] leading-relaxed text-[color:var(--muted)]">{rejectedSourceRequest?.admin_note ? `${translate("Motif :")} ${rejectedSourceRequest.admin_note}` : translate("L’équipe le vérifie puis l’active dans le moteur de copie. Il apparaît ensuite ici comme compte source.")}</p>
              </div>
              <button type="button" onClick={openSourceRequest} className="cp-btn cp-btn-gold shrink-0"><Send size={15} aria-hidden="true" />{translate(rejectedSourceRequest ? "Refaire une demande" : "Ajouter un compte source")}</button>
            </> : !approvedMaster && pendingSourceRequest ? <>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{translate("Ton compte source est en vérification")}</h3>
                <p className="mt-1 max-w-[65ch] text-[13px] leading-relaxed text-[color:var(--muted)]">{pendingSourceRequest.alias} · {pendingSourceRequest.platform} #{pendingSourceRequest.login}. {translate("Tu es prévenu dès qu’il est activé. En attendant, tu peux déjà ajouter tes comptes copieurs.")}</p>
              </div>
              {!virtualReceivers.length ? <button type="button" onClick={startAddReceiver} className="cp-btn cp-btn-gold shrink-0"><Plus size={16} aria-hidden="true" />{translate("Ajouter un compte copieur")}</button> : null}
            </> : <>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{translate("Ajoute les comptes qui vont copier")}</h3>
                <p className="mt-1 max-w-[65ch] text-[13px] leading-relaxed text-[color:var(--muted)]">{translate("Chaque compte copieur reçoit les trades du compte source. Tu régleras son volume juste après.")}</p>
              </div>
              <button type="button" onClick={startAddReceiver} className="cp-btn cp-btn-gold shrink-0"><Plus size={16} aria-hidden="true" />{translate("Ajouter un compte copieur")}</button>
            </>}
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <li className="cp-inset p-4"><b className="block text-[14px] font-semibold">{translate("Rien à installer")}</b><span className="mt-1 block text-[13px] leading-relaxed text-[color:var(--muted)]">{translate("La copie tourne sur nos serveurs, 24 h/24 : ton ordinateur peut rester éteint.")}</span></li>
            <li className="cp-inset p-4"><b className="block text-[14px] font-semibold">{translate("Un volume par compte")}</b><span className="mt-1 block text-[13px] leading-relaxed text-[color:var(--muted)]">{translate("Les lots fixes s’appliquent tout de suite ; les autres réglages se demandent à l’équipe.")}</span></li>
            <li className="cp-inset p-4"><b className="block text-[14px] font-semibold">{translate("Pause à tout moment")}</b><span className="mt-1 block text-[13px] leading-relaxed text-[color:var(--muted)]">{translate("Tu arrêtes la copie sur un compte sans toucher aux autres.")}</span></li>
          </ul>
        </section> : null}

        {virtualReceivers.length > 0 ? <section aria-label={translate("Vue d’ensemble")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CopyTile label="Comptes copieurs actifs" value={String(activeCopyCount)} sub={translate("sur {count}").replace("{count}", String(virtualReceivers.length))} />
          <CopyTile
            label="Résultat du jour"
            value={daily.currencies.length ? signedMoney(daily.currencies[0].pnl, daily.currencies[0].currency) : "—"}
            tone={daily.currencies.length ? (daily.currencies[0].pnl > 0 ? "gain" : daily.currencies[0].pnl < 0 ? "loss" : undefined) : undefined}
            sub={daily.currencies.length > 1
              ? translate("Autres devises : {list}").replace("{list}", daily.currencies.slice(1).map((entry) => signedMoney(entry.pnl, entry.currency)).join(", "))
              : daily.currencies.length
                ? translate("{trades} trade(s) clôturé(s) · {covered}/{total} comptes").replace("{trades}", String(daily.tradeCount)).replace("{covered}", String(daily.coveredCount)).replace("{total}", String(daily.totalCount))
                : dailyReadFailed ? translate("Lecture du jour indisponible pour le moment") : translate("En attente de l’historique du jour")}
          />
          <CopyTile
            label="Positions ouvertes"
            value={totalOpenPositions != null ? String(totalOpenPositions) : positionRows.length ? String(knownPositions) : "—"}
            sub={[
              floating.currencies.length ? `${translate("P&L en cours")} : ${floating.currencies.map((entry) => signedMoney(entry.pnl, entry.currency)).join(", ")}` : "",
              totalOpenPositions == null && positionRows.length ? translate("{covered}/{total} comptes lus").replace("{covered}", String(positionRows.length)).replace("{total}", String(virtualReceivers.length)) : "",
            ].filter(Boolean).join(" · ") || translate("Sur tous les comptes copieurs")}
          />
          <CopyTile
            label="Compte source"
            value={approvedMaster && masterEquity != null ? money(masterEquity, masterCurrency) : approvedMaster && masterBalance != null ? money(masterBalance, masterCurrency) : "—"}
            sub={approvedMaster ? (masterEquity != null ? translate("Equity · {name}").replace("{name}", approvedMaster.alias) : masterBalance != null ? translate("Solde · {name}").replace("{name}", approvedMaster.alias) : translate("Solde non synchronisé")) : pendingSourceRequest ? translate("En vérification par l’équipe") : translate("Aucun compte source actif")}
          />
        </section> : null}
        {virtualReceivers.length > 0 && (financialRefreshError || (daily.missingAliases.length > 0 && daily.currencies.length > 0)) ? <p role="status" className="-mt-2 text-[12px] leading-relaxed text-[color:var(--cp-amber)]">
          {financialRefreshError ? translate("Actualisation temporairement indisponible · dernières données conservées.") : `${translate("Résultat du jour partiel · données à actualiser pour")} ${daily.missingAliases.join(", ")}`}
        </p> : null}

        {virtualReceivers.length > 0 || approvedMaster ? <section aria-labelledby="copy-mes-copies" className="cp-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-[color:var(--border)] p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><Copy size={19} /></span>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[color:var(--muted)]">{translate("Compte source")}</p>
                <h2 id="copy-mes-copies" className="break-words text-[18px] font-semibold leading-snug">{approvedMaster ? approvedMaster.alias : translate("Aucun compte source actif")}</h2>
                <p className="mt-0.5 break-words text-[13px] text-[color:var(--muted)]">{approvedMaster ? [approvedMaster.broker, approvedMaster.platform, `#${approvedMaster.login}`].filter(Boolean).join(" · ") : pendingSourceRequest ? translate("Demande en vérification par l’équipe") : translate("Ajoute ton compte source pour lancer la copie.")}</p>
                {otherSources.length ? <p className="mt-1 break-words text-[12px] text-[color:var(--muted)]">{translate("Autres comptes sources :")} {otherSources.map((source) => `${source.alias} (${source.platform} #${source.login})`).join(", ")}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cp-pill">{translate(virtualReceivers.length > 1 ? "{count} comptes copieurs" : "{count} compte copieur").replace("{count}", String(virtualReceivers.length))}</span>
              {virtualReceivers.length > 0 ? <button type="button" onClick={() => void verifyNetwork()} disabled={networkChecking} className="cp-btn cp-btn-sm"><RefreshCw size={14} className={networkChecking ? "animate-spin" : ""} aria-hidden="true" />{translate(networkChecking ? "Vérification…" : "Vérifier les connexions")}</button> : null}
            </div>
          </div>

          {approvedMaster && masterBalance == null ? <details className="border-b border-[color:var(--border)] px-5 py-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-[color:var(--cp-amber)]">{translate(masterSyncFailed ? "Solde du compte source : synchronisation en échec" : "Afficher le solde du compte source")}</summary>
            <div className="mt-3 flex max-w-[760px] flex-col gap-3 pb-2">
              <p className="text-[13px] leading-relaxed text-[color:var(--muted)]">{translate(masterSyncFailed ? "Aucun solde n’a été confirmé par le connecteur. Relance la synchronisation : InvestPro reprend les identifiants déjà chiffrés du compte source, sans jamais les afficher." : "Autorise MetaSync à lire le solde et l’equity de ce compte. Les identifiants déjà chiffrés sont transmis côté serveur ; ils ne sont jamais affichés ni journalisés.")}</p>
              <label className="flex items-start gap-3 text-[13px] leading-relaxed"><input type="checkbox" className="cp-check" checked={masterSyncConsent} onChange={(event) => setMasterSyncConsent(event.target.checked)} /><span>{translate("J’autorise InvestPro à créer une connexion MetaSync pour ce compte et à conserver ses identifiants chiffrés afin de synchroniser le solde et l’equity.")}</span></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_200px_auto] sm:items-end">
                <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-[color:var(--muted)]">{translate("Devise exacte")}</span><input className="ip-field" maxLength={3} value={masterSyncCurrency} onChange={(event) => setMasterSyncCurrency(event.target.value.toUpperCase())} placeholder={translate("USD, EUR…")} /></label>
                <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-[color:var(--muted)]">{translate("Type de compte")}</span><select className="ip-field" value={masterSyncType} onChange={(event) => setMasterSyncType(event.target.value as typeof masterSyncType)}><option value="">{translate("Choisir")}</option><option value="real">{translate("Réel")}</option><option value="demo">{translate("Démo")}</option><option value="prop">{translate("Prop firm")}</option></select></label>
                <button type="button" disabled={masterSyncBusy || !masterSyncConsent || !/^[A-Z]{3}$/.test(masterSyncCurrency.trim()) || !masterSyncType} onClick={() => void startMasterSync()} className="cp-btn">{masterSyncBusy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}{translate("Synchroniser ce compte source")}</button>
              </div>
              {masterSyncMessage ? <p role="status" className="text-[13px] leading-relaxed text-[color:var(--muted)]">{translate(masterSyncMessage)}</p> : null}
            </div>
          </details> : null}

          {virtualReceivers.length === 0 ? <div className="flex flex-col items-start gap-3 p-5">
            <p className="text-[14px] leading-relaxed text-[color:var(--muted)]">{translate("Aucun compte copieur pour l’instant. Ajoute les comptes qui vont recevoir les trades du compte source.")}</p>
            <button type="button" onClick={startAddReceiver} className="cp-btn cp-btn-gold"><Plus size={16} aria-hidden="true" />{translate("Ajouter un compte copieur")}</button>
          </div> : <>
            <div aria-hidden="true" className="cp-copy-grid hidden border-b border-[color:var(--border)] bg-[color:var(--panel-2)] px-5 py-2.5 text-[12px] font-medium text-[color:var(--muted)] lg:grid">
              <span>{translate("Compte copieur")}</span><span>{translate("Réglage")}</span><span>{translate("Statut")}</span><span>{translate("Solde")}</span><span>{translate("P&L en cours")}</span><span className="text-right">{translate("Actions")}</span>
            </div>
            <ul className="divide-y divide-[color:var(--border)]">
              {copyRows.map((row) => {
                const status = copyStatus(row);
                const setting = copySetting(row);
                const stats = row.stats;
                const legacy = row.receiver.id === "legacy";
                const firstSnapshotPending = Boolean(stats && stats.hasSync && !stats.lastSync && stats.balance == null && stats.equity == null);
                return <li key={row.receiver.id} className={cn("cp-copy-grid grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 lg:items-center", riskModalOpen && row.receiver.id === selectedReceiverId ? "bg-[color:var(--gold-soft)]" : "")}>
                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    <p className="break-words text-[15px] font-semibold">{row.receiver.alias}</p>
                    <p className="mt-0.5 break-words text-[12px] text-[color:var(--muted)]">{legacy ? translate("Compte relié directement au moteur de copie") : `${row.receiver.platform} · #${row.receiver.login} · ${row.receiver.server}`}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[12px] text-[color:var(--muted)] lg:sr-only">{translate("Réglage")}</span>
                    <p className={cn("text-[14px] font-medium", setting.tone === "amber" ? "text-[color:var(--cp-amber)]" : setting.tone === "gold" ? "text-[color:var(--gold)]" : "")}>{setting.main}</p>
                    {setting.note ? <p className="text-[12px] leading-snug text-[color:var(--muted)]">{setting.note}</p> : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap content-start items-center gap-x-2 gap-y-1">
                    <span className="w-full text-[12px] text-[color:var(--muted)] lg:sr-only">{translate("Statut")}</span>
                    <span className={cn("cp-pill", `cp-tone-${status.tone}`)}><span className="cp-dot" aria-hidden="true" />{translate(status.text)}</span>
                    {row.checking ? <Loader2 size={13} className="animate-spin text-[color:var(--muted)]" aria-label={translate("Vérification en cours")} /> : null}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[12px] text-[color:var(--muted)] lg:sr-only">{translate("Solde")}</span>
                    {stats && stats.balance != null ? <p className="text-[14px] tabular-nums">{money(stats.balance, stats.currency)}</p>
                      : stats && !legacy && !stats.hasSync ? <a href="/dashboard/connexions/metatrader" className="cp-link text-[12px]">{translate("Relier MetaSync pour afficher le solde")}</a>
                      : stats && firstSnapshotPending && stats.syncStatus === "error" ? <p className="text-[12px] text-[color:var(--cp-red)]">{translate("MetaSync en échec.")} <a href="/dashboard/connexions/metatrader" className="cp-link">{translate("Vérifier MetaSync")}</a></p>
                      : stats && firstSnapshotPending ? <p className="text-[12px] text-[color:var(--muted)]">{translate("Premier relevé en attente")}</p>
                      : <p className="text-[14px] text-[color:var(--muted)]">—</p>}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[12px] text-[color:var(--muted)] lg:sr-only">{translate("P&L en cours")}</span>
                    {stats && stats.pnl != null ? <p className={cn("text-[14px] font-medium tabular-nums", Number(stats.pnl) > 0 ? "cp-gain" : Number(stats.pnl) < 0 ? "cp-loss" : "")}>{signedMoney(Number(stats.pnl), stats.currency)}</p> : <p className="text-[14px] text-[color:var(--muted)]">—</p>}
                    {stats && stats.open != null ? <p className="text-[12px] text-[color:var(--muted)]">{translate(Number(stats.open) > 1 ? "{count} positions ouvertes" : "{count} position ouverte").replace("{count}", String(stats.open))}</p> : null}
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
                    {legacy ? <span className="text-[12px] leading-snug text-[color:var(--muted)]">{translate("Ajoute-le comme compte copieur pour le régler")}</span> : <>
                      <button type="button" onClick={() => openSettings(row.receiver.id)} aria-label={`${translate("Régler")} · ${row.receiver.alias}`} className="cp-btn cp-btn-sm cp-btn-outline"><Settings2 size={14} aria-hidden="true" />{translate("Régler")}</button>
                      {row.connection.kind === "connected" ? <button type="button" onClick={() => openPause(row.receiver.id)} aria-label={`${translate("Pause")} · ${row.receiver.alias}`} className="cp-btn cp-btn-sm"><Pause size={14} aria-hidden="true" />{translate("Pause")}</button>
                        : row.connection.kind === "disconnected" ? <button type="button" onClick={() => resumeReceiver(row.receiver)} aria-label={`${translate("Reprendre")} · ${row.receiver.alias}`} className="cp-btn cp-btn-sm"><Play size={14} aria-hidden="true" />{translate("Reprendre")}</button>
                        : null}
                      <button type="button" onClick={() => { setRemoveReceiverId(row.receiver.id); setDisconnectConsent(false); setRemoveError(""); }} aria-label={translate("Retirer {name}").replace("{name}", row.receiver.alias)} title={translate("Retirer")} className="cp-btn cp-btn-sm cp-btn-icon-sm cp-btn-danger"><Unplug size={14} aria-hidden="true" /></button>
                    </>}
                  </div>
                </li>;
              })}
            </ul>
          </>}
        </section> : null}

        {configurationRequests.length > 0 || latestMasterRequests.length > 0 ? <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {configurationRequests.length > 0 ? <section aria-labelledby="copy-demandes-reglage" className="cp-card p-5">
            <h2 id="copy-demandes-reglage" className="text-[16px] font-semibold">{translate("Demandes de réglage")}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {configurationRequests.slice(0, 6).map((request) => {
                const target = receivers.find((receiver) => receiver.id === request.receiver_id);
                const status = CONFIG_REQUEST_STATUS[request.status] || CONFIG_REQUEST_STATUS.pending;
                return <li key={request.id} className="cp-inset flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-[14px] font-semibold">{requestedModeText(request.requested_config?.risk)}</p>
                    <span className={cn("cp-pill", `cp-tone-${status.tone}`)}>{translate(status.label)}</span>
                  </div>
                  <p className="break-words text-[12px] text-[color:var(--muted)]">{target ? `${target.alias} · ${target.platform} #${target.login}` : translate("Compte copieur retiré")}{shortDate(request.updated_at) ? ` · ${shortDate(request.updated_at)}` : ""}</p>
                  {request.status === "pending" || request.status === "processing" ? <p className="text-[12px] leading-relaxed text-[color:var(--muted)]">{translate("En cours de traitement par l’équipe. Ton réglage actuel reste actif en attendant.")}</p>
                    : request.status === "rejected" && request.admin_note ? <p className="text-[12px] leading-relaxed text-[color:var(--cp-red)]">{translate("Motif :")} {request.admin_note}</p>
                    : null}
                </li>;
              })}
            </ul>
          </section> : null}

          {latestMasterRequests.length > 0 ? <section aria-labelledby="copy-comptes-sources" className="cp-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="copy-comptes-sources" className="text-[16px] font-semibold">{translate("Comptes sources")}</h2>
              <button type="button" onClick={() => void loadActivationRequests()} className="cp-link text-[13px]">{translate("Actualiser")}</button>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {latestMasterRequests.map((request) => {
                const removalPending = ["pending", "processing"].includes(request.removal_status);
                const canRemove = request.status === "activated" && Boolean(request.provider_master_id) && !removalPending;
                const status: { tone: Tone; label: string } = removalPending ? { tone: "amber", label: "Retrait en cours" }
                  : request.status === "activated" ? { tone: "green", label: "Activé" }
                  : request.status === "rejected" ? { tone: "red", label: "Refusé" }
                  : request.status === "processing" ? { tone: "amber", label: "En vérification" }
                  : { tone: "amber", label: "En attente" };
                return <li key={request.id} className="cp-inset flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-[14px] font-semibold">{request.alias}</p>
                    <span className={cn("cp-pill", `cp-tone-${status.tone}`)}>{translate(status.label)}</span>
                  </div>
                  <p className="break-words text-[12px] text-[color:var(--muted)]">{[request.broker, request.platform, `#${request.login}`, request.server].filter(Boolean).join(" · ")}{shortDate(request.created_at) ? ` · ${translate("demande du")} ${shortDate(request.created_at)}` : ""}</p>
                  {request.status === "rejected" && request.admin_note ? <p className="text-[12px] leading-relaxed text-[color:var(--cp-red)]">{translate("Motif :")} {request.admin_note}</p> : null}
                  {canRemove ? <label className="mt-1 flex items-center gap-2 text-[12px] text-[color:var(--muted)]"><input type="checkbox" className="cp-check" checked={selectedRemovalId === request.id} onChange={(event) => setSelectedRemovalId(event.target.checked ? request.id : "")} />{translate("Sélectionner pour demander son retrait")}</label> : null}
                </li>;
              })}
            </ul>
            {selectedRemovalId ? <button type="button" disabled={removalBusy} onClick={() => void requestMasterRemoval()} className="cp-btn cp-btn-danger mt-3 w-full">{removalBusy ? translate("Envoi…") : translate("Demander le retrait du compte sélectionné")}</button> : null}
            {removalMessage ? <p role="status" className="mt-2 text-[12px] leading-relaxed text-[color:var(--muted)]">{translate(removalMessage)}</p> : null}
          </section> : null}
        </div> : null}

        <p className="text-[12px] leading-relaxed text-[color:var(--muted)]">{translate("La copie reproduit aussi les pertes. Les résultats passés ne garantissent pas les résultats futurs : ne copie qu’avec un capital que tu peux te permettre de perdre.")}</p>
      </main>

      {selectedReceiver && riskModalOpen && typeof document !== "undefined" ? createPortal(
        <div className="cp-root fixed inset-0 z-[10000] flex justify-end bg-black/60 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !riskBusy) closeSettings(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="copy-reglage-titre" onKeyDown={(event) => { if (event.key === "Escape" && !riskBusy) closeSettings(); }} className="flex h-full w-full max-w-[560px] flex-col border-l border-[color:var(--gold-border)] bg-[color:var(--panel)] text-[color:var(--text)] shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-5 pb-4 pt-[max(16px,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <h2 id="copy-reglage-titre" className="text-[19px] font-semibold">{translate("Régler la copie")}</h2>
                <p className="mt-0.5 break-words text-[13px] text-[color:var(--muted)]">{selectedReceiver.alias} · {selectedReceiver.platform} · #{selectedReceiver.login}</p>
              </div>
              <button type="button" autoFocus onClick={closeSettings} disabled={riskBusy} aria-label={translate("Fermer")} className="cp-btn cp-btn-icon shrink-0"><X size={18} aria-hidden="true" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              <div className="flex flex-col gap-6">
                {settingsLoading && !selectedStatus ? <p role="status" className="cp-inset flex items-center gap-2 p-3 text-[13px] text-[color:var(--muted)]"><Loader2 size={15} className="animate-spin" aria-hidden="true" />{translate("Lecture du compte auprès du moteur de copie…")}</p> : null}
                {error ? <div role="alert" className="cp-banner cp-tone-red"><span className="min-w-0">{localizeCopierMessage(message, translate)}</span><button type="button" onClick={() => openSettings(selectedReceiver.id)} className="cp-link shrink-0">{translate("Réessayer")}</button></div> : null}
                {settingsRow?.requestPending ? <div className="cp-banner cp-tone-amber"><span className="min-w-0">{translate("Une demande est déjà en cours pour ce compte :")} {requestedModeText(settingsRow.request?.requested_config?.risk)}. {translate("Envoyer une nouvelle demande la remplace.")}</span></div> : null}

                <section aria-labelledby="copy-reglage-source" className="flex flex-col gap-3">
                  <div>
                    <h3 id="copy-reglage-source" className="text-[15px] font-semibold">{translate("Compte source copié")}</h3>
                    <p className="mt-0.5 text-[12px] leading-snug text-[color:var(--muted)]">{translate("Le compte dont ce compte copieur reproduit les trades.")}</p>
                  </div>
                  {!selectedStatus ? null : selectedStatus.masterAccountsList.length === 0 ? <div className="cp-inset flex flex-col items-start gap-3 p-4 text-[13px] leading-relaxed text-[color:var(--muted)]">
                    <p>{translate(approvedMaster ? "Ton compte source n’est pas encore disponible pour ce compte copieur. Réessaie dans quelques minutes ou écris à l’équipe." : "Aucun compte source n’est actif pour l’instant. Il apparaît ici une fois validé par l’équipe.")}</p>
                    {!approvedMaster && !pendingSourceRequest ? <button type="button" onClick={() => { closeSettings(); openSourceRequest(); }} className="cp-btn cp-btn-sm"><Send size={14} aria-hidden="true" />{translate("Ajouter un compte source")}</button> : null}
                  </div> : <ul className="flex flex-col gap-2">
                    {selectedStatus.masterAccountsList.map((master) => {
                      const current = selectedMasters[master.id] || { on: false, lots: masterQuickValue };
                      const saved = confirmedMasters.some((item) => item.id === master.id);
                      const source = sourceFor(master.id);
                      const note = current.on ? (saved ? "Copié actuellement" : "Sera copié après enregistrement") : (saved ? "Ne sera plus copié après enregistrement" : "Non copié");
                      return <li key={master.id}>
                        <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-[color:var(--border)]")}>
                          <input type="checkbox" className="cp-check" checked={current.on} disabled={settingsLoading || riskBusy} onChange={() => toggleSource(master.id)} />
                          <span className="min-w-0">
                            <span className="block break-words text-[14px] font-semibold">{source?.alias || master.name}</span>
                            <span className="block break-words text-[12px] text-[color:var(--muted)]">{source ? `${source.platform} · #${source.login} · ` : ""}{translate(note)}</span>
                          </span>
                        </label>
                      </li>;
                    })}
                  </ul>}
                </section>

                <fieldset className="flex min-w-0 flex-col gap-2" disabled={settingsLoading || riskBusy}>
                  <legend className="mb-1 text-[15px] font-semibold">{translate("Volume des trades")}</legend>
                  {COPY_MODES.map((item) => {
                    const active = riskSettings.mode === item.mode;
                    const instant = item.mode === "fixed";
                    return <div key={item.mode} className={cn("rounded-2xl border p-4", active ? "border-[color:var(--gold)] bg-[color:var(--gold-soft)]" : "border-[color:var(--border)]")}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="radio" name="copy-mode" value={item.mode} checked={active} onChange={() => setRiskSettings((value) => ({ ...value, mode: item.mode }))} className="cp-check" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2"><b className="text-[14px] font-semibold">{translate(item.label)}</b><span className={cn("cp-pill cp-pill-xs", instant ? "cp-tone-green" : "cp-tone-gold")}>{translate(instant ? "Immédiat" : "Sur demande")}</span></span>
                          <span className="mt-1 block text-[13px] leading-snug text-[color:var(--muted)]">{translate(item.description)}</span>
                        </span>
                      </label>
                      {active ? <div className="mt-3 flex flex-col gap-1.5 pl-[30px]">
                        <label htmlFor={`copy-mode-${item.mode}`} className="text-[12px] font-medium text-[color:var(--muted)]">{translate(item.input)}</label>
                        {item.mode === "fixed"
                          ? <input id="copy-mode-fixed" type="number" inputMode="decimal" min="0.01" max={maxLots} step="0.01" className="ip-field max-w-[180px]" value={masterQuickValue} onChange={(event) => applyQuickModeToSelectedMasters(event.target.value)} />
                          : <input
                              id={`copy-mode-${item.mode}`}
                              type="number"
                              inputMode="decimal"
                              min="0.1"
                              max="20"
                              step="0.1"
                              className="ip-field max-w-[180px]"
                              value={(item.mode === "mirror" ? riskSettings.mirror_multiplier : item.mode === "balance" ? riskSettings.balance_multiplier : item.mode === "equity" ? riskSettings.equity_multiplier : riskSettings.risk_percent) || ""}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                setRiskSettings((current) => item.mode === "mirror" ? { ...current, mirror_multiplier: value } : item.mode === "balance" ? { ...current, balance_multiplier: value } : item.mode === "equity" ? { ...current, equity_multiplier: value } : { ...current, risk_percent: value });
                              }}
                            />}
                        <p className={cn("text-[12px] leading-snug", modeValid ? "text-[color:var(--muted)]" : "text-[color:var(--cp-red)]")}>
                          {item.mode === "fixed" ? translate("Maximum {max} par trade pendant la phase pilote.").replace("{max}", lotsText(maxLots)) : item.mode === "percent" ? translate("Entre 0,1 et 20 % du solde par trade.") : translate("Entre 0,1 et 20.")}
                        </p>
                      </div> : null}
                    </div>;
                  })}
                </fieldset>

                <section aria-labelledby="copy-reglage-protections" className="flex flex-col gap-3">
                  <div>
                    <h3 id="copy-reglage-protections" className="text-[15px] font-semibold">{translate("Protections")}</h3>
                    <p className="mt-0.5 text-[12px] leading-snug text-[color:var(--muted)]">{translate("Appliquées par l’équipe : une protection modifiée est envoyée avec ta demande.")}</p>
                  </div>
                  <div className="flex flex-col divide-y divide-[color:var(--border)] rounded-2xl border border-[color:var(--border)]">
                    {riskSettings.mode !== "fixed" ? <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <label htmlFor="copy-max-lots" className="text-[14px]">{translate("Volume maximum par trade")}</label>
                      <span className="flex items-center gap-2"><input id="copy-max-lots" type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" disabled={settingsLoading || riskBusy} className="ip-field w-[110px]" value={riskSettings.max_lots || ""} onChange={(event) => setRiskSettings((current) => ({ ...current, max_lots: Number(event.target.value) }))} /><span className="text-[13px] text-[color:var(--muted)]">{translate("lots")}</span></span>
                    </div> : null}
                    <div className="flex flex-col gap-3 p-4">
                      <label className="flex items-center justify-between gap-3"><span className="text-[14px]">{translate("Arrêter la copie si la perte du jour dépasse un seuil")}</span><input type="checkbox" role="switch" className="cp-switch" disabled={settingsLoading || riskBusy} checked={riskSettings.drawdown_enabled} onChange={(event) => setRiskSettings((current) => ({ ...current, drawdown_enabled: event.target.checked }))} /></label>
                      {riskSettings.drawdown_enabled ? <span className="flex items-center gap-2"><label htmlFor="copy-drawdown" className="text-[13px] text-[color:var(--muted)]">{translate("Seuil de perte du jour")}</label><input id="copy-drawdown" type="number" inputMode="decimal" min="0.1" max="100" step="0.1" disabled={settingsLoading || riskBusy} className="ip-field w-[100px]" value={riskSettings.max_drawdown_percent || ""} onChange={(event) => setRiskSettings((current) => ({ ...current, max_drawdown_percent: Number(event.target.value) }))} /><span className="text-[13px] text-[color:var(--muted)]">%</span></span> : null}
                    </div>
                    <label className="flex items-center justify-between gap-3 p-4"><span className="text-[14px]">{translate("Copier le stop loss et le take profit")}</span><input type="checkbox" role="switch" className="cp-switch" disabled={settingsLoading || riskBusy} checked={riskSettings.copy_sl && riskSettings.copy_tp} onChange={(event) => setRiskSettings((current) => ({ ...current, copy_sl: event.target.checked, copy_tp: event.target.checked }))} /></label>
                    <label className="flex items-center justify-between gap-3 p-4"><span className="text-[14px]">{translate("Copier les ordres en attente")}</span><input type="checkbox" role="switch" className="cp-switch" disabled={settingsLoading || riskBusy} checked={riskSettings.copy_pending} onChange={(event) => setRiskSettings((current) => ({ ...current, copy_pending: event.target.checked }))} /></label>
                  </div>
                  <details className="rounded-2xl border border-[color:var(--border)] p-4">
                    <summary className="cursor-pointer text-[14px] font-medium">{translate("Avancé : noms des symboles chez ton broker")}</summary>
                    <div className="mt-3 flex flex-col gap-1.5">
                      <label htmlFor="copy-symbols" className="text-[12px] leading-snug text-[color:var(--muted)]">{translate("Un symbole par ligne : nom chez le compte source = nom chez toi.")}</label>
                      <textarea id="copy-symbols" rows={3} disabled={settingsLoading || riskBusy} className="ip-field" value={riskSettings.symbol_mapping} onChange={(event) => setRiskSettings((current) => ({ ...current, symbol_mapping: event.target.value }))} placeholder={"XAUUSD = GOLD\nUS30 = DJ30"} />
                    </div>
                  </details>
                </section>
              </div>
            </div>

            <footer className="border-t border-[color:var(--border)] px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
              <p className="text-[13px] leading-relaxed text-[color:var(--muted)]">{translate(settingsNote)}</p>
              <label className="mt-3 flex items-start gap-3 text-[13px] leading-relaxed"><input type="checkbox" className="cp-check" checked={masterConsent} disabled={riskBusy} onChange={(event) => setMasterConsent(event.target.checked)} /><span>{translate(settingsIsRequest ? "Je confirme ma demande pour ce compte copieur." : "Je confirme ce réglage pour ce compte copieur.")}</span></label>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={closeSettings} disabled={riskBusy} className="cp-btn">{translate("Annuler")}</button>
                <button type="button" disabled={!settingsCanSave} onClick={() => void saveAll()} className="cp-btn cp-btn-gold">{saveBarState === "saving" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}{translate(saveBarState === "saving" ? "Enregistrement…" : settingsPrimaryLabel)}</button>
              </div>
              {settingsBlockReason && !riskBusy ? <p className="mt-2 text-right text-[12px] text-[color:var(--muted)]">{settingsBlockReason}</p> : null}
            </footer>
          </div>
        </div>,
        document.body
      ) : null}

      {disconnectOpen && selectedReceiver && typeof document !== "undefined" ? createPortal(
        <div className="cp-root fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div role="dialog" aria-modal="true" aria-labelledby="copy-pause-titre" className="w-full max-w-md rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-6 text-[color:var(--text)] shadow-2xl">
            <h2 id="copy-pause-titre" className="text-[18px] font-semibold">{translate("Mettre la copie en pause ?")}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--muted)]"><b className="font-semibold text-[color:var(--text)]">{selectedReceiver.alias}</b> {translate("ne recevra plus de nouveaux trades. Vérifie ensuite les positions encore ouvertes sur ce compte dans MetaTrader.")}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--muted)]">{translate("Pour reprendre, il faudra saisir à nouveau le mot de passe principal de ce compte.")}</p>
            <label className="mt-4 flex items-start gap-3 text-[14px] leading-relaxed"><input type="checkbox" className="cp-check" checked={disconnectConsent} disabled={busy} onChange={(event) => setDisconnectConsent(event.target.checked)} /><span>{translate("Je mets la copie en pause sur ce compte.")}</span></label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => { setDisconnectOpen(false); setDisconnectConsent(false); }} className="cp-btn">{translate("Annuler")}</button>
              <button type="button" disabled={!disconnectConsent || busy} onClick={() => void confirmPause()} className="cp-btn cp-btn-gold">{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{translate("Mettre en pause")}</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {removeReceiverId && (() => {
        const target = receivers.find((r) => r.id === removeReceiverId);
        return (
          <div className="cp-root fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
            <div role="dialog" aria-modal="true" aria-labelledby="copy-retrait-titre" className="w-full max-w-lg rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-6 text-[color:var(--text)] shadow-2xl">
              <div className="flex items-center justify-between gap-3"><h2 id="copy-retrait-titre" className="text-[18px] font-semibold">{translate("Retirer ce compte copieur ?")}</h2><button type="button" disabled={removeBusy} onClick={() => { setRemoveReceiverId(null); setDisconnectConsent(false); }} aria-label={translate("Fermer")} className="cp-btn cp-btn-icon"><X size={18} aria-hidden="true" /></button></div>
              <div className="cp-inset mt-4 p-4 text-[14px]"><strong className="font-semibold">{target?.alias || translate("Compte copieur")}</strong><div className="mt-1 text-[12px] text-[color:var(--muted)]">{target?.platform} · #{target?.login} · {target?.server}</div></div>
              <p className="mt-4 text-[14px] leading-relaxed text-[color:var(--muted)]">{translate("La copie est d’abord arrêtée sur ce compte, puis il est retiré de ta liste. Tu pourras le rajouter plus tard avec « Ajouter un compte copieur ».")}</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed"><input type="checkbox" className="cp-check" checked={disconnectConsent} disabled={removeBusy} onChange={(e) => setDisconnectConsent(e.target.checked)} /><span>{translate("Je confirme l’arrêt de la copie et le retrait de ce compte.")}</span></label>
              {removeError ? <p className="cp-banner cp-tone-red mt-3" role="alert"><span>{translate(removeError)}<span className="mt-1 block text-[12px] text-[color:var(--muted)]">{translate("Aucun compte n’est retiré de la liste tant que l’opération n’est pas entièrement confirmée.")}</span></span></p> : null}
              <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" autoFocus disabled={removeBusy} onClick={() => { setRemoveReceiverId(null); setDisconnectConsent(false); }} className="cp-btn">{translate("Annuler")}</button><button type="button" disabled={!disconnectConsent || removeBusy} onClick={() => void removeReceiver()} className="cp-btn cp-btn-danger-solid">{removeBusy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Unplug size={15} aria-hidden="true" />}{translate("Arrêter et retirer")}</button></div>
            </div>
          </div>
        );
      })()}

      {requestOpen ? (
        <div className="cp-root fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div role="dialog" aria-modal="true" aria-labelledby="copy-source-titre" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] text-[color:var(--text)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] p-5 md:p-6">
              <div className="min-w-0">
                <h2 id="copy-source-titre" className="text-xl font-semibold text-[color:var(--text)]">
                  {translate("Ajouter un compte source")}</h2>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[color:var(--muted)]">
                  {translate("Le compte avec lequel tu trades. L’équipe le vérifie et l’active dans le moteur de copie, puis il apparaît ici comme compte source.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setRequestOpen(false)}
                aria-label={translate("Fermer")}
                className="cp-btn cp-btn-icon shrink-0"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 md:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={translate("Nom / alias")}>
                  <input
                    className="ip-field"
                    value={requestForm.alias}
                    onChange={(e) =>
                      setRequestForm((v) => ({ ...v, alias: e.target.value }))
                    }
                    placeholder={translate("Ex. Compte perso")}
                  />
                </Field>
                <Field label={translate("Plateforme")}>
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
                    <option value="MT5">{translate("MetaTrader 5")}</option>
                    <option value="MT4">{translate("MetaTrader 4")}</option>
                  </select>
                </Field>
                <Field label={translate("Broker / serveur")}>
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
                    <option value="">{translate("Choisir un serveur")}</option>
                    {BROKER_SERVER_PRESETS[requestForm.platform].map((group) => (
                      <optgroup key={group.broker} label={group.broker}>
                        {group.servers.map((item) => (
                          <option key={item} value={item}>
                            {item} ({requestForm.platform})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__OTHER__">{translate("Mon serveur n’est pas dans la liste")}</option>
                  </select>
                </Field>
                <Field label={translate("Numéro de compte")}>
                  <input
                    className="ip-field"
                    inputMode="numeric"
                    value={requestForm.login}
                    onChange={(e) =>
                      setRequestForm((v) => ({ ...v, login: e.target.value }))
                    }
                    placeholder={translate("Ex. 12345678")}
                  />
                </Field>
                {requestServerChoice === "__OTHER__" ? (
                  <>
                    <Field label={translate("Broker")}>
                      <input
                        className="ip-field"
                        value={requestForm.broker}
                        onChange={(e) =>
                          setRequestForm((v) => ({
                            ...v,
                            broker: e.target.value,
                          }))
                        }
                        placeholder={translate("Ex. PU Prime")}
                      />
                    </Field>
                    <Field label={translate("Serveur exact")}>
                      <input
                        className="ip-field"
                        value={requestForm.server}
                        onChange={(e) =>
                          setRequestForm((v) => ({
                            ...v,
                            server: e.target.value,
                          }))
                        }
                        placeholder={translate("Ex. PUPrime-Live7")}
                      />
                    </Field>
                  </>
                ) : null}
                <Field label={translate("Mot de passe principal")}>
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
                  <span className="mt-1.5 block text-[12px] leading-snug text-[color:var(--muted)]">{translate("Le mot de passe principal du compte, pas le mot de passe investisseur.")}</span>
                </Field>
                <div className="md:col-span-2">
                  <Field label={translate("Message / précision (facultatif)")}>
                    <textarea
                      value={requestForm.note}
                      onChange={(e) =>
                        setRequestForm((v) => ({ ...v, note: e.target.value }))
                      }
                      placeholder={translate("Ex. Compte principal avec lequel je trade")}
                      className="min-h-24 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--gold-border)]"
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
                    <div className="text-[13px] font-semibold text-[color:var(--text)]">
                      {translate("Transmission sécurisée")}</div>
                    <p className="mt-1 text-[12px] leading-5 text-[color:var(--muted)]">
                      {translate("Le mot de passe est chiffré côté serveur. Seul l’administrateur InvestPro autorisé peut l’afficher pour effectuer l’activation technique du compte.")}</p>
                  </div>
                </div>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4 text-[13px] leading-5 text-[color:var(--muted)]">
                <input type="checkbox" checked={requestForm.syncConsent} onChange={(e) => setRequestForm((v) => ({ ...v, syncConsent: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-500" />
                <span>{translate("Pour afficher automatiquement le solde après approbation, j’autorise aussi InvestPro à créer la connexion MetaSync et à conserver mes identifiants chiffrés si le serveur est pris en charge. Cette autorisation est facultative.")}</span>
              </label>
              {requestForm.syncConsent ? <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4 sm:grid-cols-2">
                <Field label={translate("Devise du compte")}><input className="ip-field" required maxLength={3} value={requestForm.syncCurrency} onChange={(e) => setRequestForm((v) => ({ ...v, syncCurrency: e.target.value.toUpperCase() }))} placeholder={translate("USD")} /></Field>
                <Field label={translate("Type de compte")}><select className="ip-field" required value={requestForm.syncType} onChange={(e) => setRequestForm((v) => ({ ...v, syncType: e.target.value as "real" | "demo" | "prop" }))}><option value="real">{translate("Réel")}</option><option value="demo">{translate("Démo")}</option><option value="prop">{translate("Prop firm")}</option></select></Field>
                {(() => { const selectedServer = (requestServerChoice === "__OTHER__" ? requestForm.server : requestServerChoice).trim().toLowerCase(); const supported = hostedBrokers.some((item) => item.platform.toUpperCase() === requestForm.platform && item.server.trim().toLowerCase() === selectedServer); return <p className={cn("sm:col-span-2 text-[12px] leading-5", supported ? "text-[color:var(--cp-green)]" : "text-[color:var(--cp-amber)]")}>{supported ? translate("Serveur compatible : MetaSync démarrera une fois le compte source validé par l’équipe.") : translate("Ce serveur n’est pas dans le catalogue MetaSync : la demande peut être envoyée, mais le solde ne sera pas synchronisé automatiquement.")}</p>; })()}
              </div> : null}

              {error ? <p role="alert" className="cp-banner cp-tone-red mt-4"><span>{localizeCopierMessage(message, translate)}</span></p> : null}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  disabled={requestBusy}
                  onClick={() => void submitActivationRequest()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40"
                >
                  {requestBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {translate("Envoyer ma demande")}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen && typeof document !== "undefined" ? createPortal(
        <div className="cp-root fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/60 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-sm md:items-center md:overflow-hidden md:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="add-receiver-title" className="my-auto flex max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_24px)] w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] shadow-2xl md:max-h-[90vh] md:rounded-[26px]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-6"><div className="min-w-0"><h2 id="add-receiver-title" className="text-xl font-semibold text-[color:var(--text)]">{translate(resumeTarget ? "Reprendre la copie" : "Ajouter un compte copieur")}</h2><p className="mt-1 text-[13px] leading-relaxed text-[color:var(--muted)]">{translate(resumeTarget ? "Saisis à nouveau le mot de passe principal de ce compte pour relancer la copie." : "Il recevra les trades de ton compte source. Tu régleras son volume juste après.")}</p></div><button type="button" onClick={closeAddReceiver} className="cp-btn cp-btn-icon shrink-0" aria-label={translate("Fermer")}><X size={17} aria-hidden="true" /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(20px+env(safe-area-inset-bottom))] md:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={translate("Nom / alias")}><input className="ip-field" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={translate("Ex. Prop 100K")} /></Field>
                <Field label={translate("Plateforme")}>
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
                    <option value="MT5">{translate("MetaTrader 5")}</option>
                    <option value="MT4">{translate("MetaTrader 4")}</option>
                  </select>
                </Field>
                <Field label={translate("Numéro de compte")}><input className="ip-field" inputMode="numeric" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={translate("Ex. 12345678")} /></Field>
                <Field label={translate("Broker / serveur")}>
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
                    <option value="">{translate("Choisir un serveur")}</option>
                    {BROKER_SERVER_PRESETS[platform].map((group) => (
                      <optgroup key={group.broker} label={group.broker}>
                        {group.servers.map((item) => (
                          <option key={item} value={item}>
                            {item} ({platform})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__OTHER__">{translate("Mon serveur n’est pas dans la liste")}</option>
                  </select>
                </Field>
                {serverChoice === "__OTHER__" ? (
                  <div className="md:col-span-2">
                    <Field label={translate("Serveur exact")}>
                      <input
                        className="ip-field"
                        value={customServer}
                        onChange={(e) => setCustomServer(e.target.value)}
                        placeholder={translate("Ex. MonBroker-Live01")}
                      />
                    </Field>
                  </div>
                ) : null}
                <div className="md:col-span-2"><Field label={translate("Mot de passe principal")}><input className="ip-field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /><span className="mt-1.5 block text-[12px] leading-snug text-[color:var(--muted)]">{translate("Le mot de passe principal, pas le mot de passe investisseur : c’est lui qui permet d’ouvrir les trades sur ce compte. Il est transmis chiffré au moteur de copie et n’est jamais affiché.")}</span></Field></div>
              </div>
              <div className="mt-4 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4"><div className="flex gap-3"><LockKeyhole size={16} className="mt-0.5 text-[color:var(--gold)]" /><div><div className="text-[13px] font-semibold text-[color:var(--text)]">{translate("Le volume se règle juste après")}</div><p className="mt-1 text-[12px] leading-relaxed text-[color:var(--muted)]">{translate("Une fois le compte relié, choisis ses lots avec « Régler » dans la liste des comptes copieurs.")}</p></div></div></div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4 text-[13px] leading-5 text-[color:var(--muted)]"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[color:var(--gold)]" />{translate("J’autorise InvestPro à transmettre ces identifiants au moteur de copie pour établir et maintenir la connexion.")}</label>
              <label className="mt-3 flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4 text-[13px] leading-5 text-[color:var(--muted)]"><input type="checkbox" checked={syncConsent} onChange={(e) => { setSyncConsent(e.target.checked); setAccountCurrency(""); setAccountType(""); }} className="mt-0.5 h-4 w-4 accent-emerald-500" /><span><strong className="text-[color:var(--cp-green)]">{translate("Pour afficher ce compte dans Mes comptes et synchroniser le solde/equity :")}</strong> {" "}{translate("j’autorise InvestPro à créer la connexion MetaSync et à conserver mes identifiants chiffrés, si le serveur est pris en charge. Sans cette autorisation, le compte sera relié uniquement au Copier.")}</span></label>
              {syncConsent ? <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4 sm:grid-cols-2">
                <Field label={translate("Devise du compte")}><select className="ip-field" required value={accountCurrency} onChange={(e) => setAccountCurrency(e.target.value)}><option value="" disabled>{translate("Choisir la devise")}</option><option value="EUR">{translate("EUR — Euro")}</option><option value="USD">{translate("USD — Dollar américain")}</option></select></Field>
                <Field label={translate("Type de compte")}><select className="ip-field" required value={accountType} onChange={(e) => setAccountType(e.target.value as "real" | "demo" | "prop" | "")}><option value="" disabled>{translate("Choisir le type de compte")}</option><option value="real">{translate("Compte réel")}</option><option value="demo">{translate("Compte démo")}</option><option value="prop">{translate("Compte prop firm")}</option></select></Field>
                {(() => { const selectedServer = (serverChoice === "__OTHER__" ? customServer : serverChoice).trim().toLowerCase(); const supported = hostedBrokers.some((item) => item.platform.toUpperCase() === platform && item.server.trim().toLowerCase() === selectedServer); return <p className={cn("sm:col-span-2 text-[12px] leading-5", supported ? "text-[color:var(--cp-green)]" : "text-[color:var(--cp-amber)]")}>{supported ? translate("Serveur compatible : la synchronisation démarrera après l’ajout.") : translate("Ce serveur n’apparaît pas encore dans le catalogue MetaSync. Le compte pourra être ajouté au Copier, mais son solde ne sera pas synchronisé automatiquement.")}</p>; })()}
              </div> : null}
              {error ? <p role="alert" className="cp-banner cp-tone-red mt-4"><span>{localizeCopierMessage(message, translate)}</span></p> : null}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="max-w-md text-[12px] leading-snug text-[color:var(--muted)]">{translate("Le mot de passe n’est pas conservé avec ce compte copieur. MetaSync ne le reçoit que si tu coches l’autorisation ci-dessus et que le serveur est compatible.")}</div><button type="button" disabled={busy || !consent || (syncConsent && (!accountCurrency || !accountType))} onClick={() => void addReceiver()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} {" "}{translate("Connecter ce compte")}</button></div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      <style jsx global>{`.cp-root{--cp-green:#1d7f4c;--cp-amber:#8f5d0b;--cp-red:#bd3242}.dark .cp-root{--cp-green:#6fd3a0;--cp-amber:#f0c674;--cp-red:#f4a39a}.cp-root :is(button,a,input,select,textarea,summary):focus-visible{outline:2px solid var(--gold);outline-offset:2px}.cp-card{border:1px solid var(--border);background:var(--panel);border-radius:20px}.cp-inset{border:1px solid var(--border);background:var(--panel-2);border-radius:14px}.cp-pill{display:inline-flex;align-items:center;gap:6px;min-height:26px;border-radius:999px;border:1px solid var(--border);padding:2px 10px;font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;color:var(--muted)}.cp-pill-xs{min-height:20px;padding:1px 8px;font-size:11px}.cp-dot{width:7px;height:7px;border-radius:999px;background:currentColor;flex:none}.cp-tone-green{color:var(--cp-green);border-color:color-mix(in srgb,var(--cp-green) 38%,transparent);background:color-mix(in srgb,var(--cp-green) 10%,transparent)}.cp-tone-amber{color:var(--cp-amber);border-color:color-mix(in srgb,var(--cp-amber) 38%,transparent);background:color-mix(in srgb,var(--cp-amber) 10%,transparent)}.cp-tone-red{color:var(--cp-red);border-color:color-mix(in srgb,var(--cp-red) 38%,transparent);background:color-mix(in srgb,var(--cp-red) 10%,transparent)}.cp-tone-gold{color:var(--gold-2);border-color:var(--gold-border);background:var(--gold-soft)}.dark .cp-tone-gold{color:var(--gold)}.cp-tone-neutral{color:var(--muted)}.cp-root .cp-banner{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-radius:14px;border:1px solid var(--border);background:var(--panel);padding:12px 14px;font-size:13px;line-height:1.55;color:var(--text)}.cp-root .cp-banner.cp-tone-green{border-color:color-mix(in srgb,var(--cp-green) 38%,transparent);background:color-mix(in srgb,var(--cp-green) 9%,var(--panel))}.cp-root .cp-banner.cp-tone-amber{border-color:color-mix(in srgb,var(--cp-amber) 38%,transparent);background:color-mix(in srgb,var(--cp-amber) 9%,var(--panel))}.cp-root .cp-banner.cp-tone-red{border-color:color-mix(in srgb,var(--cp-red) 38%,transparent);background:color-mix(in srgb,var(--cp-red) 9%,var(--panel))}.cp-gain{color:var(--cp-green)}.cp-loss{color:var(--cp-red)}.cp-step-done{color:var(--cp-green);background:color-mix(in srgb,var(--cp-green) 14%,transparent)}.cp-link{color:var(--gold-2);font-weight:600;text-decoration:underline;text-underline-offset:3px}.dark .cp-link{color:var(--gold)}.cp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--border);background:var(--panel);color:var(--text);font-size:13px;font-weight:600;line-height:1.2;white-space:nowrap;transition:border-color .15s,background-color .15s}.cp-btn:hover:not(:disabled){border-color:var(--gold-border)}.cp-btn:disabled{opacity:.45;cursor:not-allowed}.cp-btn-gold{background:var(--gold);border-color:var(--gold);color:#17130a}.cp-btn-gold:hover:not(:disabled){background:var(--gold-2);border-color:var(--gold-2)}.cp-btn-outline{border-color:var(--gold-border);color:var(--gold-2)}.dark .cp-btn-outline{color:var(--gold)}.cp-btn-danger{color:var(--cp-red);border-color:color-mix(in srgb,var(--cp-red) 35%,transparent)}.cp-btn-danger-solid{background:#c2323f;border-color:#c2323f;color:#fff}.cp-btn-danger-solid:hover:not(:disabled){background:#a72734;border-color:#a72734}.cp-btn-icon{width:42px;padding:0}.cp-btn-sm{min-height:36px;padding:0 12px;font-size:12px;border-radius:10px}.cp-btn-icon-sm{width:36px;padding:0}.cp-check{width:18px;height:18px;flex:none;margin-top:2px;accent-color:var(--gold)}.cp-switch{-webkit-appearance:none;appearance:none;position:relative;flex:none;width:42px;height:24px;margin:0;border-radius:999px;border:1px solid var(--border);background:var(--panel-2);cursor:pointer;transition:background-color .15s,border-color .15s}.cp-switch::before{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:999px;background:var(--muted);transition:transform .15s,background-color .15s}.cp-switch:checked{background:var(--gold);border-color:var(--gold)}.cp-switch:checked::before{transform:translateX(18px);background:#17130a}.cp-switch:disabled{opacity:.5;cursor:not-allowed}@media (min-width:1024px){.cp-root .cp-copy-grid{grid-template-columns:minmax(0,1.45fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,.85fr) minmax(0,.9fr) auto;column-gap:16px}}@media (prefers-reduced-motion:reduce){.cp-btn,.cp-switch,.cp-switch::before{transition:none}}.ip-field{height:44px;width:100%;min-width:0;border-radius:12px;border:1px solid var(--border);background:var(--panel-2);padding:0 12px;color:var(--text);font-size:14px;outline:none}textarea.ip-field{height:auto;min-height:92px;padding:10px 12px;line-height:1.5}.ip-field:focus{border-color:var(--gold-border)}.ip-field::placeholder{color:color-mix(in srgb,var(--muted) 70%,transparent)}.ip-field option{background:var(--panel);color:var(--text)}@media (max-width:640px){.ip-field{font-size:16px}}`}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t: translate } = useLocale();
 return <label className="block min-w-0"><span className="mb-1.5 block text-[12px] font-medium text-[color:var(--muted)]">{translate(label)}</span>{children}</label>; }

function CopyTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "gain" | "loss" }) {
  const { t: translate } = useLocale();
  return <div className="cp-card flex min-w-0 flex-col gap-1 p-4">
    <span className="text-[12px] font-medium text-[color:var(--muted)]">{translate(label)}</span>
    <span className={cn("break-words text-[19px] font-semibold leading-tight tabular-nums sm:text-[22px]", tone === "gain" ? "cp-gain" : tone === "loss" ? "cp-loss" : "")}>{value}</span>
    {sub ? <span className="break-words text-[12px] leading-snug text-[color:var(--muted)]">{sub}</span> : null}
  </div>;
}
