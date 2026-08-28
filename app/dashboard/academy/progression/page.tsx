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
  Flame,
  GraduationCap,
  Medal,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  TrendingUp,
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
};

type ChallengeParticipation = {
  id: number;
  challenge_id: number;
  completed_at: string | null;
  xp_awarded_at?: string | null;
};

type AcademyProgressRow = {
  id?: number;
  user_id?: string;
  lesson_id?: number | string;
  course_id?: number | string;
  completed?: boolean;
  is_completed?: boolean;
  completed_at?: string | null;
  progress?: number;
  progress_percent?: number;
  [key: string]: any;
};

type LevelInfo = {
  level: number;
  title: string;
  currentLevelStartXp: number;
  nextLevelXp: number;
  progressPercent: number;
  xpIntoLevel: number;
  xpNeededForLevel: number;
};

/* =========================================================
   LEVEL SYSTEM
========================================================= */

const LEVELS = [
  { level: 1, title: "Débutant", xp: 0 },
  { level: 2, title: "Apprenti", xp: 100 },
  { level: 3, title: "Trader discipliné", xp: 250 },
  { level: 4, title: "Trader confirmé", xp: 500 },
  { level: 5, title: "Trader avancé", xp: 850 },
  { level: 6, title: "Trader expert", xp: 1300 },
  { level: 7, title: "Élite InvestPro", xp: 2000 },
];

function getLevelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Number(xp || 0));

  let current = LEVELS[0];
  let next = LEVELS[1] || LEVELS[0];

  for (let i = 0; i < LEVELS.length; i += 1) {
    if (safeXp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || LEVELS[i];
    }
  }

  if (current.level === LEVELS[LEVELS.length - 1].level) {
    return {
      level: current.level,
      title: current.title,
      currentLevelStartXp: current.xp,
      nextLevelXp: current.xp,
      progressPercent: 100,
      xpIntoLevel: Math.max(0, safeXp - current.xp),
      xpNeededForLevel: 0,
    };
  }

  const span = Math.max(1, next.xp - current.xp);
  const into = Math.max(0, safeXp - current.xp);

  return {
    level: current.level,
    title: current.title,
    currentLevelStartXp: current.xp,
    nextLevelXp: next.xp,
    progressPercent: Math.min(100, (into / span) * 100),
    xpIntoLevel: into,
    xpNeededForLevel: Math.max(0, next.xp - safeXp),
  };
}

function planLabel(plan: string) {
  const value = String(plan || "free").toUpperCase();
  return value || "FREE";
}

/* =========================================================
   PAGE
========================================================= */

