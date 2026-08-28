"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  Award,
  CalendarDays,
  CheckCircle2,
  Flame,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type Challenge = {
  id: number;

  title: string;
  description: string;

  category: string;

  goal_type:
    | "trades_count"
    | "documented_trades"
    | "risk_respected";

  target_value: number;

  xp_reward: number;

  start_date: string;
  end_date: string;

  is_active: boolean;
};

type Participation = {
  id: number;

  challenge_id: number;

  user_id: string;

  joined_at: string;

  completed_at:
    | string
    | null;
};

type Trade = {
  id: number;

  trade_date: string;

  status:
    | "open"
    | "win"
    | "loss"
    | "breakeven"
    | "cancelled";

  risk_percent: number;

  notes:
    | string
    | null;

  screenshot_url:
    | string
    | null;
};

type TradingPlan = {
  max_risk_percent:
    number;
};

type ChallengeProgress = {
  current: number;
  target: number;
  percent: number;
  complete: boolean;
};

/* =========================================================
   HELPERS
========================================================= */

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

function categoryIcon(
  category: string
) {
  const value =
    String(category)
      .toLowerCase();

  if (
    value.includes(
      "journal"
    )
  ) {
    return (
      <Activity
        size={18}
      />
    );
  }

  if (
    value.includes(
      "discipline"
    )
  ) {
    return (
      <ShieldCheck
        size={18}
      />
    );
  }

  return (
    <Flame
      size={18}
    />
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function ChallengesPage() {
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
    useState<
      string | null
    >(null);

  const [
    challenges,
    setChallenges,
  ] =
    useState<
      Challenge[]
    >([]);

  const [
    participations,
    setParticipations,
  ] =
    useState<
      Participation[]
    >([]);

  const [
    trades,
    setTrades,
  ] =
    useState<
      Trade[]
    >([]);

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
    useState(
      true
    );

  const [
    joiningId,
    setJoiningId,
  ] =
    useState<
      number | null
    >(null);

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

      setUserId(
        user.id
      );

      const [
        challengesResult,
        participationsResult,
        tradesResult,
        planResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "challenges"
            )
            .select("*")
            .order(
              "start_date",
              {
                ascending:
                  true,
              }
            ),

          supabase
            .from(
              "challenge_participants"
            )
            .select("*")
            .eq(
              "user_id",
              user.id
            ),

          supabase
            .from(
              "trading_journal"
            )
            .select(
              `
                id,
                trade_date,
                status,
                risk_percent,
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
              "max_risk_percent"
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle(),
        ]);

      if (
        challengesResult.error
      ) {
        console.error(
          "Erreur challenges :",
          challengesResult.error
        );
      } else {
        setChallenges(
          (
            challengesResult.data as Challenge[]
          ) || []
        );
      }

      if (
        participationsResult.error
      ) {
        console.error(
          "Erreur participations :",
          participationsResult.error
        );
      } else {
        setParticipations(
          (
            participationsResult.data as Participation[]
          ) || []
        );
      }

      if (
        tradesResult.error
      ) {
        console.error(
          "Erreur trades challenges :",
          tradesResult.error
        );
      } else {
        setTrades(
          (
            tradesResult.data as Trade[]
          ) || []
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

  /* =======================================================
     PARTICIPATION MAP
  ======================================================= */

  const participationMap =
    useMemo(() => {
      const map =
        new Map<
          number,
          Participation
        >();

      participations.forEach(
        (
          participation
        ) => {
          map.set(
            participation.challenge_id,
            participation
          );
        }
      );

      return map;
    }, [
      participations,
    ]);

  /* =======================================================
     PROGRESS
  ======================================================= */

  function progressFor(
    challenge:
      Challenge
  ): ChallengeProgress {
    const start =
      new Date(
        challenge.start_date
      );

    const end =
      new Date(
        challenge.end_date
      );

    const challengeTrades =
      trades.filter(
        (
          trade
        ) => {
          const date =
            new Date(
              trade.trade_date
            );

          return (
            date >=
              start &&
            date <
              end &&
            trade.status !==
              "cancelled"
          );
        }
      );

    let current =
      0;

    if (
      challenge.goal_type ===
      "trades_count"
    ) {
      current =
        challengeTrades.length;
    }

    if (
      challenge.goal_type ===
      "documented_trades"
    ) {
      current =
        challengeTrades.filter(
          (
            trade
          ) =>
            !!trade.notes?.trim() &&
            !!trade.screenshot_url
        ).length;
    }

    if (
      challenge.goal_type ===
      "risk_respected"
    ) {
      current =
        tradingPlan
          ? challengeTrades.filter(
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
            ).length
          : 0;
    }

    const target =
      Number(
        challenge.target_value ||
          1
      );

    const percent =
      Math.min(
        100,
        (
          current /
          target
        ) *
          100
      );

    return {
      current,

      target,

      percent,

      complete:
        current >=
        target,
    };
  }

  /* =======================================================
     ACTIVE / COMPLETED
  ======================================================= */

  const activeChallenges =
    useMemo(
      () =>
        challenges.filter(
          (
            challenge
          ) =>
            challenge.is_active &&
            new Date(
              challenge.end_date
            ) >
              new Date()
        ),
      [
        challenges,
      ]
    );

  const joinedChallenges =
    useMemo(
      () =>
        activeChallenges.filter(
          (
            challenge
          ) =>
            participationMap.has(
              challenge.id
            )
        ),
      [
        activeChallenges,
        participationMap,
      ]
    );

  const completedCount =
    useMemo(
      () =>
        joinedChallenges.filter(
          (
            challenge
          ) =>
            progressFor(
              challenge
            ).complete
        ).length,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        joinedChallenges,
        trades,
        tradingPlan,
      ]
    );

  /* =======================================================
     JOIN
  ======================================================= */

  async function joinChallenge(
    challenge:
      Challenge
  ) {
    if (
      !userId ||
      participationMap.has(
        challenge.id
      )
    ) {
      return;
    }

    try {
      setJoiningId(
        challenge.id
      );

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "challenge_participants"
          )
          .insert({
            challenge_id:
              challenge.id,

            user_id:
              userId,
          })
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      setParticipations(
        (
          current
        ) => [
          ...current,
          data as Participation,
        ]
      );
    } catch (
      error: any
    ) {
      console.error(
        "Erreur inscription challenge :",
        error
      );

      alert(
        error?.message ||
          "Impossible de rejoindre ce challenge."
      );
    } finally {
      setJoiningId(
        null
      );
    }
  }

  /* =======================================================
     CLAIM XP SECURELY
  ======================================================= */

  useEffect(() => {
    if (
      !userId ||
      loading
    ) {
      return;
    }

    async function syncCompletedAndRewards() {
      for (
        const challenge of joinedChallenges
      ) {
        const participation =
          participationMap.get(
            challenge.id
          );

        if (
          !participation ||
          participation.completed_at
        ) {
          continue;
        }

        const progress =
          progressFor(
            challenge
          );

        if (
          !progress.complete
        ) {
          continue;
        }

        const {
          data,
          error,
        } =
          await supabase.rpc(
            "claim_challenge_reward",
            {
              p_challenge_id:
                challenge.id,
            }
          );

        if (
          error
        ) {
          console.error(
            "Erreur attribution XP challenge :",
            error
          );

          continue;
        }

        const result =
          Array.isArray(
            data
          )
            ? data[0]
            : data;

        if (
          result?.completed_at
        ) {
          setParticipations(
            (
              current
            ) =>
              current.map(
                (
                  item
                ) =>
                  item.id ===
                  participation.id
                    ? {
                        ...item,
                        completed_at:
                          result.completed_at,
                      }
                    : item
              )
          );
        }
      }
    }

    syncCompletedAndRewards();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    joinedChallenges,
    trades,
    tradingPlan,
    userId,
    loading,
  ]);

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement des challenges…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
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
          <Trophy
            size={12}
          />

          Challenges InvestPro
        </div>

        <h1 className="text-2xl font-semibold text-white">
          Challenges
        </h1>

        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          Relève des objectifs basés sur ta discipline, ton journal et ta régularité.
        </p>
      </div>

      {/* =====================================================
          HERO
      ===================================================== */}

      <section
        className="
          relative
          overflow-hidden
          rounded-[26px]
          border
          border-[color:var(--gold-border)]
          bg-[#0b0b0d]
          p-6
          md:p-7
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            -right-20
            -top-24
            h-[320px]
            w-[320px]
            rounded-full
            bg-[color:var(--gold)]
            opacity-[0.08]
            blur-[100px]
          "
        />

        <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              Cette semaine
            </div>

            <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
              Progresse avec des objectifs concrets
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Les challenges se mettent à jour automatiquement à partir de ton Journal et de ton Plan de trading.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:col-span-5">
            <MiniStat
              label="Disponibles"
              value={String(
                activeChallenges.length
              )}
            />

            <MiniStat
              label="Rejoints"
              value={String(
                joinedChallenges.length
              )}
            />

            <MiniStat
              label="Terminés"
              value={String(
                completedCount
              )}
            />
          </div>
        </div>
      </section>

      {/* =====================================================
          CHALLENGE GRID
      ===================================================== */}

      {activeChallenges.length ===
      0 ? (
        <section
          className="
            rounded-[22px]
            border
            border-dashed
            border-white/[0.08]
            bg-[color:var(--panel)]
            p-10
            text-center
          "
        >
          <Lock
            size={26}
            className="mx-auto text-white/15"
          />

          <div className="mt-4 text-sm font-semibold text-white">
            Aucun challenge actif
          </div>

          <p className="mt-1 text-xs text-[color:var(--muted)]">
            De nouveaux challenges seront ajoutés prochainement.
          </p>
        </section>
      ) : (
        <section
          className="
            grid
            grid-cols-1
            gap-4
            md:grid-cols-2
            xl:grid-cols-3
          "
        >
          {activeChallenges.map(
            (
              challenge
            ) => {
              const participation =
                participationMap.get(
                  challenge.id
                );

              const joined =
                !!participation;

              const progress =
                progressFor(
                  challenge
                );

              return (
                <ChallengeCard
                  key={
                    challenge.id
                  }
                  challenge={
                    challenge
                  }
                  joined={
                    joined
                  }
                  progress={
                    progress
                  }
                  completed={
                    !!participation?.completed_at ||
                    (
                      joined &&
                      progress.complete
                    )
                  }
                  joining={
                    joiningId ===
                    challenge.id
                  }
                  onJoin={() =>
                    joinChallenge(
                      challenge
                    )
                  }
                />
              );
            }
          )}
        </section>
      )}

      {/* =====================================================
          INFO
      ===================================================== */}

      <section
        className="
          flex
          flex-col
          gap-4
          rounded-[20px]
          border
          border-white/[0.07]
          bg-black/20
          p-5
          md:flex-row
          md:items-center
          md:justify-between
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
              border
              border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              text-[color:var(--gold)]
            "
          >
            <Sparkles
              size={17}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-white">
              Récompenses XP
            </div>

            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[color:var(--muted)]">
              Dès qu’un challenge est réellement terminé, les XP sont crédités automatiquement sur ton profil une seule fois.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function ChallengeCard({
  challenge,
  joined,
  progress,
  completed,
  joining,
  onJoin,
}: {
  challenge:
    Challenge;

  joined:
    boolean;

  progress:
    ChallengeProgress;

  completed:
    boolean;

  joining:
    boolean;

  onJoin:
    () => void;
}) {
  return (
    <article
      className={[
        "relative overflow-hidden rounded-[22px] border p-5 transition",
        completed
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : joined
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-[color:var(--border)] bg-[color:var(--panel)] hover:border-[color:var(--gold-border)]",
      ].join(
        " "
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="
            flex
            h-11
            w-11
            shrink-0
            items-center
            justify-center
            rounded-xl
            border
            border-[color:var(--gold-border)]
            bg-black/20
            text-[color:var(--gold)]
          "
        >
          {categoryIcon(
            challenge.category
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <span
            className="
              rounded-full
              border
              border-[color:var(--gold-border)]
              bg-black/20
              px-2.5
              py-1
              text-[8px]
              font-bold
              uppercase
              text-[color:var(--gold)]
            "
          >
            +{
              challenge.xp_reward
            } XP
          </span>

          {completed ? (
            <span
              className="
                inline-flex
                items-center
                gap-1
                rounded-full
                border
                border-emerald-500/20
                bg-emerald-500/10
                px-2.5
                py-1
                text-[8px]
                font-bold
                text-emerald-400
              "
            >
              <CheckCircle2
                size={9}
              />

              TERMINÉ
            </span>
          ) : joined ? (
            <span
              className="
                rounded-full
                border
                border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
                px-2.5
                py-1
                text-[8px]
                font-bold
                text-[color:var(--gold)]
              "
            >
              EN COURS
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">
          {
            challenge.category
          }
        </div>

        <h2 className="mt-2 text-base font-semibold text-white">
          {
            challenge.title
          }
        </h2>

        <p className="mt-2 min-h-[42px] text-[11px] leading-5 text-[color:var(--muted)]">
          {
            challenge.description
          }
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2 text-[9px] text-white/35">
        <CalendarDays
          size={11}
        />

        {formatDate(
          challenge.start_date
        )}{" "}
        →{" "}
        {formatDate(
          challenge.end_date
        )}
      </div>

      {joined ? (
        <>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-semibold text-white">
                {
                  progress.current
                }{" "}
                /{" "}
                {
                  progress.target
                }
              </div>

              <div className="mt-1 text-[9px] text-[color:var(--muted)]">
                progression
              </div>
            </div>

            <div className="text-xs font-bold text-[color:var(--gold)]">
              {progress.percent.toFixed(
                0
              )}
              %
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className={
                completed
                  ? "h-full rounded-full bg-emerald-400 transition-all"
                  : "h-full rounded-full bg-[color:var(--gold)] transition-all"
              }
              style={{
                width: `${progress.percent}%`,
              }}
            />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={
            onJoin
          }
          disabled={
            joining
          }
          className="
            mt-5
            flex
            h-10
            w-full
            items-center
            justify-center
            gap-2
            rounded-xl
            bg-[color:var(--gold)]
            text-xs
            font-semibold
            text-black
            transition
            hover:bg-[color:var(--gold-2)]
            disabled:opacity-50
          "
        >
          <Target
            size={14}
          />

          {joining
            ? "Inscription..."
            : "Rejoindre le challenge"}
        </button>
      )}
    </article>
  );
}

function MiniStat({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-white/[0.07]
        bg-black/20
        px-4
        py-3
      "
    >
      <div className="text-[9px] text-[color:var(--muted)]">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}