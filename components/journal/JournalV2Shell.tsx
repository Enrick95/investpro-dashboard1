"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Edit3,
  Eye,
  FileText,
  Filter,
  RefreshCw,
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


function parseMoney(value: string) {
  const cleaned = value
    .replace(/\s/g, "")
    .replace(/\$US|USD|EUR|€/gi, "")
    .replace(/\$/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/[^0-9+\-.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function moneyUnit(value: string) {
  if (/\$US/i.test(value)) return "$US";
  if (/USD/i.test(value)) return "USD";
  if (/EUR|€/i.test(value)) return "€";
  if (/\$/i.test(value)) return "$";
  return "";
}

function formatMoneyValue(value: number, unit: string, sign = false) {
  const prefix = sign && value > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}${unit ? ` ${unit}` : ""}`;
}

const frenchMonths: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

const shortFrenchMonths: Record<string, number> = {
  janv: 0,
  jan: 0,
  fevr: 1,
  févr: 1,
  fev: 1,
  fév: 1,
  mars: 2,
  avr: 3,
  mai: 4,
  juin: 5,
  juil: 6,
  aout: 7,
  août: 7,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
  déc: 11,
};

function dateKeyFromRowText(value: string) {
  const clean = value.toLowerCase().replace(/\./g, "").trim();
  const match = clean.match(/(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthName = match[2];
  const month = frenchMonths[monthName] ?? shortFrenchMonths[monthName];
  const year = Number(match[3]);
  if (!Number.isFinite(day) || month == null || !Number.isFinite(year)) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function labelFromDateKey(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type QuickStats = {
  profitFactor: string;
  avgWin: string;
  avgLoss: string;
  visible: number;
};

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
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const [accountFilter, setAccountFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [symbolFilter, setSymbolFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quickStats, setQuickStats] = useState<QuickStats>({
    profitFactor: "—",
    avgWin: "—",
    avgLoss: "—",
    visible: 0,
  });



  useEffect(() => {
    let observer: MutationObserver | null = null;
    let timer = 0;

    function setupHostsAndOptions() {
      const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[];
      const filterSection = sections.find((section) => {
        const text = section.innerText || "";
        return /Tous les résultats/i.test(text) && /(Achat|Vente)/i.test(text);
      });

      if (filterSection) {
        let host = document.getElementById("journal-v2-tools-host");
        if (!host) {
          host = document.createElement("div");
          host.id = "journal-v2-tools-host";
          host.setAttribute("data-journal-v2-tools", "true");
          filterSection.insertAdjacentElement("afterend", host);
        }
        setToolsHost(host);
      }

      const historySection = sections.find(
        (section) => section.querySelector("h2")?.textContent?.trim().toLowerCase() === "historique"
      );
      const rows = historySection
        ? (Array.from(historySection.querySelectorAll(".divide-y > div")) as HTMLElement[])
        : [];
      const parsed = rows.map(parseTradeRow);
      setAccounts(
        Array.from(new Set(parsed.map((trade) => trade.account).filter((value) => value && value !== "—"))).sort()
      );
      setSources(
        Array.from(new Set(parsed.map((trade) => trade.source).filter((value) => value && value !== "—"))).sort()
      );
      setSymbols(Array.from(new Set(parsed.map((trade) => trade.symbol).filter(Boolean))).sort());
    }

    setupHostsAndOptions();
    observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(setupHostsAndOptions, 90);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      document.getElementById("journal-v2-tools-host")?.remove();
    };
  }, []);

  useEffect(() => {
    function applyFilters() {
      const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[];
      const historySection = sections.find(
        (section) => section.querySelector("h2")?.textContent?.trim().toLowerCase() === "historique"
      );
      if (!historySection) return;

      const rows = Array.from(historySection.querySelectorAll(".divide-y > div")) as HTMLElement[];
      const visibleTrades: DrawerTrade[] = [];

      rows.forEach((row) => {
        const trade = parseTradeRow(row);
        const rowDateKey = dateKeyFromRowText(trade.date);
        const accountOk = accountFilter === "all" || trade.account === accountFilter;
        const sourceOk = sourceFilter === "all" || trade.source === sourceFilter;
        const symbolOk = symbolFilter === "all" || trade.symbol === symbolFilter;
        const dateOk = !dateFilter || rowDateKey === dateFilter;
        const show = accountOk && sourceOk && symbolOk && dateOk;
        row.style.display = show ? "" : "none";
        if (show) visibleTrades.push(trade);
      });

      const amounts = visibleTrades
        .map((trade) => ({ value: parseMoney(trade.pnl), unit: moneyUnit(trade.pnl) }))
        .filter((item): item is { value: number; unit: string } => item.value !== null);
      const wins = amounts.filter((item) => item.value > 0);
      const losses = amounts.filter((item) => item.value < 0);
      const grossProfit = wins.reduce((sum, item) => sum + item.value, 0);
      const grossLoss = Math.abs(losses.reduce((sum, item) => sum + item.value, 0));
      const unit = amounts.find((item) => item.unit)?.unit || "";
      const factor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;
      const avgWin = wins.length ? grossProfit / wins.length : null;
      const avgLoss = losses.length ? grossLoss / losses.length : null;

      setQuickStats({
        profitFactor: factor == null ? "—" : Number.isFinite(factor) ? factor.toFixed(2) : "∞",
        avgWin: avgWin == null ? "—" : formatMoneyValue(avgWin, unit, true),
        avgLoss: avgLoss == null ? "—" : `-${formatMoneyValue(avgLoss, unit)}`,
        visible: visibleTrades.length,
      });
    }

    applyFilters();
    const observer = new MutationObserver(() => window.setTimeout(applyFilters, 50));
    const root = document.querySelector("[data-journal-v2]");
    if (root) observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [accountFilter, sourceFilter, symbolFilter, dateFilter]);

  useEffect(() => {
    function onCalendarClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[];
      const calendarSection = sections.find((section) => /Calendrier de performance/i.test(section.innerText || ""));
      if (!calendarSection || !calendarSection.contains(target)) return;

      const monthText = Array.from(calendarSection.querySelectorAll("button, div, span"))
        .map((node) => (node.textContent || "").trim().toLowerCase())
        .find((text) => /^(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4}$/.test(text));
      if (!monthText) return;
      const monthMatch = monthText.match(/^([a-zà-ÿ]+)\s+(\d{4})$/i);
      if (!monthMatch) return;
      const month = frenchMonths[monthMatch[1]];
      const year = Number(monthMatch[2]);
      if (month == null || !Number.isFinite(year)) return;

      let node: HTMLElement | null = target;
      let cell: HTMLElement | null = null;
      while (node && node !== calendarSection) {
        const lines = cleanLines(node.innerText || "");
        if (lines.length >= 1 && lines.length <= 4 && /^\d{1,2}$/.test(lines[0])) {
          cell = node;
        }
        node = node.parentElement;
      }
      if (!cell) return;
      const day = Number(cleanLines(cell.innerText || "")[0]);
      if (!day || day > 31) return;

      calendarSection.querySelectorAll("[data-journal-v2-selected-day]").forEach((el) =>
        el.removeAttribute("data-journal-v2-selected-day")
      );
      cell.setAttribute("data-journal-v2-selected-day", "true");
      setDateFilter(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
      window.setTimeout(() => {
        const history = sections.find(
          (section) => section.querySelector("h2")?.textContent?.trim().toLowerCase() === "historique"
        );
        history?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }

    document.addEventListener("click", onCalendarClick);
    return () => document.removeEventListener("click", onCalendarClick);
  }, []);

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


      {toolsHost
        ? createPortal(
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="journal-v2-tools mt-5 rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Profit Factor</div>
                  <div className="mt-1 text-xl font-bold text-[color:var(--gold)]">{quickStats.profitFactor}</div>
                </div>
                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Gain moyen</div>
                  <div className="mt-1 text-xl font-bold text-emerald-400">{quickStats.avgWin}</div>
                </div>
                <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.035] p-4">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Perte moyenne</div>
                  <div className="mt-1 text-xl font-bold text-red-400">{quickStats.avgLoss}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-white">
                <Filter size={15} className="text-[color:var(--gold)]" />
                Filtres avancés
                <span className="ml-auto text-[10px] font-normal text-white/35">{quickStats.visible} trade{quickStats.visible !== 1 ? "s" : ""} affiché{quickStats.visible !== 1 ? "s" : ""}</span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
                <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="journal-v2-select">
                  <option value="all">Tous les comptes</option>
                  {accounts.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="journal-v2-select">
                  <option value="all">Toutes les sources</option>
                  {sources.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} className="journal-v2-select">
                  <option value="all">Tous les actifs</option>
                  {symbols.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setAccountFilter("all");
                    setSourceFilter("all");
                    setSymbolFilter("all");
                    setDateFilter(null);
                    document.querySelectorAll("[data-journal-v2-selected-day]").forEach((el) =>
                      el.removeAttribute("data-journal-v2-selected-day")
                    );
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-4 text-xs font-semibold text-white/55 hover:border-[color:var(--gold-border)] hover:text-white"
                >
                  <RefreshCw size={13} /> Réinitialiser
                </button>
              </div>

              {dateFilter ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-2.5 text-xs text-white/65">
                  <CalendarDays size={14} className="text-[color:var(--gold)]" />
                  Journée sélectionnée : <strong className="text-white">{labelFromDateKey(dateFilter)}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setDateFilter(null);
                      document.querySelectorAll("[data-journal-v2-selected-day]").forEach((el) =>
                        el.removeAttribute("data-journal-v2-selected-day")
                      );
                    }}
                    className="ml-auto rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1.5 text-[10px] font-semibold text-white/55 hover:text-white"
                  >
                    Effacer la journée
                  </button>
                </div>
              ) : (
                <div className="mt-3 text-[10px] text-white/30">Astuce : clique sur un jour du calendrier pour afficher uniquement les trades de cette journée.</div>
              )}
            </motion.section>,
            toolsHost
          )
        : null}

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

        .journal-v2-select { height: 44px; width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.20); padding: 0 12px; color: white; font-size: 12px; outline: none; }
        .journal-v2-select:focus { border-color: rgba(216,175,71,.35); box-shadow: 0 0 0 3px rgba(216,175,71,.06); }
        [data-journal-v2-selected-day="true"] { position: relative; z-index: 2; outline: 1px solid var(--gold, #d8af47) !important; outline-offset: -2px; box-shadow: inset 0 0 0 1px rgba(216,175,71,.30), 0 0 24px rgba(216,175,71,.10) !important; }
        [data-journal-v2] section:has(h2) { scroll-margin-top: 90px; }

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
