"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuraDashboard from "@/components/aura/Dashboard";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Flame,
  GraduationCap,
  Lock,
  Plus,
  ShieldCheck,
  Target,
  Trophy,
  WalletCards,
  Activity,
  TrendingUp,
  Clock3,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type Profile = {
  username: string;
  plan: string;
  xp: number;
};

type TradingAccount = {
  id: number;
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

  account_id: number | null;

  trade_date: string;

  symbol: string;

  direction: "buy" | "sell";

  risk_percent: number;

  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;

  result_amount: number;

  result_r: number;

  status:
    | "open"
    | "win"
    | "loss"
    | "breakeven"
    | "cancelled";

  setup: string | null;

  session:
    | "asian"
    | "london"
    | "new_york"
    | "other"
    | null;

  timeframe: string | null;

  notes: string | null;
  screenshot_url: string | null;
};

type TradingPlan = {
  max_risk_percent: number;
  max_trades_per_day: number;
  minimum_rr: number;
  weekly_goal: string | null;

  allowed_sessions: string[];
  allowed_assets: string[];
  allowed_setups: string[];
};

type Stars = 1 | 2 | 3;

type EconEvent = {
  id: string;
  dateParisYMD: string;
  time: string;
  currency: string;
  countryLabel: string;
  title: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  stars: Stars;
};

/* =========================================================
   CALENDAR
========================================================= */

const ALLOWED = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
]);

const FLAGS: Record<
  string,
  string
> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  CNY: "🇨🇳",
};

/* =========================================================
   HELPERS
========================================================= */

function formatCurrency(
  value: number,
  currency = "EUR"
) {
  try {
    return new Intl.NumberFormat(
      "fr-FR",
      {
        style: "currency",
        currency,

        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      }
    ).format(value);
  } catch {
    return `${value.toFixed(
      2
    )} ${currency}`;
  }
}

function formatDate(
  value: string
) {
  return new Date(
    value
  ).toLocaleDateString(
    "fr-FR",
    {
      day: "2-digit",
      month: "short",
    }
  );
}

function currentParisMonth() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Paris",

        year: "numeric",

        month:
          "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year"
    )?.value || "";

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month"
    )?.value || "";

  return `${year}-${month}`;
}

function parisYMD(
  date: Date
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Paris",

        year: "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    ).formatToParts(
      date
    );

  const get = (
    type: string
  ) =>
    parts.find(
      (part) =>
        part.type ===
        type
    )?.value ?? "";

  return `${get(
    "year"
  )}-${get(
    "month"
  )}-${get(
    "day"
  )}`;
}

function isThisMonth(
  value: string
) {
  const tradeMonth =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Paris",

        year: "numeric",

        month:
          "2-digit",
      }
    )
      .format(
        new Date(value)
      )
      .slice(0, 7);

  return (
    tradeMonth ===
    currentParisMonth()
  );
}

function getWeekStart() {
  const now =
    new Date();

  const parisDateString =
    now.toLocaleDateString(
      "en-US",
      {
        timeZone:
          "Europe/Paris",
      }
    );

  const parisDate =
    new Date(
      `${parisDateString} 12:00:00`
    );

  const day =
    parisDate.getDay();

  const diff =
    day === 0
      ? -6
      : 1 - day;

  parisDate.setDate(
    parisDate.getDate() +
      diff
  );

  return parisYMD(
    parisDate
  );
}

function tradeParisYMD(
  value: string
) {
  return parisYMD(
    new Date(value)
  );
}

