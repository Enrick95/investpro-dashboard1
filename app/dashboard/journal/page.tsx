"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Eye,
  ImageIcon,
  Plus,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { pushNotif } from "@/lib/notifyStore";

/* =========================================================
   TYPES
========================================================= */

type TradeStatus =
  | "open"
  | "win"
  | "loss"
  | "breakeven"
  | "cancelled";

type Direction = "buy" | "sell";

type Session =
  | "asian"
  | "london"
  | "new_york"
  | "other";

type TradingAccount = {
  id: number;
  user_id: string;
  name: string;
  account_type: "real" | "demo" | "prop";
  platform: "MT4" | "MT5" | "OTHER" | null;
  broker: string | null;
  currency: string;
  initial_balance: number;
  current_balance: number;
  connection_type: "manual" | "automatic";
};

type Trade = {
  id: number;

  user_id: string;

  account_id: number | null;
  account_balance: number | null;

  trade_date: string;

  symbol: string;

  direction: Direction;

  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;

  risk_percent: number;

  result_amount: number;
  result_r: number;

  status: TradeStatus;

  setup: string | null;

  session: Session | null;

  timeframe: string | null;

  emotion: string | null;
  mistake: string | null;
  notes: string | null;

  screenshot_url: string | null;

  created_at: string;
  updated_at: string;
};

type TradeForm = {
  trade_date: string;

  account_id: string;

  symbol: string;

  direction: Direction;

  entry_price: string;
  stop_loss: string;
  take_profit: string;

  risk_percent: string;

  status: TradeStatus;

  setup: string;

  session: Session | "";

  timeframe: string;

  emotion: string;
  mistake: string;
  notes: string;
};

type TradingPlan = {
  max_risk_percent: number;

  max_trades_per_day: number;

  minimum_rr: number;

  allowed_sessions: string[];

  allowed_assets: string[];

  allowed_setups: string[];
};

type PlanCheck = {
  key:
    | "risk"
    | "rr"
    | "asset"
    | "session"
    | "setup";

  label: string;

  valid: boolean;

  detail: string;
};

/* =========================================================
   DEFAULT FORM
========================================================= */

const emptyTradeForm: TradeForm = {
  trade_date: new Date()
    .toISOString()
    .slice(0, 10),

  account_id: "",

  symbol: "",

  direction: "buy",

  entry_price: "",
  stop_loss: "",
  take_profit: "",

  risk_percent: "1",

  status: "open",

  setup: "",

  session: "",

  timeframe: "",

  emotion: "",
  mistake: "",
  notes: "",
};

/* =========================================================
   HELPERS
========================================================= */

function numberOrNull(value: string) {
  const clean = value
    .trim()
    .replace(",", ".");

  if (!clean) {
    return null;
  }

  const number = Number(clean);

  return Number.isFinite(number)
    ? number
    : null;
}

function numberOrZero(value: string) {
  return numberOrNull(value) ?? 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(
  value: number,
  currency = "EUR"
) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(
    "fr-FR",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(
    "fr-FR",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function statusLabel(status: TradeStatus) {
  switch (status) {
    case "win":
      return "WIN";

    case "loss":
      return "LOSS";

    case "breakeven":
      return "BE";

    case "open":
      return "OUVERT";

    case "cancelled":
      return "ANNULÉ";

    default:
      return status;
  }
}

function statusClass(status: TradeStatus) {
  switch (status) {
    case "win":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";

    case "loss":
      return "border-red-500/20 bg-red-500/10 text-red-400";

    case "breakeven":
      return "border-blue-500/20 bg-blue-500/10 text-blue-400";

    case "open":
      return "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";

    case "cancelled":
      return "border-white/10 bg-white/5 text-white/40";
  }
}

/* =========================================================
   PETIT SON DE CONFIRMATION
========================================================= */

function prepareTradeSound() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as any).webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    const context =
      new AudioContextClass();

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    return context as AudioContext;
  } catch {
    return null;
  }
}

function playTradeSuccessSound(
  context: AudioContext | null
) {
  if (!context) {
    return;
  }

  try {
    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type = "sine";

    oscillator.frequency.setValueAtTime(
      880,
      context.currentTime
    );

    oscillator.frequency.exponentialRampToValueAtTime(
      1175,
      context.currentTime + 0.11
    );

    gain.gain.setValueAtTime(
      0.0001,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.12,
      context.currentTime + 0.015
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + 0.18
    );

    oscillator.connect(gain);

    gain.connect(
      context.destination
    );

    oscillator.start();

    oscillator.stop(
      context.currentTime + 0.19
    );

    oscillator.onended = () => {
      context
        .close()
        .catch(() => {});
    };
  } catch {
    // Le son ne doit jamais bloquer
    // l'enregistrement d'un trade.
  }
}

/* =========================================================
   AUTOMATIC TRADE CALCULATIONS
========================================================= */

function calculateRR(
  entry: number | null,
  stopLoss: number | null,
  takeProfit: number | null
) {
  if (
    entry == null ||
    stopLoss == null ||
    takeProfit == null
  ) {
    return null;
  }

  const riskDistance =
    Math.abs(
      entry - stopLoss
    );

  const rewardDistance =
    Math.abs(
      takeProfit - entry
    );

  if (riskDistance <= 0) {
    return null;
  }

  return (
    rewardDistance /
    riskDistance
  );
}

function calculateTradeResult({
  balance,
  riskPercent,
  entry,
  stopLoss,
  takeProfit,
  status,
}: {
  balance: number;
  riskPercent: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  status: TradeStatus;
}) {
  const riskMoney =
    balance > 0 &&
    riskPercent > 0
      ? balance *
        (riskPercent / 100)
      : 0;

  const rr =
    calculateRR(
      entry,
      stopLoss,
      takeProfit
    );

  let resultR = 0;
  let resultAmount = 0;

  if (status === "win") {
    resultR =
      rr ?? 0;

    resultAmount =
      riskMoney *
      resultR;
  }

  if (status === "loss") {
    resultR = -1;

    resultAmount =
      -riskMoney;
  }

  if (
    status === "breakeven" ||
    status === "open" ||
    status === "cancelled"
  ) {
    resultR = 0;
    resultAmount = 0;
  }

  return {
    riskMoney,
    rr,
    resultR,
    resultAmount,
  };
}

/* =========================================================
   PLAN HELPERS
========================================================= */

function normalizeAsset(value: string) {
  const clean = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (clean === "GOLD") {
    return "XAUUSD";
  }

  return clean;
}

function normalizeSession(
  value?: string | null
) {
  const clean = String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ");

  if (
    clean === "new york" ||
    clean === "newyork"
  ) {
    return "new york";
  }

  if (
    clean === "asian" ||
    clean === "asia"
  ) {
    return "asian";
  }

  if (clean === "london") {
    return "london";
  }

  return clean;
}

