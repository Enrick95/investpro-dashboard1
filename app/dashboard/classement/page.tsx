"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Medal,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type LeaderRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  tag: string | null;
  bio: string | null;

  trades_count: number;
  wins: number;
  losses: number;
  breakevens: number;

  winrate: number;
  total_r: number;
  avg_risk: number;

  plan_compliance: number;
  risk_compliance: number;
  journal_quality: number;

  score: number;
};

type MyProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  leaderboard_public: boolean;
};

const SCORE_HELP = [
  {
    title: "Discipline",
    value: "40 pts",
    text: "Respect des règles du plan de trading.",
  },
  {
    title: "Gestion du risque",
    value: "20 pts",
    text: "Respect du risque maximum défini dans le plan.",
  },
  {
    title: "Journal",
    value: "15 pts",
    text: "Trades documentés avec notes et capture.",
  },
  {
    title: "Activité",
    value: "10 pts",
    text: "Régularité de l'utilisation du journal.",
  },
  {
    title: "Performance",
    value: "15 pts",
    text: "Résultat en R, plafonné pour éviter de favoriser la prise de risque excessive.",
  },
];

function initials(value: string) {
  return (value || "IP").slice(0, 2).toUpperCase();
}

function rankMedal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

function formatSigned(value: number, suffix = "") {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}${suffix}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export default function ClassementPage() {
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [me, setMe] = useState<MyProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage() {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      const [profileResult, leaderboardResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, avatar_url, leaderboard_public")
          .eq("id", user.id)
          .single(),

        supabase.rpc("get_weekly_leaderboard"),
      ]);

      if (profileResult.error) {
        console.error(
          "Erreur profil classement :",
          profileResult.error
        );
      } else if (profileResult.data) {
        setMe({
          id: profileResult.data.id,
          username:
            profileResult.data.username ||
            user.email?.split("@")[0] ||
            "Trader",
          avatar_url: profileResult.data.avatar_url || null,
          leaderboard_public:
            !!profileResult.data.leaderboard_public,
        });
      }

      if (leaderboardResult.error) {
        console.error(
          "Erreur leaderboard RPC :",
          leaderboardResult.error
        );

        setRows([]);
      } else {
        setRows(
          ((leaderboardResult.data || []) as LeaderRow[]).map(
            (row) => ({
              ...row,
              trades_count: Number(row.trades_count || 0),
              wins: Number(row.wins || 0),
              losses: Number(row.losses || 0),
              breakevens: Number(row.breakevens || 0),
              winrate: Number(row.winrate || 0),
              total_r: Number(row.total_r || 0),
              avg_risk: Number(row.avg_risk || 0),
              plan_compliance: Number(row.plan_compliance || 0),
              risk_compliance: Number(row.risk_compliance || 0),
              journal_quality: Number(row.journal_quality || 0),
              score: Number(row.score || 0),
            })
          )
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshLeaderboard() {
    setRefreshing(true);
    await loadPage();
  }

  async function toggleVisibility() {
    if (!me || visibilitySaving) {
      return;
    }

    try {
      setVisibilitySaving(true);

      const next = !me.leaderboard_public;

      const { error } = await supabase
        .from("profiles")
        .update({
          leaderboard_public: next,
        })
        .eq("id", me.id);

      if (error) {
        throw error;
      }

      setMe((current) =>
        current
          ? {
              ...current,
              leaderboard_public: next,
            }
          : current
      );

      await loadPage();
    } catch (error: any) {
      console.error(
        "Erreur visibilité classement :",
        error
      );

      alert(
        error?.message ||
          "Impossible de modifier la visibilité du classement."
      );
    } finally {
      setVisibilitySaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      return rows;
    }

    return rows.filter((row) => {
      const haystack = [
        row.username,
        row.tag,
        row.bio,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, search]);

  const myRank = useMemo(() => {
    if (!me) return null;

    const index = rows.findIndex(
      (row) => row.user_id === me.id
    );

    return index >= 0 ? index + 1 : null;
  }, [rows, me]);

  const top3 = rows.slice(0, 3);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement du classement InvestPro…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* HEADER */}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div
            className="
              mb-3
              inline-flex
              items-center
              gap-2
              rounded-full
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              px-3 py-1.5
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.13em]
              text-[color:var(--gold)]
            "
          >
            <Trophy size={12} />
            Classement hebdomadaire
          </div>

          <h1 className="text-2xl font-semibold text-white">
            Score InvestPro
          </h1>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
            Le classement récompense la discipline, la gestion du risque,
            la régularité et la qualité du journal — pas seulement le profit.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refreshLeaderboard}
            disabled={refreshing}
            className="
              inline-flex h-11 items-center gap-2 rounded-xl
              border border-white/10 bg-white/[0.03]
              px-4 text-sm font-medium text-white
              transition hover:bg-white/[0.06]
              disabled:opacity-50
            "
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : ""}
            />
            Rafraîchir
          </button>

          <button
            type="button"
            onClick={toggleVisibility}
            disabled={!me || visibilitySaving}
            className={[
              "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50",
              me?.leaderboard_public
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
            ].join(" ")}
          >
            {me?.leaderboard_public ? (
              <Eye size={15} />
            ) : (
              <EyeOff size={15} />
            )}

            {visibilitySaving
              ? "Enregistrement..."
              : me?.leaderboard_public
              ? "Profil public"
              : "Participer au classement"}
          </button>
        </div>
      </div>

      {/* HERO */}

      <section
        className="
          relative overflow-hidden rounded-[26px]
          border border-[color:var(--gold-border)]
          bg-[#0b0b0d] p-6 md:p-7
        "
      >
        <div
          className="
            pointer-events-none absolute
            -right-20 -top-28 h-[340px] w-[340px]
            rounded-full bg-[color:var(--gold)]
            opacity-[0.08] blur-[100px]
          "
        />

        <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              Cette semaine
            </div>

            <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
              La discipline avant la prise de risque
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Le Score InvestPro est limité à 100 points. Une grosse prise de
              risque ne suffit pas pour monter dans le classement.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-5">
            <MiniStat
              label="Membres"
              value={String(rows.length)}
            />

            <MiniStat
              label="Ton rang"
              value={
                me?.leaderboard_public
                  ? myRank
                    ? `#${myRank}`
                    : "—"
                  : "Privé"
              }
            />

            <MiniStat
              label="Reset"
              value="Lundi"
            />
          </div>
        </div>
      </section>

      {/* SCORE EXPLANATION */}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {SCORE_HELP.map((item) => (
          <div
            key={item.title}
            className="
              rounded-[18px]
              border border-[color:var(--border)]
              bg-[color:var(--panel)]
              p-4
            "
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
                {item.title}
              </div>

              <div className="text-[10px] font-bold text-[color:var(--gold)]">
                {item.value}
              </div>
            </div>

            <div className="mt-2 text-[10px] leading-4 text-[color:var(--muted)]">
              {item.text}
            </div>
          </div>
        ))}
      </section>

      {/* PODIUM */}

      <section
        className="
          rounded-[24px]
          border border-[color:var(--border)]
          bg-[color:var(--panel)]
          p-5
        "
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Podium de la semaine
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Les 3 meilleurs Score InvestPro.
            </p>
          </div>

          <Medal
            size={18}
            className="text-[color:var(--gold)]"
          />
        </div>

        {top3.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {top3.map((row, index) => (
              <PodiumCard
                key={row.user_id}
                row={row}
                rank={index + 1}
              />
            ))}
          </div>
        )}
      </section>

      {/* LEADERBOARD */}

      <section
        className="
          overflow-hidden rounded-[24px]
          border border-[color:var(--border)]
          bg-[color:var(--panel)]
        "
      >
        <div className="flex flex-col gap-4 border-b border-[color:var(--border)] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Classement complet
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {filteredRows.length} membre
              {filteredRows.length !== 1 ? "s" : ""} affiché
              {filteredRows.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex h-10 w-full items-center gap-2 rounded-xl border border-[color:var(--border)] bg-black/20 px-3 md:w-[300px]">
            <Search
              size={14}
              className="text-white/30"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Rechercher un membre..."
              className="
                w-full bg-transparent text-xs text-white
                outline-none placeholder:text-white/25
              "
            />
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-5">
            <EmptyState />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <Th>Rang</Th>
                  <Th>Trader</Th>
                  <Th>Score</Th>
                  <Th>Discipline</Th>
                  <Th>Risque</Th>
                  <Th>Journal</Th>
                  <Th>Trades</Th>
                  <Th>Winrate</Th>
                  <Th>Résultat</Th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
                  const rank =
                    rows.findIndex(
                      (item) => item.user_id === row.user_id
                    ) + 1;

                  const isMe =
                    me?.id === row.user_id;

                  return (
                    <tr
                      key={row.user_id}
                      className={[
                        "border-b border-white/[0.04] transition last:border-b-0",
                        isMe
                          ? "bg-[color:var(--gold-soft)]"
                          : "hover:bg-white/[0.02]",
                      ].join(" ")}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {rankMedal(rank) || ""}
                          </span>

                          <span
                            className={[
                              "font-semibold",
                              rank <= 3
                                ? "text-[color:var(--gold)]"
                                : "text-white",
                            ].join(" ")}
                          >
                            #{rank}
                          </span>
                        </div>
                      </Td>

                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar
                            username={row.username}
                            avatarUrl={row.avatar_url}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="max-w-[180px] truncate font-semibold text-white">
                                {row.username}
                              </span>

                              {isMe ? (
                                <span className="rounded-full border border-[color:var(--gold-border)] bg-black/20 px-2 py-0.5 text-[8px] font-bold text-[color:var(--gold)]">
                                  TOI
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1 max-w-[240px] truncate text-[9px] text-[color:var(--muted)]">
                              {row.tag || row.bio || "Membre InvestPro"}
                            </div>
                          </div>
                        </div>
                      </Td>

                      <Td>
                        <ScorePill
                          value={row.score}
                        />
                      </Td>

                      <Td>
                        <PercentCell
                          value={row.plan_compliance}
                        />
                      </Td>

                      <Td>
                        <PercentCell
                          value={row.risk_compliance}
                        />
                      </Td>

                      <Td>
                        <PercentCell
                          value={row.journal_quality}
                        />
                      </Td>

                      <Td>
                        <span className="font-medium text-white">
                          {row.trades_count}
                        </span>
                      </Td>

                      <Td>
                        <span className="font-medium text-white">
                          {row.winrate.toFixed(1)}%
                        </span>
                      </Td>

                      <Td>
                        <span
                          className={[
                            "font-semibold",
                            row.total_r > 0
                              ? "text-emerald-400"
                              : row.total_r < 0
                              ? "text-red-400"
                              : "text-white/50",
                          ].join(" ")}
                        >
                          {formatSigned(row.total_r, "R")}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PRIVACY INFO */}

      <section
        className="
          flex flex-col gap-4 rounded-[20px]
          border border-white/[0.07]
          bg-black/20 p-5
          md:flex-row md:items-center md:justify-between
        "
      >
        <div className="flex items-start gap-3">
          <div
            className="
              flex h-10 w-10 shrink-0 items-center justify-center
              rounded-xl border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              text-[color:var(--gold)]
            "
          >
            <ShieldCheck size={17} />
          </div>

          <div>
            <div className="text-xs font-semibold text-white">
              Participation volontaire
            </div>

            <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[color:var(--muted)]">
              Seuls les membres qui activent leur profil public apparaissent
              dans le classement. Aucun montant de capital ni P&L en devise
              n'est affiché publiquement.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleVisibility}
          disabled={!me || visibilitySaving}
          className="
            h-10 rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            px-4 text-xs font-semibold
            text-[color:var(--gold)]
            disabled:opacity-50
          "
        >
          {me?.leaderboard_public
            ? "Quitter le classement"
            : "Participer au classement"}
        </button>
      </section>
    </div>
  );
}

function Avatar({
  username,
  avatarUrl,
  large = false,
}: {
  username: string;
  avatarUrl: string | null;
  large?: boolean;
}) {
  const size = large
    ? "h-16 w-16 text-base"
    : "h-10 w-10 text-xs";

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] font-bold text-[color:var(--gold)]",
        size,
      ].join(" ")}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(username)
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
      <div className="text-[9px] text-[color:var(--muted)]">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function PodiumCard({
  row,
  rank,
}: {
  row: LeaderRow;
  rank: number;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[20px] border p-5",
        rank === 1
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.07] bg-black/20",
      ].join(" ")}
    >
      {rank === 1 ? (
        <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-[color:var(--gold)] opacity-[0.08] blur-[45px]" />
      ) : null}

      <div className="relative flex items-center justify-between">
        <span className="text-2xl">
          {rankMedal(rank)}
        </span>

        <ScorePill value={row.score} />
      </div>

      <div className="relative mt-5 flex items-center gap-3">
        <Avatar
          username={row.username}
          avatarUrl={row.avatar_url}
          large
        />

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {row.username}
          </div>

          <div className="mt-1 text-[10px] text-[color:var(--muted)]">
            {row.trades_count} trades cette semaine
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-2">
        <SmallMetric
          label="Discipline"
          value={`${row.plan_compliance.toFixed(0)}%`}
        />

        <SmallMetric
          label="Winrate"
          value={`${row.winrate.toFixed(0)}%`}
        />

        <SmallMetric
          label="Résultat"
          value={formatSigned(row.total_r, "R")}
        />
      </div>
    </div>
  );
}

