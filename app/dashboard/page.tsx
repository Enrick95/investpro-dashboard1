"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Flame,
  GraduationCap,
  LineChart,
  Lock,
  Plus,
  ShieldCheck,
  Target,
  Trophy,
  WalletCards,
  Activity,
  TrendingUp,
  Clock3,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Profile = {
  username: string;
  plan: string;
  xp: number;
};

const pageItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const softSpring = {
  type: "spring" as const,
  stiffness: 170,
  damping: 22,
  mass: 0.7,
};

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile>({
    username: "Trader",
    plan: "free",
    xp: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("username, plan, xp")
          .eq("id", user.id)
          .single();

        setProfile({
          username:
            data?.username ||
            user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            "Trader",

          plan: String(data?.plan || "free").toLowerCase(),

          xp: Number(data?.xp || 0),
        });
      } catch (error) {
        console.error("Erreur dashboard :", error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [supabase]);

  const isAcademyUnlocked =
    profile.plan === "pro" || profile.plan === "elite";

  const planLabel = profile.plan.toUpperCase();

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-sm text-[color:var(--muted)]">
          Chargement de ton espace InvestPro…
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="relative space-y-5 pb-8 overflow-hidden"
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduceMotion ? 0 : 0.07,
            delayChildren: reduceMotion ? 0 : 0.04,
          },
        },
      }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -top-[120px] left-[5%] h-[360px] w-[360px] rounded-full bg-[color:var(--gold)] opacity-[0.07] blur-[110px]"
          animate={reduceMotion ? undefined : { x: [0, 55, 0], y: [0, 28, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[-120px] top-[260px] h-[360px] w-[360px] rounded-full bg-[color:var(--gold)] opacity-[0.07] blur-[110px]"
          animate={reduceMotion ? undefined : { x: [0, -45, 0], y: [0, -22, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
            maskImage: "linear-gradient(to bottom, black, transparent 75%)",
          }}
        />
      </div>

      {/* =========================================================
          TOP WELCOME
      ========================================================= */}

      <motion.div
        className="flex items-start justify-between gap-4"
        variants={pageItem}
        transition={softSpring}
      >
        <div>
          <h1 className="text-[22px] md:text-2xl font-semibold text-white">
            Bonjour,{" "}
            <span className="text-[color:var(--gold)]">
              {profile.username}
            </span>{" "}
            👋
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Voici ce qui se passe sur ton compte aujourd’hui.
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
          <ShieldCheck
            size={15}
            className="text-[color:var(--gold)]"
          />

          <span className="text-xs text-[color:var(--muted)]">
            Plan
          </span>

          <span className="text-xs font-bold text-[color:var(--gold)]">
            {planLabel}
          </span>
        </div>
      </motion.div>

      {/* =========================================================
          HERO
      ========================================================= */}

      <motion.section
        variants={pageItem}
        transition={softSpring}
        className="
          relative
          overflow-hidden
          min-h-[205px]
          rounded-[26px]
          border border-[color:var(--gold-border)]
          bg-[#0b0b0d]
          shadow-[0_30px_90px_rgba(0,0,0,0.35)]
          investpro-hero
        "
      >
        <motion.div
          className="pointer-events-none absolute inset-y-0 w-[35%] bg-gradient-to-r from-transparent via-[#ffe89b]/[0.08] to-transparent"
          initial={reduceMotion ? false : { x: "-130%", skewX: -16, opacity: 0 }}
          animate={reduceMotion ? undefined : { x: ["-130%", "160%"], opacity: [0, 0.18, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1.1 }}
        />
        <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[color:var(--gold)]/50 to-transparent" />

        {/* Glow gauche */}
        <div
          className="
            pointer-events-none
            absolute
            -left-32
            -top-40
            w-[420px]
            h-[420px]
            rounded-full
            bg-[color:var(--gold)]
            opacity-[0.06]
            blur-[110px]
          "
        />

        {/* Glow droite */}
        <div
          className="
            pointer-events-none
            absolute
            right-[-80px]
            top-[-140px]
            w-[540px]
            h-[440px]
            rounded-full
            bg-[color:var(--gold)]
            opacity-[0.10]
            blur-[120px]
          "
        />

        {/* contenu */}
        <motion.div
          className="relative z-10 p-7 md:p-8 max-w-2xl"
          initial={reduceMotion ? false : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.5, delay: 0.12 }}
        >
          <motion.div
            animate={reduceMotion ? undefined : { boxShadow: ["0 0 0 rgba(242,199,91,0)", "0 0 28px rgba(242,199,91,.12)", "0 0 0 rgba(242,199,91,0)"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="
              inline-flex
              items-center gap-2
              mb-4
              rounded-full
              border border-[color:var(--gold-border)]
              bg-black/30
              px-3 py-1
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.12em]
              text-[color:var(--gold)]
            "
          >
            <Activity size={12} />
            InvestPro Trading Hub
          </motion.div>

          <h2 className="text-2xl md:text-[28px] leading-tight font-semibold text-white">
            Bienvenue dans ton espace{" "}
            <motion.span
              className="bg-gradient-to-r from-[#f2c75b] via-[#fff0a6] to-[#c99624] bg-clip-text text-transparent"
              animate={reduceMotion ? undefined : { filter: ["brightness(.9)", "brightness(1.25)", "brightness(.9)"] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            >
              InvestPro
            </motion.span>
          </h2>

          <p
            className="
              mt-3
              max-w-xl
              text-sm
              leading-6
              text-[color:var(--muted)]
            "
          >
            Apprends, analyse, gère ton risque et suis ta performance.
            Tout ce dont tu as besoin pour progresser avec discipline,
            au même endroit.
          </p>

          <motion.div
            className="mt-5 flex flex-wrap gap-2"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : 0.3 }}
          >
            <HeroPill label="Plan" value={planLabel} />
            <HeroPill label="XP" value={String(profile.xp)} />
            <HeroPill label="Statut" value="En ligne" live />
          </motion.div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {isAcademyUnlocked ? (
              <Link
                href="/dashboard/academy"
                className="
                  inline-flex
                  items-center gap-2
                  h-11
                  rounded-xl
                  bg-[color:var(--gold)]
                  px-4
                  text-sm
                  font-semibold
                  text-black
                  no-underline
                  hover:bg-[color:var(--gold-2)]
                  transition
                "
              >
                Voir ma progression
                <ArrowRight size={15} />
              </Link>
            ) : (
              <Link
                href="/dashboard/abonnement"
                className="
                  inline-flex
                  items-center gap-2
                  h-11
                  rounded-xl
                  bg-[color:var(--gold)]
                  px-4
                  text-sm
                  font-semibold
                  text-black
                  no-underline
                  hover:bg-[color:var(--gold-2)]
                  transition
                "
              >
                Découvrir InvestPro PRO
                <ArrowRight size={15} />
              </Link>
            )}

            <Link
              href="/dashboard/comptes"
              className="
                inline-flex
                items-center gap-2
                h-11
                rounded-xl
                border border-white/10
                bg-white/[0.03]
                px-4
                text-sm
                font-medium
                text-white
                no-underline
                hover:bg-white/[0.06]
                transition
              "
            >
              Mes comptes
            </Link>
          </div>
        </motion.div>

        {/* =====================================================
            GRAPH / CANDLE DECORATION
        ===================================================== */}

        <div
          className="
            pointer-events-none
            absolute
            right-0
            top-0
            hidden
            h-full
            w-[46%]
            lg:block
          "
        >
          {/* lignes horizontales */}
          <div className="absolute inset-0 opacity-[0.08]">
            <div className="absolute left-0 right-0 top-[25%] border-t border-white" />
            <div className="absolute left-0 right-0 top-[50%] border-t border-white" />
            <div className="absolute left-0 right-0 top-[75%] border-t border-white" />
          </div>

          {/* bougies */}
          <div className="absolute bottom-7 right-8 flex h-[135px] items-end gap-[10px] opacity-35">
            {[
              48, 68, 54, 92, 112, 78, 125, 105, 148, 126, 172, 154,
            ].map((height, index) => (
              <motion.div
                key={index}
                className="relative w-[10px]"
                style={{ height, transformOrigin: "bottom" }}
                initial={reduceMotion ? false : { scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.38,
                  delay: reduceMotion ? 0 : 0.22 + index * 0.035,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <span
                  className="
                    absolute
                    left-1/2
                    top-[-12px]
                    bottom-[-12px]
                    w-px
                    -translate-x-1/2
                    bg-[color:var(--gold)]
                  "
                />

                <span
                  className="
                    absolute
                    inset-x-0
                    bottom-0
                    rounded-sm
                    bg-[color:var(--gold)]
                  "
                  style={{
                    height: Math.max(18, height * 0.52),
                  }}
                />
              </motion.div>
            ))}
          </div>

          {/* courbe */}
          <svg
            viewBox="0 0 650 220"
            className="absolute bottom-0 right-0 h-[185px] w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="investproLine"
                x1="0"
                x2="1"
                y1="0"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor="#8b6a20"
                  stopOpacity="0.15"
                />

                <stop
                  offset="55%"
                  stopColor="#d4a934"
                  stopOpacity="0.8"
                />

                <stop
                  offset="100%"
                  stopColor="#f2c75b"
                />
              </linearGradient>

              <filter id="goldGlow">
                <feGaussianBlur
                  stdDeviation="5"
                  result="blur"
                />

                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <motion.path
              d="
                M 0 180
                C 45 178, 55 155, 92 160
                S 142 145, 177 150
                S 225 118, 258 125
                S 315 112, 340 88
                S 400 102, 430 68
                S 493 76, 520 48
                S 588 70, 650 18
              "
              fill="none"
              stroke="url(#investproLine)"
              strokeWidth="3"
              filter="url(#goldGlow)"
              initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 1.15, delay: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
            />

            <motion.circle
              cx="650"
              cy="18"
              r="7"
              fill="#f2c75b"
              filter="url(#goldGlow)"
              initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
              animate={{ opacity: [0.55, 1, 0.55], scale: [0.8, 1.35, 0.8] }}
              transition={{ duration: reduceMotion ? 0 : 1.8, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut", delay: 1 }}
            />

            <circle
              cx="520"
              cy="48"
              r="5"
              fill="#f2c75b"
              filter="url(#goldGlow)"
            />

            <circle
              cx="650"
              cy="18"
              r="6"
              fill="#f2c75b"
              filter="url(#goldGlow)"
            />
          </svg>
        </div>
      </motion.section>

      {/* =========================================================
          KPI
      ========================================================= */}

      <motion.section
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: reduceMotion ? 0 : 0.09 } },
        }}
        className="
          grid
          grid-cols-1
          gap-3
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-5
        "
      >
        <StatCard
          icon={<WalletCards size={18} />}
          label="Capital total"
          value="—"
          sub="Ajoute un compte"
        />

        <StatCard
          icon={<BarChart3 size={18} />}
          label="P&L du mois"
          value="—"
          sub="Aucune donnée"
        />

        <StatCard
          icon={<Target size={18} />}
          label="Winrate"
          value="—"
          sub="Aucune donnée"
        />

        <StatCard
          icon={<ShieldCheck size={18} />}
          label="Risque moyen"
          value="—"
          sub="Aucune donnée"
        />

        <StatCard
          icon={<TrendingUp size={18} />}
          label="Trades du mois"
          value="0"
          sub="Ce mois-ci"
        />
      </motion.section>

      {/* =========================================================
          MAIN ROW
      ========================================================= */}

      <motion.section
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        variants={pageItem}
        transition={softSpring}
      >
        {/* Academy */}
        <DashboardCard className="xl:col-span-5">
          <CardHeader
            icon={<BookOpen size={17} />}
            title="Continuer ma formation"
            right={
              !isAcademyUnlocked ? (
                <span
                  className="
                    inline-flex
                    items-center gap-1
                    rounded-full
                    border border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                    px-2 py-1
                    text-[9px]
                    font-bold
                    text-[color:var(--gold)]
                  "
                >
                  <Lock size={10} />
                  PRO
                </span>
              ) : null
            }
          />

          {isAcademyUnlocked ? (
            <div className="mt-5">
              <div className="flex items-center gap-4">
                <div
                  className="
                    flex
                    h-[72px]
                    w-[72px]
                    shrink-0
                    items-center
                    justify-center
                    rounded-2xl
                    border border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                  "
                >
                  <GraduationCap className="text-[color:var(--gold)]" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">
                    Les bases du trading
                  </div>

                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    Module 1
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full w-0 bg-[color:var(--gold)]" />
                  </div>
                </div>

                <div className="text-sm text-[color:var(--muted)]">
                  0%
                </div>
              </div>
            </div>
          ) : (
            <div
              className="
                mt-5
                rounded-2xl
                border border-[color:var(--gold-border)]
                bg-gradient-to-br
                from-[color:var(--gold-soft)]
                to-transparent
                p-5
              "
            >
              <div className="flex gap-4">
                <div
                  className="
                    flex
                    h-12
                    w-12
                    shrink-0
                    items-center
                    justify-center
                    rounded-xl
                    border border-[color:var(--gold-border)]
                    bg-black/30
                  "
                >
                  <Lock className="text-[color:var(--gold)]" size={20} />
                </div>

                <div>
                  <div className="font-semibold text-white">
                    Academy InvestPro
                  </div>

                  <p className="mt-1 max-w-md text-sm leading-5 text-[color:var(--muted)]">
                    Accède aux formations, ressources et au suivi de
                    progression avec InvestPro PRO.
                  </p>

                  <Link
                    href="/dashboard/abonnement"
                    className="
                      mt-4
                      inline-flex
                      items-center gap-2
                      text-sm
                      font-semibold
                      text-[color:var(--gold)]
                      no-underline
                    "
                  >
                    Débloquer l’Academy
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </DashboardCard>

        {/* Activity */}
        <DashboardCard className="xl:col-span-4">
          <CardHeader
            icon={<Clock3 size={17} />}
            title="Mon activité récente"
          />

          <div className="mt-5">
            <EmptyState
              title="Aucune activité récente"
              text="Tes trades, journaux et activités apparaîtront ici."
            />
          </div>
        </DashboardCard>

        {/* Calendar */}
        <DashboardCard className="xl:col-span-3">
          <CardHeader
            icon={<CalendarDays size={17} />}
            title="Marchés aujourd’hui"
          />

          <div className="mt-5 space-y-3">
            <MarketRow
              time="14:30"
              currency="USD"
              event="Événement économique"
              level="Élevé"
            />

            <MarketRow
              time="16:00"
              currency="USD"
              event="Donnée macro"
              level="Moyen"
            />

            <Link
              href="/dashboard/calendrier"
              className="
                inline-flex
                items-center gap-2
                pt-2
                text-xs
                font-semibold
                text-[color:var(--gold)]
                no-underline
              "
            >
              Voir le calendrier complet
              <ArrowRight size={13} />
            </Link>
          </div>
        </DashboardCard>
      </motion.section>

      {/* =========================================================
          BOTTOM
      ========================================================= */}

      <motion.section
        variants={pageItem}
        transition={softSpring}
        className="
          grid
          grid-cols-1
          gap-4
          md:grid-cols-2
          xl:grid-cols-4
        "
      >
        {/* Goals */}
        <DashboardCard>
          <CardHeader
            icon={<Target size={17} />}
            title="Objectif de la semaine"
          />

          <div className="mt-6 flex items-end justify-between">
            <div>
              <div className="text-2xl font-semibold text-white">
                0 / 3
              </div>

              <div className="mt-1 text-xs text-[color:var(--muted)]">
                objectifs complétés
              </div>
            </div>

            <div className="text-xs font-semibold text-[color:var(--gold)]">
              0%
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full w-0 bg-[color:var(--gold)]" />
          </div>

          <div className="mt-5 space-y-3 text-xs text-[color:var(--muted)]">
            <Goal text="Réaliser 5 trades" />
            <Goal text="Respecter ton risque" />
            <Goal text="Compléter ton journal" />
          </div>
        </DashboardCard>

        {/* Connected accounts */}
        <DashboardCard>
          <CardHeader
            icon={<WalletCards size={17} />}
            title="Comptes connectés"
          />

          <div className="mt-5">
            <EmptyState
              title="Aucun compte connecté"
              text="Connecte un compte MetaTrader pour afficher tes performances."
            />
          </div>

          <Link
            href="/dashboard/comptes"
            className="
              mt-5
              flex
              h-10
              items-center
              justify-center
              gap-2
              rounded-xl
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              text-xs
              font-semibold
              text-[color:var(--gold)]
              no-underline
              hover:bg-white/5
              transition
            "
          >
            <Plus size={15} />
            Ajouter un compte
          </Link>
        </DashboardCard>

        {/* Ranking */}
        <DashboardCard>
          <CardHeader
            icon={<Trophy size={17} />}
            title="Classement hebdo"
          />

          <div className="mt-5">
            <EmptyState
              title="Classement bientôt disponible"
              text="Compare tes performances avec la communauté InvestPro."
            />
          </div>

          <Link
            href="/dashboard/classement"
            className="
              mt-5
              inline-flex
              items-center gap-2
              text-xs
              font-semibold
              text-[color:var(--gold)]
              no-underline
            "
          >
            Voir le classement
            <ArrowRight size={13} />
          </Link>
        </DashboardCard>

        {/* Challenges */}
        <DashboardCard>
          <CardHeader
            icon={<Flame size={17} />}
            title="Défis en cours"
          />

          <div
            className="
              mt-5
              rounded-2xl
              border border-[color:var(--border)]
              bg-black/20
              p-4
            "
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">
                Défi Régularité
              </div>

              <span
                className="
                  rounded-full
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  px-2 py-1
                  text-[9px]
                  font-bold
                  text-[color:var(--gold)]
                "
              >
                BIENTÔT
              </span>
            </div>

            <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">
              Les challenges communautaires arrivent prochainement.
            </p>
          </div>
        </DashboardCard>
      </motion.section>


    </motion.div>
  );
}

/* =============================================================
   COMPONENTS
============================================================= */

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1 },
      }}
      whileHover={{ y: -7, scale: 1.025 }}
      transition={softSpring}
      className="
        group
        relative
        overflow-hidden
        min-h-[96px]
        rounded-2xl
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
        transition
        hover:border-[color:var(--gold-border)]
      "
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[color:var(--gold)] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-[0.12]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(circle at 15% 0%, rgba(242,199,91,.08), transparent 42%)" }}
      />
      <div className="relative z-10 flex h-full items-center gap-3">
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
            transition-transform duration-300
            group-hover:scale-110 group-hover:-rotate-3
          "
        >
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-[11px] text-[color:var(--muted)]">
            {label}
          </div>

          <div className="mt-1 text-lg font-semibold leading-none text-white">
            {value}
          </div>

          <div className="mt-2 text-[9px] text-[color:var(--muted)]">
            {sub}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      whileHover={{ y: -5, scale: 1.005 }}
      transition={softSpring}
      className={[
        "group relative overflow-hidden rounded-[22px]",
        "border border-[color:var(--border)]",
        "bg-[color:var(--panel)]",
        "p-5",
        "transition-shadow duration-300 hover:border-[color:var(--gold-border)] hover:shadow-[0_20px_70px_rgba(0,0,0,0.22)]",
        className,
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(circle at 15% 0%, rgba(242,199,91,.08), transparent 42%)" }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

function HeroPill({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 backdrop-blur-sm">
      <span className="text-[9px] uppercase tracking-[0.12em] text-white/35">{label}</span>
      {live ? (
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
          animate={{ boxShadow: ["0 0 0 0 rgba(52,211,153,.25)", "0 0 0 6px rgba(52,211,153,0)", "0 0 0 0 rgba(52,211,153,0)"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <span className="text-[10px] font-semibold text-white/80">{value}</span>
    </div>
  );
}

function CardHeader({
  icon,
  title,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
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
  title: string;
  text: string;
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

function MarketRow({
  time,
  currency,
  event,
  level,
}: {
  time: string;
  currency: string;
  event: string;
  level: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 pb-3">
      <div className="text-[11px] font-semibold text-white">
        {time}
      </div>

      <div className="text-[10px] font-semibold text-[color:var(--gold)]">
        {currency}
      </div>

      <div className="min-w-0 flex-1 truncate text-[10px] text-[color:var(--muted)]">
        {event}
      </div>

      <span
        className="
          rounded-full
          border border-white/[0.08]
          bg-white/[0.03]
          px-2 py-1
          text-[9px]
          font-semibold
          text-white/60
        "
      >
        {level}
      </span>
    </div>
  );
}

function Goal({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="
          flex
          h-4
          w-4
          shrink-0
          items-center
          justify-center
          rounded-full
          border border-[color:var(--gold-border)]
          bg-[color:var(--gold-soft)]
        "
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--gold)]" />
      </span>

      <span>{text}</span>
    </div>
  );
}
