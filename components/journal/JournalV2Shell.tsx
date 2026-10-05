"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Edit3,
  Eye,
  FileText,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";

type DrawerTrade = {
  symbol: string;
  direction: string;
  date: string;
  time: string;
  status: string;
  source: string;
  pnl: string;
  rInfo: string;
  account: string;
  broker: string;
  raw: string[];
  row: HTMLElement;
};

function cleanLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTradeRow(row: HTMLElement): DrawerTrade {
  const lines = cleanLines(row.innerText || "");
  const symbol = lines[0] || "Trade";
  const direction =
    lines.find((line) => /^(ACHAT|VENTE|BUY|SELL)$/i.test(line)) || "";
  const status =
    lines.find((line) => /^(WIN|LOSS|BE|OUVERT|ANNULÉ)$/i.test(line)) || "";
  const source =
    lines.find((line) => /^(Import|Manuel|ProjectX|MT4|MT5)/i.test(line)) || "";
  const pnl =
    lines.find((line) => /[-+]?\d[\d\s.,]*\s*(\$US|USD|EUR|€|\$)$/i.test(line)) ||
    lines.find((line) => /[-+]?\d[\d\s.,]*\s*(\$US|USD|EUR|€|\$)/i.test(line)) ||
    "—";
  const rInfo =
    lines.find((line) => /\bR\b|risque initial|R et risque/i.test(line)) || "—";
  const date =
    lines.find((line) => /\b\d{1,2}\s+[a-zéû.]+\s+\d{4}\b/i.test(line)) ||
    lines.find((line) => /\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(line)) ||
    "—";
  const time = lines.find((line) => /^\d{1,2}:\d{2}$/.test(line)) || "—";

  const account =
    lines.find((line) => /^(MT4|MT5|ProjectX|Tradovate)\s*[·:\-]/i.test(line)) ||
    lines.find((line) => /^(MT4|MT5)\s*·?\s*\d+/i.test(line)) ||
    "—";

  const accountIndex = account !== "—" ? lines.indexOf(account) : -1;
  const broker = accountIndex >= 0 && lines[accountIndex + 1] ? lines[accountIndex + 1] : "—";

  return {
    symbol,
    direction,
    date,
    time,
    status,
    source,
    pnl,
    rInfo,
    account,
    broker,
    raw: lines,
    row,
  };
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1.5 break-words text-sm font-semibold text-white">{value || "—"}</div>
    </div>
  );
}

