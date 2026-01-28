"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Monitor,
  NotebookPen,
  CalendarDays,
  Trophy,
  Copy,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  Check,
} from "lucide-react";

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

function Pill({ children }: { children: any }) {
  return (
    <span className="px-3 py-1.5 rounded-2xl border border-white/10 bg-black/20 text-xs text-white/70">
      {children}
    </span>
  );
}

function FeatureCard(props: {
  icon: any;
  title: string;
  desc: string;
  tag?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-3xl border border-white/10 bg-black/20 p-5 shadow-2xl overflow-hidden relative"
    >
      <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full blur-3xl opacity-30 bg-[color:var(--gold)]" />
      <div className="relative">
        <div className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
          {props.icon}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="text-white font-semibold">{props.title}</div>
          {props.tag ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-white/60">
              {props.tag}
            </span>
          ) : null}
        </div>

        <div className="mt-2 text-sm text-white/60 leading-relaxed">{props.desc}</div>
      </div>
    </motion.div>
  );
}

function PriceCard(props: {
  name: string;
  price: string;
  hint: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={cx(
        "rounded-3xl border p-6 shadow-2xl relative overflow-hidden",
        props.highlight
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/10 bg-black/20"
      )}
    >
      {props.highlight ? (
        <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full blur-3xl opacity-60 bg-[color:var(--gold)]" />
      ) : null}

      <div className="relative">
        <div className={cx("text-sm font-semibold", props.highlight ? "text-[color:var(--gold)]" : "text-white/80")}>
          {props.name}
        </div>

        <div className="mt-2 text-4xl font-semibold text-white">{props.price}</div>
        <div className={cx("mt-1 text-xs", props.highlight ? "text-white/70" : "text-white/50")}>{props.hint}</div>

        <div className="mt-5 space-y-2">
          {props.features.map((f) => (
            <div key={f} className={cx("flex items-start gap-2 text-sm", props.highlight ? "text-white/85" : "text-white/70")}>
              <Check className={cx("w-4 h-4 mt-[2px]", props.highlight ? "text-white" : "text-[color:var(--gold)]")} />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <Link
          href={props.href}
          className={cx(
            "mt-6 h-11 px-4 rounded-2xl border inline-flex items-center justify-center gap-2 font-semibold transition w-full",
            props.highlight
              ? "border-white/20 bg-black/30 text-white hover:bg-black/40"
              : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] hover:brightness-110"
          )}
        >
          {props.cta} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  );
}

function FAQItem(props: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
      <button
        type="button"
        onClick={props.onToggle}
        className="w-full px-4 py-4 flex items-center justify-between gap-4 text-left"
      >
        <span className="text-white font-semibold">{props.q}</span>
        <ChevronDown className={cx("w-5 h-5 text-white/60 transition", props.open ? "rotate-180" : "")} />
      </button>
      <div className={cx("px-4 grid transition-all duration-300", props.open ? "grid-rows-[1fr] pb-4" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden text-sm text-white/60 leading-relaxed">{props.a}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const year = useMemo(() => new Date().getFullYear(), []);
  const [faqOpen, setFaqOpen] = useMemo(() => [0, () => {}] as any, []); // safe placeholder (no state needed)

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1000px 520px at 18% 10%, rgba(214,179,95,.18), transparent 60%), radial-gradient(900px 460px at 85% 0%, rgba(255,255,255,.07), transparent 60%), rgba(0,0,0,1)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/55 to-black" />
      </div>

      {/* Floating Orbs */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 pointer-events-none"
      >
        <motion.div
          className="absolute left-[8%] top-[18%] h-56 w-56 rounded-full blur-3xl opacity-25 bg-[color:var(--gold)]"
          animate={{ y: [0, 14, 0], x: [0, 8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[10%] top-[10%] h-64 w-64 rounded-full blur-3xl opacity-15 bg-white"
          animate={{ y: [0, 18, 0], x: [0, -10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <Image
                src="/brand/investpro.webp"
                alt="InvestPro"
                width={40}
                height={40}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div>
              <div className="font-semibold leading-none">InvestPro Trading</div>
              <div className="text-xs text-white/50">Dashboard - Journal - News</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-sm text-white/70">
            <a className="hover:text-white transition" href="#pourquoi">
              Pourquoi InvestPro
            </a>
            <a className="hover:text-white transition" href="#prix">
              Prix
            </a>
            <a className="hover:text-white transition" href="#faq">
              FAQ
            </a>
          </nav>

          <Link
            href="/dashboard"
            className="h-10 px-4 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]
                       text-[color:var(--gold)] font-semibold inline-flex items-center justify-center hover:brightness-110 transition"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-16 space-y-16">
        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.08 }}>
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-white/10 bg-black/20 text-xs text-white/70">
              <Sparkles className="w-4 h-4 text-[color:var(--gold)]" />
              Beta - Tout en un
            </motion.div>

            <motion.h1 variants={fadeUp} className="mt-4 text-4xl md:text-5xl font-semibold leading-tight">
              Trade depuis le site, note tes trades, et reste motive.
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-4 text-white/70 text-base md:text-lg max-w-xl">
              InvestPro Trading te permet de trader directement depuis le dashboard, de tenir ton journal de trading,
              de suivre le calendrier economique, et de te comparer aux autres via le classement.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="h-12 px-6 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]
                           text-[color:var(--gold)] font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 transition"
              >
                Ouvrir le Dashboard <ArrowRight className="w-4 h-4" />
              </Link>

              <a
                href="#pourquoi"
                className="h-12 px-6 rounded-2xl border border-white/10 bg-black/20 text-white/80
                           inline-flex items-center justify-center hover:bg-white/5 transition"
              >
                Decouvrir
              </a>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-7 flex flex-wrap gap-2">
              <Pill>Trading depuis le site</Pill>
              <Pill>Journal de trading</Pill>
              <Pill>Calendrier economique</Pill>
              <Pill>Classement</Pill>
              <Pill>Copieur bientot</Pill>
            </motion.div>
          </motion.div>

          {/* Hero visual */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-3xl border border-white/10 bg-black/20 p-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 h-52 w-52 rounded-full blur-3xl opacity-40 bg-[color:var(--gold)]" />
            <div className="relative">
              <div className="text-sm text-white/60">Ce que tu gagnes</div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/50">Terminal</div>
                  <div className="mt-2 text-white font-semibold">Execution rapide</div>
                  <div className="mt-1 text-[11px] text-white/40">Depuis le dashboard</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/50">Journal</div>
                  <div className="mt-2 text-white font-semibold">Analyse claire</div>
                  <div className="mt-1 text-[11px] text-white/40">Winrate, RR, PnL</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 col-span-2">
                  <div className="text-xs text-white/50">Copieur (bientot)</div>
                  <div className="mt-2 text-white font-semibold">Un seul click, plusieurs comptes</div>
                  <div className="mt-1 text-[11px] text-white/40">
                    Lier tes comptes et executer le meme trade partout, avec un risque ajuste par compte.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Pourquoi */}
        <div id="pourquoi" className="scroll-mt-24">
          <div className="mb-6">
            <div className="text-2xl md:text-3xl font-semibold text-white">Pourquoi InvestPro Trading</div>
            <div className="mt-2 text-white/60 max-w-2xl">
              Un systeme complet pour trader avec une structure : execution, suivi, news et motivation.
            </div>
          </div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} transition={{ staggerChildren: 0.08 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={<Monitor className="w-5 h-5 text-[color:var(--gold)]" />}
              title="Trader depuis le site"
              desc="Tu peux placer, modifier et gerer tes positions directement depuis le terminal du dashboard."
            />
            <FeatureCard
              icon={<NotebookPen className="w-5 h-5 text-[color:var(--gold)]" />}
              title="Journal de trading"
              desc="Note tes trades, analyse tes performances, et construis un historique propre pour progresser."
            />
            <FeatureCard
              icon={<CalendarDays className="w-5 h-5 text-[color:var(--gold)]" />}
              title="Calendrier economique"
              desc="Annonces economiques integrees : filtre par pays impactants et importance (etoiles)."
            />
            <FeatureCard
              icon={<Trophy className="w-5 h-5 text-[color:var(--gold)]" />}
              title="Classement utilisateurs"
              desc="Compare tes stats et reste motive. Profil public optionnel + historique public si active."
            />
            <FeatureCard
              icon={<Copy className="w-5 h-5 text-[color:var(--gold)]" />}
              title="Copieur (bientot)"
              desc="Relie plusieurs comptes et trade sur tous en meme temps. Gestion du risque par compte."
              tag="Coming soon"
            />
            <FeatureCard
              icon={<ShieldCheck className="w-5 h-5 text-[color:var(--gold)]" />}
              title="Concu pour scaler"
              desc="Beta d abord, puis evolution vers une architecture plus pro quand tu veux."
            />
          </motion.div>
        </div>

        {/* Prix */}
        <div id="prix" className="scroll-mt-24">
          <div className="mb-6">
            <div className="text-2xl md:text-3xl font-semibold text-white">Le prix</div>
            <div className="mt-2 text-white/60">Tu peux ajuster plus tard. La page est prete.</div>
          </div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} transition={{ staggerChildren: 0.08 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PriceCard
              name="Starter"
              price="0 EUR"
              hint="Pour tester"
              features={["Acces dashboard", "Calendrier eco", "Classement", "Notifications basiques"]}
              cta="Acceder"
              href="/dashboard"
            />
            <PriceCard
              name="Pro"
              price="19 EUR"
              hint="Pour trader serieusement"
              features={["Terminal + Journal", "Stats avancees", "Alertes news", "Acces complet"]}
              cta="Choisir Pro"
              href="/dashboard/abonnement"
              highlight
            />
            <PriceCard
              name="Elite"
              price="49 EUR"
              hint="Pour full features"
              features={["Tout Pro", "Copieur avance (bientot)", "Support prioritaire", "Options premium"]}
              cta="Choisir Elite"
              href="/dashboard/abonnement"
            />
          </motion.div>
        </div>

        {/* FAQ (simple, no state) */}
        <div id="faq" className="scroll-mt-24">
          <div className="mb-6">
            <div className="text-2xl md:text-3xl font-semibold text-white">FAQ</div>
            <div className="mt-2 text-white/60">Les questions classiques.</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FAQItem
              q="Est-ce que je peux trader directement depuis le site ?"
              a="Oui. Le terminal du dashboard est concu pour gerer les positions et les ordres. En beta, certaines fonctions peuvent evoluer."
              open={true}
              onToggle={() => {}}
            />
            <FAQItem
              q="Le copieur fonctionne comment ?"
              a="Bientot : tu relies plusieurs comptes, et tu executes un trade sur tous en meme temps, avec un risque different par compte."
              open={false}
              onToggle={() => {}}
            />
            <FAQItem
              q="Le journal de trading sert a quoi ?"
              a="A suivre tes trades, tes stats, et comprendre ce qui marche. Objectif : progresser plus vite."
              open={false}
              onToggle={() => {}}
            />
            <FAQItem
              q="Pourquoi un classement ?"
              a="Pour rester motive et voir ta progression par rapport aux autres. Tu peux rester prive si tu veux."
              open={false}
              onToggle={() => {}}
            />
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35 }}
          className="rounded-3xl border border-white/10 bg-black/20 p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        >
          <div>
            <div className="text-white font-semibold text-lg">Pret a tester ?</div>
            <div className="text-white/60 text-sm mt-1">Clique et ouvre le dashboard maintenant.</div>
          </div>

          <Link
            href="/dashboard"
            className="h-12 px-6 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]
                       text-[color:var(--gold)] font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 transition"
          >
            Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        <footer className="pt-8 border-t border-white/10 text-xs text-white/40 flex items-center justify-between">
          <span>Copyright {year} InvestPro</span>
          <span>Beta</span>
        </footer>
      </div>
    </main>
  );
}
