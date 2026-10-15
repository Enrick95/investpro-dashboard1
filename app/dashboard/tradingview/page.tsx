"use client";
import { useLocale } from "@/components/i18n/LocaleProvider";
import MarketWidget from "@/components/markets/MarketWidget";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import GoldSelect from "../../../components/ui/GoldSelect";
import { pushNotif } from "../../../lib/notifyStore";

type Tf = { label: string; value: string };

const TIMEFRAMES: Tf[] = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1D", value: "D" },
  { label: "W", value: "W" },
  { label: "M", value: "M" },
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

function TradingViewPage() {
  const { t: translate, locale } = useLocale();

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
      theme: "dark", // chart = indépendant
      style: "1",
      locale,
      toolbarbg: "rgba(0,0,0,0)",
      enable_publishing: "0",
      hide_side_toolbar: "0",
      allow_symbol_change: "0",
      saveimage: "0",
      calendar: "1",
      studies: "",
    });

    return "https://s.tradingview.com/widgetembed/?" + params.toString();
  }, [symbol, tf, locale]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        pushNotif({
          kind: "info",
          title: translate("Recherche symbole"),
          message: translate("Tape un symbole puis Entrée pour l’ajouter"),
          ttlMs: 1800,
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [translate]);

  function setSymbolSafe(v: string) {
    const s = v.toUpperCase().replace(/\s+/g, "");
    setSymbol(s);
  }

  function addToWatchlist(v: string) {
    const s = v.toUpperCase().replace(/\s+/g, "");
    if (!s) return;

    setWatchlist((prev) => {
      if (prev.includes(s)) {
        pushNotif({
          kind: "warning",
          title: translate("Déjà dans la watchlist"),
          message: s,
          ttlMs: 1600,
        });
        return prev;
      }
      pushNotif({
        kind: "success",
        title: translate("Ajouté à la watchlist"),
        message: s,
        ttlMs: 1600,
      });
      return [s, ...prev];
    });
  }

  function removeFromWatchlist(s: string) {
    setWatchlist((prev) => prev.filter((x) => x !== s));
    pushNotif({
      kind: "warning",
      title: translate("Retiré de la watchlist"),
      message: s,
      ttlMs: 1600,
    });
    if (symbol === s) {
      setSymbol("BTCUSD");
      pushNotif({
        kind: "info",
        title: translate("Symbole réinitialisé"),
        message: translate("BTCUSD"),
        ttlMs: 1600,
      });
    }
  }

  function onReset() {
    setSymbol("BTCUSD");
    setTf("15");
    setQuery("");
    setWatchlist(DEFAULT_WATCHLIST);
    pushNotif({
      kind: "info",
      title: translate("Reset TradingView"),
      message: translate("Symbol + TF + Watchlist"),
      ttlMs: 1800,
    });
  }

  return (
    <div className="investpro-mobile-page w-full bg-[color:var(--bg)] text-[color:var(--text)]">
      <div className="mx-auto max-w-[1400px] px-3 py-4 lg:px-4">
        {/* ===== Ligne 1 : Horaires marchés ===== */}
        <Card className="mb-3">
          <CardBody className="py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm font-semibold">
                {translate("Horaires marché — Asia / London / New York")}</div>
              <MarketSessionsInline />
            </div>
          </CardBody>
        </Card>

        {/* ===== Ligne 2 : Reset + Symbol + Timeframes ===== */}
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[160px_1fr_1fr]">
          <Button variant="secondary" onClick={onReset} className="h-[52px]">
            {translate("Reset")}</Button>

          <Card>
            <CardBody className="py-3">
              <div className="flex h-[52px] items-center gap-3">
                <div className="text-xs font-semibold text-[color:var(--muted)]">
                  {translate("SYMBOL")}</div>
                <input
                  ref={inputRef}
                  value={symbol}
                  onChange={(e) => setSymbolSafe(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addToWatchlist(symbol);
                      pushNotif({
                        kind: "info",
                        title: translate("Symbole chargé"),
                        message: symbol,
                        ttlMs: 1400,
                      });
                    }
                  }}
                  placeholder={translate("Ex: XAUUSD")}
                  className="w-full bg-transparent text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
                />
                <Button
                  variant="secondary"
                  onClick={() => addToWatchlist(symbol)}
                  className="h-10 px-4 rounded-2xl"
                  title={translate("Ajouter à la watchlist")}
                >
                  +
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="py-3">
              <div className="flex h-[52px] items-center gap-2 overflow-x-auto">
                {TIMEFRAMES.map((t) => {
                  const active = tf === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => {
                        setTf(t.value);
                        pushNotif({
                          kind: "info",
                          title: translate("Timeframe"),
                          message: t.label,
                          ttlMs: 1200,
                        });
                      }}
                      className={cx(
                        "shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold transition border",
                        active
                          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--text)]"
                          : "border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--text)] hover:bg-black/5 dark:hover:bg-white/5"
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* ===== Corps : Watchlist gauche + Chart ===== */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
          {/* Watchlist */}
          <Card>
            <CardBody>
              <div className="mb-2">
                <div className="text-sm font-semibold">{translate("Watchlist")}</div>
                <div className="text-[11px] text-[color:var(--muted)]">
                  {translate("Clique pour charger")}</div>
              </div>

              <CardSubCard className="mb-3">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={translate("Rechercher…")}
                  className="w-full bg-transparent text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
                />
              </CardSubCard>

              <div className="max-h-[260px] overflow-auto pr-1 lg:max-h-[calc(100vh-260px)]">
                {filtered.length === 0 ? (
                  <CardSubCard>
                    <div className="text-sm text-[color:var(--muted)]">
                      {translate("Aucun résultat.")}</div>
                  </CardSubCard>
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
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel-2)] hover:bg-black/5 dark:hover:bg-white/5"
                          )}
                        >
                          <button
                            className="flex-1 text-left"
                            onClick={() => {
                              setSymbol(s);
                              pushNotif({
                                kind: "info",
                                title: translate("Symbole chargé"),
                                message: s,
                                ttlMs: 1400,
                              });
                            }}
                          >
                            <div className="text-sm font-semibold">{s}</div>
                            <div className="text-[11px] text-[color:var(--muted)]">
                              {translate("TF:")}{" "}{tf === "D" ? translate("1D") : `${tf}m`}
                            </div>
                          </button>

                          <button
                            onClick={() => removeFromWatchlist(s)}
                            className="ml-2 rounded-xl border border-[color:var(--border)] bg-black/5 dark:bg-white/5 px-2 py-1 text-[11px] text-[color:var(--muted)] opacity-0 hover:bg-black/10 dark:hover:bg-white/10 group-hover:opacity-100"
                            title={translate("Retirer")}
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <CardSubCard className="mt-3">
                <div className="text-[11px] text-[color:var(--muted)]">
                  {translate("Entrée dans SYMBOL = ajoute à la watchlist. (Ctrl/⌘ + K)")}</div>
              </CardSubCard>
            </CardBody>
          </Card>

          {/* Chart */}
          <Card>
            <CardBody className="p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-xs font-semibold">
                    {symbol}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">
                    {tf === "D" ? translate("1D") : `${tf} minutes`}
                  </div>
                </div>
                <div className="text-xs text-[color:var(--muted)]">{translate("TradingView")}</div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel-2)]">
                <iframe
                  title={translate("TradingView")}
                  src={src}
                  className="h-[58vh] min-h-[420px] w-full border-0 lg:h-[78vh] lg:min-h-[640px]"
                  loading="lazy"
                  allowFullScreen
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   SESSIONS INLINE
=========================== */

