"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Clock3,
  Flame,
  GraduationCap,
  Library,
  Medal,
  Play,
  ShieldCheck,
  Target,
  Trophy,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Profile = {
  username: string;
  plan: string;
  xp: number;
};

type DbCourse = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  position: number;
  required_plan: string;
};

type DbLesson = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_minutes: number;
  position: number;
  xp_reward: number;
};

type DbProgress = {
  id: number;
  user_id: string;
  lesson_id: number;
  progress_percent: number;
  completed: boolean;
  last_position_seconds: number;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

type DbResource = {
  id: number;
  title: string;
  resource_type: string;
};

type Course = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  lessons: number;
  durationMinutes: number;
  duration: string;
  progress: number;
  completedLessons: number;
  locked: boolean;
  status: "Terminé" | "En cours" | "À commencer";
  position: number;
};

const categoryConfig = [
  {
    name: "Débutant",
    icon: BookOpen,
  },
  {
    name: "Intermédiaire",
    icon: Zap,
  },
  {
    name: "Stratégie InvestPro",
    icon: GraduationCap,
  },
  {
    name: "Psychologie",
    icon: Brain,
  },
  {
    name: "Prop Firms",
    icon: ShieldCheck,
  },
];

function formatDuration(totalMinutes: number) {
  if (totalMinutes <= 0) return "0 min";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}`;
}

export default function AcademyPage() {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile>({
    username: "Trader",
    plan: "free",
    xp: 0,
  });

  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<DbLesson[]>([]);
  const [progressRows, setProgressRows] = useState<DbProgress[]>([]);
  const [resources, setResources] = useState<DbResource[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(
    "Stratégie InvestPro"
  );

  useEffect(() => {
    async function loadAcademy() {
      try {
        setLoading(true);

        /*
        |--------------------------------------------------------------------------
        | UTILISATEUR
        |--------------------------------------------------------------------------
        */

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = "/login";
          return;
        }

        /*
        |--------------------------------------------------------------------------
        | PROFIL
        |--------------------------------------------------------------------------
        */

        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select("username, plan, xp")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error(
            "Erreur récupération profil Academy :",
            profileError
          );
        }

        const plan = String(
          profileData?.plan || "free"
        ).toLowerCase();

        if (plan !== "pro" && plan !== "elite") {
          window.location.href = "/dashboard/abonnement";
          return;
        }

        setProfile({
          username:
            profileData?.username ||
            user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            "Trader",

          plan,

          xp: Number(profileData?.xp || 0),
        });

        /*
        |--------------------------------------------------------------------------
        | COURS
        |--------------------------------------------------------------------------
        */

        const {
          data: coursesData,
          error: coursesError,
        } = await supabase
          .from("academy_courses")
          .select(
            `
              id,
              title,
              description,
              category,
              thumbnail_url,
              position,
              required_plan
            `
          )
          .eq("is_published", true)
          .order("position", {
            ascending: true,
          });

        if (coursesError) {
          console.error(
            "Erreur récupération cours :",
            coursesError
          );
        }

        /*
        |--------------------------------------------------------------------------
        | LEÇONS
        |--------------------------------------------------------------------------
        */

        const {
          data: lessonsData,
          error: lessonsError,
        } = await supabase
          .from("academy_lessons")
          .select(
            `
              id,
              course_id,
              title,
              description,
              video_url,
              thumbnail_url,
              duration_minutes,
              position,
              xp_reward
            `
          )
          .eq("is_published", true)
          .order("position", {
            ascending: true,
          });

        if (lessonsError) {
          console.error(
            "Erreur récupération leçons :",
            lessonsError
          );
        }

        /*
        |--------------------------------------------------------------------------
        | PROGRESSION DU MEMBRE
        |--------------------------------------------------------------------------
        */

        const {
          data: progressData,
          error: progressError,
        } = await supabase
          .from("academy_progress")
          .select(
            `
              id,
              user_id,
              lesson_id,
              progress_percent,
              completed,
              last_position_seconds,
              started_at,
              completed_at,
              updated_at
            `
          )
          .eq("user_id", user.id);

        if (progressError) {
          console.error(
            "Erreur récupération progression :",
            progressError
          );
        }

        /*
        |--------------------------------------------------------------------------
        | RESSOURCES
        |--------------------------------------------------------------------------
        */

        const {
          data: resourceData,
          error: resourceError,
        } = await supabase
          .from("academy_resources")
          .select("id, title, resource_type")
          .eq("is_published", true);

        if (resourceError) {
          console.error(
            "Erreur récupération ressources :",
            resourceError
          );
        }

        const safeCourses =
          (coursesData as DbCourse[] | null) || [];

        const safeLessons =
          (lessonsData as DbLesson[] | null) || [];

        const safeProgress =
          (progressData as DbProgress[] | null) || [];

        const safeResources =
          (resourceData as DbResource[] | null) || [];

        setLessons(safeLessons);
        setProgressRows(safeProgress);
        setResources(safeResources);

        /*
        |--------------------------------------------------------------------------
        | TRANSFORMATION DES COURS
        |--------------------------------------------------------------------------
        */

        const calculatedCourses: Course[] =
          safeCourses.map((course) => {
            const courseLessons = safeLessons.filter(
              (lesson) =>
                Number(lesson.course_id) ===
                Number(course.id)
            );

            const durationMinutes =
              courseLessons.reduce(
                (total, lesson) =>
                  total +
                  Number(
                    lesson.duration_minutes || 0
                  ),
                0
              );

            const lessonProgressValues =
              courseLessons.map((lesson) => {
                const row = safeProgress.find(
                  (progress) =>
                    Number(progress.lesson_id) ===
                    Number(lesson.id)
                );

                if (!row) return 0;

                if (row.completed) {
                  return 100;
                }

                return Number(
                  row.progress_percent || 0
                );
              });

            const progress =
              courseLessons.length > 0
                ? Math.round(
                    lessonProgressValues.reduce(
                      (total, value) =>
                        total + value,
                      0
                    ) / courseLessons.length
                  )
                : 0;

            const completedLessons =
              courseLessons.filter((lesson) => {
                const row = safeProgress.find(
                  (progress) =>
                    Number(progress.lesson_id) ===
                    Number(lesson.id)
                );

                return row?.completed === true;
              }).length;

            let status: Course["status"] =
              "À commencer";

            if (
              courseLessons.length > 0 &&
              completedLessons ===
                courseLessons.length
            ) {
              status = "Terminé";
            } else if (progress > 0) {
              status = "En cours";
            }

            return {
              id: course.id,
              title: course.title,
              description:
                course.description,
              category: course.category,

              lessons: courseLessons.length,

              durationMinutes,

              duration:
                formatDuration(durationMinutes),

              progress,

              completedLessons,

              locked: false,

              status,

              position: course.position,
            };
          });

        setCourses(calculatedCourses);

        /*
        |--------------------------------------------------------------------------
        | CATÉGORIE PAR DÉFAUT
        |--------------------------------------------------------------------------
        */

        if (
          calculatedCourses.length > 0 &&
          !calculatedCourses.some(
            (course) =>
              course.category ===
              "Stratégie InvestPro"
          )
        ) {
          setActiveCategory(
            calculatedCourses[0].category
          );
        }
      } catch (error) {
        console.error(
          "Erreur chargement Academy :",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadAcademy();
  }, [supabase]);

  /*
  |--------------------------------------------------------------------------
  | CHARGEMENT
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-sm text-[color:var(--muted)]">
          Chargement de l’Academy…
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | XP
  |--------------------------------------------------------------------------
  */

  const currentLevel =
    profile.xp >= 3000
      ? "Pro Trader"
      : profile.xp >= 1500
      ? "Confirmé"
      : profile.xp >= 500
      ? "Trader"
      : "Rookie";

  const nextLevelXp =
    profile.xp >= 3000
      ? 3000
      : profile.xp >= 1500
      ? 3000
      : profile.xp >= 500
      ? 1500
      : 500;

  const xpProgress =
    profile.xp >= 3000
      ? 100
      : Math.min(
          (profile.xp / nextLevelXp) *
            100,
          100
        );

  /*
  |--------------------------------------------------------------------------
  | PROGRESSION GLOBALE
  |--------------------------------------------------------------------------
  */

  const lessonProgressPercentages =
    lessons.map((lesson) => {
      const progress = progressRows.find(
        (row) =>
          Number(row.lesson_id) ===
          Number(lesson.id)
      );

      if (!progress) return 0;

      if (progress.completed) {
        return 100;
      }

      return Number(
        progress.progress_percent || 0
      );
    });

  const globalProgress =
    lessons.length > 0
      ? Math.round(
          lessonProgressPercentages.reduce(
            (total, value) =>
              total + value,
            0
          ) / lessons.length
        )
      : 0;

  const completedLessonsTotal =
    lessons.filter((lesson) => {
      const row = progressRows.find(
        (progress) =>
          Number(progress.lesson_id) ===
          Number(lesson.id)
      );

      return row?.completed === true;
    }).length;

  /*
  |--------------------------------------------------------------------------
  | CETTE SEMAINE
  |--------------------------------------------------------------------------
  */

  const sevenDaysAgo =
    Date.now() -
    7 * 24 * 60 * 60 * 1000;

  const completedThisWeek =
    progressRows.filter((row) => {
      if (!row.completed) return false;
      if (!row.completed_at) return false;

      return (
        new Date(
          row.completed_at
        ).getTime() >= sevenDaysAgo
      );
    }).length;

  const weeklyGoal = 7;

  const weeklyGoalProgress =
    Math.min(
      Math.round(
        (completedThisWeek /
          weeklyGoal) *
          100
      ),
      100
    );

  /*
  |--------------------------------------------------------------------------
  | COURS À REPRENDRE
  |--------------------------------------------------------------------------
  */

  const resumeCourse =
    courses
      .filter(
        (course) =>
          course.progress > 0 &&
          course.progress < 100
      )
      .sort(
        (a, b) =>
          b.progress - a.progress
      )[0] ||
    courses.find(
      (course) =>
        course.status === "À commencer"
    ) ||
    courses[0];

  const resumeLessons = resumeCourse
    ? lessons
        .filter(
          (lesson) =>
            Number(lesson.course_id) ===
            Number(resumeCourse.id)
        )
        .sort(
          (a, b) =>
            a.position - b.position
        )
    : [];

  const firstIncompleteLesson =
    resumeLessons.find((lesson) => {
      const progress =
        progressRows.find(
          (row) =>
            Number(row.lesson_id) ===
            Number(lesson.id)
        );

      return progress?.completed !== true;
    });

  const currentLessonNumber =
    firstIncompleteLesson
      ? resumeLessons.findIndex(
          (lesson) =>
            lesson.id ===
            firstIncompleteLesson.id
        ) + 1
      : resumeLessons.length;

  const remainingMinutes =
    resumeLessons.reduce(
      (total, lesson) => {
        const progress =
          progressRows.find(
            (row) =>
              Number(row.lesson_id) ===
              Number(lesson.id)
          );

        if (progress?.completed) {
          return total;
        }

        const percentage =
          Number(
            progress?.progress_percent ||
              0
          ) / 100;

        const remaining =
          Number(
            lesson.duration_minutes || 0
          ) *
          (1 - percentage);

        return total + remaining;
      },
      0
    );

  /*
  |--------------------------------------------------------------------------
  | CATÉGORIES
  |--------------------------------------------------------------------------
  */

  const categories =
    categoryConfig.map(
      (category) => ({
        ...category,

        count: courses.filter(
          (course) =>
            course.category ===
            category.name
        ).length,
      })
    );

  const filteredCourses =
    courses.filter(
      (course) =>
        course.category ===
        activeCategory
    );

  /*
  |--------------------------------------------------------------------------
  | RESSOURCES
  |--------------------------------------------------------------------------
  */

  const pdfCount =
    resources.filter(
      (resource) =>
        resource.resource_type ===
        "pdf"
    ).length;

  const replayCount =
    resources.filter(
      (resource) =>
        resource.resource_type ===
          "replay" ||
        resource.resource_type ===
          "video"
    ).length;

  const checklistCount =
    resources.filter(
      (resource) =>
        resource.resource_type ===
        "checklist"
    ).length;

  return (
    <div className="space-y-5 pb-10">
      {/* HEADER */}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Academy
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Progresse module par module et
            deviens le trader que tu vises.
          </p>
        </div>

        <div
          className="
            hidden md:flex
            items-center gap-2
            rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            px-3 py-2
          "
        >
          <GraduationCap
            size={15}
            className="text-[color:var(--gold)]"
          />

          <span className="text-xs text-[color:var(--muted)]">
            Plan
          </span>

          <span className="text-xs font-bold text-[color:var(--gold)]">
            {profile.plan.toUpperCase()}
          </span>
        </div>
      </div>

      {/* TOP */}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* PROGRESSION */}

        <div
          className="
            xl:col-span-3
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div className="text-sm text-[color:var(--muted)]">
            Progression globale
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div>
              <div className="text-4xl font-semibold text-[color:var(--gold)]">
                {globalProgress}%
              </div>

              <div className="mt-2 text-xs text-[color:var(--muted)]">
                {completedLessonsTotal} /{" "}
                {lessons.length} leçons
                terminées
              </div>
            </div>

            <div
              className="
                relative
                flex h-24 w-24
                items-center justify-center
                rounded-full
                border-[10px]
                border-white/5
              "
            >
              <div
                className="
                  absolute
                  inset-0
                  rounded-full
                  border-[10px]
                  border-[color:var(--gold)]
                  border-l-transparent
                  rotate-45
                "
                style={{
                  opacity:
                    globalProgress > 0
                      ? 1
                      : 0.15,
                }}
              />

              <GraduationCap
                size={24}
                className="text-[color:var(--gold)]"
              />
            </div>
          </div>

          <Link
            href="#courses"
            className="
              mt-6
              flex h-10
              items-center justify-center gap-2
              rounded-xl
              bg-[color:var(--gold)]
              text-sm font-semibold
              text-black
              no-underline
              hover:bg-[color:var(--gold-2)]
              transition
            "
          >
            Continuer
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* CURRENT MODULE */}

        <div
          className="
            xl:col-span-6
            relative overflow-hidden
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              right-[-80px]
              top-[-100px]
              h-[280px]
              w-[300px]
              rounded-full
              bg-[color:var(--gold)]
              opacity-[0.06]
              blur-3xl
            "
          />

          {resumeCourse ? (
            <div className="relative z-10">
              <div className="text-xs text-[color:var(--muted)]">
                {resumeCourse.progress > 0
                  ? "Reprendre le cours"
                  : "Prochain cours"}
              </div>

              <h2 className="mt-2 text-xl font-semibold text-white">
                {resumeCourse.title}
              </h2>

              <p className="mt-1 text-sm text-[color:var(--muted)]">
                {resumeCourse.category}
              </p>

              <div className="mt-6 flex items-center gap-4">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-[color:var(--gold)]"
                    style={{
                      width: `${resumeCourse.progress}%`,
                    }}
                  />
                </div>

                <span className="text-sm font-semibold text-white">
                  {resumeCourse.progress}%
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-4 text-xs text-[color:var(--muted)]">
                <span className="flex items-center gap-1.5">
                  <Play size={13} />

                  {resumeLessons.length > 0
                    ? `Leçon ${
                        currentLessonNumber ||
                        1
                      } sur ${
                        resumeLessons.length
                      }`
                    : "Aucune leçon"}
                </span>

                <span className="flex items-center gap-1.5">
                  <Clock3 size={13} />

                  {Math.ceil(
                    remainingMinutes
                  )}{" "}
                  min restantes
                </span>
              </div>

              <Link
                href="#courses"
                className="
                  mt-6
                  inline-flex h-10
                  items-center gap-2
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  px-4
                  text-sm font-semibold
                  text-[color:var(--gold)]
                  no-underline
                "
              >
                {resumeCourse.progress > 0
                  ? "Reprendre le cours"
                  : "Commencer le cours"}

                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="relative z-10 flex h-full items-center justify-center text-sm text-[color:var(--muted)]">
              Aucun cours publié pour le
              moment.
            </div>
          )}
        </div>

        {/* LEVEL */}

        <div
          className="
            xl:col-span-3
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div className="flex items-center gap-2">
            <Medal
              size={17}
              className="text-[color:var(--gold)]"
            />

            <h3 className="text-sm font-semibold text-white">
              Mon niveau
            </h3>
          </div>

          <div className="mt-5">
            <div className="text-xs text-[color:var(--muted)]">
              Niveau actuel
            </div>

            <div className="mt-1 text-lg font-semibold text-[color:var(--gold)]">
              {currentLevel}
            </div>

            <div className="mt-1 text-2xl font-semibold text-white">
              {profile.xp} XP
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-[color:var(--gold)]"
                style={{
                  width: `${xpProgress}%`,
                }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] text-[color:var(--muted)]">
              <span>
                {profile.xp} XP
              </span>

              <span>
                {nextLevelXp} XP
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3">
            <div className="text-xs font-semibold text-[color:var(--gold)]">
              {completedThisWeek} leçon
              {completedThisWeek > 1
                ? "s"
                : ""}{" "}
              cette semaine
            </div>

            <div className="mt-1 text-[10px] text-[color:var(--muted)]">
              Continue comme ça.
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}

      <section
        className="
          grid grid-cols-2
          gap-3
          md:grid-cols-3
          xl:grid-cols-5
        "
      >
        {categories.map(
          (category) => {
            const Comp =
              category.icon;

            const active =
              activeCategory ===
              category.name;

            return (
              <button
                key={category.name}
                type="button"
                onClick={() =>
                  setActiveCategory(
                    category.name
                  )
                }
                className={[
                  "rounded-2xl border p-4 text-left transition",

                  active
                    ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                    : "border-[color:var(--border)] bg-[color:var(--panel)] hover:bg-white/[0.03]",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="
                      flex h-9 w-9
                      items-center justify-center
                      rounded-xl
                      border border-[color:var(--gold-border)]
                      bg-black/20
                    "
                  >
                    <Comp
                      size={16}
                      className="text-[color:var(--gold)]"
                    />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">
                      {category.name}
                    </div>

                    <div className="mt-0.5 text-[10px] text-[color:var(--muted)]">
                      {category.count} cours
                    </div>
                  </div>
                </div>
              </button>
            );
          }
        )}
      </section>

      {/* CONTENT */}

      <section
        id="courses"
        className="
          grid
          grid-cols-1
          gap-4
          xl:grid-cols-12
        "
      >
        {/* COURSES */}

        <div
          className="
            xl:col-span-9
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">
                Cours et leçons
              </h3>

              <p className="mt-1 text-xs text-[color:var(--muted)]">
                Continue ton parcours étape
                par étape.
              </p>
            </div>

            <div
              className="
                rounded-xl
                border border-[color:var(--border)]
                bg-black/20
                px-3 py-2
                text-xs
                text-[color:var(--muted)]
              "
            >
              {activeCategory}
            </div>
          </div>

          {filteredCourses.length >
          0 ? (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {filteredCourses.map(
                (course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                  />
                )
              )}
            </div>
          ) : (
            <div
              className="
                mt-5
                rounded-2xl
                border border-dashed border-white/10
                bg-black/20
                p-8
                text-center
              "
            >
              <GraduationCap
                size={26}
                className="mx-auto text-[color:var(--gold)] opacity-60"
              />

              <div className="mt-3 text-sm font-semibold text-white">
                Aucun cours dans cette
                catégorie
              </div>

              <div className="mt-1 text-xs text-[color:var(--muted)]">
                De nouveaux contenus seront
                ajoutés prochainement.
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}

        <div className="xl:col-span-3 space-y-4">
          {/* WEEK GOAL */}

          <SideCard>
            <div className="flex items-center gap-2">
              <Target
                size={17}
                className="text-[color:var(--gold)]"
              />

              <h3 className="text-sm font-semibold text-white">
                Objectif de la semaine
              </h3>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-white">
                  {completedThisWeek} /{" "}
                  {weeklyGoal}
                </div>

                <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                  leçons complétées
                </div>
              </div>

              <div
                className="
                  flex h-16 w-16
                  items-center justify-center
                  rounded-full
                  border-[7px]
                  border-[color:var(--gold)]
                  bg-[color:var(--gold-soft)]
                "
                style={{
                  opacity:
                    weeklyGoalProgress >
                    0
                      ? 1
                      : 0.5,
                }}
              >
                <Flame
                  className="text-[color:var(--gold)]"
                  size={22}
                />
              </div>

              <div className="text-right">
                <div className="text-2xl font-semibold text-white">
                  {weeklyGoalProgress}%
                </div>

                <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                  objectif
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-[color:var(--gold-soft)] p-3 text-center text-[10px] text-[color:var(--gold)]">
              {completedThisWeek >=
              weeklyGoal
                ? "Objectif de la semaine atteint !"
                : `Encore ${Math.max(
                    weeklyGoal -
                      completedThisWeek,
                    0
                  )} leçon${
                    weeklyGoal -
                      completedThisWeek >
                    1
                      ? "s"
                      : ""
                  } pour atteindre ton objectif.`}
            </div>
          </SideCard>

          {/* RESOURCES */}

          <SideCard>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Library
                  size={17}
                  className="text-[color:var(--gold)]"
                />

                <h3 className="text-sm font-semibold text-white">
                  Ressources
                </h3>
              </div>

              <Link
                href="/dashboard/academy/bibliotheque"
                className="text-[10px] text-[color:var(--gold)] no-underline"
              >
                Voir tout
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              <ResourceRow
                label="Guides PDF"
                count={`${pdfCount} fichier${
                  pdfCount > 1 ? "s" : ""
                }`}
              />

              <ResourceRow
                label="Vidéos / replay"
                count={`${replayCount} vidéo${
                  replayCount > 1
                    ? "s"
                    : ""
                }`}
              />

              <ResourceRow
                label="Checklists"
                count={`${checklistCount} checklist${
                  checklistCount > 1
                    ? "s"
                    : ""
                }`}
              />
            </div>
          </SideCard>

          {/* QUIZ */}

          <SideCard>
            <div className="flex items-center gap-2">
              <Trophy
                size={17}
                className="text-[color:var(--gold)]"
              />

              <h3 className="text-sm font-semibold text-white">
                Quiz de certification
              </h3>
            </div>

            <div className="mt-5">
              <div className="text-[10px] text-[color:var(--muted)]">
                Fonctionnalité en préparation
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                Certifications InvestPro
              </div>

              <div className="mt-3 text-[10px] leading-5 text-[color:var(--muted)]">
                Valide tes connaissances après
                certains modules et débloque
                des badges.
              </div>

              <button
                type="button"
                disabled
                className="
                  mt-5
                  h-10
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  px-4
                  text-sm font-semibold
                  text-[color:var(--gold)]
                  opacity-60
                  cursor-not-allowed
                "
              >
                Bientôt disponible
              </button>
            </div>
          </SideCard>
        </div>
      </section>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| COURSE CARD
|--------------------------------------------------------------------------
*/

function CourseCard({
  course,
}: {
  course: Course;
}) {
  const statusClass =
    course.status === "Terminé"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : course.status === "En cours"
      ? "bg-[color:var(--gold-soft)] text-[color:var(--gold)] border-[color:var(--gold-border)]"
      : "bg-black/30 text-white/50 border-white/10";

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border border-[color:var(--border)]
        bg-black/20
        transition
        hover:border-[color:var(--gold-border)]
      "
    >
      <div
        className="
          relative
          h-[120px]
          overflow-hidden
          bg-gradient-to-br
          from-[#17130b]
          via-[#0d0d0f]
          to-[#050506]
        "
      >
        <div
          className="
            absolute
            inset-0
            bg-[radial-gradient(circle_at_70%_40%,rgba(212,169,52,0.20),transparent_45%)]
          "
        />

        <div className="absolute inset-0 flex items-center justify-center">
          <GraduationCap
            size={30}
            className="text-[color:var(--gold)]"
          />
        </div>

        <span
          className={[
            "absolute right-3 top-3 rounded-full border px-2 py-1 text-[9px] font-semibold",
            statusClass,
          ].join(" ")}
        >
          {course.status ===
          "Terminé" ? (
            <>
              <Check
                size={10}
                className="inline mr-1"
              />
              Terminé
            </>
          ) : (
            course.status
          )}
        </span>
      </div>

      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--gold)] mb-2">
          Module {course.position}
        </div>

        <div className="text-sm font-semibold text-white">
          {course.title}
        </div>

        {course.description ? (
          <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[color:var(--muted)]">
            {course.description}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-3 text-[10px] text-[color:var(--muted)]">
          <span>
            {course.lessons} leçon
            {course.lessons !== 1
              ? "s"
              : ""}
          </span>

          <span>
            {course.duration}
          </span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-[color:var(--gold)] transition-all"
            style={{
              width: `${course.progress}%`,
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] text-[color:var(--muted)]">
          <span>
            {course.completedLessons}/
            {course.lessons}
          </span>

          <span>
            {course.progress}%
          </span>
        </div>
      </div>
    </div>
  );
}

function SideCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        rounded-[22px]
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-5
      "
    >
      {children}
    </div>
  );
}

function ResourceRow({
  label,
  count,
}: {
  label: string;
  count: string;
}) {
  return (
    <div
      className="
        flex items-center justify-between
        rounded-xl
        border border-white/[0.05]
        bg-black/20
        px-3 py-3
      "
    >
      <span className="text-xs text-white">
        {label}
      </span>

      <span className="text-[10px] text-[color:var(--muted)]">
        {count}
      </span>
    </div>
  );
}