export default function AcademyProgressionPage() {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);

  const [participations, setParticipations] =
    useState<ChallengeParticipation[]>([]);

  const [academyProgress, setAcademyProgress] =
    useState<AcademyProgressRow[]>([]);

  const [courseCount, setCourseCount] = useState(0);
  const [lessonCount, setLessonCount] = useState(0);

  const [loading, setLoading] = useState(true);

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

      const [
        profileResult,
        participationsResult,
        coursesResult,
        lessonsResult,
        progressResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, plan, xp")
          .eq("id", user.id)
          .single(),

        supabase
          .from("challenge_participants")
          .select("id, challenge_id, completed_at, xp_awarded_at")
          .eq("user_id", user.id),

        supabase
          .from("academy_courses")
          .select("id"),

        supabase
          .from("academy_lessons")
          .select("id"),

        supabase
          .from("academy_progress")
          .select("*")
          .eq("user_id", user.id),
      ]);

      if (profileResult.data) {
        setProfile({
          id: profileResult.data.id,
          username:
            profileResult.data.username ||
            user.email?.split("@")[0] ||
            "Trader",
          plan: String(profileResult.data.plan || "free"),
          xp: Number(profileResult.data.xp || 0),
        });
      }

      if (!participationsResult.error) {
        setParticipations(
          (participationsResult.data as ChallengeParticipation[]) || []
        );
      }

      if (!coursesResult.error) {
        setCourseCount(coursesResult.data?.length || 0);
      }

      if (!lessonsResult.error) {
        setLessonCount(lessonsResult.data?.length || 0);
      }

      if (!progressResult.error) {
        setAcademyProgress(
          (progressResult.data as AcademyProgressRow[]) || []
        );
      } else {
        console.warn(
          "Progression Academy non disponible :",
          progressResult.error
        );
        setAcademyProgress([]);
      }
    } catch (error) {
      console.error("Erreur progression Academy :", error);
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     CALCULATIONS
  ======================================================= */

  const levelInfo = useMemo(
    () => getLevelInfo(profile?.xp || 0),
    [profile?.xp]
  );

  const challengeStats = useMemo(() => {
    const completed = participations.filter(
      (item) => !!item.completed_at
    ).length;

    const rewarded = participations.filter(
      (item) => !!item.xp_awarded_at
    ).length;

    return {
      joined: participations.length,
      completed,
      rewarded,
    };
  }, [participations]);

  const academyStats = useMemo(() => {
    const completedRows = academyProgress.filter((row) => {
      return (
        row.completed === true ||
        row.is_completed === true ||
        !!row.completed_at ||
        Number(row.progress || 0) >= 100 ||
        Number(row.progress_percent || 0) >= 100
      );
    });

    const completedLessons = new Set(
      completedRows
        .map((row) => row.lesson_id)
        .filter(Boolean)
        .map(String)
    ).size;

    const percent =
      lessonCount > 0
        ? Math.min(100, (completedLessons / lessonCount) * 100)
        : 0;

    return {
      completedLessons,
      percent,
    };
  }, [academyProgress, lessonCount]);

  const nextMilestone = useMemo(() => {
    return LEVELS.find(
      (item) => item.xp > Number(profile?.xp || 0)
    );
  }, [profile?.xp]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement de ta progression…
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
            mb-3 inline-flex items-center gap-2
            rounded-full border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            px-3 py-1.5 text-[10px] font-semibold
            uppercase tracking-[0.13em]
            text-[color:var(--gold)]
          "
        >
          <GraduationCap size={12} />
          Progression InvestPro
        </div>

        <h1 className="text-2xl font-semibold text-white">
          Ma progression
        </h1>

        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          Suis ton niveau, tes XP, tes challenges et ta progression Academy au même endroit.
        </p>
      </div>

      {/* =====================================================
          HERO LEVEL
      ===================================================== */}

      <section
        className="
          relative overflow-hidden rounded-[26px]
          border border-[color:var(--gold-border)]
          bg-[#0b0b0d] p-6 md:p-8
        "
      >
        <div
          className="
            pointer-events-none absolute
            -right-24 -top-28 h-[360px] w-[360px]
            rounded-full bg-[color:var(--gold)]
            opacity-[0.09] blur-[110px]
          "
        />

        <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-4">
              <div
                className="
                  flex h-16 w-16 shrink-0
                  items-center justify-center
                  rounded-2xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  text-[color:var(--gold)]
                "
              >
                <Trophy size={27} />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">
                  Niveau actuel
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold text-white">
                    Niveau {levelInfo.level}
                  </h2>

                  <span
                    className="
                      rounded-full border border-[color:var(--gold-border)]
                      bg-[color:var(--gold-soft)]
                      px-3 py-1 text-[9px] font-bold
                      text-[color:var(--gold)]
                    "
                  >
                    {levelInfo.title}
                  </span>
                </div>

                <div className="mt-2 text-sm text-[color:var(--muted)]">
                  {profile?.username || "Trader"} • Plan{" "}
                  <span className="font-semibold text-[color:var(--gold)]">
                    {planLabel(profile?.plan || "free")}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-[color:var(--muted)]">
                  Progression vers le niveau suivant
                </div>

                <div className="text-xs font-semibold text-[color:var(--gold)]">
                  {Number(profile?.xp || 0)} XP
                </div>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-[color:var(--gold)] transition-all"
                  style={{
                    width: `${levelInfo.progressPercent}%`,
                  }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[9px] text-white/30">
                <span>
                  {levelInfo.currentLevelStartXp} XP
                </span>

                <span>
                  {levelInfo.xpNeededForLevel > 0
                    ? `${levelInfo.xpNeededForLevel} XP restants`
                    : "Niveau maximum atteint"}
                </span>

                <span>
                  {levelInfo.nextLevelXp} XP
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-5 lg:grid-cols-2">
            <HeroStat
              icon={<Sparkles size={16} />}
              label="XP total"
              value={String(profile?.xp || 0)}
            />

            <HeroStat
              icon={<Award size={16} />}
              label="Challenges terminés"
              value={String(challengeStats.completed)}
            />

            <HeroStat
              icon={<BookOpen size={16} />}
              label="Leçons terminées"
              value={`${academyStats.completedLessons}/${lessonCount}`}
            />

            <HeroStat
              icon={<TrendingUp size={16} />}
              label="Academy"
              value={`${academyStats.percent.toFixed(0)}%`}
            />
          </div>
        </div>
      </section>

      {/* =====================================================
          OVERVIEW
      ===================================================== */}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ACADEMY */}

        <ProgressCard
          icon={<BookOpen size={18} />}
          title="Progression Academy"
          subtitle={`${courseCount} formation${courseCount !== 1 ? "s" : ""} • ${lessonCount} leçon${lessonCount !== 1 ? "s" : ""}`}
        >
          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold text-white">
                {academyStats.percent.toFixed(0)}%
              </div>

              <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                progression globale
              </div>
            </div>

            <div className="text-right text-xs text-[color:var(--gold)]">
              {academyStats.completedLessons}/{lessonCount}
            </div>
          </div>

          <ProgressBar percent={academyStats.percent} />

          <div className="mt-4 text-[10px] leading-5 text-[color:var(--muted)]">
            Termine tes leçons pour faire progresser ta formation.
          </div>
        </ProgressCard>

        {/* CHALLENGES */}

        <ProgressCard
          icon={<Flame size={18} />}
          title="Challenges"
          subtitle="Objectifs de régularité et discipline"
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
              label="XP crédités"
              value={String(challengeStats.rewarded)}
            />
          </div>

          <div className="mt-5 flex items-center gap-2 text-[10px] text-[color:var(--muted)]">
            <CheckCircle2
              size={13}
              className="text-emerald-400"
            />
            Les récompenses terminées sont créditées automatiquement.
          </div>
        </ProgressCard>

        {/* NEXT LEVEL */}

        <ProgressCard
          icon={<Target size={18} />}
          title="Prochain objectif"
          subtitle="Continue à progresser régulièrement"
        >
          {nextMilestone ? (
            <>
              <div className="mt-5 flex items-center gap-4">
                <div
                  className="
                    flex h-12 w-12 items-center justify-center
                    rounded-xl border border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                    text-[color:var(--gold)]
                  "
                >
                  <Medal size={20} />
                </div>

                <div>
                  <div className="text-sm font-semibold text-white">
                    Niveau {nextMilestone.level}
                  </div>

                  <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                    {nextMilestone.title}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-[9px] text-[color:var(--muted)]">
                  XP nécessaires
                </div>

                <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">
                  {Math.max(
                    0,
                    nextMilestone.xp -
                      Number(profile?.xp || 0)
                  )}{" "}
                  XP
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <CheckCircle2 size={16} />
                Niveau maximum atteint
              </div>
            </div>
          )}
        </ProgressCard>
      </section>

      {/* =====================================================
          LEVEL ROADMAP
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
              Parcours InvestPro
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Les niveaux se débloquent automatiquement avec tes XP.
            </p>
          </div>

          <Star
            size={18}
            className="text-[color:var(--gold)]"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {LEVELS.map((item) => {
            const unlocked =
              Number(profile?.xp || 0) >= item.xp;

            const current =
              item.level === levelInfo.level;

            return (
              <div
                key={item.level}
                className={[
                  "rounded-[18px] border p-4 transition",
                  current
                    ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                    : unlocked
                    ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                    : "border-white/[0.06] bg-black/20",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded-xl border",
                      current
                        ? "border-[color:var(--gold-border)] bg-black/20 text-[color:var(--gold)]"
                        : unlocked
                        ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400"
                        : "border-white/[0.08] bg-white/[0.02] text-white/25",
                    ].join(" ")}
                  >
                    {unlocked ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                  </div>

                  <span className="text-[9px] font-semibold text-white/35">
                    {item.xp} XP
                  </span>
                </div>

                <div className="mt-4 text-[9px] uppercase tracking-[0.08em] text-white/30">
                  Niveau {item.level}
                </div>

                <div className="mt-1 text-xs font-semibold text-white">
                  {item.title}
                </div>

                {current ? (
                  <div className="mt-3 text-[8px] font-bold uppercase text-[color:var(--gold)]">
                    Niveau actuel
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* =====================================================
          INFO
      ===================================================== */}

      <section
        className="
          flex items-start gap-3 rounded-[20px]
          border border-white/[0.07]
          bg-black/20 p-5
        "
      >
        <div
          className="
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-xl border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          <Sparkles size={17} />
        </div>

        <div>
          <div className="text-xs font-semibold text-white">
            Comment gagner des XP ?
          </div>

          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[color:var(--muted)]">
            Pour l'instant, les XP proviennent principalement des challenges InvestPro.
            On pourra ensuite ajouter des XP pour la progression Academy, les badges et d'autres actions utiles.
          </p>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
      <div className="flex items-center gap-2 text-[color:var(--gold)]">
        {icon}

        <span className="text-[9px] text-[color:var(--muted)]">
          {label}
        </span>
      </div>

      <div className="mt-2 text-lg font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function ProgressCard({
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
    <article
      className="
        rounded-[22px]
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-5
      "
    >
      <div className="flex items-start gap-3">
        <div
          className="
            flex h-10 w-10 shrink-0
            items-center justify-center
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

          <div className="mt-1 text-[10px] text-[color:var(--muted)]">
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