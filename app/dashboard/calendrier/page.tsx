"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { pushNotif } from "../../../lib/notifyStore";

type Stars = 1 | 2 | 3;

type EconEvent = {
  id: string;
  dateParisYMD: string; // YYYY-MM-DD (Paris)
  time: string; // HH:mm
  currency: string; // USD/EUR/GBP/JPY/CNY
  countryLabel: string; // label humain
  title: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  stars: Stars; // 1..3
};

const ALLOWED = new Set(["USD", "EUR", "GBP", "JPY", "CNY"]);

/* -------------------- Date helpers -------------------- */
function todayParisYMD() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysYMD(ymd: string, add: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // midi UTC anti-DST
  base.setUTCDate(base.getUTCDate() + add);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startOfWeekMonday(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = base.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7; // Mon=0 ... Sun=6
  base.setUTCDate(base.getUTCDate() - mondayOffset);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDayHeaderFR(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(dt);
}

/* -------------------- UI helpers -------------------- */
function StarsBadge({ stars }: { stars: Stars }) {
  const cls =
    stars === 3
      ? "border-[color:var(--danger)]/25 bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
      : stars === 2
      ? "border-[color:var(--warning)]/25 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
      : "border-white/10 bg-white/5 text-[color:var(--muted)]";

  const label = stars === 3 ? "★★★" : stars === 2 ? "★★" : "★";
  return (
    <span className={["text-[11px] px-2 py-0.5 rounded-full border font-semibold", cls].join(" ")}>
      {label}
    </span>
  );
}

function SegBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: any;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-10 px-4 rounded-2xl border text-sm transition",
        active
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] font-semibold"
          : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* -------------------- Investing parsing -------------------- */
function normalizeCurrency(raw: string): { currency: string; label: string } | null {
  const s = (raw || "").trim();
  if (!s) return null;

  if (ALLOWED.has(s)) {
    const label =
      s === "USD" ? "USA" : s === "EUR" ? "Euro Zone" : s === "GBP" ? "UK" : s === "JPY" ? "Japon" : "Chine";
    return { currency: s, label };
  }

  const up = s.toUpperCase();
  if (up.includes("UNITED STATES") || up.includes("U.S") || up === "US") return { currency: "USD", label: "USA" };
  if (up.includes("EURO") || up.includes("EUROZONE") || up.includes("GERMANY") || up.includes("FRANCE"))
    return { currency: "EUR", label: "Euro Zone" };
  if (up.includes("UNITED KINGDOM") || up.includes("UK") || up.includes("BRITAIN")) return { currency: "GBP", label: "UK" };
  if (up.includes("JAPAN")) return { currency: "JPY", label: "Japon" };
  if (up.includes("CHINA")) return { currency: "CNY", label: "Chine" };

  return null;
}

function parseInvestingHtml(html: string, startYMD: string): EconEvent[] {
  if (!html?.trim()) return [];
  const doc = new DOMParser().parseFromString(`<table><tbody>${html}</tbody></table>`, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"));

  let currentDay = startYMD;
  const out: EconEvent[] = [];

  for (const tr of rows) {
    const rowText = (tr.textContent || "").trim();

    // --- Day header detection (best effort) ---
    const hasEventCell = !!tr.querySelector(".event") || !!tr.querySelector("td.event");
    if (
      !hasEventCell &&
      rowText.length > 8 &&
      /20\d{2}/.test(rowText) &&
      /(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)/i.test(rowText)
    ) {
      const d = new Date(rowText);
      if (!Number.isNaN(d.getTime())) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Paris",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(d);
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        currentDay = `${get("year")}-${get("month")}-${get("day")}`;
      }
      continue;
    }

    // --- Event row parsing ---
    const title =
      (tr.querySelector(".event")?.textContent ||
        tr.querySelector("td.event")?.textContent ||
        tr.querySelector(".event a")?.textContent ||
        "").trim();

    if (!title) continue;

    const time =
      (tr.querySelector(".time")?.textContent || tr.querySelector("td.time")?.textContent || "").trim() || "—";

    const rawCur = (tr.querySelector(".flagCur")?.textContent || "").trim();
    const cur = normalizeCurrency(rawCur) || normalizeCurrency(rowText);
    if (!cur) continue;
    if (!ALLOWED.has(cur.currency)) continue;

    const actual = (tr.querySelector(".act")?.textContent || "").trim() || undefined;
    const forecast = (tr.querySelector(".fore")?.textContent || "").trim() || undefined;
    const previous = (tr.querySelector(".prev")?.textContent || "").trim() || undefined;

    // ✅ FIX STARS: robust sentiment parsing
    const sent = tr.querySelector(".sentiment");

    let bulls =
      tr.querySelectorAll(".fullBullishIcon").length +
      tr.querySelectorAll(".grayFullBullishIcon").length +
      tr.querySelectorAll(".bullishIcon").length;

    if (bulls === 0 && sent) {
      const iCount = sent.querySelectorAll("i").length;
      const svgCount = sent.querySelectorAll("svg").length;
      bulls = Math.max(iCount, svgCount);
    }

    bulls = Math.max(0, Math.min(3, bulls));
    const stars: Stars = bulls >= 3 ? 3 : bulls === 2 ? 2 : 1;

    const id =
      (tr.getAttribute("data-event-id") ||
        tr.getAttribute("event_attr_id") ||
        tr.getAttribute("id") ||
        "")?.toString() ||
      `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    out.push({
      id,
      dateParisYMD: currentDay,
      time,
      currency: cur.currency,
      countryLabel: cur.label,
      title,
      actual,
      forecast,
      previous,
      stars,
    });
  }

  return out;
}

/* -------------------- Page -------------------- */
export default function CalendrierPage() {
  const today = useMemo(() => todayParisYMD(), []);
  const tomorrow = useMemo(() => addDaysYMD(today, 1), [today]);

  const [mode, setMode] = useState<"day" | "tomorrow" | "week">("day");
  const [baseDate, setBaseDate] = useState(today);

  const start = useMemo(() => {
    if (mode === "week") return startOfWeekMonday(baseDate);
    if (mode === "tomorrow") return tomorrow;
    return baseDate;
  }, [mode, baseDate, tomorrow]);

  const end = useMemo(() => (mode === "week" ? addDaysYMD(start, 6) : start), [mode, start]);

  const [starsFilter, setStarsFilter] = useState<"ALL" | Stars>("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [events, setEvents] = useState<EconEvent[]>([]);

  async function loadCalendar() {
    setLoading(true);
    try {
      const url = new URL("/api/calendar", window.location.origin);
      url.searchParams.set("start", start);
      url.searchParams.set("end", end);

      const r = await fetch(url.toString(), { cache: "no-store" });
      const j = await r.json();

      if (!j?.ok) {
        pushNotif({
          kind: "warning",
          title: "Calendrier",
          message: "Investing bloqué (Cloudflare) ou réponse invalide.",
          ttlMs: 12000,
        });
        setEvents([]);
        return;
      }

      const parsed = parseInvestingHtml(String(j.html ?? ""), start);
      setEvents(parsed);

      pushNotif({
        kind: "success",
        title: "Annonce éco",
        message: `${parsed.length} annonce(s) • ${start} → ${end}`,
        ttlMs: 7000,
      });
    } catch (e: any) {
      console.error(e);
      pushNotif({ kind: "error", title: "Annonce éco", message: "Erreur chargement calendrier.", ttlMs: 12000 });
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return events
      .filter((e) => (starsFilter === "ALL" ? true : e.stars === starsFilter))
      .filter((e) => (s ? e.title.toLowerCase().includes(s) || e.currency.toLowerCase().includes(s) : true));
  }, [events, starsFilter, q]);

  const stats = useMemo(() => {
    const s3 = filtered.filter((e) => e.stars === 3).length;
    const s2 = filtered.filter((e) => e.stars === 2).length;
    const s1 = filtered.filter((e) => e.stars === 1).length;
    return { total: filtered.length, s1, s2, s3 };
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconEvent[]>();
    for (const e of filtered) {
      const k = e.dateParisYMD;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    const arr = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, list] of arr) list.sort((a, b) => a.time.localeCompare(b.time));
    return arr;
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* TOP */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex gap-2">
            <SegBtn active={mode === "day"} onClick={() => setMode("day")}>
              Jour
            </SegBtn>
            <SegBtn active={mode === "tomorrow"} onClick={() => setMode("tomorrow")}>
              Demain
            </SegBtn>
            <SegBtn active={mode === "week"} onClick={() => setMode("week")}>
              Semaine
            </SegBtn>
          </div>

          <div className="min-w-[160px]">
            <div className="text-xs text-white/60 mb-1">IMPACT</div>
            <select
              value={starsFilter === "ALL" ? "ALL" : String(starsFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setStarsFilter(v === "ALL" ? "ALL" : (Number(v) as Stars));
              }}
              className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white outline-none
                         focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            >
              <option value="ALL">Tous</option>
              <option value="3">★★★</option>
              <option value="2">★★</option>
              <option value="1">★</option>
            </select>
          </div>

          <div className="flex-1">
            <div className="text-xs text-white/60 mb-1">Recherche :</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: CPI / NFP / GDP..."
              className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white placeholder:text-white/30 outline-none
                         focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={loadCalendar} disabled={loading}>
              {loading ? "..." : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-white/50">
          <span>Plage :</span>
          <span className="text-white/80 font-semibold">
            {start} → {end}
          </span>
          <span className="ml-auto text-white/40">Pays filtrés : USD / EUR / GBP / JPY / CNY</span>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CardSubCard>
          <div className="text-xs text-white/60">TOTAL</div>
          <div className="mt-2 text-2xl font-semibold text-white">{stats.total}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-white/60">3 étoiles</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--danger)]">{stats.s3}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-white/60">2 étoiles</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--warning)]">{stats.s2}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-white/60">1 étoile</div>
          <div className="mt-2 text-2xl font-semibold text-white/70">{stats.s1}</div>
        </CardSubCard>
      </div>

      {/* EVENTS */}
      <Card>
        <CardBody className="p-0">
          <div className="rounded-[32px] border border-white/10 bg-black/15 overflow-hidden">
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
              <div className="text-lg font-semibold text-white">Événements</div>
              <div className="text-xs text-white/40">{loading ? "..." : `${filtered.length} annonce(s)`}</div>
            </div>

            <div className="p-6 space-y-6">
              {grouped.length === 0 ? (
                <div className="text-sm text-white/50">{loading ? "Chargement..." : "Aucune annonce."}</div>
              ) : (
                grouped.map(([day, list]) => (
                  <div key={day} className="rounded-3xl border border-white/10 bg-black/10 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/10 bg-black/20 text-center font-semibold text-white capitalize">
                      {formatDayHeaderFR(day)}
                    </div>

                    <div className="divide-y divide-white/10">
                      {list.map((e) => (
                        <div key={e.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                          <div className="w-[90px] shrink-0">
                            <div className="text-sm font-semibold text-white">{e.time}</div>
                            <div className="text-[11px] text-white/40">{e.currency}</div>
                          </div>

                          <div className="shrink-0">
                            <StarsBadge stars={e.stars} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-white font-semibold truncate">{e.title}</div>
                            <div className="text-xs text-white/50">{e.countryLabel}</div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-xs w-full md:w-[300px]">
                            <div className="text-right">
                              <div className="text-white/40">Prev</div>
                              <div className="text-white/80">{e.previous ?? "—"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white/40">Forecast</div>
                              <div className="text-white/80">{e.forecast ?? "—"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white/40">Actual</div>
                              <div className="text-[color:var(--gold)] font-semibold">{e.actual ?? "—"}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
