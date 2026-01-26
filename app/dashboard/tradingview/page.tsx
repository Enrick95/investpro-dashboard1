"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tf = { label: string; value: string };

const TIMEFRAMES: Tf[] = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1D", value: "D" },
];

const DEFAULT_WATCHLIST = [
  "BTCUSD",
  "ETHUSD",
  "XAUUSD",
  "EURUSD",
  "NAS100",
  "US30",
  "SPX",
  "GBPUSD",
  "USDJPY",
];

function cx(...c: Array<string | false | undefined | null>) {
  return c.filter(Boolean).join(" ");
}

export default function TradingViewPage() {
  const [symbol, setSymbol] = useState("BTCUSD");
  const [tf, setTf] = useState<string>("15");
  const [query, setQuery] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return watchlist;
    return watchlist.filter((s) => s.toUpperCase().includes(q));
  }, [query, watchlist]);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      symbol: symbol || "BTCUSD",
      interval: tf,
      hideideas: "1",
      theme: "dark",
      style: "1",
      locale: "fr",
      toolbarbg: "rgba(0,0,0,0)",
      enable_publishing: "0",
      hide_side_toolbar: "0",
      allow_symbol_change: "0",
      saveimage: "0",
      calendar: "1",
      studies: "",
    });

    return "https://s.tradingview.com/widgetembed/?" + params.toString();
  }, [symbol, tf]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function setSymbolSafe(v: string) {
    setSymbol(v.toUpperCase().replace(/\s+/g, ""));
  }

  function addToWatchlist(v: string) {
    const s = v.toUpperCase().replace(/\s+/g, "");
    if (!s) return;
    setWatchlist((prev) => (prev.includes(s) ? prev : [s, ...prev]));
  }

  function removeFromWatchlist(s: string) {
    setWatchlist((prev) => prev.filter((x) => x !== s));
    if (symbol === s) setSymbol("BTCUSD");
  }

  function onReset() {
    setSymbol("BTCUSD");
    setTf("15");
    setQuery("");
    setWatchlist(DEFAULT_WATCHLIST);
  }

  return (
    <div className="relative min-h-screen w-full text-white">
      {/* Fond neutre (écrase les backgrounds de layout) */}
      <div className="fixed inset-0 -z-10 bg-[#05060A]" />

      <div className="mx-auto max-w-[1400px] px-3 py-4 md:px-4">
        {/* ===== Ligne 1 : Horaires marchés ===== */}
        <div className="mb-3 rounded-3xl border border-white/10 bg-[#070910] px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-semibold">
              Horaires marché — Asia / London / New York
            </div>
            <MarketSessionsInline />
          </div>
        </div>

        {/* ===== Ligne 2 : Reset + Symbol + Timeframes ===== */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_1fr]">
          {/* Reset à gauche */}
          <button
            onClick={onReset}
            className="h-[52px] rounded-3xl border border-white/10 bg-[#070910] px-4 text-sm font-semibold hover:bg-white/5"
          >
            Reset
          </button>

          {/* Symbol au centre */}
          <div className="flex h-[52px] items-center gap-3 rounded-3xl border border-white/10 bg-[#070910] px-4">
            <div className="text-xs font-semibold text-white/60">SYMBOL</div>
            <input
              ref={inputRef}
              value={symbol}
              onChange={(e) => setSymbolSafe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addToWatchlist(symbol);
              }}
              placeholder="Ex: XAUUSD"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
            <button
              className="rounded-2xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
              onClick={() => addToWatchlist(symbol)}
              title="Ajouter à la watchlist"
            >
              +
            </button>
          </div>

          {/* Timeframes à droite */}
          <div className="flex h-[52px] items-center gap-2 overflow-x-auto rounded-3xl border border-white/10 bg-[#070910] px-3">
            {TIMEFRAMES.map((t) => {
              const active = tf === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTf(t.value)}
                  className={cx(
                    "shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/15"
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== Corps : Watchlist gauche + Chart ===== */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
          {/* Watchlist (hauteur full) */}
          <div className="rounded-3xl border border-white/10 bg-[#070910] p-3">
            <div className="mb-2">
              <div className="text-sm font-semibold">Whatlist</div>
              <div className="text-[11px] text-white/50">
                Clique pour charger
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-white/10 bg-[#0A0C12] px-3 py-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>

            {/* prend la hauteur dispo */}
            <div className="max-h-[calc(100vh-260px)] overflow-auto pr-1">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                  Aucun résultat.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((s) => {
                    const active = s === symbol;
                    return (
                      <li
                        key={s}
                        className={cx(
                          "group flex items-center justify-between rounded-2xl border px-3 py-2 transition",
                          active
                            ? "border-white/20 bg-white/10"
                            : "border-white/10 bg-black/20 hover:bg-black/30"
                        )}
                      >
                        <button
                          className="flex-1 text-left"
                          onClick={() => setSymbol(s)}
                        >
                          <div className="text-sm font-semibold">{s}</div>
                          <div className="text-[11px] text-white/45">
                            TF: {tf === "D" ? "1D" : `${tf}m`}
                          </div>
                        </button>

                        <button
                          onClick={() => removeFromWatchlist(s)}
                          className="ml-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 opacity-0 hover:bg-white/10 group-hover:opacity-100"
                          title="Retirer"
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-[11px] text-white/60">
              Entrée dans SYMBOL = ajoute à la watchlist. (Ctrl/⌘ + K)
            </div>
          </div>

          {/* Chart (très gros) */}
          <div className="rounded-3xl border border-white/10 bg-[#070910] p-2">
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="rounded-2xl bg-white/10 px-3 py-1.5 text-xs font-semibold">
                  {symbol}
                </div>
                <div className="text-xs text-white/50">
                  {tf === "D" ? "1D" : `${tf} minutes`}
                </div>
              </div>
              <div className="text-xs text-white/50">TradingView</div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black">
              <iframe
                title="TradingView"
                src={src}
                className="h-[78vh] min-h-[640px] w-full border-0"
                loading="lazy"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   SESSIONS INLINE (simple, propre)
   Week-end : Ven 23:00 -> Lun 00:00 (Paris)
=========================== */

function MarketSessionsInline() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const parisNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  const day = parisNow.getDay(); // 0 dim
  const hour = parisNow.getHours();
  const minute = parisNow.getMinutes();
  const totalMin = hour * 60 + minute;

  const isWeekend =
    (day === 5 && totalMin >= 23 * 60) || day === 6 || day === 0;

  // Heures Paris (exemple)
  const sessions = [
    { name: "Asia", open: 2, close: 11 },
    { name: "London", open: 10, close: 19 },
    { name: "New York", open: 15, close: 0 }, // traverse minuit
  ] as const;

  function isActive(openHour: number, closeHour: number) {
    if (isWeekend) return false;
    const o = openHour * 60;
    const c = closeHour * 60;

    if (openHour > closeHour) return totalMin >= o || totalMin < c;
    return totalMin >= o && totalMin < c;
  }

  function fmt(h: number) {
    const d = new Date(Date.UTC(2024, 0, 1, h, 0, 0));
    return d.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isWeekend && (
        <span className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300">
          WEEKEND — fermé (Ven 23:00 → Lun 00:00)
        </span>
      )}

      {sessions.map((s) => {
        const active = isActive(s.open, s.close);
        return (
          <span
            key={s.name}
            className={cx(
              "rounded-2xl border px-3 py-1.5 text-xs font-semibold",
              active
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-white/10 bg-[#0A0C12] text-white/70"
            )}
            title={`${s.name} ${fmt(s.open)}–${fmt(s.close)} (Paris)`}
          >
            {s.name} {fmt(s.open)}–{fmt(s.close)} • {active ? "ACTIVE" : "CLOSED"}
          </span>
        );
      })}
    </div>
  );
}
