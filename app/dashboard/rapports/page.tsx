"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  LineChart,
  Search,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type TradingAccount = {
  id: number;
  name: string;
  broker: string | null;
  account_type: "real" | "demo" | "prop";
  platform: "MT4" | "MT5" | "OTHER" | null;
  currency: string;
  initial_balance: number;
  current_balance: number;
};

type Trade = {
  id: number;
  account_id: number | null;
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  risk_percent: number;
  result_amount: number;
  result_r: number;
  status: "open" | "win" | "loss" | "breakeven" | "cancelled";
  setup: string | null;
  session: string | null;
  timeframe: string | null;
  notes: string | null;
  screenshot_url: string | null;
};

type Period =
  | "7d"
  | "30d"
  | "90d"
  | "year"
  | "all";

/* =========================================================
   HELPERS
========================================================= */

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function fmt(
  value: number,
  digits = 2
) {
  return Number(
    value || 0
  ).toLocaleString(
    "fr-FR",
    {
      maximumFractionDigits:
        digits,
      minimumFractionDigits:
        digits,
    }
  );
}

function fmtMoney(
  value: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      "fr-FR",
      {
        style:
          "currency",
        currency:
          currency ||
          "EUR",
        maximumFractionDigits:
          2,
      }
    ).format(
      Number(
        value ||
          0
      )
    );
  } catch {
    return `${fmt(
      value
    )} ${currency}`;
  }
}