/* =========================================================
   WEEKLY DISCIPLINE HELPERS
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

  if (
    riskDistance <= 0
  ) {
    return null;
  }

  return (
    rewardDistance /
    riskDistance
  );
}

function normalizeAsset(
  value: string
) {
  const clean =
    String(
      value || ""
    )
      .trim()
      .toUpperCase()
      .replace(
        /\s+/g,
        ""
      );

  return clean ===
    "GOLD"
    ? "XAUUSD"
    : clean;
}

function normalizeSession(
  value:
    | string
    | null
    | undefined
) {
  const clean =
    String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[_-]/g,
        " "
      );

  if (
    clean ===
      "new york" ||
    clean ===
      "newyork"
  ) {
    return "new york";
  }

  if (
    clean ===
      "asian" ||
    clean ===
      "asia"
  ) {
    return "asian";
  }

  if (
    clean ===
    "london"
  ) {
    return "london";
  }

  return clean;
}

function normalizeText(
  value:
    | string
    | null
    | undefined
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

function isTradePlanCompliant(
  trade: Trade,
  plan: TradingPlan
) {
  const checks:
    boolean[] = [];

  /* RISQUE */

  checks.push(
    Number(
      trade.risk_percent ||
        0
    ) <=
      Number(
        plan.max_risk_percent
      )
  );

  /* RR */

  const rr =
    calculateRR(
      trade.entry_price,
      trade.stop_loss,
      trade.take_profit
    );

  checks.push(
    rr !== null &&
      rr >=
        Number(
          plan.minimum_rr
        )
  );

  /* ACTIF */

  if (
    plan.allowed_assets.length >
    0
  ) {
    const allowedAssets =
      plan.allowed_assets.map(
        normalizeAsset
      );

    checks.push(
      allowedAssets.includes(
        normalizeAsset(
          trade.symbol
        )
      )
    );
  }

  /* SESSION */

  if (
    plan.allowed_sessions.length >
    0
  ) {
    const allowedSessions =
      plan.allowed_sessions.map(
        normalizeSession
      );

    checks.push(
      allowedSessions.includes(
        normalizeSession(
          trade.session
        )
      )
    );
  }

  /* SETUP */

  if (
    plan.allowed_setups.length >
    0
  ) {
    const allowedSetups =
      plan.allowed_setups.map(
        normalizeText
      );

    checks.push(
      allowedSetups.includes(
        normalizeText(
          trade.setup
        )
      )
    );
  }

  return (
    checks.length > 0 &&
    checks.every(Boolean)
  );
}

/* =========================================================
   CALENDAR HELPERS
========================================================= */

function todayParisYMD() {
  return parisYMD(
    new Date()
  );
}

function nowParisMinutes() {
  const parts =
    new Intl.DateTimeFormat(
      "fr-FR",
      {
        timeZone:
          "Europe/Paris",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false,
      }
    ).formatToParts(
      new Date()
    );

  const hour =
    Number(
      parts.find(
        (part) =>
          part.type ===
          "hour"
      )?.value ?? 0
    );

  const minute =
    Number(
      parts.find(
        (part) =>
          part.type ===
          "minute"
      )?.value ?? 0
    );

  return (
    hour * 60 +
    minute
  );
}

function timeToMinutes(
  time: string
) {
  if (
    !/^\d{1,2}:\d{2}$/.test(
      time
    )
  ) {
    return null;
  }

  const [
    hour,
    minute,
  ] =
    time
      .split(":")
      .map(Number);

  if (
    !Number.isFinite(
      hour
    ) ||
    !Number.isFinite(
      minute
    )
  ) {
    return null;
  }

  return (
    hour * 60 +
    minute
  );
}

function normalizeCurrency(
  raw: string
): {
  currency: string;
  label: string;
} | null {
  const value = (
    raw || ""
  ).trim();

  if (!value) {
    return null;
  }

  if (
    ALLOWED.has(
      value
    )
  ) {
    return {
      currency:
        value,

      label:
        value === "USD"
          ? "États-Unis"
          : value ===
            "EUR"
          ? "Zone Euro"
          : value ===
            "GBP"
          ? "Royaume-Uni"
          : value ===
            "JPY"
          ? "Japon"
          : "Chine",
    };
  }

  const upper =
    value.toUpperCase();

  if (
    upper.includes(
      "UNITED STATES"
    ) ||
    upper.includes(
      "U.S"
    ) ||
    upper === "US"
  ) {
    return {
      currency:
        "USD",

      label:
        "États-Unis",
    };
  }

  if (
    upper.includes(
      "EURO"
    ) ||
    upper.includes(
      "EUROZONE"
    ) ||
    upper.includes(
      "GERMANY"
    ) ||
    upper.includes(
      "FRANCE"
    )
  ) {
    return {
      currency:
        "EUR",

      label:
        "Zone Euro",
    };
  }

  if (
    upper.includes(
      "UNITED KINGDOM"
    ) ||
    upper.includes(
      "UK"
    ) ||
    upper.includes(
      "BRITAIN"
    )
  ) {
    return {
      currency:
        "GBP",

      label:
        "Royaume-Uni",
    };
  }

  if (
    upper.includes(
      "JAPAN"
    )
  ) {
    return {
      currency:
        "JPY",

      label:
        "Japon",
    };
  }

  if (
    upper.includes(
      "CHINA"
    )
  ) {
    return {
      currency:
        "CNY",

      label:
        "Chine",
    };
  }

  return null;
}