function MarketSessionsInline() {
  const { t: translate } = useLocale();

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

  // Heures Paris
  const sessions = [
    { name: "Asia", open: 1, close: 8.3 },
    { name: "London", open: 7, close: 17 },
    { name: "New York", open: 14, close: 23 },
  ] as const;

  function isActive(openHour: number, closeHour: number) {
    if (isWeekend) return false;
    const o = openHour * 60;
    const c = closeHour * 60;

    if (openHour > closeHour) return totalMin >= o || totalMin < c;
    return totalMin >= o && totalMin < c;
  }

  function fmt(h: number) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isWeekend && (
        <span className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-300">
          {translate("WEEKEND — fermé (Ven 23:00 → Lun 00:00)")}</span>
      )}

      {sessions.map((s) => {
        const active = isActive(s.open, s.close);
        return (
          <span
            key={s.name}
            className={cx(
              "rounded-2xl border px-3 py-1.5 text-xs font-semibold",
              active
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                : "border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--muted)]"
            )}
            title={`${s.name} ${fmt(s.open)}–${fmt(s.close)} (Paris)`}
          >
            {s.name} {fmt(s.open)}–{fmt(s.close)} • {active ? translate("ACTIVE") : translate("CLOSED")}
          </span>
        );
      })}
    </div>
  );
}

export default function MarketPage(){
  const { t: translate } = useLocale();
return <><MarketWidget kind="tradingview"/><details className="mt-6"><summary className="cursor-pointer text-sm text-[color:var(--gold)]">{translate("Outils et affichage InvestPro")}</summary><div className="mt-5"><TradingViewPage/></div></details></>;}