function ymd(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function monthLabel(
  date: Date
) {
  return date.toLocaleDateString(
    "fr-FR",
    {
      month:
        "long",
      year:
        "numeric",
    }
  );
}

function signed(
  value: number,
  suffix = ""
) {
  const n =
    Number(
      value ||
        0
    );

  return `${n > 0 ? "+" : ""}${fmt(
    n
  )}${suffix}`;
}

function periodStart(
  period: Period
) {
  const now =
    new Date();

  if (
    period ===
    "all"
  ) {
    return null;
  }

  if (
    period ===
    "year"
  ) {
    return new Date(
      now.getFullYear(),
      0,
      1
    );
  }

  const days =
    period ===
    "7d"
      ? 7
      : period ===
        "30d"
      ? 30
      : 90;

  const start =
    new Date();

  start.setDate(
    start.getDate() -
      days +
      1
  );

  start.setHours(
    0,
    0,
    0,
    0
  );

  return start;
}

/* =========================================================
   PAGE
========================================================= */

export default function RapportsPage() {
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

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
    useState<
      Trade[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    selectedAccountId,
    setSelectedAccountId,
  ] =
    useState<
      "all" | number
    >("all");

  const [
    period,
    setPeriod,
  ] =
    useState<Period>(
      "30d"
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    viewDate,
    setViewDate,
  ] =
    useState(
      new Date()
    );

  /* =======================================================
     LOAD
  ======================================================= */

  useEffect(() => {
    loadPage();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage() {
    try {
      setLoading(
        true
      );

      const {
        data: {
          user,
        },
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

      const [
        accountsResult,
        tradesResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "trading_accounts"
            )
            .select(
              `
                id,
                name,
                broker,
                account_type,
                platform,
                currency,
                initial_balance,
                current_balance
              `
            )
            .eq(
              "user_id",
              user.id
            )
            .order(
              "created_at",
              {
                ascending:
                  true,
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
            .eq(
              "user_id",
              user.id
            )
            .order(
              "trade_date",
              {
                ascending:
                  true,
              }
            ),
        ]);

      if (
        accountsResult.error
      ) {
        console.error(
          "Erreur comptes rapports :",
          accountsResult.error
        );
      } else {
        setAccounts(
          (
            accountsResult.data as TradingAccount[]
          )?.map(
            (
              account
            ) => ({
              ...account,
              initial_balance:
                Number(
                  account.initial_balance ||
                    0
                ),

              current_balance:
                Number(
                  account.current_balance ||
                    0
                ),
            })
          ) ||
            []
        );
      }

      if (
        tradesResult.error
      ) {
        console.error(
          "Erreur trades rapports :",
          tradesResult.error
        );
      } else {
        setTrades(
          (
            tradesResult.data as Trade[]
          )?.map(
            (
              trade
            ) => ({
              ...trade,
              risk_percent:
                Number(
                  trade.risk_percent ||
                    0
                ),

              result_amount:
                Number(
                  trade.result_amount ||
                    0
                ),

              result_r:
                Number(
                  trade.result_r ||
                    0
                ),
            })
          ) ||
            []
        );
      }
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =======================================================
     FILTERS
  ======================================================= */

  const selectedAccount =
    useMemo(() => {
      if (
        selectedAccountId ===
        "all"
      ) {
        return null;
      }

      return (
        accounts.find(
          (
            account
          ) =>
            account.id ===
            selectedAccountId
        ) ||
        null
      );
    }, [
      accounts,
      selectedAccountId,
    ]);

  const accountCurrency =
    selectedAccount?.currency ||
    accounts[0]?.currency ||
    "EUR";

  const filteredTrades =
    useMemo(() => {
      const start =
        periodStart(
          period
        );

      const query =
        search
          .trim()
          .toLowerCase();

      return trades.filter(
        (
          trade
        ) => {
          if (
            selectedAccountId !==
              "all" &&
            trade.account_id !==
              selectedAccountId
          ) {
            return false;
          }

          if (
            start &&
            new Date(
              trade.trade_date
            ) <
              start
          ) {
            return false;
          }

          if (
            trade.status ===
            "cancelled"
          ) {
            return false;
          }

          if (
            query
          ) {
            const haystack =
              [
                trade.symbol,
                trade.setup,
                trade.session,
                trade.timeframe,
              ]
                .filter(
                  Boolean
                )
                .join(
                  " "
                )
                .toLowerCase();

            if (
              !haystack.includes(
                query
              )
            ) {
              return false;
            }
          }

          return true;
        }
      );
    }, [
      trades,
      selectedAccountId,
      period,
      search,
    ]);

  /* =======================================================
     KPI
  ======================================================= */

  const kpi =
    useMemo(() => {
      const closed =
        filteredTrades.filter(
          (
            trade
          ) =>
            [
              "win",
              "loss",
              "breakeven",
            ].includes(
              trade.status
            )
        );

      const wins =
        closed.filter(
          (
            trade
          ) =>
            trade.status ===
            "win"
        );

      const losses =
        closed.filter(
          (
            trade
          ) =>
            trade.status ===
            "loss"
        );

      const bes =
        closed.filter(
          (
            trade
          ) =>
            trade.status ===
            "breakeven"
        );

      const totalR =
        closed.reduce(
          (
            sum,
            trade
          ) =>
            sum +
            Number(
              trade.result_r ||
                0
            ),
          0
        );

      const pnl =
        closed.reduce(
          (
            sum,
            trade
          ) =>
            sum +
            Number(
              trade.result_amount ||
                0
            ),
          0
        );

      const winrate =
        wins.length +
          losses.length >
        0
          ? (
              wins.length /
              (
                wins.length +
                losses.length
              )
            ) *
            100
          : 0;

      const positiveR =
        wins.reduce(
          (
            sum,
            trade
          ) =>
            sum +
            Math.max(
              0,
              trade.result_r
            ),
          0
        );

      const negativeRAbs =
        Math.abs(
          losses.reduce(
            (
              sum,
              trade
            ) =>
              sum +
              Math.min(
                0,
                trade.result_r
              ),
            0
          )
        );

      const profitFactor =
        negativeRAbs >
        0
          ? positiveR /
            negativeRAbs
          : positiveR >
            0
          ? positiveR
          : 0;

      const avgWinR =
        wins.length >
        0
          ? positiveR /
            wins.length
          : 0;

      const avgLossR =
        losses.length >
        0
          ? negativeRAbs /
            losses.length
          : 0;

      const avgRisk =
        closed.length >
        0
          ? closed.reduce(
              (
                sum,
                trade
              ) =>
                sum +
                Number(
                  trade.risk_percent ||
                    0
                ),
              0
            ) /
            closed.length
          : 0;

      const dayMap =
        new Map<
          string,
          number
        >();

      closed.forEach(
        (
          trade
        ) => {
          const key =
            ymd(
              new Date(
                trade.trade_date
              )
            );

          dayMap.set(
            key,
            (
              dayMap.get(
                key
              ) ||
              0
            ) +
              Number(
                trade.result_r ||
                  0
              )
          );
        }
      );

      const days =
        Array.from(
          dayMap.entries()
        ).map(
          ([
            date,
            resultR,
          ]) => ({
            date,
            resultR,
          })
        );

      const positiveDays =
        days.filter(
          (
            day
          ) =>
            day.resultR >
            0
        );

      const negativeDays =
        days.filter(
          (
            day
          ) =>
            day.resultR <
            0
        );

      const dayWinrate =
        positiveDays.length +
          negativeDays.length >
        0
          ? (
              positiveDays.length /
              (
                positiveDays.length +
                negativeDays.length
              )
            ) *
            100
          : 0;

      const bestDay =
        days.length >
        0
          ? [...days].sort(
              (
                a,
                b
              ) =>
                b.resultR -
                a.resultR
            )[0]
          : null;

      return {
        closed:
          closed.length,

        wins:
          wins.length,

        losses:
          losses.length,

        bes:
          bes.length,

        totalR,

        pnl,

        winrate,

        profitFactor,

        avgWinR,

        avgLossR,

        avgRisk,

        positiveDays:
          positiveDays.length,

        negativeDays:
          negativeDays.length,

        dayWinrate,

        bestDay,
      };
    }, [
      filteredTrades,
    ]);

  /* =======================================================
     EQUITY CURVE IN R
  ======================================================= */

  const equityCurve =
    useMemo(() => {
      let cumulative =
        0;

      return filteredTrades
        .filter(
          (
            trade
          ) =>
            [
              "win",
              "loss",
              "breakeven",
            ].includes(
              trade.status
            )
        )
        .map(
          (
            trade,
            index
          ) => {
            cumulative +=
              Number(
                trade.result_r ||
                  0
              );

            return {
              index,
              value:
                cumulative,
              date:
                trade.trade_date,
            };
          }
        );
    }, [
      filteredTrades,
    ]);

  const curveSvg =
    useMemo(() => {
      const width =
        1000;

      const height =
        260;

      if (
        equityCurve.length ===
        0
      ) {
        return {
          path: "",
          width,
          height,
          min: 0,
          max: 0,
        };
      }

      const values =
        equityCurve.map(
          (
            point
          ) =>
            point.value
        );

      let min =
        Math.min(
          0,
          ...values
        );

      let max =
        Math.max(
          0,
          ...values
        );

      if (
        min ===
        max
      ) {
        min -= 1;
        max += 1;
      }

      const xFor =
        (
          index: number
        ) =>
          equityCurve.length ===
          1
            ? width /
              2
            : 30 +
              (
                index /
                (
                  equityCurve.length -
                  1
                )
              ) *
                (
                  width -
                  60
                );

      const yFor =
        (
          value: number
        ) =>
          25 +
          (
            1 -
            (
              value -
              min
            ) /
              (
                max -
                min
              )
          ) *
            (
              height -
              50
            );

      const path =
        equityCurve
          .map(
            (
              point,
              index
            ) =>
              `${index === 0 ? "M" : "L"} ${xFor(
                index
              )} ${yFor(
                point.value
              )}`
          )
          .join(
            " "
          );

      return {
        path,
        width,
        height,
        min,
        max,
      };
    }, [
      equityCurve,
    ]);

  /* =======================================================
     BREAKDOWNS
  ======================================================= */

  const breakdowns =
    useMemo(() => {
      function aggregate(
        key:
          | "symbol"
          | "session"
          | "timeframe"
          | "setup"
      ) {
        const map =
          new Map<
            string,
            {
              count: number;
              totalR: number;
              wins: number;
              losses: number;
            }
          >();

        filteredTrades.forEach(
          (
            trade
          ) => {
            if (
              ![
                "win",
                "loss",
                "breakeven",
              ].includes(
                trade.status
              )
            ) {
              return;
            }

            const label =
              String(
                trade[
                  key
                ] ||
                  "Non renseigné"
              );

            const current =
              map.get(
                label
              ) || {
                count: 0,
                totalR: 0,
                wins: 0,
                losses: 0,
              };

            current.count +=
              1;

            current.totalR +=
              Number(
                trade.result_r ||
                  0
              );

            if (
              trade.status ===
              "win"
            ) {
              current.wins +=
                1;
            }

            if (
              trade.status ===
              "loss"
            ) {
              current.losses +=
                1;
            }

            map.set(
              label,
              current
            );
          }
        );

        return Array.from(
          map.entries()
        )
          .map(
            ([
              label,
              data,
            ]) => ({
              label,
              ...data,

              winrate:
                data.wins +
                  data.losses >
                0
                  ? (
                      data.wins /
                      (
                        data.wins +
                        data.losses
                      )
                    ) *
                    100
                  : 0,
            })
          )
          .sort(
            (
              a,
              b
            ) =>
              b.totalR -
              a.totalR
          );
      }

      return {
        symbols:
          aggregate(
            "symbol"
          ),

        sessions:
          aggregate(
            "session"
          ),

        timeframes:
          aggregate(
            "timeframe"
          ),

        setups:
          aggregate(
            "setup"
          ),
      };
    }, [
      filteredTrades,
    ]);

  /* =======================================================
     CALENDAR
  ======================================================= */

  const calendar =
    useMemo(() => {
      const firstDay =
        new Date(
          viewDate.getFullYear(),
          viewDate.getMonth(),
          1
        );

      const startWeekday =
        (
          firstDay.getDay() +
          6
        ) %
        7;

      const gridStart =
        new Date(
          firstDay
        );

      gridStart.setDate(
        firstDay.getDate() -
          startWeekday
      );

      const monthTrades =
        filteredTrades.filter(
          (
            trade
          ) => {
            const date =
              new Date(
                trade.trade_date
              );

            return (
              date.getFullYear() ===
                viewDate.getFullYear() &&
              date.getMonth() ===
                viewDate.getMonth()
            );
          }
        );

      const days:
        {
          date: Date;
          key: string;
          resultR: number;
          count: number;
        }[] = [];

      for (
        let index =
          0;
        index <
        42;
        index +=
          1
      ) {
        const date =
          new Date(
            gridStart
          );

        date.setDate(
          gridStart.getDate() +
            index
        );

        const key =
          ymd(
            date
          );

        const dayTrades =
          monthTrades.filter(
            (
              trade
            ) =>
              ymd(
                new Date(
                  trade.trade_date
                )
              ) ===
              key
          );

        days.push({
          date,
          key,

          resultR:
            dayTrades.reduce(
              (
                sum,
                trade
              ) =>
                sum +
                Number(
                  trade.result_r ||
                    0
                ),
              0
            ),

          count:
            dayTrades.length,
        });
      }

      return {
        days,
        monthR:
          monthTrades.reduce(
            (
              sum,
              trade
            ) =>
              sum +
              Number(
                trade.result_r ||
                  0
              ),
            0
          ),
      };
    }, [
      viewDate,
      filteredTrades,
    ]);

  const weeks =
    useMemo(() => {
      const rows:
        typeof calendar.days[] =
        [];

      for (
        let index =
          0;
        index <
        6;
        index +=
          1
      ) {
        rows.push(
          calendar.days.slice(
            index *
              7,
            index *
              7 +
              7
          )
        );
      }

      return rows;
    }, [
      calendar.days,
    ]);

  /* =======================================================
     CAPITAL
  ======================================================= */

  const capital =
    useMemo(() => {
      if (
        selectedAccount
      ) {
        return {
          initial:
            selectedAccount.initial_balance,

          current:
            selectedAccount.current_balance,

          currency:
            selectedAccount.currency,
        };
      }

      const sameCurrency =
        accounts.every(
          (
            account
          ) =>
            account.currency ===
            accountCurrency
        );

      if (
        !sameCurrency
      ) {
        return {
          initial: 0,
          current: 0,
          currency:
            accountCurrency,
        };
      }

      return {
        initial:
          accounts.reduce(
            (
              sum,
              account
            ) =>
              sum +
              account.initial_balance,
            0
          ),

        current:
          accounts.reduce(
            (
              sum,
              account
            ) =>
              sum +
              account.current_balance,
            0
          ),

        currency:
          accountCurrency,
      };
    }, [
      selectedAccount,
      accounts,
      accountCurrency,
    ]);

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement des rapports…
      </div>
    );
  }

  return (
    <div className="investpro-mobile-page space-y-4 pb-4 lg:space-y-5 lg:pb-10">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div>
        <div
          className="
            mb-3
            inline-flex
            items-center
            gap-2
            rounded-full
            border
            border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            px-3
            py-1.5
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.13em]
            text-[color:var(--gold)]
          "
        >
          <BarChart3
            size={12}
          />

          Analytics InvestPro
        </div>

        <h1 className="text-2xl font-semibold text-white">
          Rapports de performance
        </h1>

        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          Analyse tes performances réelles à partir de tes comptes et des trades enregistrés dans ton Journal.
        </p>
      </div>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <section
        className="
          rounded-[22px]
          border
          border-[color:var(--border)]
          bg-[color:var(--panel)]
          p-4
        "
      >
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <div className="mb-2 text-[9px] font-medium uppercase tracking-[0.08em] text-white/35">
              Compte
            </div>

            <select
              value={
                selectedAccountId
              }
              onChange={(
                event
              ) =>
                setSelectedAccountId(
                  event.target.value ===
                    "all"
                    ? "all"
                    : Number(
                        event.target.value
                      )
                )
              }
              className={inputClass}
            >
              <option value="all">
                Tous les comptes
              </option>

              {accounts.map(
                (
                  account
                ) => (
                  <option
                    key={
                      account.id
                    }
                    value={
                      account.id
                    }
                  >
                    {account.name}
                    {account.broker
                      ? ` • ${account.broker}`
                      : ""}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="xl:col-span-5">
            <div className="mb-2 text-[9px] font-medium uppercase tracking-[0.08em] text-white/35">
              Période
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
              {(
                [
                  [
                    "7d",
                    "7 jours",
                  ],
                  [
                    "30d",
                    "30 jours",
                  ],
                  [
                    "90d",
                    "3 mois",
                  ],
                  [
                    "year",
                    "Année",
                  ],
                  [
                    "all",
                    "Tout",
                  ],
                ] as [
                  Period,
                  string
                ][]
              ).map(
                ([
                  key,
                  label,
                ]) => (
                  <button
                    key={
                      key
                    }
                    type="button"
                    onClick={() =>
                      setPeriod(
                        key
                      )
                    }
                    className={[
                      "h-11 shrink-0 min-w-[72px] rounded-xl border px-3 text-[10px] font-semibold transition lg:min-w-0 lg:px-2",

                      period ===
                      key
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                        : "border-white/10 bg-black/20 text-white/45",
                    ].join(
                      " "
                    )}
                  >
                    {
                      label
                    }
                  </button>
                )
              )}
            </div>
          </div>

          <div className="xl:col-span-3">
            <div className="mb-2 text-[9px] font-medium uppercase tracking-[0.08em] text-white/35">
              Recherche
            </div>

            <div className="relative">
              <Search
                size={14}
                className="
                  absolute
                  left-3
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
                    event.target.value
                  )
                }
                placeholder="GOLD, London, OTE..."
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          KPI
      ===================================================== */}

      <section
        className="
          grid
          grid-cols-2
          gap-2
          lg:gap-3
          xl:grid-cols-6
        "
      >
        <KpiCard
          icon={
            <Activity
              size={17}
            />
          }
          label="Trades"
          value={String(
            kpi.closed
          )}
        />

        <KpiCard
          icon={
            <Target
              size={17}
            />
          }
          label="Winrate"
          value={`${fmt(
            kpi.winrate,
            1
          )}%`}
        />

        <KpiCard
          icon={
            <TrendingUp
              size={17}
            />
          }
          label="Résultat"
          value={signed(
            kpi.totalR,
            "R"
          )}
          tone={
            kpi.totalR >
            0
              ? "success"
              : kpi.totalR <
                0
              ? "danger"
              : "neutral"
          }
        />

        <KpiCard
          icon={
            <Gauge
              size={17}
            />
          }
          label="Profit Factor"
          value={fmt(
            kpi.profitFactor
          )}
          tone="gold"
        />

        <KpiCard
          icon={
            <ShieldCheck
              size={17}
            />
          }
          label="Risque moyen"
          value={`${fmt(
            kpi.avgRisk
          )}%`}
        />

        <KpiCard
          icon={
            <CircleDollarSign
              size={17}
            />
          }
          label="P&L"
          value={fmtMoney(
            kpi.pnl,
            accountCurrency
          )}
          tone={
            kpi.pnl >
            0
              ? "success"
              : kpi.pnl <
                0
              ? "danger"
              : "neutral"
          }
        />
      </section>

      {/* =====================================================
          CAPITAL + CURVE
      ===================================================== */}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div
          className="
            rounded-[24px]
            border
            border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
            xl:col-span-4
          "
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
              <WalletCards
                size={17}
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-white">
                Capital
              </div>

              <div className="mt-1 text-[9px] text-[color:var(--muted)]">
                {selectedAccount
                  ? selectedAccount.name
                  : "Vue globale"}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[9px] uppercase tracking-[0.08em] text-white/30">
              Capital actuel
            </div>

            <div className="mt-2 text-3xl font-semibold text-white">
              {fmtMoney(
                capital.current,
                capital.currency
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <SmallMetric
              label="Initial"
              value={fmtMoney(
                capital.initial,
                capital.currency
              )}
            />

            <SmallMetric
              label="Écart"
              value={fmtMoney(
                capital.current -
                  capital.initial,
                capital.currency
              )}
              gold
            />
          </div>

          {selectedAccountId ===
            "all" &&
          accounts.some(
            (
              account
            ) =>
              account.currency !==
              accountCurrency
          ) ? (
            <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3 text-[9px] leading-4 text-amber-200/70">
              Plusieurs devises sont présentes. Sélectionne un compte pour obtenir un capital exact dans sa devise.
            </div>
          ) : null}
        </div>

        <div
          className="
            rounded-[24px]
            border
            border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
            xl:col-span-8
          "
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Évolution de la performance
              </div>

              <div className="mt-1 text-[9px] text-[color:var(--muted)]">
                Résultat cumulé en R sur la période sélectionnée.
              </div>
            </div>

            <div
              className={[
                "text-lg font-semibold",
                kpi.totalR >
                0
                  ? "text-emerald-400"
                  : kpi.totalR <
                    0
                  ? "text-red-400"
                  : "text-white",
              ].join(
                " "
              )}
            >
              {signed(
                kpi.totalR,
                "R"
              )}
            </div>
          </div>

          <div className="mt-5 h-[220px] lg:h-[285px] overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20">
            {curveSvg.path ? (
              <svg
                viewBox={`0 0 ${curveSvg.width} ${curveSvg.height}`}
                className="h-full w-full"
                preserveAspectRatio="none"
              >
                {[0.25, 0.5, 0.75].map(
                  (
                    ratio
                  ) => (
                    <line
                      key={
                        ratio
                      }
                      x1="0"
                      x2={
                        curveSvg.width
                      }
                      y1={
                        curveSvg.height *
                        ratio
                      }
                      y2={
                        curveSvg.height *
                        ratio
                      }
                      stroke="rgba(255,255,255,.06)"
                    />
                  )
                )}

                <path
                  d={
                    curveSvg.path
                  }
                  fill="none"
                  stroke="rgba(214,179,95,.95)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted)]">
                Ajoute des trades clôturés pour afficher la courbe.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          ADVANCED KPI
      ===================================================== */}

      <section
        className="
          grid
          grid-cols-1
          gap-4
          lg:grid-cols-2
          xl:grid-cols-4
        "
      >
        <AdvancedCard
          title="Avg Win"
          value={signed(
            kpi.avgWinR,
            "R"
          )}
          subtitle="Gain moyen par trade gagnant"
          icon={
            <TrendingUp
              size={17}
            />
          }
          tone="success"
        />

        <AdvancedCard
          title="Avg Loss"
          value={`-${fmt(
            kpi.avgLossR
          )}R`}
          subtitle="Perte moyenne par trade perdant"
          icon={
            <TrendingDown
              size={17}
            />
          }
          tone="danger"
        />

        <AdvancedCard
          title="Day Win"
          value={`${fmt(
            kpi.dayWinrate,
            1
          )}%`}
          subtitle={`${kpi.positiveDays} jours positifs • ${kpi.negativeDays} négatifs`}
          icon={
            <CalendarDays
              size={17}
            />
          }
          tone="gold"
        />

        <AdvancedCard
          title="Meilleur jour"
          value={
            kpi.bestDay
              ? signed(
                  kpi.bestDay.resultR,
                  "R"
                )
              : "—"
          }
          subtitle={
            kpi.bestDay?.date ||
            "Pas assez de données"
          }
          icon={
            <LineChart
              size={17}
            />
          }
          tone="gold"
        />
      </section>

      {/* =====================================================
          BREAKDOWNS
      ===================================================== */}

      <section
        className="
          grid
          grid-cols-1
          gap-4
          xl:grid-cols-2
        "
      >
        <BreakdownCard
          title="Performance par actif"
          rows={
            breakdowns.symbols
          }
        />

        <BreakdownCard
          title="Performance par session"
          rows={
            breakdowns.sessions
          }
        />

        <BreakdownCard
          title="Performance par timeframe"
          rows={
            breakdowns.timeframes
          }
        />

        <BreakdownCard
          title="Performance par setup"
          rows={
            breakdowns.setups
          }
        />
      </section>

      {/* =====================================================
          CALENDAR
      ===================================================== */}

      <section
        className="
          rounded-[24px]
          border
          border-[color:var(--border)]
          bg-[color:var(--panel)]
          p-5
        "
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Calendrier de performance
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Résultat journalier en R.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setViewDate(
                  new Date(
                    viewDate.getFullYear(),
                    viewDate.getMonth() -
                      1,
                    1
                  )
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/60"
            >
              <ChevronLeft
                size={15}
              />
            </button>

            <div className="min-w-[160px] text-center text-sm font-semibold capitalize text-[color:var(--gold)]">
              {monthLabel(
                viewDate
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setViewDate(
                  new Date(
                    viewDate.getFullYear(),
                    viewDate.getMonth() +
                      1,
                    1
                  )
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/60"
            >
              <ChevronRight
                size={15}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-2 text-center text-[9px] font-semibold uppercase text-white/25">
          {[
            "Lun",
            "Mar",
            "Mer",
            "Jeu",
            "Ven",
            "Sam",
            "Dim",
          ].map(
            (
              label
            ) => (
              <div
                key={
                  label
                }
              >
                {
                  label
                }
              </div>
            )
          )}
        </div>

        <div className="mt-2 space-y-2">
          {weeks.map(
            (
              week,
              weekIndex
            ) => (
              <div
                key={
                  weekIndex
                }
                className="grid grid-cols-7 gap-2"
              >
                {week.map(
                  (
                    day
                  ) => {
                    const inMonth =
                      day.date.getMonth() ===
                      viewDate.getMonth();

                    return (
                      <div
                        key={
                          day.key
                        }
                        className={[
                          "min-h-[84px] rounded-xl border p-2 transition",

                          day.resultR >
                          0
                            ? "border-emerald-500/15 bg-emerald-500/[0.05]"
                            : day.resultR <
                              0
                            ? "border-red-500/15 bg-red-500/[0.05]"
                            : "border-white/[0.06] bg-black/20",

                          inMonth
                            ? ""
                            : "opacity-30",
                        ].join(
                          " "
                        )}
                      >
                        <div className="text-[9px] text-white/40">
                          {day.date.getDate()}
                        </div>

                        {day.count >
                        0 ? (
                          <>
                            <div
                              className={[
                                "mt-3 text-xs font-semibold",

                                day.resultR >
                                0
                                  ? "text-emerald-400"
                                  : day.resultR <
                                    0
                                  ? "text-red-400"
                                  : "text-white/55",
                              ].join(
                                " "
                              )}
                            >
                              {signed(
                                day.resultR,
                                "R"
                              )}
                            </div>

                            <div className="mt-1 text-[8px] text-white/25">
                              {
                                day.count
                              }{" "}
                              trade
                              {day.count !==
                              1
                                ? "s"
                                : ""}
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  }
                )}
              </div>
            )
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
          <span className="text-[10px] text-[color:var(--muted)]">
            Résultat du mois affiché
          </span>

          <span
            className={[
              "text-sm font-semibold",

              calendar.monthR >
              0
                ? "text-emerald-400"
                : calendar.monthR <
                  0
                ? "text-red-400"
                : "text-white",
            ].join(
              " "
            )}
          >
            {signed(
              calendar.monthR,
              "R"
            )}
          </span>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

const inputClass = `
  h-11
  w-full
  rounded-xl
  border
  border-white/10
  bg-black/30
  px-3
  text-sm
  text-white
  outline-none
  focus:border-[color:var(--gold-border)]
`;

function KpiCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon:
    React.ReactNode;

  label:
    string;

  value:
    string;

  tone?:
    | "neutral"
    | "gold"
    | "success"
    | "danger";
}) {
  const valueClass =
    tone ===
    "success"
      ? "text-emerald-400"
      : tone ===
        "danger"
      ? "text-red-400"
      : tone ===
        "gold"
      ? "text-[color:var(--gold)]"
      : "text-white";

  return (
    <div
      className="
        rounded-[20px]
        border
        border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
      "
    >
      <div className="flex items-center gap-2 text-[color:var(--gold)]">
        {
          icon
        }

        <span className="text-[9px] text-[color:var(--muted)]">
          {
            label
          }
        </span>
      </div>

      <div
        className={[
          "mt-3 truncate text-lg font-semibold",
          valueClass,
        ].join(
          " "
        )}
      >
        {
          value
        }
      </div>
    </div>
  );
}

function SmallMetric({
  label,
  value,
  gold = false,
}: {
  label:
    string;

  value:
    string;

  gold?:
    boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[8px] text-[color:var(--muted)]">
        {
          label
        }
      </div>

      <div
        className={[
          "mt-1 text-xs font-semibold",

          gold
            ? "text-[color:var(--gold)]"
            : "text-white",
        ].join(
          " "
        )}
      >
        {
          value
        }
      </div>
    </div>
  );
}

function AdvancedCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title:
    string;

  value:
    string;

  subtitle:
    string;

  icon:
    React.ReactNode;

  tone:
    | "success"
    | "danger"
    | "gold";
}) {
  const valueClass =
    tone ===
    "success"
      ? "text-emerald-400"
      : tone ===
        "danger"
      ? "text-red-400"
      : "text-[color:var(--gold)]";

  return (
    <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          {
            icon
          }
        </div>

        <div>
          <div className="text-[9px] text-[color:var(--muted)]">
            {
              title
            }
          </div>

          <div
            className={[
              "mt-1 text-lg font-semibold",
              valueClass,
            ].join(
              " "
            )}
          >
            {
              value
            }
          </div>
        </div>
      </div>

      <div className="mt-4 text-[9px] leading-4 text-white/30">
        {
          subtitle
        }
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title:
    string;

  rows:
    {
      label: string;
      count: number;
      totalR: number;
      wins: number;
      losses: number;
      winrate: number;
    }[];
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
      <div className="text-sm font-semibold text-white">
        {
          title
        }
      </div>

      <div className="mt-4 space-y-2">
        {rows.length ===
        0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.07] bg-black/20 p-5 text-center text-[10px] text-[color:var(--muted)]">
            Pas assez de données.
          </div>
        ) : (
          rows.slice(
            0,
            6
          ).map(
            (
              row
            ) => (
              <div
                key={
                  row.label
                }
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-semibold text-white">
                    {
                      row.label
                    }
                  </div>

                  <div className="mt-1 text-[8px] text-white/25">
                    {
                      row.count
                    }{" "}
                    trade
                    {row.count !==
                    1
                      ? "s"
                      : ""}
                  </div>
                </div>

                <div className="text-[9px] text-white/45">
                  {fmt(
                    row.winrate,
                    0
                  )}
                  %
                </div>

                <div
                  className={[
                    "text-[10px] font-semibold",

                    row.totalR >
                    0
                      ? "text-emerald-400"
                      : row.totalR <
                        0
                      ? "text-red-400"
                      : "text-white/40",
                  ].join(
                    " "
                  )}
                >
                  {signed(
                    row.totalR,
                    "R"
                  )}
                </div>

                <div
                  className="
                    h-1.5
                    w-16
                    overflow-hidden
                    rounded-full
                    bg-white/5
                  "
                >
                  <div
                    className="h-full rounded-full bg-[color:var(--gold)]"
                    style={{
                      width: `${clamp(
                        row.winrate,
                        0,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}