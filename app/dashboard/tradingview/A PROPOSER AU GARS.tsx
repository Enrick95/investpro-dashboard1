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
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return watchlist;
    return watchlist.filter((s) => s.toUpperCase().includes(q));
  }, [query, watchlist]);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      symbol: symbol || "BTCUSD",
      interval: tf, // "15" / "60" / "D" etc
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

  // Fullscreen handling (Escape key)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Optional: ensure symbol is uppercase (TradingView vibe)
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

  return (
    <div className="min-h-[calc(100vh-0px)] w-full">
      <div
        ref={containerRef}
        className={cx(
          "relative w-full",
          isFullscreen
            ? "fixed inset-0 z-[9999] bg-[#0b0f1a] p-3 md:p-4"
            : "p-4 md:p-6"
        )}
      >
        {/* Header */}
        <div className="mb-3 flex flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 ring-1 ring-white/10" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-white">
                TradingView
              </div>
              <div className="text-xs text-white/60">
                Graphique + watchlist (Ctrl/⌘ + K)
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            {/* Symbol input */}
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="text-xs font-medium text-white/60">SYMBOL</div>
              <input
                ref={inputRef}
                value={symbol}
                onChange={(e) => setSymbolSafe(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addToWatchlist(symbol);
                }}
                placeholder="Ex: BTCUSD"
                className="w-[170px] bg-transparent text-sm text-white outline-none placeholder:text-white/30 md:w-[220px]"
              />
              <button
                className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                onClick={() => addToWatchlist(symbol)}
                title="Ajouter à la watchlist"
              >
                +
              </button>
            </div>

            {/* Timeframes */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2">
              {TIMEFRAMES.map((t) => {
                const active = tf === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setTf(t.value)}
                    className={cx(
                      "rounded-xl px-3 py-1.5 text-xs font-semibold transition",
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

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFullscreen((v) => !v)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                {isFullscreen ? "Quitter plein écran" : "Plein écran"}
              </button>

              <button
                onClick={() => {
                  setSymbol("BTCUSD");
                  setTf("15");
                  setQuery("");
                  setWatchlist(DEFAULT_WATCHLIST);
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
                title="Reset"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[300px_1fr] md:gap-4">
          {/* Watchlist */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-3 md:p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Watchlist</div>
                <div className="text-xs text-white/50">
                  Clique pour charger le symbole
                </div>
              </div>
              <div className="text-xs text-white/50">
                {watchlist.length} items
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>

            <div className="max-h-[360px] overflow-auto pr-1 md:max-h-[520px]">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-sm text-white/60">
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
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        )}
                      >
                        <button
                          className="flex-1 text-left"
                          onClick={() => setSymbol(s)}
                        >
                          <div className="text-sm font-semibold text-white">
                            {s}
                          </div>
                          <div className="text-[11px] text-white/50">
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

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/60">
              Astuce: <span className="text-white/80">Entrée</span> dans le champ
              symbol = ajoute à la watchlist.
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 md:px-2">
              <div className="flex items-center gap-2">
                <div className="rounded-2xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
                  {symbol}
                </div>
                <div className="text-xs text-white/50">
                  {tf === "D" ? "1D" : `${tf} minutes`}
                </div>
              </div>
              <div className="text-xs text-white/50">
                Embed TradingView (dark)
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
              <iframe
                title="TradingView"
                src={src}
                className={cx(
                  "w-full border-0",
                  isFullscreen
                    ? "h-[calc(100vh-110px)]"
                    : "h-[680px] md:h-[760px]"
                )}
                loading="lazy"
                allowFullScreen
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-white/40 md:px-2">
              <span>
                Si tu veux le même rendu exact que TradingView (widgets + DOM),
                il faut passer par leur script “Advanced Charting Library” (pas
                juste l’iframe).
              </span>
              <span className="text-white/50">
                Symbol: <span className="text-white/70">{symbol}</span> • TF:{" "}
                <span className="text-white/70">
                  {tf === "D" ? "1D" : tf}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Fullscreen hint */}
        {isFullscreen && (
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 mx-auto w-fit rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/70">
            Appuie sur <span className="text-white font-semibold">Esc</span> pour
            quitter le plein écran
          </div>
        )}
      </div>
    </div>
  );
}
