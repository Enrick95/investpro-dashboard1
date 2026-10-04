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
  // Sécurité V5 : on ne cherche QUE parmi les <section>.
  // Cela évite de masquer par erreur le wrapper de toute la page.
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));

  const matches = sections.filter((section) => {
    const text = normalizeText(section.textContent);

    const directConnectForm =
      text.includes("connecter mon compte mt4 / mt5") &&
      (text.includes("numéro du compte") || text.includes("numero du compte")) &&
      text.includes("mot de passe investisseur") &&
      (text.includes("capital de départ") || text.includes("capital de depart")) &&
      text.includes("connecter mon compte");

    const pilotPanel =
      text.includes("synchronisation mt5") &&
      (text.includes("installation pilote") ||
        text.includes("créer / renouveler ma clé") ||
        text.includes("creer / renouveler ma cle") ||
        text.includes("renouveler ma clé de synchronisation") ||
        text.includes("renouveler ma cle de synchronisation"));

    return directConnectForm || pilotPanel;
  });

  if (matches.length === 0) return null;

  // Si plusieurs sections correspondent, on prend la plus petite :
  // c'est le formulaire lui-même, jamais le conteneur global de la page.
  matches.sort(
    (a, b) => normalizeText(a.textContent).length - normalizeText(b.textContent).length
  );

  return matches[0] ?? null;
}

function setPlatformInsidePanel(panel: HTMLElement, platform: "MT4" | "MT5") {
  // Essaie les select natifs.
  const selects = Array.from(panel.querySelectorAll<HTMLSelectElement>("select"));
  const platformSelect = selects.find((select) =>
    Array.from(select.options).some((option) =>
      normalizeText(option.textContent).includes(platform.toLowerCase())
    )
  );

  if (platformSelect) {
    const option = Array.from(platformSelect.options).find((item) =>
      normalizeText(item.textContent).includes(platform.toLowerCase())
    );
    if (option) {
      platformSelect.value = option.value;
      platformSelect.dispatchEvent(new Event("input", { bubbles: true }));
      platformSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  }

  // Fallback pour les composants custom : clique sur le contrôle proche du label Plateforme.
  const candidates = Array.from(panel.querySelectorAll<HTMLElement>("button, [role='combobox'], input"));
  const candidate = candidates.find((el) => {
    const parentText = normalizeText(el.parentElement?.textContent);
    const ownText = normalizeText(el.textContent || (el as HTMLInputElement).value);
    return parentText.includes("plateforme") && (ownText.includes("mt4") || ownText.includes("mt5"));
  });

  if (candidate) {
    candidate.click();
    window.setTimeout(() => {
      const options = Array.from(document.querySelectorAll<HTMLElement>("[role='option'], button, li, div"));
      const option = options.find((el) => normalizeText(el.textContent) === platform.toLowerCase());
      option?.click();
    }, 80);
  }
}


export default function ComptesMotionLayout({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
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

  function revealMetaTrader(platform: "MT4" | "MT5") {
    setChoice(platform === "MT5" ? "mt5" : "mt4");
    setChooserOpen(false);

    window.setTimeout(() => {
      const panel = pilotPanel.current || findPilotPanel();
      if (!panel) return;

      pilotPanel.current = panel;
      panel.dataset.ipPilotOpened = "1";
      panel.classList.remove("ip-mt5-pilot-hidden");
      panel.classList.add("ip-mt5-pilot-reveal");
      setPlatformInsidePanel(panel, platform);
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });

      window.setTimeout(() => panel.classList.remove("ip-mt5-pilot-reveal"), 850);
    }, 80);
  }

  function chooseMt5() {
    revealMetaTrader("MT5");
  }

  function chooseMt4() {
    revealMetaTrader("MT4");
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
            className="fixed inset-0 z-[1000000] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
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
              className="relative max-h-[92dvh] w-full max-w-[860px] overflow-y-auto rounded-t-[26px] border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-[0_30px_120px_rgba(0,0,0,.62)] sm:rounded-[28px]"
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

              <div className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0b0d0b]/95 px-4 py-4 backdrop-blur-xl sm:relative sm:bg-transparent sm:px-6 sm:py-5 md:px-8">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">
                      <Sparkles size={12} />
                      Connexion InvestPro
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-white sm:mt-4 sm:text-xl md:text-2xl">
                      Ajouter un <span className="text-[color:var(--gold)]">compte</span>
                    </h2>
                    <p className="mt-1.5 max-w-xl text-[11px] leading-4 text-white/45 sm:mt-2 sm:text-xs sm:leading-5 md:text-sm">
                      Choisis comment tu souhaites ajouter ton compte de trading.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setChooserOpen(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white sm:h-10 sm:w-10"
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>

              <div className="relative z-10 p-3.5 sm:p-5 md:p-7">
                <div className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-3">
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
                    text="Synchronisation automatique du compte, de la balance et de l’historique."
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

        @media (max-width: 639px) {
          .accounts-motion-scope [role="dialog"] {
            scrollbar-width: none;
          }
          .accounts-motion-scope [role="dialog"]::-webkit-scrollbar {
            display: none;
          }
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
  eyebrow,
  highlighted = false,
}: {
  title: string;
  subtitle: string;
  text: string;
  icon: ReactNode;
  onClick: () => void;
  eyebrow?: string;
  highlighted?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -7, scale: 1.012 }}
      whileTap={{ scale: 0.985 }}
      className={[
        "group relative min-h-0 overflow-hidden rounded-[18px] border p-4 text-left sm:rounded-[22px] sm:p-5 md:min-h-[250px]",
        highlighted
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.08] bg-black/25 hover:border-[color:var(--gold-border)]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute right-[-55px] top-[-55px] h-[150px] w-[150px] rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[55px] transition-opacity group-hover:opacity-[0.12]" />

      <div className="relative z-10 grid grid-cols-[44px_1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:h-full sm:flex-col sm:items-stretch sm:gap-0">
        <div className="contents sm:flex sm:items-start sm:justify-between sm:gap-3">
          <div className="row-span-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)] shadow-[0_0_30px_rgba(255,190,60,.05)] sm:h-12 sm:w-12 sm:rounded-2xl">
            {icon}
          </div>

          {eyebrow ? (
            <span className="rounded-full border border-[color:var(--gold-border)] bg-black/25 px-2.5 py-1 text-[8px] font-bold tracking-[0.1em] text-[color:var(--gold)]">
              {eyebrow}
            </span>
          ) : null}
        </div>

        <div className="col-start-2 mt-0 text-[8px] font-bold uppercase tracking-[0.16em] text-[color:var(--gold)] sm:mt-7 sm:text-[9px] sm:tracking-[0.18em]">{subtitle}</div>
        <div className="col-start-2 mt-0 text-sm font-semibold text-white sm:mt-1 sm:text-base">{title}</div>
        <p className="col-start-2 mt-0 line-clamp-2 text-[10px] leading-4 text-white/45 sm:mt-3 sm:flex-1 sm:text-[11px] sm:leading-5">{text}</p>

        <div className="col-start-3 row-span-4 row-start-1 mt-0 flex items-center gap-1 text-[11px] font-semibold text-white transition-colors group-hover:text-[color:var(--gold)] sm:mt-5 sm:gap-2 sm:text-xs">
          {subtitle === "MANUEL" ? "Ajouter" : "Connecter"}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}
