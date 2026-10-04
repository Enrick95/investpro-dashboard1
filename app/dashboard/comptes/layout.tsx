"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, MonitorCog, Plus, Sparkles, WalletCards, X } from "lucide-react";

type Choice = "mt5" | "mt4" | "manual" | null;

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findPilotPanel(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("section, div"));

  // On ne masque QUE le panneau pilote technique, jamais les blocs génériques du bas.
  const marker = all.find((el) => {
    const text = normalizeText(el.textContent);
    return (
      text.includes("synchronisation mt5") &&
      (text.includes("installation pilote") ||
        text.includes("créer / renouveler ma clé") ||
        text.includes("renouveler ma clé de synchronisation"))
    );
  });

  if (!marker) return null;

  const section = marker.closest("section") as HTMLElement | null;
  if (section) return section;

  let node: HTMLElement | null = marker;
  for (let i = 0; i < 5 && node?.parentElement; i += 1) {
    const parent = node.parentElement as HTMLElement;
    const text = normalizeText(parent.textContent);
    if (
      text.includes("synchronisation mt5") &&
      text.length < 9000
    ) {
      node = parent;
      continue;
    }
    break;
  }

  return node;
}

export default function ComptesMotionLayout({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [mt4Message, setMt4Message] = useState(false);
  const bypassNextAddClick = useRef(false);
  const originalAddButton = useRef<HTMLElement | null>(null);
  const pilotPanel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function hidePilotPanel() {
      const panel = findPilotPanel();
      if (!panel) return;

      pilotPanel.current = panel;
      if (panel.dataset.ipPilotOpened !== "1") {
        panel.classList.add("ip-mt5-pilot-hidden");
      }
    }

    hidePilotPanel();

    const observer = new MutationObserver(() => hidePilotPanel());
    observer.observe(document.body, { childList: true, subtree: true });

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button, a") as HTMLElement | null;
      if (!button) return;

      const text = normalizeText(button.textContent);
      if (!text.includes("ajouter un compte") && !text.includes("ajouter mon premier compte")) {
        return;
      }

      if (bypassNextAddClick.current) {
        bypassNextAddClick.current = false;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      originalAddButton.current = button;
      setChoice(null);
      setMt4Message(false);
      setChooserOpen(true);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  function chooseManual() {
    setChoice("manual");
    setChooserOpen(false);

    const button = originalAddButton.current;
    if (!button) return;

    bypassNextAddClick.current = true;
    window.setTimeout(() => button.click(), 40);
  }

  function chooseMt5() {
    setChoice("mt5");
    setChooserOpen(false);

    window.setTimeout(() => {
      const panel = pilotPanel.current || findPilotPanel();
      if (!panel) return;

      pilotPanel.current = panel;
      panel.dataset.ipPilotOpened = "1";
      panel.classList.remove("ip-mt5-pilot-hidden");
      panel.classList.add("ip-mt5-pilot-reveal");
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });

      window.setTimeout(() => panel.classList.remove("ip-mt5-pilot-reveal"), 850);
    }, 80);
  }

  function chooseMt4() {
    setChoice("mt4");
    setMt4Message(true);
  }

  return (
    <motion.div
      className="accounts-motion-scope relative isolate"
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.994 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 145, damping: 22, mass: 0.75 }}
    >
      {!reduceMotion ? (
        <>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed right-[8%] top-[12%] -z-10 h-[420px] w-[420px] rounded-full bg-[color:var(--gold)] blur-[150px]"
            animate={{ opacity: [0.02, 0.065, 0.02], scale: [0.96, 1.1, 0.96] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed bottom-[5%] left-[24%] -z-10 h-[300px] w-[300px] rounded-full bg-[color:var(--gold)] blur-[160px]"
            animate={{ opacity: [0.012, 0.04, 0.012], x: [0, 36, 0], y: [0, -18, 0] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      ) : null}

      {children}

      <AnimatePresence>
        {chooserOpen ? (
          <motion.div
            className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setChooserOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Ajouter un compte"
              className="relative w-full max-w-[860px] overflow-hidden rounded-[28px] border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-[0_30px_120px_rgba(0,0,0,.62)]"
              initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.965 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 240, damping: 25 }}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[-190px] h-[390px] w-[540px] -translate-x-1/2 rounded-full bg-[color:var(--gold)] blur-[130px]"
                animate={reduceMotion ? undefined : { opacity: [0.05, 0.11, 0.05], scale: [0.94, 1.07, 0.94] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
              />

              <div className="relative z-10 border-b border-white/[0.07] px-6 py-5 md:px-8">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">
                      <Sparkles size={12} />
                      Connexion InvestPro
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-white md:text-2xl">
                      Ajouter un <span className="text-[color:var(--gold)]">compte</span>
                    </h2>
                    <p className="mt-2 max-w-xl text-xs leading-5 text-white/45 md:text-sm">
                      Choisis comment tu souhaites ajouter ton compte de trading.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setChooserOpen(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white"
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>

              <div className="relative z-10 p-5 md:p-7">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <ChoiceCard
                    title="MetaTrader 5"
                    subtitle="MT5"
                    text="Synchronisation automatique du compte, de la balance et de l’historique."
                    icon={<MonitorCog size={24} />}
                    onClick={chooseMt5}
                  />

                  <ChoiceCard
                    title="MetaTrader 4"
                    subtitle="MT4"
                    text="Connecte ton compte MetaTrader 4 avec le même parcours clair et sécurisé."
                    icon={<MonitorCog size={24} />}
                    onClick={chooseMt4}
                  />

                  <ChoiceCard
                    title="Compte manuel"
                    subtitle="MANUEL"
                    text="Ajoute un compte sans synchronisation et renseigne toi-même le capital."
                    icon={<WalletCards size={24} />}
                    onClick={chooseManual}
                  />
                </div>

                <AnimatePresence>
                  {mt4Message ? (
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="mt-5 flex items-start gap-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--gold-border)] text-[color:var(--gold)]">
                        <Plus size={15} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">Connexion MetaTrader 4</div>
                        <div className="mt-1 text-[10px] leading-5 text-white/45">
                          Le parcours MT4 est prévu ici. Son panneau de connexion sera activé dès que la synchronisation MT4 sera opérationnelle.
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <style jsx global>{`
        .ip-mt5-pilot-hidden {
          display: none !important;
        }

        .ip-mt5-pilot-reveal {
          animation: ipPilotReveal 760ms cubic-bezier(.2,.8,.2,1) both;
        }

        @keyframes ipPilotReveal {
          0% { opacity: 0; transform: translateY(22px) scale(.985); filter: brightness(.9); }
          55% { opacity: 1; transform: translateY(-2px) scale(1.004); filter: brightness(1.08); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }

        .accounts-motion-scope > div > section,
        .accounts-motion-scope main section {
          transition:
            transform 260ms cubic-bezier(.2,.8,.2,1),
            border-color 260ms ease,
            box-shadow 260ms ease,
            background-color 260ms ease;
        }

        .accounts-motion-scope > div > section:hover,
        .accounts-motion-scope main section:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--gold) 34%, transparent);
          box-shadow: 0 20px 64px rgba(0,0,0,.22), 0 0 30px color-mix(in srgb, var(--gold) 7%, transparent);
        }

        .accounts-motion-scope button,
        .accounts-motion-scope a {
          transition:
            transform 180ms cubic-bezier(.2,.8,.2,1),
            box-shadow 180ms ease,
            filter 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease !important;
        }

        .accounts-motion-scope button:hover,
        .accounts-motion-scope a:hover {
          transform: translateY(-2px);
        }

        .accounts-motion-scope button:active,
        .accounts-motion-scope a:active {
          transform: translateY(0) scale(.98);
        }

        @media (prefers-reduced-motion: reduce) {
          .accounts-motion-scope *,
          .accounts-motion-scope *::before,
          .accounts-motion-scope *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </motion.div>
  );
}

function ChoiceCard({
  title,
  subtitle,
  text,
  icon,
  onClick,
  highlighted = false,
}: {
  title: string;
  subtitle: string;
  text: string;
  icon: ReactNode;
  onClick: () => void;
  highlighted?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -7, scale: 1.012 }}
      whileTap={{ scale: 0.985 }}
      className={[
        "group relative min-h-[250px] overflow-hidden rounded-[22px] border p-5 text-left",
        highlighted
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.08] bg-black/25 hover:border-[color:var(--gold-border)]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute right-[-55px] top-[-55px] h-[150px] w-[150px] rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[55px] transition-opacity group-hover:opacity-[0.12]" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)] shadow-[0_0_30px_rgba(255,190,60,.05)]">
            {icon}
          </div>


        </div>

        <div className="mt-7 text-[9px] font-bold uppercase tracking-[0.18em] text-[color:var(--gold)]">{subtitle}</div>
        <div className="mt-1 text-base font-semibold text-white">{title}</div>
        <p className="mt-3 flex-1 text-[11px] leading-5 text-white/45">{text}</p>

        <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-white transition-colors group-hover:text-[color:var(--gold)]">
          {subtitle === "MANUEL" ? "Ajouter" : "Connecter"}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}