function ScorePill({
  value,
}: {
  value: number;
}) {
  const score = Math.max(
    0,
    Math.min(100, Number(value || 0))
  );

  return (
    <div
      className="
        inline-flex items-center gap-2 rounded-xl
        border border-[color:var(--gold-border)]
        bg-[color:var(--gold-soft)]
        px-3 py-2
      "
    >
      <Sparkles
        size={12}
        className="text-[color:var(--gold)]"
      />

      <span className="text-sm font-bold text-[color:var(--gold)]">
        {score.toFixed(1)}
      </span>

      <span className="text-[8px] font-semibold uppercase text-white/35">
        pts
      </span>
    </div>
  );
}

function PercentCell({
  value,
}: {
  value: number;
}) {
  const percent = clampPercent(value);

  return (
    <div className="min-w-[95px]">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-medium text-white">
          {percent.toFixed(0)}%
        </span>

        {percent >= 80 ? (
          <CheckCircle2
            size={11}
            className="text-emerald-400"
          />
        ) : null}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-[color:var(--gold)]"
          style={{
            width: `${percent}%`,
          }}
        />
      </div>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="text-[8px] text-[color:var(--muted)]">
        {label}
      </div>

      <div className="mt-1 text-[10px] font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-white/[0.08] bg-black/20 p-8 text-center">
      <UserRound
        size={24}
        className="mx-auto text-white/20"
      />

      <div className="mt-3 text-sm font-semibold text-white">
        Aucun membre classé pour l'instant
      </div>

      <div className="mt-1 text-xs text-[color:var(--muted)]">
        Les membres apparaîtront après avoir activé leur participation.
      </div>
    </div>
  );
}

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
      {children}
    </th>
  );
}

function Td({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="whitespace-nowrap px-5 py-4 text-xs text-white/60">
      {children}
    </td>
  );
}