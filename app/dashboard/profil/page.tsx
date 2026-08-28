"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Award,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  GraduationCap,
  Medal,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type Profile = {
  id: string;
  username: string;
  plan: string;
  xp: number;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  tag: string | null;
  leaderboard_public: boolean;
};

type LeaderboardRow = {
  user_id: string;
  score: number;
  trades_count: number;
  winrate: number;
  total_r: number;
  plan_compliance: number;
  risk_compliance: number;
  journal_quality: number;
};

type ChallengeParticipation = {
  id: number;
  challenge_id: number;
  completed_at: string | null;
  xp_awarded_at: string | null;
};

type AcademyProgress = {
  lesson_id?: number | string | null;
  completed?: boolean | null;
  is_completed?: boolean | null;
  completed_at?: string | null;
  progress?: number | null;
  progress_percent?: number | null;
};

type Trade = {
  id: number;
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  status: "open" | "win" | "loss" | "breakeven" | "cancelled";
  result_r: number;
  risk_percent: number;
  setup: string | null;
  screenshot_url: string | null;
};

type Level = {
  level: number;
  title: string;
  xp: number;
};

const LEVELS: Level[] = [
  { level: 1, title: "Débutant", xp: 0 },
  { level: 2, title: "Apprenti", xp: 100 },
  { level: 3, title: "Trader discipliné", xp: 250 },
  { level: 4, title: "Trader confirmé", xp: 500 },
  { level: 5, title: "Trader avancé", xp: 850 },
  { level: 6, title: "Trader expert", xp: 1300 },
  { level: 7, title: "Élite InvestPro", xp: 2000 },
];

/* =========================================================
   HELPERS
========================================================= */

function initials(value: string) {
  return (value || "IP").slice(0, 2).toUpperCase();
}

function getLevel(xp: number) {
  const safeXp = Math.max(0, Number(xp || 0));

  let current = LEVELS[0];
  let next = LEVELS[1] || LEVELS[0];

  for (let i = 0; i < LEVELS.length; i += 1) {
    if (safeXp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || LEVELS[i];
    }
  }

  const maxed =
    current.level === LEVELS[LEVELS.length - 1].level;

  const percent = maxed
    ? 100
    : Math.min(
        100,
        ((safeXp - current.xp) /
          Math.max(1, next.xp - current.xp)) *
          100
      );

  return {
    current,
    next,
    maxed,
    percent,
    remaining: maxed ? 0 : Math.max(0, next.xp - safeXp),
  };
}

function statusLabel(status: Trade["status"]) {
  switch (status) {
    case "win":
      return "WIN";
    case "loss":
      return "LOSS";
    case "breakeven":
      return "BE";
    case "open":
      return "OUVERT";
    default:
      return "ANNULÉ";
  }
}

function statusClass(status: Trade["status"]) {
  switch (status) {
    case "win":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
    case "loss":
      return "border-red-500/20 bg-red-500/10 text-red-400";
    case "breakeven":
      return "border-blue-500/20 bg-blue-500/10 text-blue-400";
    case "open":
      return "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";
    default:
      return "border-white/10 bg-white/5 text-white/35";
  }
}

/* =========================================================
   PAGE
========================================================= */

