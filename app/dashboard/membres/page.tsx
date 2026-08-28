"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Award,
  Eye,
  EyeOff,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type Member = {
  id: string;
  username: string;
  plan: string;
  xp: number;
  avatar_url: string | null;
  leaderboard_public: boolean;
  tag: string | null;
  bio: string | null;
};

type LeaderboardRow = {
  user_id: string;
  score: number;
};

/* =========================================================
   HELPERS
========================================================= */

function initials(value: string) {
  return (value || "IP")
    .slice(0, 2)
    .toUpperCase();
}

function planLabel(plan: string) {
  const value =
    String(plan || "free")
      .trim()
      .toLowerCase();

  if (value === "elite") {
    return "ELITE";
  }

  if (value === "pro") {
    return "PRO";
  }

  return "FREE";
}

function planClass(plan: string) {
  const value =
    String(plan || "free")
      .trim()
      .toLowerCase();

  if (value === "elite") {
    return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  }

  if (value === "pro") {
    return "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";
  }

  return "border-white/10 bg-white/[0.04] text-white/45";
}

/* =========================================================
   PAGE
========================================================= */

export default function MembresPage() {
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    members,
    setMembers,
  ] =
    useState<Member[]>([]);

  const [
    leaderboard,
    setLeaderboard,
  ] =
    useState<LeaderboardRow[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    planFilter,
    setPlanFilter,
  ] =
    useState<
      "all" | "free" | "pro" | "elite"
    >("all");

  const [
    visibilityFilter,
    setVisibilityFilter,
  ] =
    useState<
      "all" | "public" | "private"
    >("all");

  const [
    currentUserId,
    setCurrentUserId,
  ] =
    useState<string | null>(
      null
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
      setLoading(true);

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

      setCurrentUserId(
        user.id
      );

      const [
        membersResult,
        leaderboardResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "profiles"
            )
            .select(
              `
                id,
                username,
                plan,
                xp,
                avatar_url,
                leaderboard_public,
                tag,
                bio
              `
            )
            .order(
              "username",
              {
                ascending:
                  true,
              }
            ),

          supabase.rpc(
            "get_weekly_leaderboard"
          ),
        ]);

      if (
        membersResult.error
      ) {
        console.error(
          "Erreur chargement membres :",
          membersResult.error
        );

        setMembers(
          []
        );
      } else {
        setMembers(
          (
            membersResult.data as Member[]
          ) || []
        );
      }

      if (
        leaderboardResult.error
      ) {
        console.error(
          "Erreur leaderboard membres :",
          leaderboardResult.error
        );

        setLeaderboard(
          []
        );
      } else {
        setLeaderboard(
          (
            leaderboardResult.data as LeaderboardRow[]
          ) || []
        );
      }
    } catch (
      error
    ) {
      console.error(
        "Erreur page Membres :",
        error
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =======================================================
     LEADERBOARD MAP
  ======================================================= */

  const leaderboardMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          {
            score: number;
            rank: number;
          }
        >();

      leaderboard.forEach(
        (
          row,
          index
        ) => {
          map.set(
            row.user_id,
            {
              score:
                Number(
                  row.score ||
                    0
                ),

              rank:
                index + 1,
            }
          );
        }
      );

      return map;
    }, [
      leaderboard,
    ]);

  /* =======================================================
     FILTERS
  ======================================================= */

  const filteredMembers =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return members.filter(
        (
          member
        ) => {
          if (
            planFilter !==
              "all" &&
            String(
              member.plan ||
                "free"
            ).toLowerCase() !==
              planFilter
          ) {
            return false;
          }

          if (
            visibilityFilter ===
              "public" &&
            !member.leaderboard_public
          ) {
            return false;
          }

          if (
            visibilityFilter ===
              "private" &&
            member.leaderboard_public
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const haystack =
            [
              member.username,
              member.tag,
              member.bio,
              member.plan,
            ]
              .filter(
                Boolean
              )
              .join(" ")
              .toLowerCase();

          return haystack.includes(
            query
          );
        }
      );
    }, [
      members,
      search,
      planFilter,
      visibilityFilter,
    ]);

  /* =======================================================
     STATS
  ======================================================= */

  const stats =
    useMemo(() => {
      const publicCount =
        members.filter(
          (
            member
          ) =>
            member.leaderboard_public
        ).length;

      const proCount =
        members.filter(
          (
            member
          ) =>
            String(
              member.plan
            ).toLowerCase() ===
            "pro"
        ).length;

      const eliteCount =
        members.filter(
          (
            member
          ) =>
            String(
              member.plan
            ).toLowerCase() ===
            "elite"
        ).length;

      return {
        total:
          members.length,

        publicCount,

        proCount,

        eliteCount,
      };
    }, [
      members,
    ]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement des membres InvestPro…
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
          <Users
            size={12}
          />

          Communauté InvestPro
        </div>

        <h1 className="text-2xl font-semibold text-white">
          Membres
        </h1>

        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          Découvre les membres de la communauté InvestPro et retrouve les profils qui participent au classement.
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
              Espace communauté
            </div>

            <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
              Une communauté tournée vers la progression
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Retrouvez les membres InvestPro, leur niveau et leur participation au classement hebdomadaire.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-5">
            <MiniStat
              label="Membres"
              value={String(
                stats.total
              )}
            />

            <MiniStat
              label="Publics"
              value={String(
                stats.publicCount
              )}
            />

            <MiniStat
              label="PRO"
              value={String(
                stats.proCount
              )}
            />

            <MiniStat
              label="ELITE"
              value={String(
                stats.eliteCount
              )}
            />
          </div>
        </div>
      </section>

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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-6">
            <Search
              size={15}
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
                  event.target.value
                )
              }
              placeholder="Rechercher un membre, tag..."
              className="
                h-11
                w-full
                rounded-xl
                border
                border-[color:var(--border)]
                bg-black/20
                pl-11
                pr-4
                text-sm
                text-white
                outline-none
                placeholder:text-white/25
                focus:border-[color:var(--gold-border)]
              "
            />
          </div>

          <select
            value={
              planFilter
            }
            onChange={(
              event
            ) =>
              setPlanFilter(
                event.target.value as
                  | "all"
                  | "free"
                  | "pro"
                  | "elite"
              )
            }
            className="
              h-11
              rounded-xl
              border
              border-[color:var(--border)]
              bg-black/20
              px-3
              text-sm
              text-white
              outline-none
              lg:col-span-3
            "
          >
            <option value="all">
              Tous les plans
            </option>

            <option value="free">
              FREE
            </option>

            <option value="pro">
              PRO
            </option>

            <option value="elite">
              ELITE
            </option>
          </select>

          <select
            value={
              visibilityFilter
            }
            onChange={(
              event
            ) =>
              setVisibilityFilter(
                event.target.value as
                  | "all"
                  | "public"
                  | "private"
              )
            }
            className="
              h-11
              rounded-xl
              border
              border-[color:var(--border)]
              bg-black/20
              px-3
              text-sm
              text-white
              outline-none
              lg:col-span-3
            "
          >
            <option value="all">
              Tous les profils
            </option>

            <option value="public">
              Classement public
            </option>

            <option value="private">
              Classement privé
            </option>
          </select>
        </div>
      </section>

      {/* =====================================================
          MEMBERS
      ===================================================== */}

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Tous les membres
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {
                filteredMembers.length
              }{" "}
              membre
              {filteredMembers.length !==
              1
                ? "s"
                : ""}{" "}
              affiché
              {filteredMembers.length !==
              1
                ? "s"
                : ""}
            </p>
          </div>

          <UserRound
            size={18}
            className="text-[color:var(--gold)]"
          />
        </div>

        {filteredMembers.length ===
        0 ? (
          <div
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
            <Users
              size={27}
              className="mx-auto text-white/15"
            />

            <div className="mt-4 text-sm font-semibold text-white">
              Aucun membre trouvé
            </div>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Modifie ta recherche ou tes filtres.
            </p>
          </div>
        ) : (
          <div
            className="
              grid
              grid-cols-1
              gap-4
              md:grid-cols-2
              xl:grid-cols-3
              2xl:grid-cols-4
            "
          >
            {filteredMembers.map(
              (
                member
              ) => {
                const ranking =
                  leaderboardMap.get(
                    member.id
                  );

                const isMe =
                  member.id ===
                  currentUserId;

                return (
                  <MemberCard
                    key={
                      member.id
                    }
                    member={
                      member
                    }
                    isMe={
                      isMe
                    }
                    score={
                      ranking?.score ??
                      null
                    }
                    rank={
                      ranking?.rank ??
                      null
                    }
                  />
                );
              }
            )}
          </div>
        )}
      </section>

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
            <ShieldCheck
              size={17}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-white">
              Respect de la confidentialité
            </div>

            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[color:var(--muted)]">
              La page Membres n'affiche pas le capital, le P&L en argent ni les trades privés des utilisateurs.
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

