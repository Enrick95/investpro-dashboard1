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
      servers: ["FusionMarkets-Demo", "FusionMarkets-Live", "FusionMarkets-Live 3", "FusionMarkets-Live3"],
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

  const [riskSettings, setRiskSettings] = useState<RiskSettings>(DEFAULT_RISK_SETTINGS);
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
  const [requestBusy, setRequestBusy] = useState(false);
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
  });

  const approvedMasterLogins = useMemo(() => new Set(activationRequests.filter((r) => r.status === "activated").map((r) => `${r.platform}:${r.login}`)), [activationRequests]);
  const approvedMaster = activationRequests.find((r) => r.status === "activated") || null;
  const virtualReceivers = useMemo(() => {
    const rows: Array<Receiver & { legacy?: boolean }> = receivers.filter((r) => !approvedMasterLogins.has(`${r.platform}:${r.login}`)).map((r) => ({ ...r }));
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
  }, [receivers, legacyConnected, approvedMasterLogins]);

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
      setRequestSuccess("Votre demande de Master a bien été reçue. Vous pouvez suivre son statut dans votre espace InvestPro. Une notification ou un e-mail vous sera envoyé si ce canal est activé.");
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
      setMessage("InvestPro Copier actualisé.");
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
          "Demande de Risk Engine envoyée à l’équipe InvestPro. Le réglage actuel reste en place jusqu’à confirmation."
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

  function statsFor(receiver: Receiver) {
    const row = accounts.find((a) => {
      const p = String(a.platform || "").toUpperCase();
      return accountNumber(a) === receiver.login && (!p || p === receiver.platform);
    });
    const currency = String(row?.currency || "USD");
    return {
      balance: stat(row, ["current_balance", "balance"]),
      equity: stat(row, ["equity", "current_equity"]),
      pnl: stat(row, ["daily_pnl", "pnl_today", "today_pnl"]),
      open: stat(row, ["open_positions", "positions_open", "open_trades"]),
      currency,
    };
  }

  const masterAccountRow = approvedMaster ? accounts.find((a) => accountNumber(a) === approvedMaster.login && (!a.platform || String(a.platform).toUpperCase() === approvedMaster.platform)) : undefined;
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
      const data = await post({ action: "masters", receiverId: selectedReceiverId, consent: true, masters });
      if (data.status) applyStatus(data.status);
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
        if (!response.ok) throw new Error(result.error || "Impossible d’enregistrer les réglages de copie.");
        setRiskSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
        setRiskSaveState(result.requestStatus === "pending" ? "pending" : "saved");
      }
      setSaveBarState("saved");
      setRiskModalOpen(false);
      const pending = riskSettings.mode !== "fixed";
      setSaveBarMessage(pending ? "Liaison enregistrée · risque avancé en attente de validation" : "Configuration confirmée pour le mode lots fixes");
      setMessage(pending ? "La liaison a été enregistrée. Le mode de risque avancé attend la validation de l'équipe ; il n'est pas encore appliqué au moteur." : "Configuration des lots fixes envoyée au moteur.");
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
                <button type="button" onClick={() => setRequestOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]/80"><Send size={14} /> Demander un Master</button>
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

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.7fr]">
          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-6">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-semibold text-white">Compte Master (source)</div><div className="mt-1 text-[10px] text-white/35">Compte sélectionné pour piloter la copie</div></div><State active={Boolean(approvedMaster)} label={approvedMaster ? "Approuvé" : "À approuver"} /></div>
            <div className="mt-5 rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-2xl font-semibold text-white">{approvedMaster?.alias || "Aucun Master approuvé"}</div><div className="mt-1 text-[11px] text-white/40">{approvedMaster ? `#${approvedMaster.login} • ${approvedMaster.server}` : "La demande de Master doit être approuvée par un administrateur."}</div></div><button className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/70"><Settings2 size={16} /></button></div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><MiniMetric label="Equity" value={masterEquity == null ? "—" : money(masterEquity, masterCurrency)} /><MiniMetric label="Solde" value={masterBalance == null ? "En attente de sync" : money(masterBalance, masterCurrency)} /><MiniMetric label="P&L jour" value={masterPnl == null ? "—" : money(masterPnl, masterCurrency)} positive={Number(masterPnl) > 0} negative={Number(masterPnl) < 0} /></div>
            </div>
            <div className="mt-3 rounded-[20px] border border-white/[0.07] bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><SlidersHorizontal size={16} /></span>
                  <div><div className="text-xs font-semibold text-white">Risque &amp; exécution</div><div className="mt-1 text-[10px] leading-4 text-white/40">{selectedReceiver ? `Réglages de ${selectedReceiver.alias}` : "Sélectionne un receveur pour gérer le risque."}</div></div>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-semibold", riskSaveState === "saved" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300" : "border-white/[0.08] bg-white/[0.03] text-white/45")}>{riskSaveState === "saved" ? "Enregistré" : riskSaveState === "pending" ? "En attente" : "À vérifier"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <div><div className="text-[9px] uppercase tracking-[0.08em] text-white/30">Mode de copie</div><div className="mt-1 text-xs font-semibold text-[color:var(--gold)]">{riskModeLabel(riskSettings.mode)}</div></div>
                <button type="button" disabled={!selectedReceiver || selectedReceiver.id === "legacy"} onClick={() => setRiskModalOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 text-[10px] font-semibold text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]/80 disabled:cursor-not-allowed disabled:opacity-40"><Settings2 size={13} /> Régler le risque</button>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div id="copier-receivers" className="scroll-mt-24 text-lg font-semibold text-white">Comptes receveurs ({virtualReceivers.length})</div><div className="mt-1 text-[11px] text-white/40">Sélectionnez un compte pour configurer ses paramètres de copie.</div></div><button onClick={() => setAddOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black"><Plus size={15} /> Ajouter un compte receveur</button></div>
            <div className="mt-5 overflow-hidden rounded-[20px] border border-white/[0.07]">
              <div className="hidden grid-cols-[56px_1.7fr_.7fr_.8fr_.9fr_.9fr_.8fr_.75fr_.9fr] gap-3 border-b border-white/[0.06] bg-black/25 px-4 py-3 text-[9px] font-bold uppercase tracking-[0.08em] text-white/30 xl:grid"><div></div><div>Nom du compte</div><div>Plateforme</div><div>Statut</div><div>Solde</div><div>Equity</div><div>P&L jour</div><div>Ouverts</div><div>Actions</div></div>
              {virtualReceivers.length === 0 ? <div className="p-10 text-center text-white/40">Aucun receveur pour le moment.</div> : virtualReceivers.map((receiver) => {
                const s = receiver.id === "legacy" ? { balance: null, equity: null, pnl: null, open: null, currency: "USD" } : statsFor(receiver);
                const selected = selectedReceiverId === receiver.id;
                return <div key={receiver.id} className={cn("grid grid-cols-1 gap-3 border-b border-white/[0.05] px-4 py-4 last:border-0 xl:grid-cols-[56px_1.7fr_.7fr_.8fr_.9fr_.9fr_.8fr_.75fr_.9fr] xl:items-center", selected ? "bg-[color:var(--gold-soft)]" : "bg-black/10 hover:bg-white/[0.02]") }><div className="flex items-center"><button onClick={() => void selectReceiver(receiver.id)} className={cn("flex h-6 w-6 items-center justify-center rounded-md border text-[10px]", selected ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/50")}>{selected ? <Check size={13} /> : null}</button></div><button onClick={() => void selectReceiver(receiver.id)} className="text-left"><div className="text-sm font-semibold text-white">{receiver.alias}</div><div className="mt-1 text-[10px] text-white/35">#{receiver.login}</div></button><div className="text-[11px] font-semibold text-[color:var(--gold)]">{receiver.platform}</div><div><ReceiverStatusBadge status={receiver.status} /></div><div className="text-[11px] text-white/70">{money(s.balance, s.currency)}</div><div className="text-[11px] text-white/70">{money(s.equity, s.currency)}</div><div className={cn("text-[11px] font-medium", Number(s.pnl) > 0 ? "text-emerald-400" : Number(s.pnl) < 0 ? "text-red-400" : "text-white/60")}>{s.pnl == null ? "—" : money(s.pnl, s.currency)}</div><div className="text-[11px] text-white/70">{s.open == null ? "—" : String(s.open)}</div><div className="flex items-center gap-2"><button onClick={() => { setShowStats(true); void selectReceiver(receiver.id); }} aria-label={`Statistiques de ${receiver.alias}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white xl:h-8 xl:w-8 xl:rounded-lg"><Activity size={14} /></button><button onClick={() => void selectReceiver(receiver.id)} aria-label={`Configurer ${receiver.alias}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white xl:h-8 xl:w-8 xl:rounded-lg"><Settings2 size={14} /></button>{receiver.id !== "legacy" ? <button onClick={() => { setRemoveReceiverId(receiver.id); setDisconnectConsent(false); setRemoveError(""); }} aria-label={`Retirer ${receiver.alias}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 xl:h-8 xl:w-8 xl:rounded-lg"><Unplug size={14} /></button> : null}</div></div>;
              })}
            </div>
          </section>
        </section>

        {selectedReceiver ? <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div id="copier-masters" className="scroll-mt-24 text-lg font-semibold text-white">Liaisons Master</div><div className="mt-1 text-[11px] text-white/35">Sélectionne un Master approuvé pour ton receveur, puis configure le risque.</div></div>{selectedReceiver && selectedReceiver.id !== "legacy" ? <button onClick={() => { setRemoveReceiverId(selectedReceiver.id); setDisconnectConsent(false); setRemoveError(""); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 text-[11px] font-semibold text-red-300"><Unplug size={13} /> Retirer ce receveur</button> : null}</div><div className="mt-5 space-y-3">{(selectedStatus?.masterAccountsList || []).length === 0 ? <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-6 text-[11px] text-white/40">Aucune liaison master disponible pour le moment.</div> : (selectedStatus?.masterAccountsList || []).map((master, index) => { const current = selectedMasters[master.id] || { on: false, lots: masterQuickValue || "0.01" }; return <div key={master.id} className={cn("rounded-[18px] border p-4 transition", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.07] bg-black/20")}><div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr_auto_auto] md:items-center"><button onClick={() => toggleMaster(master.id)} className={cn("flex h-7 w-7 items-center justify-center rounded-md border", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/50")}>{current.on ? <Check size={14} /> : null}</button><div><div className="text-sm font-semibold text-white">{master.name}</div><div className="mt-1 text-[10px] text-white/35">MASTER {String(index + 1).padStart(2, "0")} · {current.on ? "Actif" : "Pause"}</div></div><div className="text-[10px] text-white/50">Mode</div><div className="text-[11px] font-semibold text-[color:var(--gold)]">{riskModeLabel(riskSettings.mode)}</div></div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_110px] md:items-end"><div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] text-white/40">Cette liaison utilisera les paramètres du bloc “Régler le risque”.</div>{riskSettings.mode === "fixed" ? <Field label="Lots"><input type="number" min="0.001" max={maxLots} step="any" value={current.lots} disabled={!current.on} onChange={(e) => changeLots(master.id, e.target.value)} className="ip-field disabled:opacity-35" /></Field> : <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-[10px] text-white/45">Géré automatiquement</div>}<State active={current.on} label={current.on ? "Actif" : "Pause"} /></div></div>; })}</div><label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[11px] leading-5 text-white/55"><input type="checkbox" checked={masterConsent} onChange={(e) => { setMasterConsent(e.target.checked); setSaveBarState("idle"); setSaveBarMessage("Configuration non enregistrée"); }} className="mt-0.5 h-4 w-4 accent-[#d4a934]" /> Je confirme le compte Master sélectionné.</label><div className="mt-4 flex justify-end"><button type="button" disabled={!selectedReceiver || activeMasters.length === 0 || !masterConsent} onClick={() => setRiskModalOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 py-3 text-xs font-semibold text-black disabled:opacity-40"><Settings2 size={15} /> Continuer : configurer le risque</button></div></section> : <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 text-sm text-white/50">Ajoute un compte receveur pour commencer.</section>}

        {selectedReceiver && riskModalOpen ? <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/80 px-3 py-5 backdrop-blur-sm md:px-8 md:py-10"><div className="mx-auto w-full max-w-[1200px]">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--gold-border)] bg-[#101310] p-4"><div><div className="font-semibold text-white">Configurer le risque de copie</div><div className="mt-1 text-xs text-white/50">{approvedMaster?.alias || "Master"} → {selectedReceiver.alias} : un seul enregistrement final</div></div><button onClick={() => setRiskModalOpen(false)} className="rounded-xl border border-white/10 p-2 text-white" aria-label="Fermer"><X size={18}/></button></div>
          <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xl font-semibold text-white">Paramètres de copie — {selectedReceiver.alias}</div><p className="mt-1 text-[11px] text-white/40">Configurez la stratégie de copie et les paramètres de gestion du risque pour ce compte receveur.</p></div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-semibold text-emerald-400"><CheckCircle2 size={12} /> Compte sélectionné</span><button onClick={() => setShowStats((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-[10px] font-semibold text-[color:var(--gold)]"><Activity size={13} /> {showStats ? "Masquer les statistiques" : "Voir les statistiques"}</button></div></div><div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2"><section className="hidden rounded-[22px] border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-bold text-black">1</span><div><div className="text-base font-semibold text-white">Choisir le receveur</div><div className="mt-1 text-[10px] text-white/35">Compte qui recevra les trades</div></div></div><div className="mt-4 rounded-[18px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">{selectedReceiver.alias}</div><div className="mt-1 text-[10px] text-white/35">#{selectedReceiver.login} · {selectedReceiver.platform} · {selectedReceiver.server}</div></div><State active={selectedReceiver.status === "connected"} label={selectedReceiver.status === "connected" ? "Connecté" : selectedReceiver.status === "paused" ? "Pause" : "Erreur"} /></div><select value={selectedReceiverId || ""} onChange={(e) => void selectReceiver(e.target.value)} className="ip-field mt-4">{virtualReceivers.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.alias} — {receiver.login}</option>)}</select><div className="mt-3 text-[10px] text-white/35">Tu peux changer de receveur ici pour configurer un autre compte sans quitter la page.</div></div></section><section className="rounded-[22px] border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-bold text-black">2</span><div><div className="text-base font-semibold text-white">Régler le risque</div><div className="mt-1 text-[10px] text-white/35">Choisissez la méthode de calcul des lots.</div></div></div><div className="mt-4 space-y-3"><InlineRiskOption active={riskSettings.mode === "fixed"} label="Lots fixes" desc="Volume identique défini par stratégie" onClick={() => setRiskSettings((v) => ({ ...v, mode: "fixed" }))}><input type="number" min="0.001" step="0.001" value={masterQuickValue} onChange={(e) => applyQuickModeToSelectedMasters(e.target.value)} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "mirror"} label="Copier les lots du Master" desc="Même lot que le master avec multiplicateur" onClick={() => setRiskSettings((v) => ({ ...v, mode: "mirror" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.mirror_multiplier} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "mirror", mirror_multiplier: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "balance"} label="Risque par solde" desc="Sizing basé sur le ratio de balance" onClick={() => setRiskSettings((v) => ({ ...v, mode: "balance" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.balance_multiplier} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "balance", balance_multiplier: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "equity"} label="Risque par equity" desc="Sizing basé sur le ratio d’equity" onClick={() => setRiskSettings((v) => ({ ...v, mode: "equity" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.equity_multiplier} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "equity", equity_multiplier: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption><InlineRiskOption active={riskSettings.mode === "percent"} label="Risque en %" desc="Pourcentage de capital risqué par trade" onClick={() => setRiskSettings((v) => ({ ...v, mode: "percent" }))}><input type="number" min="0.1" step="0.1" value={riskSettings.risk_percent} onChange={(e) => setRiskSettings((v) => ({ ...v, mode: "percent", risk_percent: Number(e.target.value || 1) }))} className="ip-field h-10 w-full text-center" /></InlineRiskOption></div></section><section className="rounded-[22px] border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--gold)] text-sm font-bold text-black">3</span><div><div className="text-base font-semibold text-white">Paramètres avancés</div><div className="mt-1 text-[10px] text-white/35">Protection, exécution et filtres.</div></div></div><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><RiskNumber label="Slippage max" value={riskSettings.slippage_pips} min={0} max={1000} step={1} suffix="pips" onChange={(value) => setRiskSettings((v) => ({ ...v, slippage_pips: value }))} /><RiskNumber label="Lots maximum" value={riskSettings.max_lots} min={0.01} max={1000} step={0.01} suffix="lots" onChange={(value) => setRiskSettings((v) => ({ ...v, max_lots: value }))} /><RiskNumber label="Multiplicateur des lots" value={riskSettings.mirror_multiplier} min={0.1} max={20} step={0.1} suffix="x" onChange={(value) => setRiskSettings((v) => ({ ...v, mirror_multiplier: value }))} /><RiskNumber label="Risque en %" value={riskSettings.risk_percent} min={0.1} max={20} step={0.1} suffix="%" onChange={(value) => setRiskSettings((v) => ({ ...v, risk_percent: value }))} /></div><div className="mt-4 space-y-3"><ToggleSetting label="Copier uniquement certains symboles" description="Préparez un filtrage personnalisé par symboles." checked={Boolean(riskSettings.symbol_mapping)} onChange={(checked) => setRiskSettings((v) => ({ ...v, symbol_mapping: checked ? v.symbol_mapping || "XAUUSD=GOLD" : "" }))} /><ToggleSetting label="Heures de trading autorisées" description="Option avancée de filtrage horaire." checked={riskSettings.drawdown_enabled} onChange={(checked) => setRiskSettings((v) => ({ ...v, drawdown_enabled: checked }))} /></div><Field label="Configuration / notes avancées"><textarea value={riskSettings.symbol_mapping} onChange={(e) => setRiskSettings((v) => ({ ...v, symbol_mapping: e.target.value }))} className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-black/25 p-3 text-[11px] leading-5 text-white outline-none focus:border-[color:var(--gold-border)]" placeholder={`Ex. XAUUSD=GOLD\nUS30=DJ30`} /></Field></section></div></section><div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[color:var(--gold-border)] bg-[#101310] p-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={masterConsent} onChange={(e) => setMasterConsent(e.target.checked)} /> Je confirme la configuration de la copie</label><button disabled={busy || riskBusy || !masterConsent} onClick={() => void saveAll()} className="rounded-xl bg-[color:var(--gold)] px-5 py-3 text-sm font-bold text-black disabled:opacity-40">{saveBarState === "saving" ? "Enregistrement…" : "Enregistrer et terminer"}</button></div></div></div> : null}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-1"><section className="hidden rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-lg font-semibold text-white">Liaisons Master</div><div className="mt-1 text-[11px] text-white/35">Active les masters que ce receveur doit copier.</div></div>{selectedReceiver && selectedReceiver.id !== "legacy" ? <button onClick={() => { setRemoveReceiverId(selectedReceiver.id); setDisconnectConsent(false); setRemoveError(""); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 text-[11px] font-semibold text-red-300"><Unplug size={13} /> Retirer ce receveur</button> : null}</div><div className="mt-5 space-y-3">{(selectedStatus?.masterAccountsList || []).length === 0 ? <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-6 text-[11px] text-white/40">Aucune liaison master disponible pour le moment.</div> : (selectedStatus?.masterAccountsList || []).map((master, index) => { const current = selectedMasters[master.id] || { on: false, lots: masterQuickValue || "0.01" }; return <div key={master.id} className={cn("rounded-[18px] border p-4 transition", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.07] bg-black/20")}><div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr_auto_auto] md:items-center"><button onClick={() => toggleMaster(master.id)} className={cn("flex h-7 w-7 items-center justify-center rounded-md border", current.on ? "border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black" : "border-white/10 text-white/50")}>{current.on ? <Check size={14} /> : null}</button><div><div className="text-sm font-semibold text-white">{master.name}</div><div className="mt-1 text-[10px] text-white/35">MASTER {String(index + 1).padStart(2, "0")} · {current.on ? "Actif" : "Pause"}</div></div><div className="text-[10px] text-white/50">Mode</div><div className="text-[11px] font-semibold text-[color:var(--gold)]">{riskModeLabel(riskSettings.mode)}</div></div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_110px] md:items-end"><div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] text-white/40">Cette liaison utilisera les paramètres du bloc “Régler le risque”.</div>{riskSettings.mode === "fixed" ? <Field label="Lots"><input type="number" min="0.001" max={maxLots} step="any" value={current.lots} disabled={!current.on} onChange={(e) => changeLots(master.id, e.target.value)} className="ip-field disabled:opacity-35" /></Field> : <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-[10px] text-white/45">Géré automatiquement</div>}<State active={current.on} label={current.on ? "Actif" : "Pause"} /></div></div>; })}</div><label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[11px] leading-5 text-white/55"><input type="checkbox" checked={masterConsent} onChange={(e) => { setMasterConsent(e.target.checked); setSaveBarState("idle"); setSaveBarMessage("Configuration non enregistrée"); }} className="mt-0.5 h-4 w-4 accent-[#d4a934]" /> Je confirme les stratégies et volumes sélectionnés.</label></section><section className="space-y-5"><section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div id="copier-history" className="scroll-mt-24 text-lg font-semibold text-white">État &amp; vérifications</div><div className="mt-1 text-[11px] text-white/35">État actuel des comptes et des réglages de copie.</div><div className="mt-4 overflow-hidden rounded-[18px] border border-white/[0.06]"><div className="grid grid-cols-3 gap-3 border-b border-white/[0.06] bg-black/20 px-4 py-3 text-[9px] font-bold uppercase tracking-[0.08em] text-white/30"><div>Élément</div><div>Statut</div><div>Dernière vérification</div></div><div className="grid grid-cols-3 gap-3 px-4 py-3 text-[11px] text-white/65"><div>Receveur sélectionné</div><div>{selectedReceiver ? "Sélectionné" : "En attente"}</div><div>{checked || "—"}</div></div><div className="grid grid-cols-3 gap-3 border-t border-white/[0.06] px-4 py-3 text-[11px] text-white/65"><div>Réglages de risque</div><div>{riskSaveState === "saved" ? "Enregistré" : riskSaveState === "pending" ? "En attente" : "Non enregistré"}</div><div>{riskSavedAt || "—"}</div></div><div className="grid grid-cols-3 gap-3 border-t border-white/[0.06] px-4 py-3 text-[11px] text-white/65"><div>Liaisons Master actives</div><div>{String(activeMasters.length)}</div><div>{checked || "—"}</div></div></div></section>{showStats ? <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6"><div className="text-lg font-semibold text-white">Statistiques du compte sélectionné</div><div className="mt-4 grid grid-cols-2 gap-3"><Summary label="Solde" value={selectedStats.balance == null ? "—" : money(selectedStats.balance, selectedStats.currency)} /><Summary label="Equity" value={selectedStats.equity == null ? "—" : money(selectedStats.equity, selectedStats.currency)} /><Summary label="P&L jour" value={selectedStats.pnl == null ? "—" : money(selectedStats.pnl, selectedStats.currency)} green={Number(selectedStats.pnl) > 0} /><Summary label="Positions ouvertes" value={selectedStats.open == null ? "—" : String(selectedStats.open)} /></div></section> : null}</section></section>


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
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] leading-5 text-white/50"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d4a934]" />J’autorise InvestPro à utiliser ces identifiants pour établir et maintenir la connexion de copie via son infrastructure technique.</label>
              <div className="mt-5 flex items-center justify-between gap-3"><div className="text-[8px] text-white/25">Le mot de passe n’est jamais stocké dans copier_receivers.</div><button disabled={busy || !consent} onClick={() => void addReceiver()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Connecter ce compte</button></div>
            </div>
          </div>
        </div>
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
