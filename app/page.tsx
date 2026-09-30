"use client";

import Image from "next/image";
import Link from "next/link";
import AuraLanding from "@/components/aura/Landing";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  Monitor,
  NotebookPen,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

/* =========================================================
   HELPERS
========================================================= */

function cx(
  ...classes: Array<
    string | false | null | undefined
  >
) {
  return classes
    .filter(Boolean)
    .join(" ");
}

const fadeUp = {
  hidden: {
    opacity: 0,
    y: 20,
  },

  show: {
    opacity: 1,
    y: 0,
  },
};

const reveal = {
  hidden: {
    opacity: 0,
    y: 24,
  },

  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

/* =========================================================
   PAGE
========================================================= */

export default function HomePage() {
  const year = useMemo(
    () =>
      new Date().getFullYear(),
    []
  );

  const [
    faqOpen,
    setFaqOpen,
  ] =
    useState<number | null>(0);

  const faq = [
    {
      q: "Puis-je trader directement depuis le site ?",

      a:
        "Le terminal InvestPro est prévu pour centraliser l’exécution, le suivi et la gestion des positions. Certaines fonctions sont encore en cours de développement pendant la bêta.",
    },

    {
      q: "À quoi sert le journal de trading ?",

      a:
        "Le journal permet de suivre chaque trade, le risque, le résultat, le P&L, le R/R et surtout de vérifier si tu respectes réellement ton plan de trading.",
    },

    {
      q: "Mes données sont-elles sécurisées ?",

      a:
        "Les données du compte sont isolées par utilisateur et les accès aux données sont protégés côté base de données.",
    },

    {
      q: "Comment fonctionne le copieur ?",

      a:
        "Le copieur est prévu pour permettre de relier plusieurs comptes et d’exécuter une même position avec une gestion du risque adaptée à chaque compte.",
    },

    {
      q: "Puis-je connecter plusieurs comptes ?",

      a:
        "Oui. InvestPro permet déjà de centraliser plusieurs comptes manuels. La synchronisation automatique MetaTrader arrivera ensuite.",
    },

    {
      q: "Puis-je changer de formule plus tard ?",

      a:
        "Oui. Les différentes formules peuvent évoluer et tu pourras passer d’un niveau d’accès à un autre.",
    },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      {/* =====================================================
          BACKGROUND
      ===================================================== */}

      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(850px 500px at 18% 12%, rgba(215,171,62,.13), transparent 62%), radial-gradient(700px 450px at 82% 12%, rgba(215,171,62,.07), transparent 65%), #050505",
          }}
        />

        <div
          className="
            absolute
            inset-0
            opacity-[0.17]
          "
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",

            backgroundSize:
              "70px 70px",
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black" />
      </div>

      {/* =====================================================
          NAVBAR
      ===================================================== */}

      <div className="aura-faithful"><header className="landing-nav"><Link href="/" className="brand"><div className="brand-mark"><span/><span/><span/></div><div>investpro<span className="brand-sub">TRADING</span></div></Link><nav><a href="#pourquoi">Pourquoi InvestPro</a><a href="#fonctionnalites">Fonctionnalités</a><a href="#beta">Accès bêta</a><a href="#faq">FAQ</a></nav><Link className="btn primary" href="/dashboard">Explorer l’espace <ArrowRight size={17}/></Link></header></div>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <div className="relative z-10">
        {/* =====================================================
            HERO
        ===================================================== */}

        <AuraLanding />

        {/* =====================================================
            STATS STRIP
        ===================================================== */}

        <section
          className="
            border-b
            border-white/[0.06]
            bg-[#080808]
          "
        >
          <div
            className="
              mx-auto
              grid
              max-w-[1420px]
              grid-cols-2
              gap-px
              px-5
              lg:grid-cols-5
              lg:px-8
            "
          >
            <TrustStat
              icon={
                <NotebookPen
                  size={18}
                />
              }
              value="1 plateforme"
              label="Tout ton trading au même endroit"
            />

            <TrustStat
              icon={
                <WalletCards
                  size={18}
                />
              }
              value="6+ outils"
              label="Pour analyser et progresser"
            />

            <TrustStat
              icon={
                <Target
                  size={18}
                />
              }
              value="100% gratuit"
              label="Pendant la bêta"
            />

            <TrustStat
              icon={
                <BarChart3
                  size={18}
                />
              }
              value="24/7"
              label="Accès à ton espace"
            />

            <div
              className="
                col-span-2
                flex
                items-center
                justify-center
                border-l
                border-white/[0.05]
                px-5
                py-6
                text-center
                lg:col-span-1
              "
            >
              <div className="text-sm font-medium leading-5 text-white/70">
                “Tout ce qu’il faut pour
                trader sérieusement.”
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            MAIN CONTENT
        ===================================================== */}

        <div
          className="
            mx-auto
            max-w-[1420px]
            px-5
            py-16
            lg:px-8
          "
        >
          {/* =================================================
              FEATURES / PRICING / COMPARE
          ================================================= */}

          <section
            id="fonctionnalites"
            className="
              grid
              grid-cols-1
              gap-5
              xl:grid-cols-12
            "
          >
            {/* FEATURES */}

            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{
                once:
                  true,
                margin:
                  "-80px",
              }}
              variants={reveal}
              className="
                rounded-[26px]
                border
                border-white/[0.07]
                bg-[#0a0b0d]
                p-5
                xl:col-span-4
              "
            >
              <SectionEyebrow>
                Tout ce dont vous avez besoin
              </SectionEyebrow>

              <h2
                className="
                  mt-3
                  max-w-sm
                  text-2xl
                  font-semibold
                  tracking-[-0.03em]
                  text-white
                "
              >
                Une plateforme pensée pour la
                performance
              </h2>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FeatureMiniCard
                  icon={
                    <Monitor
                      size={17}
                    />
                  }
                  title="Dashboard"
                  text="Centralise toutes tes performances."
                />

                <FeatureMiniCard
                  icon={
                    <NotebookPen
                      size={17}
                    />
                  }
                  title="Journal"
                  text="Analyse tes trades et tes habitudes."
                />

                <FeatureMiniCard
                  icon={
                    <CalendarDays
                      size={17}
                    />
                  }
                  title="Calendrier"
                  text="Suis les événements importants."
                />

                <FeatureMiniCard
                  icon={
                    <WalletCards
                      size={17}
                    />
                  }
                  title="Mes comptes"
                  text="Regroupe ton capital au même endroit."
                />

                <FeatureMiniCard
                  icon={
                    <Target
                      size={17}
                    />
                  }
                  title="Plan de trading"
                  text="Structure ton exécution et ton risque."
                />

                <FeatureMiniCard
                  icon={
                    <Trophy
                      size={17}
                    />
                  }
                  title="Classement"
                  text="Compare ta progression."
                />
              </div>

              <Link
                href="/dashboard"
                className="
                  mt-5
                  inline-flex
                  items-center
                  gap-2
                  text-xs
                  font-semibold
                  text-[color:var(--gold)]
                  no-underline
                "
              >
                Voir les fonctionnalités

                <ArrowRight
                  size={13}
                />
              </Link>
            </motion.div>

            {/* =================================================
                PRICING
            ================================================= */}

            <motion.div
              id="beta"
              initial="hidden"
              whileInView="show"
              viewport={{
                once:
                  true,
                margin:
                  "-80px",
              }}
              variants={reveal}
              className="
                rounded-[26px]
                border
                border-white/[0.07]
                bg-[#0a0b0d]
                p-5
                xl:col-span-4
              "
            >
              <SectionEyebrow>
                Accès bêta
              </SectionEyebrow>

              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">
                InvestPro est gratuit pendant la bêta
              </h2>

              <p className="mt-3 max-w-md text-[11px] leading-5 text-white/45">
                Profite actuellement d’InvestPro Trading gratuitement pendant la phase bêta.
                Découvre les outils déjà disponibles et suis les prochaines fonctionnalités à venir.
              </p>

              <div
                className="
                  mt-5
                  rounded-2xl
                  border
                  border-[color:var(--gold-border)]
                  bg-[linear-gradient(180deg,rgba(217,173,69,.13),rgba(217,173,69,.05))]
                  p-5
                  shadow-[0_0_40px_rgba(214,173,61,.08)]
                "
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
                      Accès actuel
                    </div>

                    <div className="mt-2 text-3xl font-semibold text-white">
                      100% gratuit
                    </div>

                    <div className="mt-1 text-[9px] text-white/35">
                      Pendant la phase bêta
                    </div>
                  </div>

                  <div
                    className="
                      flex
                      h-12
                      w-12
                      items-center
                      justify-center
                      rounded-xl
                      border
                      border-[color:var(--gold-border)]
                      bg-black/20
                      text-[color:var(--gold)]
                    "
                  >
                    <Sparkles size={20} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <BetaFeature text="Dashboard complet" />
                  <BetaFeature text="Journal de trading" />
                  <BetaFeature text="Mes comptes" />
                  <BetaFeature text="Plan de trading" />
                  <BetaFeature text="Calendrier économique" />
                  <BetaFeature text="Academy disponible" />
                </div>

                <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="text-[9px] font-semibold text-white">
                    Fonctionnalités à venir
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <SoonPill text="Copieur" />
                    <SoonPill text="Terminal" />
                    <SoonPill text="Challenges" />
                    <SoonPill text="Communauté" />
                  </div>
                </div>

                <Link
                  href="/dashboard"
                  className="
                    mt-5
                    flex
                    h-11
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-[color:var(--gold)]
                    text-[10px]
                    font-bold
                    text-black
                    no-underline
                    transition
                    hover:bg-[color:var(--gold-2)]
                  "
                >
                  Commencer gratuitement
                  <ArrowRight size={13} />
                </Link>
              </div>
            </motion.div>

            {/* =================================================
                COMPARISON
            ================================================= */}

            <motion.div
              id="pourquoi"
              initial="hidden"
              whileInView="show"
              viewport={{
                once:
                  true,
                margin:
                  "-80px",
              }}
              variants={reveal}
              className="
                rounded-[26px]
                border
                border-white/[0.07]
                bg-[#0a0b0d]
                p-5
                xl:col-span-4
              "
            >
              <SectionEyebrow>
                Voyez la différence
              </SectionEyebrow>

              <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.03em] text-white">
                Plus de clarté.
                <br />
                Plus de discipline.
                <br />

                <span className="text-[color:var(--gold)]">
                  Meilleurs résultats.
                </span>
              </h2>

              <div
                className="
                  mt-6
                  overflow-hidden
                  rounded-2xl
                  border
                  border-white/[0.07]
                  bg-black/25
                "
              >
                <div
                  className="
                    grid
                    grid-cols-[1fr_80px_80px]
                    border-b
                    border-white/[0.06]
                    px-4
                    py-3
                    text-[8px]
                  "
                >
                  <span />

                  <span className="text-center text-[color:var(--gold)]">
                    InvestPro
                  </span>

                  <span className="text-center text-white/30">
                    Sans
                  </span>
                </div>

                <CompareRow text="Vision claire des performances" />

                <CompareRow text="Suivi régulier" />

                <CompareRow text="Gestion du risque" />

                <CompareRow text="Décisions basées sur les données" />

                <CompareRow text="Progression constante" />
              </div>

              {/* TESTIMONIAL */}

              <div
                className="
                  mt-4
                  rounded-2xl
                  border
                  border-white/[0.07]
                  bg-black/25
                  p-4
                "
              >
                <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
                  Témoignage
                </div>

                <p className="mt-3 text-[11px] leading-5 text-white/55">
                  “InvestPro me permet de
                  centraliser mes trades, mon
                  risque et mes performances.
                  Je sais enfin exactement où
                  j’en suis.”
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="
                        flex
                        h-9
                        w-9
                        items-center
                        justify-center
                        rounded-full
                        border
                        border-[color:var(--gold-border)]
                        bg-[color:var(--gold-soft)]
                        text-[10px]
                        font-bold
                        text-[color:var(--gold)]
                      "
                    >
                      IP
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-white">
                        Trader InvestPro
                      </div>

                      <div className="mt-1 text-[8px] text-white/30">
                        Membre PRO
                      </div>
                    </div>
                  </div>

                  <div className="text-[color:var(--gold)]">
                    ★★★★★
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* =================================================
              PRODUCT BENEFITS
          ================================================= */}

          <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-4">
            <BigBenefit
              icon={
                <Zap
                  size={20}
                />
              }
              title="Exécution plus nette"
              text="Tes outils essentiels sont regroupés au même endroit."
            />

            <BigBenefit
              icon={
                <BarChart3
                  size={20}
                />
              }
              title="Analyse intelligente"
              text="P&L, winrate, risque et statistiques accessibles rapidement."
            />

            <BigBenefit
              icon={
                <ShieldCheck
                  size={20}
                />
              }
              title="Discipline renforcée"
              text="Ton plan de trading contrôle automatiquement tes décisions."
            />

            <BigBenefit
              icon={
                <Activity
                  size={20}
                />
              }
              title="Progrès mesurable"
              text="Observe ton évolution au fil de tes trades."
            />
          </section>

          {/* =================================================
              FAQ
          ================================================= */}

          <section
            id="faq"
            className="
              mt-5
              grid
              grid-cols-1
              gap-5
              lg:grid-cols-12
            "
          >
            <div
              className="
                rounded-[26px]
                border
                border-white/[0.07]
                bg-[#0a0b0d]
                p-5
                lg:col-span-8
              "
            >
              <SectionEyebrow>
                Foire aux questions
              </SectionEyebrow>

              <h2 className="mt-3 text-2xl font-semibold text-white">
                Des questions ? Nous avons les
                réponses.
              </h2>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                {faq.map(
                  (
                    item,
                    index
                  ) => (
                    <FAQItem
                      key={
                        item.q
                      }
                      question={
                        item.q
                      }
                      answer={
                        item.a
                      }
                      open={
                        faqOpen ===
                        index
                      }
                      onClick={() =>
                        setFaqOpen(
                          faqOpen ===
                            index
                            ? null
                            : index
                        )
                      }
                    />
                  )
                )}
              </div>
            </div>

            {/* CTA */}

            <div
              className="
                relative
                overflow-hidden
                rounded-[26px]
                border
                border-[color:var(--gold-border)]
                bg-[#0a0b0d]
                p-7
                lg:col-span-4
              "
            >
              <div
                className="
                  pointer-events-none
                  absolute
                  -right-20
                  -top-24
                  h-[260px]
                  w-[260px]
                  rounded-full
                  bg-[color:var(--gold)]
                  opacity-[0.12]
                  blur-[90px]
                "
              />

              <div className="relative">
                <div
                  className="
                    flex
                    h-12
                    w-12
                    items-center
                    justify-center
                    rounded-xl
                    border
                    border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                    text-[color:var(--gold)]
                  "
                >
                  <Trophy
                    size={21}
                  />
                </div>

                <h2 className="mt-5 text-2xl font-semibold leading-tight text-white">
                  Prêt à passer au niveau
                  supérieur ?
                </h2>

                <p className="mt-3 text-sm leading-6 text-white/45">
                  Centralise ton trading,
                  structure tes décisions et
                  commence à suivre réellement
                  ta progression.
                </p>

                <Link
                  href="/dashboard"
                  className="
                    mt-6
                    inline-flex
                    h-12
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-[color:var(--gold)]
                    px-5
                    text-sm
                    font-bold
                    text-black
                    no-underline
                    transition
                    hover:bg-[color:var(--gold-2)]
                  "
                >
                  Ouvrir le dashboard

                  <ArrowRight
                    size={16}
                  />
                </Link>
              </div>
            </div>
          </section>

          {/* =================================================
              CTA STRIP
          ================================================= */}

          <section
            className="
              relative
              mt-5
              overflow-hidden
              rounded-[24px]
              border
              border-[color:var(--gold-border)]
              bg-gradient-to-r
              from-[#151006]
              via-[#0d0c0a]
              to-[#090909]
              px-6
              py-6
            "
          >
            <div
              className="
                pointer-events-none
                absolute
                left-0
                top-1/2
                h-[200px]
                w-[250px]
                -translate-y-1/2
                rounded-full
                bg-[color:var(--gold)]
                opacity-[0.09]
                blur-[70px]
              "
            />

            <div
              className="
                relative
                flex
                flex-col
                gap-5
                lg:flex-row
                lg:items-center
                lg:justify-between
              "
            >
              <div className="flex items-center gap-4">
                <div
                  className="
                    flex
                    h-14
                    w-14
                    shrink-0
                    items-center
                    justify-center
                    rounded-2xl
                    border
                    border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                    text-[color:var(--gold)]
                  "
                >
                  <Trophy
                    size={24}
                  />
                </div>

                <div>
                  <div className="text-lg font-semibold text-white">
                    Rejoins une nouvelle façon
                    de trader.
                  </div>

                  <div className="mt-1 text-xs text-white/40">
                    Plus de clarté. Plus de
                    discipline. Plus de
                    contrôle.
                  </div>
                </div>
              </div>

              <Link
                href="/dashboard"
                className="
                  inline-flex
                  h-12
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-[color:var(--gold)]
                  px-7
                  text-sm
                  font-bold
                  text-black
                  no-underline
                  transition
                  hover:bg-[color:var(--gold-2)]
                "
              >
                Commencer gratuitement

                <ArrowRight
                  size={16}
                />
              </Link>
            </div>
          </section>

          {/* =================================================
              FOOTER
          ================================================= */}

          <footer
            className="
              mt-5
              grid
              grid-cols-1
              gap-8
              border-t
              border-white/[0.07]
              py-10
              md:grid-cols-4
            "
          >
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="
                    h-10
                    w-10
                    overflow-hidden
                    rounded-full
                    border
                    border-[color:var(--gold-border)]
                  "
                >
                  <Image
                    src="/brand/investpro.webp"
                    alt="InvestPro"
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="text-sm font-semibold text-white">
                  InvestPro{" "}
                  <span className="text-[color:var(--gold)]">
                    Trading
                  </span>
                </div>
              </div>

              <p className="mt-4 max-w-[260px] text-[10px] leading-5 text-white/35">
                Une plateforme tout-en-un pour
                centraliser ton trading,
                analyser tes performances et
                améliorer ta discipline.
              </p>
            </div>

            <FooterColumn
              title="Produit"
              links={[
                [
                  "Dashboard",
                  "/dashboard",
                ],

                [
                  "Journal",
                  "/dashboard/journal",
                ],

                [
                  "Mes comptes",
                  "/dashboard/comptes",
                ],

                [
                  "Plan de trading",
                  "/dashboard/plan",
                ],
              ]}
            />

            <FooterColumn
              title="Ressources"
              links={[
                [
                  "Calendrier",
                  "/dashboard/calendrier",
                ],

                [
                  "Academy",
                  "/dashboard/academy",
                ],

                [
                  "Classement",
                  "/dashboard/classement",
                ],

                [
                  "Support",
                  "/dashboard/contact",
                ],
              ]}
            />

            <div>
              <div className="text-xs font-semibold text-white">
                InvestPro Trading
              </div>

              <div className="mt-4 space-y-2 text-[10px] text-white/35">
                <div>
                  © {year} InvestPro Trading.
                </div>

                <div>
                  Tous droits réservés.
                </div>

                <div className="pt-3 text-[color:var(--gold)]">
                  Beta
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SectionEyebrow({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div
      className="
        text-[9px]
        font-bold
        uppercase
        tracking-[0.14em]
        text-[color:var(--gold)]
      "
    >
      {children}
    </div>
  );
}

function SmallBenefit({
  icon,
  text,
}: {
  icon:
    React.ReactNode;

  text:
    string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[color:var(--gold)]">
        {icon}
      </span>

      <span>
        {text}
      </span>
    </div>
  );
}

function MockMenu({
  text,
  active = false,
}: {
  text:
    string;

  active?:
    boolean;
}) {
  return (
    <div
      className={cx(
        "mb-2 rounded-lg px-2 py-2 text-[7px]",

        active
          ? "border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
          : "text-white/25"
      )}
    >
      {text}
    </div>
  );
}

function MiniStat({
  title,
  value,
  positive = false,
}: {
  title:
    string;

  value:
    string;

  positive?:
    boolean;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-white/[0.06]
        bg-black/25
        p-3
      "
    >
      <div className="text-[7px] text-white/30">
        {title}
      </div>

      <div
        className={cx(
          "mt-1 text-sm font-semibold",

          positive
            ? "text-emerald-400"
            : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PlanLine({
  text,
}: {
  text:
    string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="
          flex
          h-4
          w-4
          items-center
          justify-center
          rounded
          bg-[color:var(--gold-soft)]
          text-[color:var(--gold)]
        "
      >
        <Check
          size={9}
        />
      </span>

      <span className="text-[7px] text-white/50">
        {text}
      </span>
    </div>
  );
}

function TrustStat({
  icon,
  value,
  label,
}: {
  icon:
    React.ReactNode;

  value:
    string;

  label:
    string;
}) {
  return (
    <div
      className="
        flex
        items-center
        gap-3
        border-l
        border-white/[0.05]
        px-4
        py-6
      "
    >
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
        {icon}
      </div>

      <div>
        <div className="text-xl font-semibold text-white">
          {value}
        </div>

        <div className="mt-1 text-[9px] text-white/35">
          {label}
        </div>
      </div>
    </div>
  );
}

function FeatureMiniCard({
  icon,
  title,
  text,
}: {
  icon:
    React.ReactNode;

  title:
    string;

  text:
    string;
}) {
  return (
    <div
      className="
        group
        rounded-2xl
        border
        border-white/[0.07]
        bg-black/25
        p-4
        transition
        hover:border-[color:var(--gold-border)]
        hover:bg-[color:var(--gold-soft)]
      "
    >
      <div
        className="
          flex
          h-9
          w-9
          items-center
          justify-center
          rounded-xl
          border
          border-[color:var(--gold-border)]
          bg-[color:var(--gold-soft)]
          text-[color:var(--gold)]
        "
      >
        {icon}
      </div>

      <div className="mt-4 text-xs font-semibold text-white">
        {title}
      </div>

      <p className="mt-2 text-[9px] leading-4 text-white/35">
        {text}
      </p>
    </div>
  );
}


function BetaFeature({
  text,
}: {
  text:
    string;
}) {
  return (
    <div
      className="
        flex
        items-center
        gap-2
        rounded-lg
        border
        border-white/[0.05]
        bg-black/20
        px-3
        py-2.5
      "
    >
      <span
        className="
          flex
          h-5
          w-5
          shrink-0
          items-center
          justify-center
          rounded-md
          bg-[color:var(--gold-soft)]
          text-[color:var(--gold)]
        "
      >
        <Check size={11} />
      </span>

      <span className="text-[9px] font-medium text-white/65">
        {text}
      </span>
    </div>
  );
}

function SoonPill({
  text,
}: {
  text:
    string;
}) {
  return (
    <span
      className="
        rounded-full
        border
        border-[color:var(--gold-border)]
        bg-[color:var(--gold-soft)]
        px-3
        py-1.5
        text-[8px]
        font-bold
        uppercase
        tracking-[0.08em]
        text-[color:var(--gold)]
      "
    >
      {text} · Bientôt
    </span>
  );
}

function CompareRow({
  text,
}: {
  text:
    string;
}) {
  return (
    <div
      className="
        grid
        grid-cols-[1fr_80px_80px]
        items-center
        border-b
        border-white/[0.05]
        px-4
        py-2.5
        text-[8px]
        last:border-b-0
      "
    >
      <span className="text-white/45">
        {text}
      </span>

      <span className="flex justify-center">
        <Check
          size={11}
          className="text-[color:var(--gold)]"
        />
      </span>

      <span className="flex justify-center">
        <X
          size={11}
          className="text-white/25"
        />
      </span>
    </div>
  );
}

function BigBenefit({
  icon,
  title,
  text,
}: {
  icon:
    React.ReactNode;

  title:
    string;

  text:
    string;
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 15,
      }}
      whileInView={{
        opacity: 1,
        y: 0,
      }}
      viewport={{
        once: true,
      }}
      className="
        rounded-[22px]
        border
        border-white/[0.07]
        bg-[#0a0b0d]
        p-5
      "
    >
      <div
        className="
          flex
          h-11
          w-11
          items-center
          justify-center
          rounded-xl
          border
          border-[color:var(--gold-border)]
          bg-[color:var(--gold-soft)]
          text-[color:var(--gold)]
        "
      >
        {icon}
      </div>

      <div className="mt-4 text-sm font-semibold text-white">
        {title}
      </div>

      <p className="mt-2 text-[10px] leading-5 text-white/35">
        {text}
      </p>
    </motion.div>
  );
}

function FAQItem({
  question,
  answer,
  open,
  onClick,
}: {
  question:
    string;

  answer:
    string;

  open:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <div
      className="
        overflow-hidden
        rounded-xl
        border
        border-white/[0.07]
        bg-black/25
      "
    >
      <button
        type="button"
        onClick={
          onClick
        }
        className="
          flex
          w-full
          items-center
          justify-between
          gap-4
          px-4
          py-3.5
          text-left
        "
      >
        <span className="text-[10px] font-semibold text-white/80">
          {question}
        </span>

        <ChevronDown
          size={14}
          className={cx(
            "shrink-0 text-white/30 transition-transform",

            open &&
              "rotate-180 text-[color:var(--gold)]"
          )}
        />
      </button>

      <div
        className={cx(
          "grid transition-all duration-300",

          open
            ? "grid-rows-[1fr]"
            : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-[9px] leading-5 text-white/35">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}


function PhoneLine({
  title,
  value,
  gold = false,
}: {
  title:
    string;

  value:
    string;

  gold?:
    boolean;
}) {
  return (
    <div
      className="
        flex
        items-center
        justify-between
        rounded-lg
        border
        border-white/[0.05]
        bg-black/20
        px-2
        py-2
      "
    >
      <span className="text-[6px] text-white/30">
        {title}
      </span>

      <span
        className={cx(
          "text-[7px] font-semibold",
          gold
            ? "text-[color:var(--gold)]"
            : "text-white/70"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title:
    string;

  links: [
    string,
    string
  ][];
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-white">
        {title}
      </div>

      <div className="mt-4 space-y-2">
        {links.map(
          ([
            label,
            href,
          ]) => (
            <Link
              key={
                label
              }
              href={
                href
              }
              className="
                block
                text-[10px]
                text-white/50
                no-underline
                transition
                hover:text-[color:var(--gold)]
              "
            >
              {label}
            </Link>
          )
        )}
      </div>
    </div>
  );
}