function parseInvestingHtml(
  html: string,
  startYMD: string
): EconEvent[] {
  if (
    !html?.trim()
  ) {
    return [];
  }

  const doc =
    new DOMParser().parseFromString(
      `<table><tbody>${html}</tbody></table>`,
      "text/html"
    );

  const rows =
    Array.from(
      doc.querySelectorAll(
        "tr"
      )
    );

  let currentDay =
    startYMD;

  const output: EconEvent[] =
    [];

  for (
    const row of rows
  ) {
    const rowText = (
      row.textContent || ""
    ).trim();

    const hasEvent =
      !!row.querySelector(
        ".event"
      ) ||
      !!row.querySelector(
        "td.event"
      );

    if (
      !hasEvent &&
      rowText.length >
        8 &&
      /20\d{2}/.test(
        rowText
      ) &&
      /(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)/i.test(
        rowText
      )
    ) {
      const date =
        new Date(
          rowText
        );

      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {
        currentDay =
          parisYMD(
            date
          );
      }

      continue;
    }

    const title = (
      row.querySelector(
        ".event"
      )?.textContent ||
      row.querySelector(
        "td.event"
      )?.textContent ||
      row.querySelector(
        ".event a"
      )?.textContent ||
      ""
    ).trim();

    if (!title) {
      continue;
    }

    const time =
      (
        row.querySelector(
          ".time"
        )?.textContent ||
        row.querySelector(
          "td.time"
        )?.textContent ||
        ""
      ).trim() ||
      "—";

    const rawCurrency =
      (
        row.querySelector(
          ".flagCur"
        )?.textContent ||
        ""
      ).trim();

    const currency =
      normalizeCurrency(
        rawCurrency
      ) ||
      normalizeCurrency(
        rowText
      );

    if (!currency) {
      continue;
    }

    if (
      !ALLOWED.has(
        currency.currency
      )
    ) {
      continue;
    }

    const actual =
      (
        row.querySelector(
          ".act"
        )?.textContent ||
        ""
      ).trim() ||
      undefined;

    const forecast =
      (
        row.querySelector(
          ".fore"
        )?.textContent ||
        ""
      ).trim() ||
      undefined;

    const previous =
      (
        row.querySelector(
          ".prev"
        )?.textContent ||
        ""
      ).trim() ||
      undefined;

    const sentiment =
      row.querySelector(
        ".sentiment"
      );

    let bulls =
      row.querySelectorAll(
        ".fullBullishIcon"
      ).length +
      row.querySelectorAll(
        ".grayFullBullishIcon"
      ).length +
      row.querySelectorAll(
        ".bullishIcon"
      ).length;

    if (
      bulls === 0 &&
      sentiment
    ) {
      bulls =
        Math.max(
          sentiment.querySelectorAll(
            "i"
          ).length,

          sentiment.querySelectorAll(
            "svg"
          ).length
        );
    }

    bulls =
      Math.max(
        0,
        Math.min(
          3,
          bulls
        )
      );

    const stars: Stars =
      bulls >= 3
        ? 3
        : bulls === 2
        ? 2
        : 1;

    const id =
      row.getAttribute(
        "data-event-id"
      ) ||
      row.getAttribute(
        "event_attr_id"
      ) ||
      row.getAttribute(
        "id"
      ) ||
      `evt_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}`;

    output.push({
      id,

      dateParisYMD:
        currentDay,

      time,

      currency:
        currency.currency,

      countryLabel:
        currency.label,

      title,

      actual,

      forecast,

      previous,

      stars,
    });
  }

  return output;
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function DashboardPage() {
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    profile,
    setProfile,
  ] =
    useState<Profile>({
      username:
        "Trader",

      plan:
        "free",

      xp:
        0,
    });

  const [
    accounts,
    setAccounts,
  ] =
    useState<
      TradingAccount[]
    >([]);

  const [
    trades,
    setTrades,
  ] =
    useState<Trade[]>(
      []
    );

  const [
    tradingPlan,
    setTradingPlan,
  ] =
    useState<
      TradingPlan | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    marketEvents,
    setMarketEvents,
  ] =
    useState<
      EconEvent[]
    >([]);

  const [
    calendarLoading,
    setCalendarLoading,
  ] =
    useState(true);

  /* =====================================================
     LOAD DASHBOARD DATA
  ===================================================== */

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(
          true
        );

        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();

        if (!user) {
          window.location.href =
            "/login";

          return;
        }

        const [
          profileResult,
          accountsResult,
          tradesResult,
          planResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "profiles"
              )
              .select(
                "username, plan, xp"
              )
              .eq(
                "id",
                user.id
              )
              .single(),

            supabase
              .from(
                "trading_accounts"
              )
              .select(
                `
                  id,
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

            supabase
              .from(
                "trading_journal"
              )
              .select(
                `
                  id,
                  account_id,
                  trade_date,
                  symbol,
                  direction,
                  risk_percent,
                  entry_price,
                  stop_loss,
                  take_profit,
                  result_amount,
                  result_r,
                  status,
                  setup,
                  session,
                  timeframe,
                  notes,
                  screenshot_url
                `
              )
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
                  weekly_goal,
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
          ]);

        /* PROFILE */

        setProfile({
          username:
            profileResult
              .data
              ?.username ||
            user
              .user_metadata
              ?.username ||
            user.email?.split(
              "@"
            )[0] ||
            "Trader",

          plan:
            String(
              profileResult
                .data
                ?.plan ||
                "free"
            ).toLowerCase(),

          xp:
            Number(
              profileResult
                .data
                ?.xp ||
                0
            ),
        });

        /* ACCOUNTS */

        if (
          accountsResult.error
        ) {
          console.error(
            "Erreur comptes dashboard :",
            accountsResult.error
          );
        } else {
          setAccounts(
            (accountsResult.data as TradingAccount[]) ||
              []
          );
        }

        /* TRADES */

        if (
          tradesResult.error
        ) {
          console.error(
            "Erreur trades dashboard :",
            tradesResult.error
          );
        } else {
          setTrades(
            (tradesResult.data as Trade[]) ||
              []
          );
        }

        /* PLAN */

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

            weekly_goal:
              planResult.data
                .weekly_goal ||
              null,

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
        }
      } catch (
        error
      ) {
        console.error(
          "Erreur dashboard :",
          error
        );
      } finally {
        setLoading(
          false
        );
      }
    }

    loadDashboard();
  }, [supabase]);

  /* =====================================================
     ECONOMIC CALENDAR
  ===================================================== */

  useEffect(() => {
    async function loadDashboardCalendar() {
      try {
        setCalendarLoading(
          true
        );

        const today =
          todayParisYMD();

        const url =
          new URL(
            "/api/calendar",
            window
              .location
              .origin
          );

        url.searchParams.set(
          "start",
          today
        );

        url.searchParams.set(
          "end",
          today
        );

        const response =
          await fetch(
            url.toString(),
            {
              cache:
                "no-store",
            }
          );

        const json =
          await response.json();

        if (
          !json?.ok
        ) {
          setMarketEvents(
            []
          );

          return;
        }

        const parsed =
          parseInvestingHtml(
            String(
              json.html ??
                ""
            ),
            today
          );

        const currentMinutes =
          nowParisMinutes();

        const upcoming =
          parsed
            .filter(
              (
                event
              ) =>
                event.stars >=
                2
            )
            .filter(
              (
                event
              ) => {
                const eventMinutes =
                  timeToMinutes(
                    event.time
                  );

                if (
                  eventMinutes ===
                  null
                ) {
                  return false;
                }

                return (
                  eventMinutes >=
                  currentMinutes
                );
              }
            )
            .sort(
              (
                a,
                b
              ) => {
                const aMinutes =
                  timeToMinutes(
                    a.time
                  ) ??
                  9999;

                const bMinutes =
                  timeToMinutes(
                    b.time
                  ) ??
                  9999;

                return (
                  aMinutes -
                  bMinutes
                );
              }
            )
            .slice(
              0,
              3
            );

        if (
          upcoming.length ===
          0
        ) {
          const importantToday =
            parsed
              .filter(
                (
                  event
                ) =>
                  event.stars >=
                  2
              )
              .sort(
                (
                  a,
                  b
                ) => {
                  const aMinutes =
                    timeToMinutes(
                      a.time
                    ) ??
                    9999;

                  const bMinutes =
                    timeToMinutes(
                      b.time
                    ) ??
                    9999;

                  return (
                    aMinutes -
                    bMinutes
                  );
                }
              )
              .slice(
                0,
                3
              );

          setMarketEvents(
            importantToday
          );

          return;
        }

        setMarketEvents(
          upcoming
        );
      } catch (
        error
      ) {
        console.error(
          "Erreur calendrier dashboard :",
          error
        );

        setMarketEvents(
          []
        );
      } finally {
        setCalendarLoading(
          false
        );
      }
    }

    loadDashboardCalendar();
  }, []);

  /* =====================================================
     CALCULATED DATA
  ===================================================== */

  const accountMap =
    useMemo(() => {
      const map =
        new Map<
          number,
          TradingAccount
        >();

      accounts.forEach(
        (
          account
        ) => {
          map.set(
            account.id,
            account
          );
        }
      );

      return map;
    }, [accounts]);

  const accountCurrency =
    useMemo(() => {
      if (
        accounts.length ===
        0
      ) {
        return null;
      }

      const currencies =
        Array.from(
          new Set(
            accounts.map(
              (
                account
              ) =>
                account.currency
            )
          )
        );

      return currencies.length ===
        1
        ? currencies[0]
        : null;
    }, [accounts]);

  const monthTrades =
    useMemo(
      () =>
        trades.filter(
          (
            trade
          ) =>
            isThisMonth(
              trade.trade_date
            )
        ),
      [trades]
    );

  const dashboardStats =
    useMemo(() => {
      const totalCapital =
        accounts.reduce(
          (
            total,
            account
          ) =>
            total +
            Number(
              account.current_balance ||
                0
            ),
          0
        );

      const monthPnl =
        monthTrades.reduce(
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

      const wins =
        monthTrades.filter(
          (
            trade
          ) =>
            trade.status ===
            "win"
        ).length;

      const losses =
        monthTrades.filter(
          (
            trade
          ) =>
            trade.status ===
            "loss"
        ).length;

      const winrate =
        wins + losses > 0
          ? (wins /
              (wins +
                losses)) *
            100
          : 0;

      const riskTrades =
        monthTrades.filter(
          (
            trade
          ) =>
            Number(
              trade.risk_percent
            ) > 0
        );

      const averageRisk =
        riskTrades.length >
        0
          ? riskTrades.reduce(
              (
                total,
                trade
              ) =>
                total +
                Number(
                  trade.risk_percent ||
                    0
                ),
              0
            ) /
            riskTrades.length
          : 0;

      return {
        totalCapital,
        monthPnl,
        winrate,
        averageRisk,

        tradesThisMonth:
          monthTrades.length,
      };
    }, [
      accounts,
      monthTrades,
    ]);

  /* =====================================================
     WEEK GOALS
  ===================================================== */

  const weeklyGoals =
    useMemo(() => {
      const weekStart =
        getWeekStart();

      const weekTrades =
        trades.filter(
          (
            trade
          ) =>
            tradeParisYMD(
              trade.trade_date
            ) >=
              weekStart &&
            trade.status !==
              "cancelled"
        );

      /* 1. VOLUME DE TRADES */

      const tradeTarget =
        5;

      const fiveTrades =
        weekTrades.length >=
        tradeTarget;

      /* 2. RISQUE MAX */

      const riskRespected =
        weekTrades.length >
          0 &&
        tradingPlan
          ? weekTrades.every(
              (
                trade
              ) =>
                Number(
                  trade.risk_percent ||
                    0
                ) <=
                Number(
                  tradingPlan.max_risk_percent
                )
            )
          : false;

      /* 3. NOMBRE MAX DE TRADES / JOUR */

      const tradesByDay =
        new Map<
          string,
          number
        >();

      weekTrades.forEach(
        (
          trade
        ) => {
          const day =
            tradeParisYMD(
              trade.trade_date
            );

          tradesByDay.set(
            day,
            (
              tradesByDay.get(
                day
              ) || 0
            ) + 1
          );
        }
      );

      const dailyLimitRespected =
        weekTrades.length >
          0 &&
        tradingPlan
          ? Array.from(
              tradesByDay.values()
            ).every(
              (
                count
              ) =>
                count <=
                Number(
                  tradingPlan.max_trades_per_day
                )
            )
          : false;

      /* 4. DISCIPLINE DU PLAN */

      const compliantTrades =
        tradingPlan
          ? weekTrades.filter(
              (
                trade
              ) =>
                isTradePlanCompliant(
                  trade,
                  tradingPlan
                )
            ).length
          : 0;

      const disciplinePercent =
        weekTrades.length >
          0 &&
        tradingPlan
          ? (
              compliantTrades /
              weekTrades.length
            ) *
            100
          : 0;

      const disciplineGoal =
        weekTrades.length >
          0 &&
        tradingPlan
          ? disciplinePercent >=
            80
          : false;

      /* 5. JOURNAL DOCUMENTÉ */

      const documentedTrades =
        weekTrades.filter(
          (
            trade
          ) =>
            !!trade.notes?.trim() &&
            !!trade.screenshot_url
        ).length;

      const journalCompleted =
        weekTrades.length >
          0 &&
        documentedTrades ===
          weekTrades.length;

      const goals = [
        fiveTrades,
        riskRespected,
        dailyLimitRespected,
        disciplineGoal,
        journalCompleted,
      ];

      const completed =
        goals.filter(
          Boolean
        ).length;

      return {
        completed,

        totalGoals:
          goals.length,

        percent:
          (
            completed /
            goals.length
          ) *
          100,

        weekTrades:
          weekTrades.length,

        tradeTarget,

        fiveTrades,

        riskRespected,

        dailyLimitRespected,

        disciplinePercent,

        disciplineGoal,

        documentedTrades,

        journalCompleted,
      };
    }, [
      trades,
      tradingPlan,
    ]);

  const recentTrades =
    trades.slice(
      0,
      3
    );

  const isAcademyUnlocked =
    profile.plan ===
      "pro" ||
    profile.plan ===
      "elite";

  const planLabel =
    profile.plan.toUpperCase();

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-sm text-[color:var(--muted)]">
          Chargement de ton espace InvestPro…
        </div>
      </div>
    );
  }

  return <AuraDashboard profile={profile} accounts={accounts} trades={trades} plan={tradingPlan} compliantIds={trades.filter(t=>tradingPlan && isTradePlanCompliant(t,tradingPlan)).map(t=>t.id)} events={marketEvents} calendarLoading={calendarLoading}/>;
}


function StatCard({
  icon,
  label,
  value,
  sub,
  positive,
  className = "",
}: {
  icon:
    React.ReactNode;

  label:
    string;

  value:
    string;

  sub:
    string;

  positive?:
    boolean;

  className?:
    string;
}) {
  return (
    <div
      className={[
        "aura-surface group min-h-[124px] rounded-2xl",
        "border border-[color:var(--border)]",
        "bg-[color:var(--panel)]",
        "p-3 lg:min-h-[96px] lg:p-4",
        "transition hover:border-[color:var(--gold-border)]",
        className,
      ].join(" ")}
    >
      <div className="flex h-full flex-col items-start gap-2 lg:flex-row lg:items-center lg:gap-3">
        <div
          className="
            flex h-9 w-9 shrink-0 items-center justify-center
            rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
            lg:h-10 lg:w-10
          "
        >
          {icon}
        </div>

        <div className="min-w-0 w-full">
          <div className="truncate text-[9px] text-[color:var(--muted)] lg:text-[11px]">
            {label}
          </div>

          <div
            className={[
              "mt-1 truncate text-[15px] font-semibold leading-none lg:text-lg",
              positive === true
                ? "text-emerald-400"
                : positive === false
                ? "text-red-400"
                : "text-white",
            ].join(" ")}
          >
            {value}
          </div>

          <div className="mt-2 hidden text-[9px] text-[color:var(--muted)] sm:block">
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({
  children,
  className = "",
}: {
  children:
    React.ReactNode;

  className?:
    string;
}) {
  return (
    <div
      className={[
        "aura-surface rounded-[14px]",
        "border border-[color:var(--border)]",
        "bg-[color:var(--panel)]",
        "p-4 lg:p-5",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
  right,
}: {
  icon:
    React.ReactNode;

  title:
    string;

  right?:
    React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[color:var(--gold)]">
          {icon}
        </span>

        <h3 className="text-sm font-semibold text-white">
          {title}
        </h3>
      </div>

      {right}
    </div>
  );
}

function EmptyState({
  title,
  text,
}: {
  title:
    string;

  text:
    string;
}) {
  return (
    <div
      className="
        rounded-2xl
        border border-dashed border-white/[0.08]
        bg-black/20
        p-4
      "
    >
      <div className="text-xs font-semibold text-white">
        {title}
      </div>

      <p className="mt-1 text-[11px] leading-5 text-[color:var(--muted)]">
        {text}
      </p>
    </div>
  );
}

function DashboardAccount({
  account,
}: {
  account:
    TradingAccount;
}) {
  return (
    <div
      className="
        rounded-xl
        border border-white/[0.06]
        bg-black/20
        p-3
      "
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-white">
            {
              account.name
            }
          </div>

          <div className="mt-1 truncate text-[9px] text-[color:var(--muted)]">
            {account.broker ||
              "Compte manuel"}

            {account.platform
              ? ` • ${account.platform}`
              : ""}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-[color:var(--gold)]">
            {formatCurrency(
              Number(
                account.current_balance ||
                  0
              ),
              account.currency
            )}
          </div>

          <div className="mt-1 text-[8px] uppercase text-white/30">
            {
              account.connection_type
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentTrade({
  trade,
  currency,
}: {
  trade:
    Trade;

  currency:
    string;
}) {
  const positive =
    Number(
      trade.result_amount
    ) > 0;

  const negative =
    Number(
      trade.result_amount
    ) < 0;

  return (
    <div
      className="
        flex
        items-center
        gap-3
        rounded-xl
        border border-white/[0.06]
        bg-black/20
        p-3
      "
    >
      <div
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",

          trade.direction ===
          "buy"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400",
        ].join(" ")}
      >
        {trade.direction ===
        "buy" ? (
          <ArrowUpRight
            size={16}
          />
        ) : (
          <ArrowDownRight
            size={16}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-xs font-semibold text-white">
            {
              trade.symbol
            }
          </div>

          <span className="text-[8px] uppercase text-[color:var(--muted)]">
            {
              trade.status
            }
          </span>
        </div>

        <div className="mt-1 text-[9px] text-[color:var(--muted)]">
          {formatDate(
            trade.trade_date
          )}

          {trade.timeframe
            ? ` • ${trade.timeframe}`
            : ""}
        </div>
      </div>

      <div
        className={[
          "shrink-0 text-xs font-semibold",

          positive
            ? "text-emerald-400"
            : negative
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
    </div>
  );
}

function MarketRow({
  time,
  currency,
  flag,
  event,
  stars,
}: {
  time:
    string;

  currency:
    string;

  flag:
    string;

  event:
    string;

  stars:
    Stars;
}) {
  const level =
    stars === 3
      ? "Élevé"
      : stars === 2
      ? "Moyen"
      : "Faible";

  return (
    <div className="flex items-center gap-2 border-b border-white/5 pb-3 last:border-b-0">
      <div className="w-[38px] shrink-0 text-[11px] font-semibold text-white">
        {time}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[11px]">
          {flag}
        </span>

        <span className="text-[9px] text-[color:var(--muted)]">
          {currency}
        </span>
      </div>

      <div className="min-w-0 flex-1 truncate text-[10px] text-white">
        {event}
      </div>

      <span
        className={[
          "shrink-0 rounded-full px-2 py-1 text-[8px] font-bold",

          stars === 3
            ? "bg-red-500/10 text-red-400"
            : stars === 2
            ? "bg-amber-400/10 text-amber-300"
            : "bg-white/5 text-white/40",
        ].join(" ")}
      >
        {level}
      </span>
    </div>
  );
}

function Goal({
  text,
  done = false,
}: {
  text:
    string;

  done?:
    boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2
          size={13}
          className="shrink-0 text-emerald-400"
        />
      ) : (
        <span className="h-3 w-3 shrink-0 rounded-full border border-white/20" />
      )}

      <span
        className={
          done
            ? "text-white"
            : ""
        }
      >
        {text}
      </span>
    </div>
  );
}