export default function ProfilPage() {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");

  const [leaderboard, setLeaderboard] =
    useState<LeaderboardRow | null>(null);

  const [myRank, setMyRank] = useState<number | null>(null);

  const [participations, setParticipations] =
    useState<ChallengeParticipation[]>([]);

  const [academyProgress, setAcademyProgress] =
    useState<AcademyProgress[]>([]);

  const [lessonCount, setLessonCount] = useState(0);

  const [trades, setTrades] =
    useState<Trade[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    username: "",
    tag: "",
    bio: "",
    avatar_url: "",
    banner_url: "",
  });

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
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email || "");

      const [
        profileResult,
        leaderboardResult,
        challengeResult,
        academyProgressResult,
        lessonsResult,
        tradesResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            `
              id,
              username,
              plan,
              xp,
              avatar_url,
              banner_url,
              bio,
              tag,
              leaderboard_public
            `
          )
          .eq("id", user.id)
          .single(),

        supabase.rpc("get_weekly_leaderboard"),

        supabase
          .from("challenge_participants")
          .select(
            `
              id,
              challenge_id,
              completed_at,
              xp_awarded_at
            `
          )
          .eq("user_id", user.id),

        supabase
          .from("academy_progress")
          .select("*")
          .eq("user_id", user.id),

        supabase
          .from("academy_lessons")
          .select("id"),

        supabase
          .from("trading_journal")
          .select(
            `
              id,
              trade_date,
              symbol,
              direction,
              status,
              result_r,
              risk_percent,
              setup,
              screenshot_url
            `
          )
          .eq("user_id", user.id)
          .order("trade_date", {
            ascending: false,
          })
          .limit(6),
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      const p = profileResult.data;

      const loadedProfile: Profile = {
        id: p.id,
        username:
          p.username ||
          user.email?.split("@")[0] ||
          "Trader",
        plan: String(p.plan || "free"),
        xp: Number(p.xp || 0),
        avatar_url: p.avatar_url || null,
        banner_url: p.banner_url || null,
        bio: p.bio || null,
        tag: p.tag || null,
        leaderboard_public:
          !!p.leaderboard_public,
      };

      setProfile(loadedProfile);

      setForm({
        username: loadedProfile.username,
        tag: loadedProfile.tag || "",
        bio: loadedProfile.bio || "",
        avatar_url: loadedProfile.avatar_url || "",
        banner_url: loadedProfile.banner_url || "",
      });

      if (!leaderboardResult.error) {
        const allRows =
          (leaderboardResult.data as LeaderboardRow[]) || [];

        const index =
          allRows.findIndex(
            (row) => row.user_id === user.id
          );

        if (index >= 0) {
          setLeaderboard({
            ...allRows[index],
            score: Number(allRows[index].score || 0),
            trades_count: Number(allRows[index].trades_count || 0),
            winrate: Number(allRows[index].winrate || 0),
            total_r: Number(allRows[index].total_r || 0),
            plan_compliance: Number(allRows[index].plan_compliance || 0),
            risk_compliance: Number(allRows[index].risk_compliance || 0),
            journal_quality: Number(allRows[index].journal_quality || 0),
          });

          setMyRank(index + 1);
        } else {
          setLeaderboard(null);
          setMyRank(null);
        }
      }

      if (!challengeResult.error) {
        setParticipations(
          (challengeResult.data as ChallengeParticipation[]) || []
        );
      }

      if (!academyProgressResult.error) {
        setAcademyProgress(
          (academyProgressResult.data as AcademyProgress[]) || []
        );
      }

      if (!lessonsResult.error) {
        setLessonCount(lessonsResult.data?.length || 0);
      }

      if (!tradesResult.error) {
        setTrades(
          ((tradesResult.data as Trade[]) || []).map(
            (trade) => ({
              ...trade,
              result_r: Number(trade.result_r || 0),
              risk_percent: Number(trade.risk_percent || 0),
            })
          )
        );
      }
    } catch (error) {
      console.error("Erreur profil :", error);
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     CALCULATED DATA
  ======================================================= */

  const level = useMemo(
    () => getLevel(profile?.xp || 0),
    [profile?.xp]
  );

  const challengeStats = useMemo(() => {
    return {
      joined: participations.length,
      completed: participations.filter(
        (item) => !!item.completed_at
      ).length,
      rewarded: participations.filter(
        (item) => !!item.xp_awarded_at
      ).length,
    };
  }, [participations]);

  const academyStats = useMemo(() => {
    const completedLessonIds = new Set(
      academyProgress
        .filter((row) => {
          return (
            row.completed === true ||
            row.is_completed === true ||
            !!row.completed_at ||
            Number(row.progress || 0) >= 100 ||
            Number(row.progress_percent || 0) >= 100
          );
        })
        .map((row) => row.lesson_id)
        .filter(Boolean)
        .map(String)
    );

    const completed = completedLessonIds.size;

    return {
      completed,
      percent:
        lessonCount > 0
          ? Math.min(100, (completed / lessonCount) * 100)
          : 0,
    };
  }, [academyProgress, lessonCount]);

  /* =======================================================
     SAVE PROFILE
  ======================================================= */

  async function saveProfile() {
    if (!profile || saving) {
      return;
    }

    const username =
      form.username.trim();

    if (!username) {
      alert("Le pseudo ne peut pas être vide.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        username,
        tag:
          form.tag.trim() ||
          null,
        bio:
          form.bio.trim() ||
          null,
        avatar_url:
          form.avatar_url.trim() ||
          null,
        banner_url:
          form.banner_url.trim() ||
          null,
      };

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id)
        .select(
          `
            id,
            username,
            plan,
            xp,
            avatar_url,
            banner_url,
            bio,
            tag,
            leaderboard_public
          `
        )
        .single();

      if (error) {
        throw error;
      }

      setProfile({
        id: data.id,
        username: data.username,
        plan: String(data.plan || "free"),
        xp: Number(data.xp || 0),
        avatar_url: data.avatar_url || null,
        banner_url: data.banner_url || null,
        bio: data.bio || null,
        tag: data.tag || null,
        leaderboard_public:
          !!data.leaderboard_public,
      });

      setEditMode(false);
    } catch (error: any) {
      console.error("Erreur sauvegarde profil :", error);

      alert(
        error?.message ||
          "Impossible d'enregistrer le profil."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleLeaderboardVisibility() {
    if (!profile) {
      return;
    }

    try {
      const next =
        !profile.leaderboard_public;

      const {
        error,
      } = await supabase
        .from("profiles")
        .update({
          leaderboard_public: next,
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      setProfile({
        ...profile,
        leaderboard_public: next,
      });

      await loadPage();
    } catch (error: any) {
      alert(
        error?.message ||
          "Impossible de modifier la visibilité."
      );
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement du profil…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Profil introuvable.
      </div>
    );
  }

  return (
    <div className="investpro-mobile-page space-y-4 pb-4 lg:space-y-5 lg:pb-10">
      {/* =====================================================
          PROFILE HEADER
      ===================================================== */}

      <section
        className="
          relative overflow-hidden rounded-[26px]
          border border-[color:var(--gold-border)]
          bg-[color:var(--panel)]
        "
      >
        <div className="relative h-[140px] lg:h-[230px] overflow-hidden bg-black/30 lg:h-[230px]">
          {profile.banner_url ? (
            <img
              src={profile.banner_url}
              alt="Bannière"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background:
                  "radial-gradient(900px 300px at 30% 0%, rgba(214,179,95,.18), transparent 60%), radial-gradient(700px 260px at 80% 20%, rgba(255,255,255,.07), transparent 55%), rgba(0,0,0,.35)",
              }}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0d] via-black/10 to-transparent" />
        </div>

        <div className="relative px-6 pb-6 lg:px-7">
          <div className="-mt-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-end gap-4">
              <Avatar
                username={profile.username}
                avatarUrl={profile.avatar_url}
              />

              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-white">
                    {profile.username}
                  </h1>

                  {profile.tag ? (
                    <span className="text-sm text-white/35">
                      {profile.tag}
                    </span>
                  ) : null}

                  <span
                    className="
                      rounded-full border border-[color:var(--gold-border)]
                      bg-[color:var(--gold-soft)]
                      px-2.5 py-1 text-[8px] font-bold
                      text-[color:var(--gold)]
                    "
                  >
                    {String(profile.plan).toUpperCase()}
                  </span>
                </div>

                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  Niveau {level.current.level} • {level.current.title}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleLeaderboardVisibility}
                className={[
                  "inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition",
                  profile.leaderboard_public
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-white/10 bg-white/[0.03] text-white/55",
                ].join(" ")}
              >
                {profile.leaderboard_public ? (
                  <Eye size={14} />
                ) : (
                  <EyeOff size={14} />
                )}

                {profile.leaderboard_public
                  ? "Profil classement public"
                  : "Profil classement privé"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setEditMode((value) => !value)
                }
                className="
                  inline-flex h-10 items-center gap-2 rounded-xl
                  bg-[color:var(--gold)] px-4
                  text-xs font-semibold text-black
                  transition hover:bg-[color:var(--gold-2)]
                "
              >
                <Pencil size={14} />
                Modifier le profil
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
                Bio
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                {profile.bio ||
                  "Ajoute une bio pour présenter ton approche et ton parcours de trader."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-4 xl:grid-cols-2">
              <MiniStat
                label="XP"
                value={String(profile.xp)}
              />

              <MiniStat
                label="Niveau"
                value={String(level.current.level)}
              />

              <MiniStat
                label="Rang"
                value={myRank ? `#${myRank}` : "—"}
              />

              <MiniStat
                label="Score"
                value={
                  leaderboard
                    ? leaderboard.score.toFixed(1)
                    : "—"
                }
                gold
              />
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          EDIT
      ===================================================== */}

      {editMode ? (
        <section
          className="
            rounded-[22px]
            border border-[color:var(--gold-border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Modifier mon profil
              </h2>

              <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                Ces informations sont enregistrées dans Supabase.
              </p>
            </div>

            <UserRound
              size={17}
              className="text-[color:var(--gold)]"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="Pseudo">
              <input
                value={form.username}
                onChange={(event) =>
                  setForm({
                    ...form,
                    username: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>

            <Field label="Tag">
              <input
                value={form.tag}
                onChange={(event) =>
                  setForm({
                    ...form,
                    tag: event.target.value,
                  })
                }
                placeholder="@investpro"
                className={inputClass}
              />
            </Field>

            <Field label="URL avatar">
              <input
                value={form.avatar_url}
                onChange={(event) =>
                  setForm({
                    ...form,
                    avatar_url: event.target.value,
                  })
                }
                placeholder="https://..."
                className={inputClass}
              />
            </Field>

            <Field label="URL bannière">
              <input
                value={form.banner_url}
                onChange={(event) =>
                  setForm({
                    ...form,
                    banner_url: event.target.value,
                  })
                }
                placeholder="https://..."
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Bio">
              <textarea
                value={form.bio}
                onChange={(event) =>
                  setForm({
                    ...form,
                    bio: event.target.value,
                  })
                }
                rows={4}
                placeholder="Présente ton profil..."
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="
                h-10 rounded-xl border border-white/10
                bg-white/[0.03] px-4 text-xs font-medium text-white
              "
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="
                inline-flex h-10 items-center gap-2 rounded-xl
                bg-[color:var(--gold)] px-4
                text-xs font-semibold text-black
                disabled:opacity-50
              "
            >
              <Save size={14} />

              {saving
                ? "Enregistrement..."
                : "Enregistrer"}
            </button>
          </div>
        </section>
      ) : null}

      {/* =====================================================
          XP / PROGRESSION
      ===================================================== */}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InfoCard
          icon={<Trophy size={18} />}
          title="Progression XP"
          subtitle={`Niveau ${level.current.level} • ${level.current.title}`}
        >
          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold text-white">
                {profile.xp}
              </div>

              <div className="mt-1 text-[9px] text-[color:var(--muted)]">
                XP total
              </div>
            </div>

            <div className="text-xs font-semibold text-[color:var(--gold)]">
              {level.percent.toFixed(0)}%
            </div>
          </div>

          <ProgressBar percent={level.percent} />

          <div className="mt-3 text-[9px] text-[color:var(--muted)]">
            {level.maxed
              ? "Niveau maximum atteint."
              : `${level.remaining} XP avant ${level.next.title}.`}
          </div>
        </InfoCard>

        <InfoCard
          icon={<Flame size={18} />}
          title="Challenges"
          subtitle="Régularité et discipline"
        >
          <div className="mt-5 grid grid-cols-3 gap-2">
            <SmallStat
              label="Rejoints"
              value={String(challengeStats.joined)}
            />

            <SmallStat
              label="Terminés"
              value={String(challengeStats.completed)}
              gold
            />

            <SmallStat
              label="Récompensés"
              value={String(challengeStats.rewarded)}
            />
          </div>
        </InfoCard>

        <InfoCard
          icon={<GraduationCap size={18} />}
          title="Academy"
          subtitle="Progression des leçons"
        >
          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold text-white">
                {academyStats.percent.toFixed(0)}%
              </div>

              <div className="mt-1 text-[9px] text-[color:var(--muted)]">
                progression globale
              </div>
            </div>

            <div className="text-xs font-semibold text-[color:var(--gold)]">
              {academyStats.completed}/{lessonCount}
            </div>
          </div>

          <ProgressBar percent={academyStats.percent} />
        </InfoCard>
      </section>

      {/* =====================================================
          LEADERBOARD STATS
      ===================================================== */}

      <section
        className="
          rounded-[24px]
          border border-[color:var(--border)]
          bg-[color:var(--panel)]
          p-5
        "
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Score InvestPro
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Tes statistiques de discipline pour la semaine en cours.
            </p>
          </div>

          <Medal
            size={18}
            className="text-[color:var(--gold)]"
          />
        </div>

        {leaderboard ? (
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Score"
              value={`${leaderboard.score.toFixed(1)} pts`}
              gold
            />

            <Metric
              label="Discipline"
              value={`${leaderboard.plan_compliance.toFixed(0)}%`}
            />

            <Metric
              label="Risque"
              value={`${leaderboard.risk_compliance.toFixed(0)}%`}
            />

            <Metric
              label="Journal"
              value={`${leaderboard.journal_quality.toFixed(0)}%`}
            />

            <Metric
              label="Winrate"
              value={`${leaderboard.winrate.toFixed(1)}%`}
            />

            <Metric
              label="Résultat"
              value={`${leaderboard.total_r > 0 ? "+" : ""}${leaderboard.total_r.toFixed(2)}R`}
            />
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-white/[0.08] bg-black/20 p-6 text-center">
            <ShieldCheck
              size={22}
              className="mx-auto text-white/20"
            />

            <div className="mt-3 text-xs font-semibold text-white">
              Pas encore classé cette semaine
            </div>

            <div className="mt-1 text-[10px] text-[color:var(--muted)]">
              Active ton profil public et ajoute au moins un trade au Journal pour apparaître.
            </div>
          </div>
        )}
      </section>

      {/* =====================================================
          RECENT TRADES
      ===================================================== */}

      <section
        className="
          overflow-hidden rounded-[24px]
          border border-[color:var(--border)]
          bg-[color:var(--panel)]
        "
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border)] p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Mes derniers trades
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Les 6 derniers trades enregistrés dans ton Journal.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              (window.location.href = "/dashboard/journal")
            }
            className="
              h-9 rounded-xl border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)] px-3
              text-[10px] font-semibold text-[color:var(--gold)]
            "
          >
            Voir le journal
          </button>
        </div>

        {trades.length === 0 ? (
          <div className="p-10 text-center">
            <BookOpen
              size={24}
              className="mx-auto text-white/15"
            />

            <div className="mt-3 text-sm font-semibold text-white">
              Aucun trade
            </div>
          </div>
        ) : (
          <>
          <div className="lg:hidden divide-y divide-white/[0.05]">
            {trades.map((trade) => (
              <article key={trade.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{trade.symbol}</span>
                      <span className={["inline-flex rounded-lg border px-2 py-1 text-[9px] font-bold", statusClass(trade.status)].join(" ")}>
                        {statusLabel(trade.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                      {new Date(trade.trade_date).toLocaleDateString("fr-FR")} • {trade.direction === "buy" ? "BUY" : "SELL"} • {trade.setup || "Sans setup"}
                    </div>
                  </div>
                  <div className={["text-base font-semibold", trade.result_r > 0 ? "text-emerald-400" : trade.result_r < 0 ? "text-red-400" : "text-white/50"].join(" ")}>
                    {trade.result_r > 0 ? "+" : ""}{trade.result_r.toFixed(2)}R
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3 text-[10px] text-[color:var(--muted)]">
                  <span>Risque {trade.risk_percent.toFixed(2)}%</span>
                  {trade.screenshot_url ? <span className="inline-flex items-center gap-1 text-[color:var(--gold)]"><Eye size={12}/> Graphique</span> : <span>Pas de capture</span>}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <Th>Date</Th>
                  <Th>Actif</Th>
                  <Th>Direction</Th>
                  <Th>Statut</Th>
                  <Th>Risque</Th>
                  <Th>Résultat</Th>
                  <Th>Setup</Th>
                  <Th>Graphique</Th>
                </tr>
              </thead>

              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-white/[0.04] last:border-b-0"
                  >
                    <Td>
                      {new Date(
                        trade.trade_date
                      ).toLocaleDateString("fr-FR")}
                    </Td>

                    <Td>
                      <span className="font-semibold text-white">
                        {trade.symbol}
                      </span>
                    </Td>

                    <Td>
                      <span
                        className={
                          trade.direction === "buy"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }
                      >
                        {trade.direction === "buy"
                          ? "BUY"
                          : "SELL"}
                      </span>
                    </Td>

                    <Td>
                      <span
                        className={[
                          "inline-flex rounded-lg border px-2 py-1 text-[9px] font-bold",
                          statusClass(trade.status),
                        ].join(" ")}
                      >
                        {statusLabel(trade.status)}
                      </span>
                    </Td>

                    <Td>
                      {trade.risk_percent.toFixed(2)}%
                    </Td>

                    <Td>
                      <span
                        className={[
                          "font-semibold",
                          trade.result_r > 0
                            ? "text-emerald-400"
                            : trade.result_r < 0
                            ? "text-red-400"
                            : "text-white/50",
                        ].join(" ")}
                      >
                        {trade.result_r > 0 ? "+" : ""}
                        {trade.result_r.toFixed(2)}R
                      </span>
                    </Td>

                    <Td>
                      {trade.setup || "—"}
                    </Td>

                    <Td>
                      {trade.screenshot_url ? (
                        <span
                          className="
                            inline-flex items-center gap-1
                            rounded-full border border-[color:var(--gold-border)]
                            bg-[color:var(--gold-soft)]
                            px-2 py-1 text-[8px] font-semibold
                            text-[color:var(--gold)]
                          "
                        >
                          <CheckCircle2 size={9} />
                          Ajouté
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* =====================================================
          PRIVATE INFO
      ===================================================== */}

      <section
        className="
          flex flex-col gap-4 rounded-[20px]
          border border-white/[0.07]
          bg-black/20 p-5
          lg:flex-row lg:items-center lg:justify-between
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
              Informations privées
            </div>

            <p className="mt-1 text-[10px] leading-5 text-[color:var(--muted)]">
              Ton email reste privé. Le capital et le P&L en argent ne sont jamais affichés sur ton profil public.
            </p>
          </div>
        </div>

        <div className="text-xs text-white/45">
          {email}
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

const inputClass = `
  h-11 w-full rounded-xl
  border border-white/10
  bg-black/30 px-3
  text-sm text-white
  outline-none
  placeholder:text-white/20
  focus:border-[color:var(--gold-border)]
`;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-medium text-white/55">
        {label}
      </div>

      {children}
    </label>
  );
}

function Avatar({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  return (
    <div
      className="
        flex h-24 w-24 shrink-0 items-center justify-center
        overflow-hidden rounded-full
        border-2 border-[color:var(--gold-border)]
        bg-[color:var(--gold-soft)]
        text-xl font-bold text-[color:var(--gold)]
        shadow-xl
      "
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
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
      <div className="text-[8px] text-[color:var(--muted)]">
        {label}
      </div>

      <div
        className={[
          "mt-1 text-sm font-semibold",
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

function InfoCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
      <div className="flex items-start gap-3">
        <div
          className="
            flex h-10 w-10 shrink-0 items-center justify-center
            rounded-xl border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          {icon}
        </div>

        <div>
          <div className="text-sm font-semibold text-white">
            {title}
          </div>

          <div className="mt-1 text-[9px] text-[color:var(--muted)]">
            {subtitle}
          </div>
        </div>
      </div>

      {children}
    </article>
  );
}

function ProgressBar({
  percent,
}: {
  percent: number;
}) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.05]">
      <div
        className="h-full rounded-full bg-[color:var(--gold)] transition-all"
        style={{
          width: `${Math.max(
            0,
            Math.min(100, percent)
          )}%`,
        }}
      />
    </div>
  );
}

function SmallStat({
  label,
  value,
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
      <div className="text-[8px] text-[color:var(--muted)]">
        {label}
      </div>

      <div
        className={[
          "mt-1 text-sm font-semibold",
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

function Metric({
  label,
  value,
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[9px] text-[color:var(--muted)]">
        {label}
      </div>

      <div
        className={[
          "mt-1 text-sm font-semibold",
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
    <td className="whitespace-nowrap px-4 py-4 lg:px-5 text-xs text-white/60">
      {children}
    </td>
  );
}