function MemberCard({
  member,
  isMe,
  score,
  rank,
}: {
  member:
    Member;

  isMe:
    boolean;

  score:
    number | null;

  rank:
    number | null;
}) {
  return (
    <article
      className="
        group
        relative
        overflow-hidden
        rounded-[22px]
        border
        border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-5
        transition
        hover:border-[color:var(--gold-border)]
      "
    >
      <div
        className="
          pointer-events-none
          absolute
          -right-14
          -top-16
          h-40
          w-40
          rounded-full
          bg-[color:var(--gold)]
          opacity-0
          blur-[55px]
          transition
          group-hover:opacity-[0.06]
        "
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            username={
              member.username
            }
            avatarUrl={
              member.avatar_url
            }
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-white">
                {
                  member.username
                }
              </div>

              {isMe ? (
                <span
                  className="
                    rounded-full
                    border
                    border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                    px-2
                    py-0.5
                    text-[8px]
                    font-bold
                    text-[color:var(--gold)]
                  "
                >
                  TOI
                </span>
              ) : null}
            </div>

            <div className="mt-1 truncate text-[10px] text-[color:var(--muted)]">
              {member.tag ||
                "Membre InvestPro"}
            </div>
          </div>
        </div>

        <span
          className={[
            "shrink-0 rounded-full border px-2 py-1 text-[8px] font-bold",
            planClass(
              member.plan
            ),
          ].join(
            " "
          )}
        >
          {planLabel(
            member.plan
          )}
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-2">
        <SmallStat
          label="XP"
          value={String(
            Number(
              member.xp ||
                0
            )
          )}
        />

        <SmallStat
          label="Score"
          value={
            score !==
            null
              ? score.toFixed(
                  1
                )
              : "—"
          }
          gold={
            score !==
            null
          }
        />

        <SmallStat
          label="Rang"
          value={
            rank
              ? `#${rank}`
              : "—"
          }
        />
      </div>

      <div
        className="
          relative
          mt-4
          flex
          items-center
          justify-between
          gap-3
          border-t
          border-white/[0.05]
          pt-4
        "
      >
        <div className="flex items-center gap-2">
          {member.leaderboard_public ? (
            <>
              <Eye
                size={12}
                className="text-emerald-400"
              />

              <span className="text-[9px] font-medium text-emerald-400">
                Classement public
              </span>
            </>
          ) : (
            <>
              <EyeOff
                size={12}
                className="text-white/25"
              />

              <span className="text-[9px] text-white/30">
                Classement privé
              </span>
            </>
          )}
        </div>

        {rank &&
        rank <= 10 ? (
          <div
            className="
              inline-flex
              items-center
              gap-1
              rounded-full
              border
              border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              px-2
              py-1
              text-[8px]
              font-bold
              text-[color:var(--gold)]
            "
          >
            <Trophy
              size={9}
            />

            TOP 10
          </div>
        ) : null}
      </div>

      {member.bio ? (
        <p
          className="
            relative
            mt-4
            line-clamp-2
            text-[10px]
            leading-5
            text-[color:var(--muted)]
          "
        >
          {
            member.bio
          }
        </p>
      ) : null}
    </article>
  );
}

function Avatar({
  username,
  avatarUrl,
}: {
  username:
    string;

  avatarUrl:
    string | null;
}) {
  return (
    <div
      className="
        flex
        h-12
        w-12
        shrink-0
        items-center
        justify-center
        overflow-hidden
        rounded-full
        border
        border-[color:var(--gold-border)]
        bg-[color:var(--gold-soft)]
        text-xs
        font-bold
        text-[color:var(--gold)]
      "
    >
      {avatarUrl ? (
        <img
          src={
            avatarUrl
          }
          alt={
            username
          }
          className="h-full w-full object-cover"
        />
      ) : (
        initials(
          username
        )
      )}
    </div>
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

function SmallStat({
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
    <div
      className="
        rounded-xl
        border
        border-white/[0.06]
        bg-black/20
        px-3
        py-2.5
      "
    >
      <div className="text-[8px] text-[color:var(--muted)]">
        {label}
      </div>

      <div
        className={[
          "mt-1 text-[11px] font-semibold",

          gold
            ? "text-[color:var(--gold)]"
            : "text-white",
        ].join(
          " "
        )}
      >
        {value}
      </div>
    </div>
  );
}