export default function JournalV2Shell({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<DrawerTrade | null>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest(
          "button, a, input, select, textarea, label, [role='button'], [data-journal-v2-drawer]"
        )
      ) {
        return;
      }

      const row = target.closest(".divide-y > div") as HTMLElement | null;
      if (!row) return;

      const historySection = row.closest("section");
      if (!historySection) return;

      const heading = historySection.querySelector("h2")?.textContent?.trim().toLowerCase();
      if (heading && heading !== "historique") return;

      setSelected(parseTradeRow(row));
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    if (window.innerWidth < 1024) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);

  const positive = useMemo(() => {
    if (!selected) return false;
    return selected.status.toUpperCase() === "WIN" || selected.pnl.trim().startsWith("+");
  }, [selected]);

  function clickExistingAction(title: string) {
    if (!selected) return;
    const button = Array.from(selected.row.querySelectorAll("button")).find(
      (node) => node.getAttribute("title")?.toLowerCase() === title.toLowerCase()
    ) as HTMLButtonElement | undefined;
    setSelected(null);
    window.setTimeout(() => button?.click(), 120);
  }

  return (
    <div data-journal-v2 className="journal-v2-root">
      <div className="journal-v2-glow journal-v2-glow-a" />
      <div className="journal-v2-glow journal-v2-glow-b" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="journal-v2-content"
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {selected ? (
          <>
            <motion.button
              type="button"
              aria-label="Fermer le détail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="fixed inset-0 z-[999980] cursor-default bg-black/55 backdrop-blur-[2px] lg:bg-black/25"
            />

            <motion.aside
              data-journal-v2-drawer
              initial={{ x: "105%", opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "105%", opacity: 0.5 }}
              transition={{ type: "spring", stiffness: 330, damping: 34, mass: 0.9 }}
              className="fixed bottom-0 right-0 top-0 z-[999990] flex w-full flex-col border-l border-[color:var(--gold-border)] bg-[#0a0a0b]/[.985] shadow-[-30px_0_90px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:w-[440px] xl:w-[480px]"
            >
              <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-5 sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-[-0.03em] text-white">{selected.symbol}</h2>
                    {selected.direction ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${
                          /achat|buy/i.test(selected.direction)
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/20 bg-red-500/10 text-red-400"
                        }`}
                      >
                        {/achat|buy/i.test(selected.direction) ? (
                          <ArrowUpRight size={11} />
                        ) : (
                          <ArrowDownRight size={11} />
                        )}
                        {selected.direction}
                      </span>
                    ) : null}
                    {selected.status ? (
                      <span className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2 py-1 text-[9px] font-bold text-[color:var(--gold)]">
                        {selected.status}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                    <CalendarDays size={13} />
                    <span>{selected.date}</span>
                    <span>·</span>
                    <span>{selected.time}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/55 hover:border-[color:var(--gold-border)] hover:text-white"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Résultat</div>
                      <div
                        className={`mt-1 text-2xl font-bold tracking-[-0.03em] ${
                          positive ? "text-emerald-400" : selected.pnl.startsWith("-") ? "text-red-400" : "text-white"
                        }`}
                      >
                        {selected.pnl}
                      </div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)]">
                      <BarChart3 size={20} />
                    </div>
                  </div>
                  <div className="mt-3 text-xs leading-5 text-white/45">{selected.rInfo}</div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InfoCard label="Compte" value={selected.account} />
                  <InfoCard label="Broker / serveur" value={selected.broker} />
                  <InfoCard label="Source" value={selected.source || "Journal InvestPro"} />
                  <InfoCard label="Sens" value={selected.direction || "—"} />
                </div>

                <div className="mt-5 rounded-[22px] border border-white/[0.07] bg-white/[0.018] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ShieldCheck size={16} className="text-[color:var(--gold)]" />
                    Informations du journal
                  </div>
                  <p className="mt-3 text-xs leading-6 text-white/45">
                    Ce panneau reprend les informations disponibles dans ton historique actuel. Pour les trades importés MT4/MT5, le stop initial et le R peuvent rester indisponibles lorsque la plateforme ne permet pas de les reconstruire de façon fiable.
                  </p>
                </div>

                {selected.raw.length ? (
                  <div className="mt-5 rounded-[22px] border border-white/[0.07] bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <FileText size={16} className="text-[color:var(--gold)]" />
                      Détails disponibles
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selected.raw.slice(0, 14).map((line, index) => (
                        <span
                          key={`${line}-${index}`}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-white/55"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-white/[0.07] bg-black/35 p-4 sm:px-6">
                <div className="grid grid-cols-2 gap-3">
                  {selected.row.querySelector('button[title="Voir le graphique"]') ? (
                    <button
                      type="button"
                      onClick={() => clickExistingAction("Voir le graphique")}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
                    >
                      <Eye size={14} />
                      Graphique
                    </button>
                  ) : (
                    <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 text-xs text-white/25">
                      <WalletCards size={14} />
                      Pas de capture
                    </div>
                  )}

                  {selected.row.querySelector('button[title="Modifier"]') ? (
                    <button
                      type="button"
                      onClick={() => clickExistingAction("Modifier")}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-bold text-black hover:brightness-105"
                    >
                      <Edit3 size={14} />
                      Modifier
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="h-11 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-bold text-black"
                    >
                      Fermer
                    </button>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <style jsx global>{`
        .journal-v2-root { position: relative; isolation: isolate; }
        .journal-v2-content { position: relative; z-index: 2; }
        .journal-v2-glow { position: fixed; z-index: 0; pointer-events: none; border-radius: 999px; filter: blur(90px); opacity: .11; }
        .journal-v2-glow-a { width: 360px; height: 360px; top: 90px; right: 7vw; background: var(--gold, #d8af47); }
        .journal-v2-glow-b { width: 260px; height: 260px; bottom: 12vh; left: 18vw; background: var(--gold, #d8af47); opacity: .06; }

        [data-journal-v2] .journal-v2-content > div > div:first-child h1 { letter-spacing: -.035em; font-size: clamp(1.55rem, 2.4vw, 2.15rem); }
        [data-journal-v2] section { box-shadow: 0 16px 46px rgba(0,0,0,.18); transition: border-color .22s ease, transform .22s ease, box-shadow .22s ease; }
        [data-journal-v2] section:hover { border-color: rgba(216,175,71,.20); }
        [data-journal-v2] input, [data-journal-v2] select, [data-journal-v2] textarea { transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; }
        [data-journal-v2] input:focus, [data-journal-v2] select:focus, [data-journal-v2] textarea:focus { box-shadow: 0 0 0 3px rgba(216,175,71,.07); }

        [data-journal-v2] .divide-y > div { position: relative; cursor: pointer; }
        [data-journal-v2] .divide-y > div::before { content: ""; position: absolute; left: 0; top: 11px; bottom: 11px; width: 2px; border-radius: 99px; background: transparent; transition: background .18s ease; }
        [data-journal-v2] .divide-y > div:hover::before { background: var(--gold, #d8af47); }
        [data-journal-v2] .divide-y > div:hover { background: linear-gradient(90deg, rgba(216,175,71,.045), rgba(255,255,255,.012)); }
        [data-journal-v2] .divide-y > div:hover::after { content: "Voir le détail"; position: absolute; right: 86px; top: 50%; transform: translateY(-50%); border: 1px solid rgba(216,175,71,.18); background: rgba(216,175,71,.07); color: var(--gold, #d8af47); border-radius: 9px; padding: 5px 8px; font-size: 9px; font-weight: 700; pointer-events: none; }

        [data-journal-v2] button { transition: transform .16s ease, filter .16s ease, border-color .16s ease, background .16s ease; }
        [data-journal-v2] button:active { transform: scale(.975); }

        @media (max-width: 1100px) {
          [data-journal-v2] .divide-y > div:hover::after { display: none; }
        }

        @media (max-width: 767px) {
          .journal-v2-glow-a { width: 230px; height: 230px; right: -90px; top: 120px; }
          [data-journal-v2] .journal-v2-content > div { padding-bottom: 92px; }
          [data-journal-v2] section { border-radius: 18px !important; }
          [data-journal-v2] .divide-y > div { margin: 10px; border: 1px solid rgba(255,255,255,.065); border-radius: 16px; background: rgba(0,0,0,.18); padding: 14px !important; }
          [data-journal-v2] .divide-y > div + div { border-top-width: 1px !important; }
          [data-journal-v2] .divide-y > div::before { top: 14px; bottom: 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          [data-journal-v2] *, [data-journal-v2] *::before, [data-journal-v2] *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
        }
      `}</style>
    </div>
  );
}