function normalizeText(
  value?: string | null
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

function evaluatePlan(
  trade: {
    symbol: string;

    risk_percent: number;

    entry_price: number | null;

    stop_loss: number | null;

    take_profit: number | null;

    session: string | null;

    setup: string | null;
  },

  plan: TradingPlan | null
) {
  if (!plan) {
    return {
      compliant:
        null as boolean | null,

      rr:
        null as number | null,

      checks:
        [] as PlanCheck[],
    };
  }

  const checks: PlanCheck[] = [];

  /* RISK */

  const riskValid =
    Number(
      trade.risk_percent
    ) <=
    Number(
      plan.max_risk_percent
    );

  checks.push({
    key: "risk",

    label:
      "Risque respecté",

    valid:
      riskValid,

    detail: `${Number(
      trade.risk_percent
    )}% / max ${Number(
      plan.max_risk_percent
    )}%`,
  });

  /* RR */

  const rr =
    calculateRR(
      trade.entry_price,
      trade.stop_loss,
      trade.take_profit
    );

  const rrValid =
    rr !== null &&
    rr >=
      Number(
        plan.minimum_rr
      );

  checks.push({
    key: "rr",

    label:
      "RR respecté",

    valid:
      rrValid,

    detail:
      rr === null
        ? `Impossible à vérifier • minimum 1:${plan.minimum_rr}`
        : `1:${rr.toFixed(
            2
          )} / minimum 1:${plan.minimum_rr}`,
  });

  /* ASSET */

  if (
    plan.allowed_assets.length >
    0
  ) {
    const asset =
      normalizeAsset(
        trade.symbol
      );

    const allowedAssets =
      plan.allowed_assets.map(
        normalizeAsset
      );

    const assetValid =
      allowedAssets.includes(
        asset
      );

    checks.push({
      key: "asset",

      label:
        "Actif autorisé",

      valid:
        assetValid,

      detail:
        assetValid
          ? asset
          : `${asset || "—"} n’est pas dans ton plan`,
    });
  }

  /* SESSION */

  if (
    plan.allowed_sessions.length >
    0
  ) {
    const session =
      normalizeSession(
        trade.session
      );

    const allowedSessions =
      plan.allowed_sessions.map(
        normalizeSession
      );

    const sessionValid =
      !!session &&
      allowedSessions.includes(
        session
      );

    checks.push({
      key: "session",

      label:
        "Session autorisée",

      valid:
        sessionValid,

      detail:
        sessionValid
          ? session
          : session
          ? `${session} n’est pas autorisée`
          : "Session non renseignée",
    });
  }

  /* SETUP */

  if (
    plan.allowed_setups.length >
    0
  ) {
    const setup =
      normalizeText(
        trade.setup
      );

    const allowedSetups =
      plan.allowed_setups.map(
        normalizeText
      );

    const setupValid =
      !!setup &&
      allowedSetups.includes(
        setup
      );

    checks.push({
      key: "setup",

      label:
        "Setup autorisé",

      valid:
        setupValid,

      detail:
        setupValid
          ? trade.setup || ""
          : setup
          ? `${trade.setup} n’est pas dans ton plan`
          : "Setup non renseigné",
    });
  }

  return {
    rr,

    checks,

    compliant:
      checks.length > 0 &&
      checks.every(
        (check) =>
          check.valid
      ),
  };
}

/* =========================================================
   PAGE
========================================================= */

export default function JournalPage() {
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    userId,
    setUserId,
  ] =
    useState<string | null>(
      null
    );

  const [
    trades,
    setTrades,
  ] =
    useState<Trade[]>([]);

  const [
    accounts,
    setAccounts,
  ] =
    useState<TradingAccount[]>(
      []
    );

  const [
    tradingPlan,
    setTradingPlan,
  ] =
    useState<TradingPlan | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    modalOpen,
    setModalOpen,
  ] =
    useState(false);

  const [
    editingTrade,
    setEditingTrade,
  ] =
    useState<Trade | null>(
      null
    );

  const [
    form,
    setForm,
  ] =
    useState<TradeForm>({
      ...emptyTradeForm,
    });

  const [
    screenshotFile,
    setScreenshotFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    screenshotPreview,
    setScreenshotPreview,
  ] =
    useState<string | null>(
      null
    );

  const [
    removeExistingScreenshot,
    setRemoveExistingScreenshot,
  ] =
    useState(false);

  const [
    screenshotUrls,
    setScreenshotUrls,
  ] =
    useState<Record<number, string>>(
      {}
    );

  const [
    viewingScreenshot,
    setViewingScreenshot,
  ] =
    useState<string | null>(
      null
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      "all" | TradeStatus
    >("all");

  const [
    directionFilter,
    setDirectionFilter,
  ] =
    useState<
      "all" | Direction
    >("all");

  /* =========================================================
     LOAD
  ========================================================= */

  useEffect(() => {
    loadJournal();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (
        screenshotPreview?.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          screenshotPreview
        );
      }
    };
  }, [screenshotPreview]);

  async function loadJournal() {
    try {
      setLoading(true);

      const {
        data: { user },
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        window.location.href =
          "/login";

        return;
      }

      setUserId(
        user.id
      );

      const [
        tradesResult,
        planResult,
        accountsResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "trading_journal"
            )
            .select("*")
            .order(
              "trade_date",
              {
                ascending:
                  false,
              }
            ),

          supabase
            .from(
              "trading_plans"
            )
            .select(
              `
                max_risk_percent,
                max_trades_per_day,
                minimum_rr,
                allowed_sessions,
                allowed_assets,
                allowed_setups
              `
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle(),

          supabase
            .from(
              "trading_accounts"
            )
            .select(
              `
                id,
                user_id,
                name,
                account_type,
                platform,
                broker,
                currency,
                initial_balance,
                current_balance,
                connection_type
              `
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            ),
        ]);

      /* TRADES */

      if (
        tradesResult.error
      ) {
        console.error(
          "Erreur journal :",
          tradesResult.error
        );

        pushNotif({
          kind: "error",

          title:
            "Journal",

          message:
            "Impossible de charger les trades.",

          ttlMs: 8000,
        });
      } else {
        const loadedTrades =
          (tradesResult.data as Trade[]) ||
          [];

        setTrades(
          loadedTrades
        );

        await loadScreenshotUrls(
          loadedTrades
        );
      }

      /* ACCOUNTS */

      if (
        accountsResult.error
      ) {
        console.error(
          "Erreur comptes journal :",
          accountsResult.error
        );

        pushNotif({
          kind: "error",

          title:
            "Journal",

          message:
            "Impossible de charger tes comptes de trading.",

          ttlMs: 8000,
        });
      } else {
        setAccounts(
          (accountsResult.data as TradingAccount[]) ||
            []
        );
      }

      /* PLAN */

      if (
        planResult.error
      ) {
        console.error(
          "Erreur chargement plan :",
          planResult.error
        );
      }

      if (
        planResult.data
      ) {
        setTradingPlan({
          max_risk_percent:
            Number(
              planResult.data
                .max_risk_percent
            ),

          max_trades_per_day:
            Number(
              planResult.data
                .max_trades_per_day
            ),

          minimum_rr:
            Number(
              planResult.data
                .minimum_rr
            ),

          allowed_sessions:
            Array.isArray(
              planResult.data
                .allowed_sessions
            )
              ? planResult.data
                  .allowed_sessions
              : [],

          allowed_assets:
            Array.isArray(
              planResult.data
                .allowed_assets
            )
              ? planResult.data
                  .allowed_assets
              : [],

          allowed_setups:
            Array.isArray(
              planResult.data
                .allowed_setups
            )
              ? planResult.data
                  .allowed_setups
              : [],
        });
      } else {
        setTradingPlan(
          null
        );
      }
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =========================================================
     SCREENSHOTS / SUPABASE STORAGE
  ========================================================= */

  async function loadScreenshotUrls(
    tradeList: Trade[]
  ) {
    const withScreenshot =
      tradeList.filter(
        (trade) =>
          !!trade.screenshot_url
      );

    if (
      withScreenshot.length ===
      0
    ) {
      setScreenshotUrls(
        {}
      );

      return;
    }

    const entries =
      await Promise.all(
        withScreenshot.map(
          async (
            trade
          ) => {
            const storedValue =
              trade.screenshot_url!;

            if (
              storedValue.startsWith(
                "http://"
              ) ||
              storedValue.startsWith(
                "https://"
              )
            ) {
              return [
                trade.id,
                storedValue,
              ] as const;
            }

            const {
              data,
              error,
            } =
              await supabase.storage
                .from(
                  "trade-screenshots"
                )
                .createSignedUrl(
                  storedValue,
                  60 * 60
                );

            if (
              error ||
              !data?.signedUrl
            ) {
              console.error(
                "Erreur URL capture :",
                error
              );

              return null;
            }

            return [
              trade.id,
              data.signedUrl,
            ] as const;
          }
        )
      );

    const nextUrls:
      Record<
        number,
        string
      > = {};

    entries.forEach(
      (
        entry
      ) => {
        if (entry) {
          nextUrls[
            entry[0]
          ] =
            entry[1];
        }
      }
    );

    setScreenshotUrls(
      nextUrls
    );
  }

  function selectScreenshot(
    file:
      | File
      | null
  ) {
    if (!file) {
      return;
    }

    const allowedTypes =
      [
        "image/png",
        "image/jpeg",
        "image/webp",
      ];

    if (
      !allowedTypes.includes(
        file.type
      )
    ) {
      pushNotif({
        kind:
          "warning",

        title:
          "Capture TradingView",

        message:
          "Utilise une image PNG, JPG/JPEG ou WEBP.",

        ttlMs:
          7000,
      });

      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      pushNotif({
        kind:
          "warning",

        title:
          "Capture TradingView",

        message:
          "La capture ne doit pas dépasser 5 Mo.",

        ttlMs:
          7000,
      });

      return;
    }

    if (
      screenshotPreview?.startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(
        screenshotPreview
      );
    }

    setScreenshotFile(
      file
    );

    setScreenshotPreview(
      URL.createObjectURL(
        file
      )
    );

    setRemoveExistingScreenshot(
      false
    );
  }

  function removeScreenshotFromForm() {
    if (
      screenshotPreview?.startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(
        screenshotPreview
      );
    }

    setScreenshotFile(
      null
    );

    setScreenshotPreview(
      null
    );

    if (
      editingTrade?.screenshot_url
    ) {
      setRemoveExistingScreenshot(
        true
      );
    }
  }

  async function uploadTradeScreenshot(
    file: File
  ) {
    if (!userId) {
      throw new Error(
        "Utilisateur non connecté."
      );
    }

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase() ||
      "jpg";

    const fileName =
      typeof crypto !==
        "undefined" &&
      "randomUUID" in
        crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;

    const path =
      `${userId}/${Date.now()}-${fileName}.${extension}`;

    const {
      error,
    } =
      await supabase.storage
        .from(
          "trade-screenshots"
        )
        .upload(
          path,
          file,
          {
            cacheControl:
              "3600",

            upsert:
              false,

            contentType:
              file.type,
          }
        );

    if (error) {
      throw error;
    }

    return path;
  }

  async function deleteStoredScreenshot(
    path:
      | string
      | null
  ) {
    if (
      !path ||
      path.startsWith(
        "http://"
      ) ||
      path.startsWith(
        "https://"
      )
    ) {
      return;
    }

    const {
      error,
    } =
      await supabase.storage
        .from(
          "trade-screenshots"
        )
        .remove([
          path,
        ]);

    if (error) {
      console.error(
        "Erreur suppression capture :",
        error
      );
    }
  }

  const currentScreenshotPreview =
    screenshotPreview ||
    (
      !removeExistingScreenshot &&
      editingTrade?.screenshot_url
        ? screenshotUrls[
            editingTrade.id
          ] ||
          null
        : null
    );

  /* =========================================================
     SELECTED ACCOUNT
  ========================================================= */

  const selectedAccount =
    useMemo(() => {
      if (
        !form.account_id
      ) {
        return null;
      }

      return (
        accounts.find(
          (account) =>
            String(
              account.id
            ) ===
            form.account_id
        ) || null
      );
    }, [
      accounts,
      form.account_id,
    ]);

  /* =========================================================
     ACCOUNT MAP
  ========================================================= */

  const accountMap =
    useMemo(() => {
      const map =
        new Map<
          number,
          TradingAccount
        >();

      accounts.forEach(
        (account) => {
          map.set(
            account.id,
            account
          );
        }
      );

      return map;
    }, [accounts]);

  /* =========================================================
     FILTERS
  ========================================================= */

  const filteredTrades =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return trades.filter(
        (trade) => {
          if (
            statusFilter !==
              "all" &&
            trade.status !==
              statusFilter
          ) {
            return false;
          }

          if (
            directionFilter !==
              "all" &&
            trade.direction !==
              directionFilter
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const account =
            trade.account_id
              ? accountMap.get(
                  trade.account_id
                )
              : null;

          const haystack =
            [
              trade.symbol,
              trade.setup,
              trade.session,
              trade.timeframe,
              trade.notes,
              trade.mistake,
              trade.emotion,
              account?.name,
              account?.broker,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          return haystack.includes(
            query
          );
        }
      );
    }, [
      trades,
      search,
      statusFilter,
      directionFilter,
      accountMap,
    ]);

  /* =========================================================
     DISPLAY CURRENCY
  ========================================================= */

  const journalCurrency =
    useMemo(() => {
      if (
        accounts.length === 0
      ) {
        return "EUR";
      }

      const currencies =
        Array.from(
          new Set(
            accounts.map(
              (account) =>
                account.currency
            )
          )
        );

      if (
        currencies.length ===
        1
      ) {
        return (
          currencies[0] ||
          "EUR"
        );
      }

      return null;
    }, [accounts]);

  /* =========================================================
     STATS
  ========================================================= */

  const stats =
    useMemo(() => {
      const closed =
        trades.filter(
          (trade) =>
            trade.status ===
              "win" ||
            trade.status ===
              "loss" ||
            trade.status ===
              "breakeven"
        );

      const wins =
        closed.filter(
          (trade) =>
            trade.status ===
            "win"
        ).length;

      const losses =
        closed.filter(
          (trade) =>
            trade.status ===
            "loss"
        ).length;

      const pnl =
        trades.reduce(
          (
            total,
            trade
          ) =>
            total +
            Number(
              trade.result_amount ||
                0
            ),
          0
        );

      const rTotal =
        closed.reduce(
          (
            total,
            trade
          ) =>
            total +
            Number(
              trade.result_r ||
                0
            ),
          0
        );

      const winrate =
        wins + losses > 0
          ? (wins /
              (wins +
                losses)) *
            100
          : 0;

      const avgR =
        closed.length > 0
          ? rTotal /
            closed.length
          : 0;

      const evaluated =
        trades.map(
          (trade) =>
            evaluatePlan(
              trade,
              tradingPlan
            )
        );

      const conforming =
        evaluated.filter(
          (result) =>
            result.compliant ===
            true
        ).length;

      const evaluatedCount =
        evaluated.filter(
          (result) =>
            result.compliant !==
            null
        ).length;

      const discipline =
        evaluatedCount > 0
          ? (conforming /
              evaluatedCount) *
            100
          : 0;

      return {
        total:
          trades.length,

        wins,

        losses,

        pnl,

        winrate,

        avgR,

        discipline,
      };
    }, [
      trades,
      tradingPlan,
    ]);

  /* =========================================================
     AUTOMATIC RESULT
  ========================================================= */

  const autoResult =
    useMemo(() => {
      return calculateTradeResult({
        balance:
          Number(
            selectedAccount
              ?.current_balance ||
              0
          ),

        riskPercent:
          numberOrZero(
            form.risk_percent
          ),

        entry:
          numberOrNull(
            form.entry_price
          ),

        stopLoss:
          numberOrNull(
            form.stop_loss
          ),

        takeProfit:
          numberOrNull(
            form.take_profit
          ),

        status:
          form.status,
      });
    }, [
      form,
      selectedAccount,
    ]);

  /* =========================================================
     PLAN ANALYSIS
  ========================================================= */

  const formPlanEvaluation =
    useMemo(() => {
      return evaluatePlan(
        {
          symbol:
            form.symbol,

          risk_percent:
            numberOrZero(
              form.risk_percent
            ),

          entry_price:
            numberOrNull(
              form.entry_price
            ),

          stop_loss:
            numberOrNull(
              form.stop_loss
            ),

          take_profit:
            numberOrNull(
              form.take_profit
            ),

          session:
            form.session ||
            null,

          setup:
            form.setup ||
            null,
        },

        tradingPlan
      );
    }, [
      form,
      tradingPlan,
    ]);

  /* =========================================================
     MODAL
  ========================================================= */

  function openNewTrade() {
    setEditingTrade(
      null
    );

    if (
      screenshotPreview?.startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(
        screenshotPreview
      );
    }

    setScreenshotFile(
      null
    );

    setScreenshotPreview(
      null
    );

    setRemoveExistingScreenshot(
      false
    );

    setForm({
      ...emptyTradeForm,

      trade_date:
        new Date()
          .toISOString()
          .slice(0, 10),

      account_id:
        accounts.length > 0
          ? String(
              accounts[0].id
            )
          : "",

      risk_percent:
        tradingPlan
          ? String(
              tradingPlan.max_risk_percent
            )
          : "1",
    });

    setModalOpen(
      true
    );
  }

  function openEditTrade(
    trade: Trade
  ) {
    setEditingTrade(
      trade
    );

    if (
      screenshotPreview?.startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(
        screenshotPreview
      );
    }

    setScreenshotFile(
      null
    );

    setScreenshotPreview(
      null
    );

    setRemoveExistingScreenshot(
      false
    );

    let accountId =
      trade.account_id
        ? String(
            trade.account_id
          )
        : "";

    /*
     * Pour les anciens trades créés avant
     * la liaison aux comptes :
     * s'il n'existe qu'un compte, on le
     * sélectionne automatiquement.
     */

    if (
      !accountId &&
      accounts.length === 1
    ) {
      accountId =
        String(
          accounts[0].id
        );
    }

    setForm({
      trade_date:
        trade.trade_date.slice(
          0,
          10
        ),

      account_id:
        accountId,

      symbol:
        trade.symbol,

      direction:
        trade.direction,

      entry_price:
        trade.entry_price !=
        null
          ? String(
              trade.entry_price
            )
          : "",

      stop_loss:
        trade.stop_loss !=
        null
          ? String(
              trade.stop_loss
            )
          : "",

      take_profit:
        trade.take_profit !=
        null
          ? String(
              trade.take_profit
            )
          : "",

      risk_percent:
        String(
          trade.risk_percent ??
            1
        ),

      status:
        trade.status,

      setup:
        trade.setup ||
        "",

      session:
        trade.session ||
        "",

      timeframe:
        trade.timeframe ||
        "",

      emotion:
        trade.emotion ||
        "",

      mistake:
        trade.mistake ||
        "",

      notes:
        trade.notes ||
        "",
    });

    setModalOpen(
      true
    );
  }

  /* =========================================================
     SAVE
  ========================================================= */

  async function saveTrade() {
    if (!userId) {
      return;
    }

    const symbol =
      form.symbol
        .trim()
        .toUpperCase();

    if (!symbol) {
      pushNotif({
        kind:
          "warning",

        title:
          "Journal",

        message:
          "L’actif est obligatoire.",

        ttlMs:
          7000,
      });

      return;
    }

    if (
      !selectedAccount
    ) {
      pushNotif({
        kind:
          "warning",

        title:
          "Journal",

        message:
          "Sélectionne un compte de trading avant d’ajouter le trade.",

        ttlMs:
          8000,
      });

      return;
    }

    const balance =
      Number(
        selectedAccount
          .current_balance ||
          0
      );

    if (
      form.status !==
        "cancelled" &&
      balance <= 0
    ) {
      pushNotif({
        kind:
          "warning",

        title:
          "Journal",

        message:
          "Le capital actuel de ce compte doit être supérieur à 0.",

        ttlMs:
          8000,
      });

      return;
    }

    if (
      form.status ===
        "win" &&
      autoResult.rr ===
        null
    ) {
      pushNotif({
        kind:
          "warning",

        title:
          "Journal",

        message:
          "Pour un WIN, renseigne l’entrée, le Stop Loss et le Take Profit afin de calculer le RR.",

        ttlMs:
          9000,
      });

      return;
    }

    /*
     * On prépare l'AudioContext pendant
     * le clic utilisateur.
     * Cela évite que le navigateur bloque
     * le son après l'appel Supabase.
     */

    const soundContext =
      !editingTrade
        ? prepareTradeSound()
        : null;

    let uploadedScreenshotPath:
      | string
      | null =
        null;

    let finalScreenshotPath:
      | string
      | null =
        editingTrade?.screenshot_url ||
        null;

    try {
      setSaving(
        true
      );

      if (
        removeExistingScreenshot
      ) {
        finalScreenshotPath =
          null;
      }

      if (
        screenshotFile
      ) {
        uploadedScreenshotPath =
          await uploadTradeScreenshot(
            screenshotFile
          );

        finalScreenshotPath =
          uploadedScreenshotPath;
      }

      const payload = {
        user_id:
          userId,

        account_id:
          selectedAccount.id,

        /*
         * Snapshot du capital au moment
         * où le trade est enregistré.
         */

        account_balance:
          balance,

        trade_date:
          new Date(
            `${form.trade_date}T12:00:00`
          ).toISOString(),

        symbol,

        direction:
          form.direction,

        entry_price:
          numberOrNull(
            form.entry_price
          ),

        stop_loss:
          numberOrNull(
            form.stop_loss
          ),

        take_profit:
          numberOrNull(
            form.take_profit
          ),

        risk_percent:
          numberOrZero(
            form.risk_percent
          ),

        result_amount:
          autoResult.resultAmount,

        result_r:
          autoResult.resultR,

        status:
          form.status,

        setup:
          form.setup.trim() ||
          null,

        session:
          form.session ||
          null,

        timeframe:
          form.timeframe.trim() ||
          null,

        emotion:
          form.emotion.trim() ||
          null,

        mistake:
          form.mistake.trim() ||
          null,

        notes:
          form.notes.trim() ||
          null,

        screenshot_url:
          finalScreenshotPath,

        updated_at:
          new Date().toISOString(),
      };

      /* EDIT */

      if (
        editingTrade
      ) {
        const {
          error,
        } =
          await supabase
            .from(
              "trading_journal"
            )
            .update(
              payload
            )
            .eq(
              "id",
              editingTrade.id
            );

        if (error) {
          throw error;
        }

        if (
          editingTrade.screenshot_url &&
          (
            removeExistingScreenshot ||
            (
              uploadedScreenshotPath &&
              uploadedScreenshotPath !==
                editingTrade.screenshot_url
            )
          )
        ) {
          await deleteStoredScreenshot(
            editingTrade.screenshot_url
          );
        }

        pushNotif({
          kind:
            "success",

          title:
            "Journal",

          message:
            "Trade modifié et résultats recalculés.",

          ttlMs:
            6000,
        });
      }

      /* NEW */

      else {
        const {
          error,
        } =
          await supabase
            .from(
              "trading_journal"
            )
            .insert(
              payload
            );

        if (error) {
          throw error;
        }

        /*
         * 🔔 Petit bip uniquement après
         * un ajout réellement réussi.
         */

        playTradeSuccessSound(
          soundContext
        );

        pushNotif({
          kind:
            "success",

          title:
            "Journal",

          message:
            formPlanEvaluation.compliant ===
            true
              ? "Trade ajouté • conforme à ton plan."
              : formPlanEvaluation.compliant ===
                false
              ? "Trade ajouté • certaines règles du plan ne sont pas respectées."
              : "Trade ajouté.",

          ttlMs:
            7000,
        });
      }

      setModalOpen(
        false
      );

      await loadJournal();
    } catch (
      error: any
    ) {
      console.error(
        "Erreur sauvegarde trade :",
        error
      );

      if (
        uploadedScreenshotPath
      ) {
        await deleteStoredScreenshot(
          uploadedScreenshotPath
        );
      }

      if (
        soundContext
      ) {
        soundContext
          .close()
          .catch(
            () => {}
          );
      }

      pushNotif({
        kind:
          "error",

        title:
          "Journal",

        message:
          error?.message ||
          "Impossible d’enregistrer le trade.",

        ttlMs:
          10000,
      });
    } finally {
      setSaving(
        false
      );
    }
  }

  /* =========================================================
     DELETE
  ========================================================= */

  async function deleteTrade(
    trade: Trade
  ) {
    const confirmed =
      window.confirm(
        `Supprimer le trade ${trade.symbol} ?`
      );

    if (!confirmed) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "trading_journal"
        )
        .delete()
        .eq(
          "id",
          trade.id
        );

    if (error) {
      pushNotif({
        kind:
          "error",

        title:
          "Journal",

        message:
          "Impossible de supprimer le trade.",

        ttlMs:
          8000,
      });

      return;
    }

    if (
      trade.screenshot_url
    ) {
      await deleteStoredScreenshot(
        trade.screenshot_url
      );
    }

    setTrades(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            trade.id
        )
    );

    pushNotif({
      kind:
        "success",

      title:
        "Journal",

      message:
        "Trade supprimé.",

      ttlMs:
        5000,
    });
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement du journal…
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5 pb-10">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Journal de trading
            </h1>

            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Analyse tes trades,
              tes résultats et
              ta discipline.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="
                rounded-xl
                border border-[color:var(--border)]
                bg-[color:var(--panel)]
                px-3 py-2
                text-xs
                text-[color:var(--muted)]
              "
            >
              Mode manuel
            </div>

            <button
              type="button"
              onClick={
                openNewTrade
              }
              className="
                inline-flex
                h-11
                items-center
                gap-2
                rounded-xl
                bg-[color:var(--gold)]
                px-4
                text-sm
                font-semibold
                text-black
                hover:bg-[color:var(--gold-2)]
                transition
              "
            >
              <Plus
                size={16}
              />

              Ajouter un trade
            </button>
          </div>
        </div>

        {/* =====================================================
            PLAN
        ===================================================== */}

        {tradingPlan ? (
          <section
            className="
              flex
              flex-col
              gap-4
              rounded-[22px]
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              px-5 py-4
              lg:flex-row
              lg:items-center
              lg:justify-between
            "
          >
            <div className="flex items-center gap-3">
              <div
                className="
                  flex h-10 w-10
                  items-center justify-center
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-black/20
                  text-[color:var(--gold)]
                "
              >
                <ShieldCheck
                  size={18}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-white">
                  Ton plan de
                  trading est actif
                </div>

                <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                  Chaque trade est
                  analysé automatiquement
                  selon tes règles.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PlanMiniPill
                text={`Risque max ${tradingPlan.max_risk_percent}%`}
              />

              <PlanMiniPill
                text={`RR min 1:${tradingPlan.minimum_rr}`}
              />

              <PlanMiniPill
                text={`${tradingPlan.max_trades_per_day} trades/jour`}
              />

              <Link
                href="/dashboard/plan"
                className="
                  ml-1
                  text-[10px]
                  font-semibold
                  text-[color:var(--gold)]
                  no-underline
                "
              >
                Modifier mon plan →
              </Link>
            </div>
          </section>
        ) : null}

        {/* =====================================================
            ACCOUNT INFO
        ===================================================== */}

        {accounts.length >
        0 ? (
          <section
            className="
              flex
              flex-col
              gap-3
              rounded-[20px]
              border border-white/[0.07]
              bg-[color:var(--panel)]
              px-5 py-4
              md:flex-row
              md:items-center
              md:justify-between
            "
          >
            <div className="flex items-center gap-3">
              <div
                className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  text-[color:var(--gold)]
                "
              >
                <WalletCards
                  size={17}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-white">
                  {accounts.length ===
                  1
                    ? "Compte de trading connecté au journal"
                    : `${accounts.length} comptes disponibles`}
                </div>

                <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                  Le capital est
                  récupéré automatiquement
                  depuis Mes comptes.
                </div>
              </div>
            </div>

            {accounts.length ===
            1 ? (
              <div className="text-right">
                <div className="text-xs font-semibold text-white">
                  {
                    accounts[0]
                      .name
                  }
                </div>

                <div className="mt-1 text-[10px] text-[color:var(--gold)]">
                  {formatCurrency(
                    Number(
                      accounts[0]
                        .current_balance ||
                        0
                    ),
                    accounts[0]
                      .currency
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <section
            className="
              flex
              flex-col
              gap-3
              rounded-[20px]
              border border-amber-500/20
              bg-amber-500/[0.04]
              px-5 py-4
              md:flex-row
              md:items-center
              md:justify-between
            "
          >
            <div>
              <div className="text-xs font-semibold text-white">
                Aucun compte de
                trading
              </div>

              <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                Ajoute d’abord un
                compte pour que le
                Journal connaisse
                automatiquement ton
                capital.
              </div>
            </div>

            <Link
              href="/dashboard/comptes"
              className="
                rounded-xl
                border border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
                px-4 py-2
                text-xs
                font-semibold
                text-[color:var(--gold)]
                no-underline
              "
            >
              Ajouter un compte
            </Link>
          </section>
        )}

        {/* =====================================================
            KPI
        ===================================================== */}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            icon={
              <BarChart3
                size={18}
              />
            }
            label="P&L total"
            value={
              journalCurrency
                ? formatCurrency(
                    stats.pnl,
                    journalCurrency
                  )
                : "Multi-devises"
            }
            positive={
              journalCurrency
                ? stats.pnl >= 0
                : undefined
            }
          />

          <StatCard
            icon={
              <Target
                size={18}
              />
            }
            label="Winrate"
            value={`${stats.winrate.toFixed(
              1
            )}%`}
          />

          <StatCard
            icon={
              <TrendingUp
                size={18}
              />
            }
            label="Trades"
            value={String(
              stats.total
            )}
          />

          <StatCard
            icon={
              <ArrowUpRight
                size={18}
              />
            }
            label="Wins / Losses"
            value={`${stats.wins} / ${stats.losses}`}
          />

          <StatCard
            icon={
              <Target
                size={18}
              />
            }
            label="R moyen"
            value={
              stats.avgR !== 0
                ? `${stats.avgR.toFixed(
                    2
                  )}R`
                : "—"
            }
          />

          <StatCard
            icon={
              <ShieldCheck
                size={18}
              />
            }
            label="Discipline"
            value={
              tradingPlan &&
              stats.total > 0
                ? `${stats.discipline.toFixed(
                    0
                  )}%`
                : "—"
            }
          />
        </section>

        {/* =====================================================
            FILTERS
        ===================================================== */}

        <section
          className="
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-4
          "
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="relative lg:col-span-6">
              <Search
                size={16}
                className="
                  absolute
                  left-4
                  top-1/2
                  -translate-y-1/2
                  text-white/30
                "
              />

              <input
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Rechercher GOLD, London, FusionMarket..."
                className="
                  h-11
                  w-full
                  rounded-xl
                  border border-[color:var(--border)]
                  bg-black/20
                  pl-11 pr-4
                  text-sm
                  text-white
                  outline-none
                  placeholder:text-white/25
                "
              />
            </div>

            <select
              value={
                statusFilter
              }
              onChange={(
                event
              ) =>
                setStatusFilter(
                  event
                    .target
                    .value as any
                )
              }
              className="
                h-11
                rounded-xl
                border border-[color:var(--border)]
                bg-black/20
                px-3
                text-sm
                text-white
                outline-none
                lg:col-span-3
              "
            >
              <option value="all">
                Tous les résultats
              </option>

              <option value="win">
                WIN
              </option>

              <option value="loss">
                LOSS
              </option>

              <option value="breakeven">
                BE
              </option>

              <option value="open">
                Ouvert
              </option>
            </select>

            <select
              value={
                directionFilter
              }
              onChange={(
                event
              ) =>
                setDirectionFilter(
                  event
                    .target
                    .value as any
                )
              }
              className="
                h-11
                rounded-xl
                border border-[color:var(--border)]
                bg-black/20
                px-3
                text-sm
                text-white
                outline-none
                lg:col-span-3
              "
            >
              <option value="all">
                Achat + Vente
              </option>

              <option value="buy">
                Achats
              </option>

              <option value="sell">
                Ventes
              </option>
            </select>
          </div>
        </section>

        {/* =====================================================
            HISTORY
        ===================================================== */}

        <section
          className="
            overflow-hidden
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
          "
        >
          <div
            className="
              flex
              items-center
              justify-between
              border-b border-[color:var(--border)]
              px-5 py-4
            "
          >
            <div>
              <h2 className="text-sm font-semibold text-white">
                Historique
              </h2>

              <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                {
                  filteredTrades.length
                }{" "}
                trade
                {filteredTrades.length !==
                1
                  ? "s"
                  : ""}
              </div>
            </div>
          </div>

          {filteredTrades.length ===
          0 ? (
            <div className="px-6 py-16 text-center">
              <TrendingUp
                size={24}
                className="mx-auto text-[color:var(--gold)]"
              />

              <div className="mt-4 text-sm font-semibold text-white">
                Aucun trade
                enregistré
              </div>

              <button
                onClick={
                  openNewTrade
                }
                className="
                  mt-5
                  inline-flex
                  h-10
                  items-center
                  gap-2
                  rounded-xl
                  bg-[color:var(--gold)]
                  px-4
                  text-xs
                  font-semibold
                  text-black
                "
              >
                <Plus
                  size={14}
                />

                Ajouter un trade
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {filteredTrades.map(
                (trade) => (
                  <TradeRow
                    key={
                      trade.id
                    }
                    trade={
                      trade
                    }
                    plan={
                      tradingPlan
                    }
                    account={
                      trade.account_id
                        ? accountMap.get(
                            trade.account_id
                          ) ||
                          null
                        : null
                    }
                    fallbackCurrency={
                      journalCurrency ||
                      "EUR"
                    }
                    screenshotUrl={
                      screenshotUrls[
                        trade.id
                      ] ||
                      null
                    }
                    onViewScreenshot={
                      screenshotUrls[
                        trade.id
                      ]
                        ? () =>
                            setViewingScreenshot(
                              screenshotUrls[
                                trade.id
                              ]
                            )
                        : undefined
                    }
                    onEdit={() =>
                      openEditTrade(
                        trade
                      )
                    }
                    onDelete={() =>
                      deleteTrade(
                        trade
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </section>
      </div>

      {/* =====================================================
          MODAL
      ===================================================== */}

      {modalOpen ? (
        <div
          className="
            fixed inset-0
            z-[999999]
            flex items-center justify-center
            bg-black/75
            p-4
            backdrop-blur-sm
          "
        >
          <div
            className="
              max-h-[92vh]
              w-full
              max-w-4xl
              overflow-y-auto
              rounded-[24px]
              border border-[color:var(--border)]
              bg-[#0d0d10]
              shadow-2xl
            "
          >
            <div
              className="
                sticky top-0
                z-10
                flex items-center
                justify-between
                border-b border-[color:var(--border)]
                bg-[#0d0d10]
                px-6 py-5
              "
            >
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {editingTrade
                    ? "Modifier le trade"
                    : "Ajouter un trade"}
                </h2>

                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  Le capital,
                  le P&L et le
                  résultat en R
                  sont calculés
                  automatiquement.
                </p>
              </div>

              <button
                onClick={() =>
                  setModalOpen(
                    false
                  )
                }
                className="
                  flex h-9 w-9
                  items-center
                  justify-center
                  rounded-xl
                  border border-[color:var(--border)]
                  bg-black/20
                  text-white/60
                "
              >
                <X
                  size={16}
                />
              </button>
            </div>

            <div className="p-6">
              {/* =============================================
                  ACCOUNT
              ============================================= */}

              <div
                className="
                  mb-5
                  rounded-[20px]
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  p-5
                "
              >
                <div className="flex items-center gap-2">
                  <WalletCards
                    size={17}
                    className="text-[color:var(--gold)]"
                  />

                  <div className="text-sm font-semibold text-white">
                    Compte de trading
                  </div>
                </div>

                {accounts.length >
                0 ? (
                  <>
                    <div className="mt-4">
                      <SelectField
                        label="Compte utilisé"
                        value={
                          form.account_id
                        }
                        onChange={(
                          value
                        ) =>
                          setForm({
                            ...form,

                            account_id:
                              value,
                          })
                        }
                        options={[
                          {
                            value:
                              "",

                            label:
                              "Sélectionner un compte",
                          },

                          ...accounts.map(
                            (
                              account
                            ) => ({
                              value:
                                String(
                                  account.id
                                ),

                              label: `${
                                account.name
                              }${
                                account.broker
                                  ? ` • ${account.broker}`
                                  : ""
                              }`,
                            })
                          ),
                        ]}
                      />
                    </div>

                    {selectedAccount ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <AccountInfoCard
                          label="Compte"
                          value={
                            selectedAccount.name
                          }
                        />

                        <AccountInfoCard
                          label="Broker"
                          value={
                            selectedAccount.broker ||
                            "Non renseigné"
                          }
                        />

                        <AccountInfoCard
                          label="Capital actuel"
                          value={formatCurrency(
                            Number(
                              selectedAccount.current_balance ||
                                0
                            ),
                            selectedAccount.currency
                          )}
                          gold
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                    <div className="text-xs font-semibold text-white">
                      Aucun compte
                      disponible
                    </div>

                    <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                      Ajoute un
                      compte dans
                      Mes comptes
                      avant
                      d’enregistrer
                      ton trade.
                    </p>

                    <Link
                      href="/dashboard/comptes"
                      className="
                        mt-3
                        inline-flex
                        rounded-lg
                        text-[10px]
                        font-semibold
                        text-[color:var(--gold)]
                        no-underline
                      "
                    >
                      Aller dans Mes
                      comptes →
                    </Link>
                  </div>
                )}
              </div>

              {/* =============================================
                  TRADE FORM
              ============================================= */}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InputField
                  label="Date"
                  type="date"
                  value={
                    form.trade_date
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      trade_date:
                        value,
                    })
                  }
                />

                <InputField
                  label="Actif / Symbole"
                  placeholder="GOLD, EURUSD, BTCUSD..."
                  value={
                    form.symbol
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      symbol:
                        value,
                    })
                  }
                />

                <InputField
                  label="Risque (%)"
                  placeholder="1"
                  value={
                    form.risk_percent
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      risk_percent:
                        value,
                    })
                  }
                />

                <SelectField
                  label="Direction"
                  value={
                    form.direction
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      direction:
                        value as Direction,
                    })
                  }
                  options={[
                    {
                      value:
                        "buy",

                      label:
                        "Achat",
                    },

                    {
                      value:
                        "sell",

                      label:
                        "Vente",
                    },
                  ]}
                />

                <SelectField
                  label="Résultat"
                  value={
                    form.status
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      status:
                        value as TradeStatus,
                    })
                  }
                  options={[
                    {
                      value:
                        "open",

                      label:
                        "Ouvert",
                    },

                    {
                      value:
                        "win",

                      label:
                        "WIN",
                    },

                    {
                      value:
                        "loss",

                      label:
                        "LOSS",
                    },

                    {
                      value:
                        "breakeven",

                      label:
                        "Break-even",
                    },

                    {
                      value:
                        "cancelled",

                      label:
                        "Annulé",
                    },
                  ]}
                />

                <InputField
                  label="Prix d’entrée"
                  placeholder="2350.50"
                  value={
                    form.entry_price
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      entry_price:
                        value,
                    })
                  }
                />

                <InputField
                  label="Stop Loss"
                  placeholder="2340.00"
                  value={
                    form.stop_loss
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      stop_loss:
                        value,
                    })
                  }
                />

                <InputField
                  label="Take Profit"
                  placeholder="2370.00"
                  value={
                    form.take_profit
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      take_profit:
                        value,
                    })
                  }
                />

                <InputField
                  label="Setup"
                  placeholder="OTE + OB, Breakout..."
                  value={
                    form.setup
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      setup:
                        value,
                    })
                  }
                />

                <SelectField
                  label="Session"
                  value={
                    form.session
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      session:
                        value as
                          | Session
                          | "",
                    })
                  }
                  options={[
                    {
                      value:
                        "",

                      label:
                        "Non renseignée",
                    },

                    {
                      value:
                        "asian",

                      label:
                        "Asian",
                    },

                    {
                      value:
                        "london",

                      label:
                        "London",
                    },

                    {
                      value:
                        "new_york",

                      label:
                        "New York",
                    },

                    {
                      value:
                        "other",

                      label:
                        "Autre",
                    },
                  ]}
                />

                <InputField
                  label="Timeframe"
                  placeholder="M1, M15, H1, H4..."
                  value={
                    form.timeframe
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      timeframe:
                        value,
                    })
                  }
                />

                <InputField
                  label="Émotion"
                  placeholder="Calme, stressé, FOMO..."
                  value={
                    form.emotion
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      emotion:
                        value,
                    })
                  }
                />
              </div>

              {/* =============================================
                  CAPTURE TRADINGVIEW
              ============================================= */}

              <div
                className="
                  mt-6
                  rounded-[20px]
                  border border-[color:var(--border)]
                  bg-black/10
                  p-5
                "
              >
                <div className="flex items-start gap-3">
                  <div
                    className="
                      flex
                      h-10
                      w-10
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
                      border border-[color:var(--gold-border)]
                      bg-[color:var(--gold-soft)]
                      text-[color:var(--gold)]
                    "
                  >
                    <ImageIcon
                      size={18}
                    />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">
                      Capture du graphique TradingView
                    </div>

                    <p className="mt-1 text-[10px] leading-5 text-[color:var(--muted)]">
                      Ajoute une capture de ton setup pour pouvoir revoir visuellement ta prise de position plus tard.
                    </p>
                  </div>
                </div>

                {currentScreenshotPreview ? (
                  <div
                    className="
                      mt-4
                      overflow-hidden
                      rounded-2xl
                      border border-white/[0.07]
                      bg-black/30
                    "
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setViewingScreenshot(
                          currentScreenshotPreview
                        )
                      }
                      className="
                        group
                        relative
                        block
                        w-full
                        overflow-hidden
                        bg-black
                        text-left
                      "
                    >
                      <img
                        src={
                          currentScreenshotPreview
                        }
                        alt="Capture TradingView"
                        className="
                          max-h-[360px]
                          w-full
                          object-contain
                          transition
                          duration-300
                          group-hover:scale-[1.01]
                        "
                      />

                      <div
                        className="
                          absolute
                          inset-0
                          flex
                          items-center
                          justify-center
                          bg-black/0
                          opacity-0
                          transition
                          group-hover:bg-black/35
                          group-hover:opacity-100
                        "
                      >
                        <span
                          className="
                            inline-flex
                            items-center
                            gap-2
                            rounded-xl
                            border border-white/10
                            bg-black/70
                            px-4
                            py-2
                            text-xs
                            font-semibold
                            text-white
                            backdrop-blur
                          "
                        >
                          <Eye size={14} />
                          Agrandir
                        </span>
                      </div>
                    </button>

                    <div
                      className="
                        flex
                        flex-col
                        gap-3
                        border-t border-white/[0.06]
                        p-4
                        sm:flex-row
                        sm:items-center
                        sm:justify-between
                      "
                    >
                      <div className="text-[10px] text-[color:var(--muted)]">
                        {screenshotFile
                          ? screenshotFile.name
                          : "Capture actuellement enregistrée"}
                      </div>

                      <div className="flex gap-2">
                        <label
                          className="
                            inline-flex
                            h-9
                            cursor-pointer
                            items-center
                            gap-2
                            rounded-xl
                            border border-[color:var(--gold-border)]
                            bg-[color:var(--gold-soft)]
                            px-3
                            text-[10px]
                            font-semibold
                            text-[color:var(--gold)]
                          "
                        >
                          <Upload size={13} />
                          Remplacer

                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(
                              event
                            ) =>
                              selectScreenshot(
                                event.target.files?.[0] ||
                                  null
                              )
                            }
                          />
                        </label>

                        <button
                          type="button"
                          onClick={
                            removeScreenshotFromForm
                          }
                          className="
                            h-9
                            rounded-xl
                            border border-red-500/20
                            bg-red-500/[0.05]
                            px-3
                            text-[10px]
                            font-semibold
                            text-red-400
                          "
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={(
                      event
                    ) => {
                      event.preventDefault();
                    }}
                    onDrop={(
                      event
                    ) => {
                      event.preventDefault();

                      selectScreenshot(
                        event.dataTransfer.files?.[0] ||
                          null
                      );
                    }}
                    className="
                      mt-4
                      flex
                      min-h-[170px]
                      cursor-pointer
                      flex-col
                      items-center
                      justify-center
                      rounded-2xl
                      border border-dashed border-[color:var(--gold-border)]
                      bg-[color:var(--gold-soft)]
                      px-5
                      text-center
                      transition
                      hover:bg-white/[0.04]
                    "
                  >
                    <div
                      className="
                        flex
                        h-12
                        w-12
                        items-center
                        justify-center
                        rounded-xl
                        border border-[color:var(--gold-border)]
                        bg-black/20
                        text-[color:var(--gold)]
                      "
                    >
                      <Upload
                        size={19}
                      />
                    </div>

                    <div className="mt-3 text-xs font-semibold text-white">
                      Ajouter une capture
                    </div>

                    <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                      Clique ou dépose ton graphique ici
                    </div>

                    <div className="mt-2 text-[9px] text-white/25">
                      PNG, JPG ou WEBP • 5 Mo maximum
                    </div>

                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(
                        event
                      ) =>
                        selectScreenshot(
                          event.target.files?.[0] ||
                            null
                        )
                      }
                    />
                  </label>
                )}
              </div>

              {/* =============================================
                  AUTO CALCULATION
              ============================================= */}

              <div
                className="
                  mt-6
                  rounded-[20px]
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  p-5
                "
              >
                <div className="flex items-center gap-2">
                  <WalletCards
                    size={17}
                    className="text-[color:var(--gold)]"
                  />

                  <div className="text-sm font-semibold text-white">
                    Calcul automatique
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <AutoResultCard
                    label="Montant risqué"
                    value={
                      selectedAccount
                        ? formatCurrency(
                            autoResult.riskMoney,
                            selectedAccount.currency
                          )
                        : "—"
                    }
                  />

                  <AutoResultCard
                    label="RR théorique"
                    value={
                      autoResult.rr !==
                      null
                        ? `1:${autoResult.rr.toFixed(
                            2
                          )}`
                        : "—"
                    }
                  />

                  <AutoResultCard
                    label="Résultat"
                    value={
                      autoResult.resultR >
                      0
                        ? `+${autoResult.resultR.toFixed(
                            2
                          )}R`
                        : `${autoResult.resultR.toFixed(
                            2
                          )}R`
                    }
                    positive={
                      autoResult.resultR >
                      0
                    }
                    negative={
                      autoResult.resultR <
                      0
                    }
                  />

                  <AutoResultCard
                    label="P&L"
                    value={
                      selectedAccount
                        ? formatCurrency(
                            autoResult.resultAmount,
                            selectedAccount.currency
                          )
                        : "—"
                    }
                    positive={
                      autoResult.resultAmount >
                      0
                    }
                    negative={
                      autoResult.resultAmount <
                      0
                    }
                  />
                </div>

                <p className="mt-4 text-[10px] leading-5 text-[color:var(--muted)]">
                  Le capital est
                  récupéré depuis
                  ton compte • WIN
                  = RR calculé avec
                  Entrée / SL / TP
                  • LOSS = -1R •
                  Break-even = 0R.
                </p>
              </div>

              {/* =============================================
                  PLAN
              ============================================= */}

              {tradingPlan ? (
                <div
                  className={[
                    "mt-6 rounded-[20px] border p-5",

                    formPlanEvaluation.compliant
                      ? "border-emerald-500/20 bg-emerald-500/[0.05]"
                      : "border-amber-500/20 bg-amber-500/[0.04]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3">
                    {formPlanEvaluation.compliant ? (
                      <CheckCircle2
                        size={20}
                        className="text-emerald-400"
                      />
                    ) : (
                      <AlertTriangle
                        size={20}
                        className="text-amber-300"
                      />
                    )}

                    <div>
                      <div className="text-sm font-semibold text-white">
                        {formPlanEvaluation.compliant
                          ? "Trade conforme à ton plan"
                          : "Vérification du plan"}
                      </div>

                      <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                        Analyse
                        automatique
                        de tes règles.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {formPlanEvaluation.checks.map(
                      (
                        check
                      ) => (
                        <PlanCheckRow
                          key={
                            check.key
                          }
                          check={
                            check
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextAreaField
                  label="Erreur / point à améliorer"
                  placeholder="Entrée trop tôt, déplacement du SL..."
                  value={
                    form.mistake
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      mistake:
                        value,
                    })
                  }
                />

                <TextAreaField
                  label="Notes"
                  placeholder="Pourquoi j’ai pris ce trade ?"
                  value={
                    form.notes
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,

                      notes:
                        value,
                    })
                  }
                />
              </div>

              <div
                className="
                  mt-6
                  flex flex-col-reverse
                  gap-3
                  border-t border-[color:var(--border)]
                  pt-5
                  sm:flex-row
                  sm:justify-end
                "
              >
                <button
                  type="button"
                  onClick={() =>
                    setModalOpen(
                      false
                    )
                  }
                  className="
                    h-11
                    rounded-xl
                    border border-[color:var(--border)]
                    bg-black/20
                    px-5
                    text-sm
                    text-white/70
                  "
                >
                  Annuler
                </button>

                <button
                  type="button"
                  disabled={
                    saving ||
                    !selectedAccount
                  }
                  onClick={
                    saveTrade
                  }
                  className="
                    h-11
                    rounded-xl
                    bg-[color:var(--gold)]
                    px-6
                    text-sm
                    font-semibold
                    text-black
                    disabled:opacity-50
                  "
                >
                  {saving
                    ? "Enregistrement..."
                    : editingTrade
                    ? "Enregistrer les modifications"
                    : "Ajouter le trade"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* =====================================================
          CAPTURE PLEIN ÉCRAN
      ===================================================== */}

      {viewingScreenshot ? (
        <div
          className="
            fixed
            inset-0
            z-[1000000]
            flex
            items-center
            justify-center
            bg-black/90
            p-4
            backdrop-blur-md
          "
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setViewingScreenshot(
                null
              );
            }
          }}
        >
          <div
            className="
              relative
              max-h-[94vh]
              w-full
              max-w-6xl
              overflow-hidden
              rounded-[22px]
              border border-white/[0.08]
              bg-[#09090b]
              shadow-2xl
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
                border-b border-white/[0.06]
                px-4
                py-3
              "
            >
              <div className="flex items-center gap-2">
                <ImageIcon
                  size={15}
                  className="text-[color:var(--gold)]"
                />

                <div className="text-xs font-semibold text-white">
                  Graphique TradingView
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setViewingScreenshot(
                    null
                  )
                }
                className="
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-xl
                  border border-white/[0.08]
                  bg-white/[0.03]
                  text-white/60
                "
              >
                <X size={15} />
              </button>
            </div>

            <div
              className="
                flex
                max-h-[calc(94vh-62px)]
                items-center
                justify-center
                overflow-auto
                bg-black
                p-3
              "
            >
              <img
                src={
                  viewingScreenshot
                }
                alt="Graphique TradingView"
                className="
                  max-h-[calc(94vh-90px)]
                  max-w-full
                  object-contain
                "
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function StatCard({
  icon,
  label,
  value,
  positive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div
      className="
        rounded-2xl
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
      "
    >
      <div className="flex items-center gap-3">
        <div
          className="
            flex h-10 w-10
            items-center justify-center
            rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          {icon}
        </div>

        <div>
          <div className="text-[10px] text-[color:var(--muted)]">
            {label}
          </div>

          <div
            className={[
              "mt-1 text-lg font-semibold",

              positive === true
                ? "text-emerald-400"
                : positive ===
                  false
                ? "text-red-400"
                : "text-white",
            ].join(" ")}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function AutoResultCard({
  label,
  value,
  positive = false,
  negative = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className="
        rounded-xl
        border border-white/[0.06]
        bg-black/20
        px-4 py-3
      "
    >
      <div className="text-[9px] text-[color:var(--muted)]">
        {label}
      </div>

      <div
        className={[
          "mt-1 text-sm font-semibold",

          positive
            ? "text-emerald-400"
            : negative
            ? "text-red-400"
            : "text-white",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function AccountInfoCard({
  label,
  value,
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div
      className="
        rounded-xl
        border border-white/[0.06]
        bg-black/20
        px-4 py-3
      "
    >
      <div className="text-[9px] text-[color:var(--muted)]">
        {label}
      </div>

      <div
        className={[
          "mt-1 truncate text-xs font-semibold",

          gold
            ? "text-[color:var(--gold)]"
            : "text-white",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function PlanMiniPill({
  text,
}: {
  text: string;
}) {
  return (
    <span
      className="
        rounded-full
        border border-[color:var(--gold-border)]
        bg-black/20
        px-3 py-1.5
        text-[9px]
        font-semibold
        text-[color:var(--gold)]
      "
    >
      {text}
    </span>
  );
}

function PlanCheckRow({
  check,
}: {
  check: PlanCheck;
}) {
  return (
    <div
      className={[
        "flex items-start gap-3 rounded-xl border px-3 py-3",

        check.valid
          ? "border-emerald-500/15 bg-emerald-500/[0.04]"
          : "border-red-500/15 bg-red-500/[0.04]",
      ].join(" ")}
    >
      {check.valid ? (
        <CheckCircle2
          size={14}
          className="mt-0.5 shrink-0 text-emerald-400"
        />
      ) : (
        <X
          size={14}
          className="mt-0.5 shrink-0 text-red-400"
        />
      )}

      <div>
        <div className="text-[10px] font-semibold text-white">
          {check.label}
        </div>

        <div className="mt-1 text-[9px] text-[color:var(--muted)]">
          {check.detail}
        </div>
      </div>
    </div>
  );
}

function PlanBadge({
  compliant,
}: {
  compliant:
    | boolean
    | null;
}) {
  if (
    compliant === null
  ) {
    return null;
  }

  return (
    <span
      className={[
        "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-bold",

        compliant
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/20 bg-red-500/10 text-red-400",
      ].join(" ")}
    >
      {compliant ? (
        <CheckCircle2
          size={9}
        />
      ) : (
        <AlertTriangle
          size={9}
        />
      )}

      {compliant
        ? "CONFORME AU PLAN"
        : "HORS PLAN"}
    </span>
  );
}

function TradeRow({
  trade,
  plan,
  account,
  fallbackCurrency,
  screenshotUrl,
  onViewScreenshot,
  onEdit,
  onDelete,
}: {
  trade: Trade;

  plan:
    | TradingPlan
    | null;

  account:
    | TradingAccount
    | null;

  fallbackCurrency:
    string;

  screenshotUrl:
    | string
    | null;

  onViewScreenshot?:
    () => void;

  onEdit:
    () => void;

  onDelete:
    () => void;
}) {
  const planResult =
    evaluatePlan(
      trade,
      plan
    );

  const currency =
    account?.currency ||
    fallbackCurrency;

  return (
    <div
      className="
        grid grid-cols-1
        gap-4
        px-5 py-4
        transition
        hover:bg-white/[0.02]
        xl:grid-cols-12
        xl:items-center
      "
    >
      <div className="xl:col-span-3">
        <div className="flex items-center gap-3">
          <div
            className={[
              "flex h-10 w-10 items-center justify-center rounded-xl",

              trade.direction ===
              "buy"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400",
            ].join(" ")}
          >
            {trade.direction ===
            "buy" ? (
              <ArrowUpRight
                size={18}
              />
            ) : (
              <ArrowDownRight
                size={18}
              />
            )}
          </div>

          <div>
            <div className="font-semibold text-white">
              {
                trade.symbol
              }
            </div>

            <div className="mt-1 text-[10px] uppercase text-[color:var(--muted)]">
              {trade.direction ===
              "buy"
                ? "Achat"
                : "Vente"}

              {trade.timeframe
                ? ` • ${trade.timeframe}`
                : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-2">
        <div className="flex items-center gap-1 text-[10px] text-[color:var(--muted)]">
          <CalendarDays
            size={11}
          />

          {formatDate(
            trade.trade_date
          )}
        </div>

        <div className="mt-1 text-xs text-white">
          {formatTime(
            trade.trade_date
          )}
        </div>
      </div>

      <div className="xl:col-span-2">
        <span
          className={[
            "inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold",

            statusClass(
              trade.status
            ),
          ].join(" ")}
        >
          {statusLabel(
            trade.status
          )}
        </span>

        <div>
          <PlanBadge
            compliant={
              planResult.compliant
            }
          />
        </div>
      </div>

      <div className="xl:col-span-2">
        <div
          className={[
            "text-sm font-semibold",

            trade.result_amount >
            0
              ? "text-emerald-400"
              : trade.result_amount <
                0
              ? "text-red-400"
              : "text-white",
          ].join(" ")}
        >
          {formatCurrency(
            Number(
              trade.result_amount ||
                0
            ),
            currency
          )}
        </div>

        <div className="mt-1 text-[10px] text-[color:var(--muted)]">
          {trade.result_r >
          0
            ? "+"
            : ""}

          {Number(
            trade.result_r ||
              0
          ).toFixed(
            2
          )}
          R • Risque{" "}
          {Number(
            trade.risk_percent ||
              0
          )}
          %
        </div>
      </div>

      <div className="xl:col-span-2">
        {account ? (
          <>
            <div className="text-xs font-medium text-white">
              {
                account.name
              }
            </div>

            <div className="mt-1 text-[10px] text-[color:var(--muted)]">
              {account.broker ||
                "Compte manuel"}

              {trade.account_balance
                ? ` • ${formatCurrency(
                    Number(
                      trade.account_balance
                    ),
                    account.currency
                  )}`
                : ""}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-white capitalize">
              {trade.session
                ? trade.session.replace(
                    "_",
                    " "
                  )
                : "—"}
            </div>

            {trade.account_balance ? (
              <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                Ancien trade •
                Capital :{" "}
                {formatCurrency(
                  Number(
                    trade.account_balance
                  ),
                  fallbackCurrency
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 xl:col-span-1">
        {screenshotUrl &&
        onViewScreenshot ? (
          <button
            onClick={
              onViewScreenshot
            }
            className="
              flex h-9 w-9
              items-center justify-center
              rounded-xl
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              text-[color:var(--gold)]
              transition
              hover:bg-white/[0.06]
            "
            title="Voir le graphique"
          >
            <Eye
              size={14}
            />
          </button>
        ) : null}

        <button
          onClick={
            onEdit
          }
          className="
            flex h-9 w-9
            items-center justify-center
            rounded-xl
            border border-[color:var(--border)]
            bg-black/20
            text-white/50
            hover:text-[color:var(--gold)]
          "
          title="Modifier"
        >
          <Edit3
            size={14}
          />
        </button>

        <button
          onClick={
            onDelete
          }
          className="
            flex h-9 w-9
            items-center justify-center
            rounded-xl
            border border-red-500/20
            bg-red-500/5
            text-red-400/70
          "
          title="Supprimer"
        >
          <Trash2
            size={14}
          />
        </button>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;

  value: string;

  onChange: (
    value: string
  ) => void;

  placeholder?: string;

  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
      </div>

      <input
        type={type}
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        placeholder={
          placeholder
        }
        className="
          h-11
          w-full
          rounded-xl
          border border-[color:var(--border)]
          bg-black/20
          px-4
          text-sm
          text-white
          outline-none
          placeholder:text-white/20
          focus:border-[color:var(--gold-border)]
        "
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;

  value: string;

  onChange: (
    value: string
  ) => void;

  options: {
    value: string;
    label: string;
  }[];
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
      </div>

      <select
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="
          h-11
          w-full
          rounded-xl
          border border-[color:var(--border)]
          bg-black/20
          px-4
          text-sm
          text-white
          outline-none
          focus:border-[color:var(--gold-border)]
        "
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;

  value: string;

  onChange: (
    value: string
  ) => void;

  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
      </div>

      <textarea
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        placeholder={
          placeholder
        }
        rows={5}
        className="
          w-full
          resize-none
          rounded-xl
          border border-[color:var(--border)]
          bg-black/20
          px-4 py-3
          text-sm
          text-white
          outline-none
          placeholder:text-white/20
          focus:border-[color:var(--gold-border)]
        "
      />
    </label>
  );
}