"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

import { pushNotif } from "../../../lib/notifyStore";

type EconEvent = {
  id: string;
  dateUtcISO: string; // ISO UTC from API
  country: string;
  event: string;
  category?: string;
  actual?: string;
  previous?: string;
  forecast?: string;
  importance: number; // 1..3
};

type Stars = 1 | 2 | 3;

function toStars(importance: number): Stars {
  if (importance >= 3) return 3;
  if (importance === 2) return 2;
  return 1;
}

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

function fmtParisTime(isoUtc: string) {
  const d = new Date(isoUtc);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function parisYMD(isoUtc: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoUtc));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD (Paris)
}

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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeId(x: any) {
  const v = String(x ?? "").trim();
  return v || `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function CalendrierPage() {
  const [date, setDate] = useState(() => todayParisYMD());
  const [rangeDays, setRangeDays] = useState<1 | 7 | 14>(7);

  // filtre impact
  const [starsFilter, setStarsFilter] = useState<"ALL" | Stars>("ALL");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EconEvent[]>([]);

  // alertes
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [leadMin, setLeadMin] = useState(10);
  const [alertStars, setAlertStars] = useState<3 | 2>(3); // 3 => seulement ★★★, 2 => ★★+★★★

  // anti double notif (id + lead)
  const notifiedRef = useRef<Set<string>>(new Set());

  // son (beep)
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function ensureAudioUnlocked() {
    try {
      // @ts-ignore
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
      return true;
    } catch {
      return false;
    }
  }

  function beepOnce(freq = 880, dur = 0.22) {
    if (!soundEnabled) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  async function playAlertSound(stars: Stars) {
    if (!soundEnabled) return;
    if (!audioCtxRef.current) return;

    if (stars === 3) {
      beepOnce(880, 0.22);
      await sleep(220);
      beepOnce(880, 0.22);
    } else if (stars === 2) {
      beepOnce(740, 0.22);
    } else {
      beepOnce(660, 0.16);
    }
  }

  const endDate = useMemo(() => {
    const start = new Date(date + "T00:00:00");
    const days = clamp(Number(rangeDays) || 7, 1, 14);
    const end = new Date(start);
    end.setDate(start.getDate() + (days - 1));
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, "0");
    const dd = String(end.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [date, rangeDays]);

  async function fetchEvents() {
    setLoading(true);
    try {
      const url = new URL("/api/calendar", window.location.origin);
      url.searchParams.set("start", date);
      url.searchParams.set("end", endDate);

      // on peut laisser le serveur renvoyer tout, et filtrer côté UI
      const r = await fetch(url.toString(), { cache: "no-store" });
      const data = await r.json();

      if (!Array.isArray(data)) {
        console.log("Calendar API response:", data);
        pushNotif({
          kind: "error",
          title: "Calendrier",
          message: "Erreur API calendrier (réponse invalide).",
          ttlMs: 10000,
        });
        setEvents([]);
        return;
      }

      const mapped: EconEvent[] = data
        .map((x: any) => ({
          id: safeId(x.CalendarId ?? x.CalendarID ?? x.Id ?? x.id),
          dateUtcISO: String(x.Date ?? ""),
          country: String(x.Country ?? ""),
          event: String(x.Event ?? ""),
          category: x.Category ? String(x.Category) : undefined,
          actual: x.Actual ? String(x.Actual) : undefined,
          previous: x.Previous ? String(x.Previous) : undefined,
          forecast: x.Forecast ? String(x.Forecast) : undefined,
          importance: Number(x.Importance ?? 1),
        }))
        .filter((e) => !!e.id && !!e.dateUtcISO && !!e.event);

      setEvents(mapped);

      pushNotif({
        kind: "success",
        title: "Calendrier",
        message: `${mapped.length} événement(s) chargé(s) (heure de Paris).`,
        ttlMs: 6500,
      });
    } catch (e: any) {
      console.error(e);
      pushNotif({
        kind: "error",
        title: "Calendrier",
        message: "Impossible de charger les événements.",
        ttlMs: 10000,
      });
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, endDate]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return events
      .filter((e) => {
        const stars = toStars(e.importance);
        return starsFilter === "ALL" ? true : stars === starsFilter;
      })
      .filter((e) => (s ? e.event.toLowerCase().includes(s) || e.country.toLowerCase().includes(s) : true))
      .sort((a, b) => a.dateUtcISO.localeCompare(b.dateUtcISO));
  }, [events, starsFilter, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconEvent[]>();
    for (const e of filtered) {
      const k = parisYMD(e.dateUtcISO);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    // tri interne
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.dateUtcISO.localeCompare(b.dateUtcISO));
      map.set(k, arr);
    }
    // tri jours
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const stats = useMemo(() => {
    const s3 = filtered.filter((e) => toStars(e.importance) === 3).length;
    const s2 = filtered.filter((e) => toStars(e.importance) === 2).length;
    const s1 = filtered.filter((e) => toStars(e.importance) === 1).length;
    return { total: filtered.length, s1, s2, s3 };
  }, [filtered]);

  // Engine alert (toutes les 20s)
  useEffect(() => {
    if (!alertsEnabled) return;

    const lead = clamp(Number(leadMin) || 10, 1, 120);
    const minStars = alertStars; // 3 => seulement ★★★ ; 2 => ★★ + ★★★

    const tick = () => {
      const now = Date.now();

      for (const e of events) {
        const stars = toStars(e.importance);
        if (stars < minStars) continue;

        const t = new Date(e.dateUtcISO).getTime();
        const diffMin = Math.round((t - now) / 60000);

        const key = `${e.id}-${lead}-${minStars}`;
        if (diffMin <= lead && diffMin >= lead - 1 && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);

          const when = fmtParisTime(e.dateUtcISO);
          const starTxt = stars === 3 ? "★★★" : stars === 2 ? "★★" : "★";

          pushNotif({
            kind: "live",
            title: `News ${starTxt} dans ~${lead} min`,
            message: `${e.event} • ${when} (Paris) • ${e.country}`,
            ttlMs: 12000,
          });

          playAlertSound(stars);

          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`News ${starTxt} dans ~${lead} min`, {
              body: `${e.event} • ${when} (Paris) • ${e.country}`,
            });
          }
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [alertsEnabled, leadMin, alertStars, events, soundEnabled]);

  async function enableAlerts() {
    ensureAudioUnlocked();
    setSoundEnabled(true);

    if (typeof Notification === "undefined") {
      pushNotif({
        kind: "info",
        title: "Alertes",
        message: "Alertes actives (toasts + son). Notifs système non supportées.",
        ttlMs: 9000,
      });
      setAlertsEnabled(true);
      return;
    }

    if (Notification.permission === "granted") {
      pushNotif({ kind: "success", title: "Alertes", message: "Alertes actives (toasts + son + notif).", ttlMs: 9000 });
      setAlertsEnabled(true);
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      pushNotif({ kind: "success", title: "Alertes", message: "Permission accordée. Alertes actives.", ttlMs: 9000 });
      setAlertsEnabled(true);
    } else {
      pushNotif({
        kind: "warning",
        title: "Alertes",
        message: `Permission: ${perm}. Alertes actives (toasts + son).`,
        ttlMs: 9000,
      });
      setAlertsEnabled(true);
    }
  }

  function disableAlerts() {
    pushNotif({ kind: "info", title: "Alertes", message: "Alertes désactivées.", ttlMs: 7000 });
    setAlertsEnabled(false);
  }

  async function toggleSound() {
    const ok = ensureAudioUnlocked();
    if (!ok) {
      pushNotif({ kind: "error", title: "Son", message: "Audio non supporté.", ttlMs: 9000 });
      return;
    }
    setSoundEnabled((v) => !v);
    await sleep(50);
    beepOnce(660, 0.15);
    pushNotif({ kind: "info", title: "Son", message: !soundEnabled ? "Son activé" : "Son désactivé", ttlMs: 5000 });
  }

  async function testAlert() {
    ensureAudioUnlocked();
    setSoundEnabled(true);
    pushNotif({ kind: "success", title: "Test", message: "Test alerte (son + toast).", ttlMs: 6000 });
    await playAlertSound(3);
  }
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Calendrier <span className="text-[color:var(--gold)]">économique</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Affichage en <b>heure de Paris</b> • Impact en étoiles.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="block">
            <div className="text-xs text-white/70 mb-1">Jour (Paris)</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </label>

          <label className="block">
            <div className="text-xs text-white/70 mb-1">Plage</div>
            <select
              value={String(rangeDays)}
              onChange={(e) => setRangeDays(clamp(Number(e.target.value) || 7, 1, 14) as 1 | 7 | 14)}
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            >
              <option value="1">1 jour</option>
              <option value="7">7 jours</option>
              <option value="14">14 jours</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs text-white/70 mb-1">Impact</div>
            <select
              value={starsFilter === "ALL" ? "ALL" : String(starsFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setStarsFilter(v === "ALL" ? "ALL" : (Number(v) as Stars));
              }}
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            >
              <option value="ALL">Tous</option>
              <option value="3">★★★</option>
              <option value="2">★★</option>
              <option value="1">★</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs text-white/70 mb-1">Recherche</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: CPI, NFP, USD…"
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white placeholder:text-white/30
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </label>

          <div className="flex items-end gap-3">
            <Button variant="secondary" onClick={fetchEvents} disabled={loading}>
              {loading ? "Chargement..." : "Rafraîchir"}
            </Button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <Card>
        <CardBody>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">
                Alertes <span className="text-[color:var(--gold)]">news</span>
              </div>
              <div className="text-sm text-[color:var(--muted)] mt-1">
                Alerte avant l’événement (toast + son + notif système si autorisée).
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={toggleSound}>
                {soundEnabled ? "Son: ON" : "Son: OFF"}
              </Button>

              {alertsEnabled ? (
                <Button variant="danger" onClick={disableAlerts}>
                  Désactiver
                </Button>
              ) : (
                <Button onClick={enableAlerts}>Activer</Button>
              )}

              <Button variant="secondary" onClick={testAlert}>
                Test
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <CardSubCard>
              <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Impact alerté</div>
              <select
                value={String(alertStars)}
                onChange={(e) => setAlertStars((Number(e.target.value) as 2 | 3) || 3)}
                className="mt-3 w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                           outline-none focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              >
                <option value="3">★★★ uniquement</option>
                <option value="2">★★ + ★★★</option>
              </select>
            </CardSubCard>

            <CardSubCard>
              <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Minutes avant</div>
              <input
                value={String(leadMin)}
                onChange={(e) => setLeadMin(clamp(Number(e.target.value) || 10, 1, 120))}
                className="mt-3 w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                           outline-none focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              />
              <div className="mt-2 text-xs text-[color:var(--muted)]">Entre 1 et 120 minutes.</div>
            </CardSubCard>

            <CardSubCard>
              <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Statut</div>
              <div className="mt-3 text-sm">
                {alertsEnabled ? (
                  <span className="text-[color:var(--success)] font-semibold">ACTIF</span>
                ) : (
                  <span className="text-[color:var(--danger)] font-semibold">INACTIF</span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-white/40">
                * Les alertes se basent sur l’heure UTC de l’API, affichée en Paris.
              </div>
            </CardSubCard>
          </div>
        </CardBody>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CardSubCard>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Total</div>
          <div className="mt-2 text-lg font-semibold text-white">{stats.total}</div>
        </CardSubCard>
        <CardSubCard>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">★★★</div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--danger)]">{stats.s3}</div>
        </CardSubCard>
        <CardSubCard>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">★★</div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--warning)]">{stats.s2}</div>
        </CardSubCard>
        <CardSubCard>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">★</div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--muted)]">{stats.s1}</div>
        </CardSubCard>
      </div>

      {/* Events list (grouped by day Paris) */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Événements</div>
            <div className="text-xs text-[color:var(--muted)]">
              Heure: <b>Europe/Paris</b>
            </div>
          </div>

          <div className="mt-4 space-y-5">
            {grouped.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">{loading ? "Chargement..." : "Aucun événement."}</div>
            ) : (
              grouped.map(([day, arr]) => (
                <div key={day} className="space-y-2">
                  <div className="text-xs text-white/60">
                    {day} • {arr.length} évènement(s)
                  </div>

                  <div className="space-y-2">
                    {arr.map((e) => {
                      const stars = toStars(e.importance);
                      return (
                        <CardSubCard
                          key={e.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-[86px] shrink-0">
                              <div className="text-sm font-semibold text-white">{fmtParisTime(e.dateUtcISO)}</div>
                              <div className="text-[11px] text-white/40">{e.country || "—"}</div>
                            </div>

                            <StarsBadge stars={stars} />

                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate">{e.event}</div>
                              <div className="text-xs text-[color:var(--muted)] mt-1 truncate">
                                {e.category ? e.category : "—"}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-xs w-full md:w-auto">
                            <div className="text-right">
                              <div className="text-[color:var(--muted)]">Prev</div>
                              <div className="text-white/90">{e.previous ?? "—"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[color:var(--muted)]">Forecast</div>
                              <div className="text-white/90">{e.forecast ?? "—"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[color:var(--muted)]">Actual</div>
                              <div className="text-[color:var(--gold)] font-semibold">{e.actual ?? "—"}</div>
                            </div>
                          </div>
                        </CardSubCard>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 text-[11px] text-white/40">
            Filtre: {starsFilter === "ALL" ? "Tous" : starsFilter === 3 ? "★★★" : starsFilter === 2 ? "★★" : "★"} •
            Plage: {rangeDays} jour(s)
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

