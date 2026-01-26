"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

type Impact = "Low" | "Medium" | "High";

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

function mapImpact(importance: number): Impact {
  if (importance >= 3) return "High";
  if (importance === 2) return "Medium";
  return "Low";
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const cls =
    impact === "High"
      ? "border-[color:var(--danger)]/25 bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
      : impact === "Medium"
      ? "border-[color:var(--warning)]/25 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
      : "border-white/10 bg-white/5 text-[color:var(--muted)]";

  return (
    <span className={["text-[10px] px-2 py-0.5 rounded-full border", cls].join(" ")}>
      {impact.toUpperCase()}
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

function fmtParisDate(isoUtc: string) {
  const d = new Date(isoUtc);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // DD/MM/YYYY
}

function parisYMD(isoUtc: string) {
  // retourne YYYY-MM-DD en heure de Paris (pour filtrer par jour)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoUtc));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function CalendrierPage() {
  // Toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Dates (Paris)
  const todayParis = useMemo(() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }, []);

  const [date, setDate] = useState(todayParis);
  const [rangeDays, setRangeDays] = useState("1"); // 1=jour, 7=semaine
  const [impact, setImpact] = useState<"ALL" | Impact>("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // Alerts + sound
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [leadMin, setLeadMin] = useState("10");
  const [alertImpact, setAlertImpact] = useState<"High" | "High+Medium">("High");

  const notifiedRef = useRef<Set<string>>(new Set());

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

  async function playAlertSound(level: Impact) {
    if (!soundEnabled) return;
    if (!audioCtxRef.current) return;

    if (level === "High") {
      beepOnce(880, 0.22);
      await sleep(220);
      beepOnce(880, 0.22);
    } else if (level === "Medium") {
      beepOnce(740, 0.22);
    }
  }

  async function toggleSound() {
    const ok = ensureAudioUnlocked();
    if (!ok) {
      setToast("❌ Audio non supporté.");
      return;
    }
    setSoundEnabled((v) => !v);
    await sleep(50);
    beepOnce(660, 0.15);
    setToast(!soundEnabled ? "🔊 Son activé" : "🔇 Son désactivé");
  }

  // Load real events from API
  const [events, setEvents] = useState<EconEvent[]>([]);

  const endDate = useMemo(() => {
    const start = new Date(date + "T00:00:00");
    const days = Math.max(1, Math.min(14, Number(rangeDays) || 1));
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
      const start = date;
      const end = endDate;

      // importance filter server-side optional:
      // High only => importance=3, High+Medium => importance=2 (TE returns 2+3)
      let importanceParam = "";
      if (impact === "High") importanceParam = "3";
      if (impact === "Medium") importanceParam = "2"; // includes medium+high; we’ll filter in UI further if needed

      const url = new URL("/api/calendar", window.location.origin);
      url.searchParams.set("start", start);
      url.searchParams.set("end", end);
      if (importanceParam) url.searchParams.set("importance", importanceParam);

      const r = await fetch(url.toString(), { cache: "no-store" });
      const data = await r.json();

      if (!Array.isArray(data)) {
        setToast("❌ Erreur API calendrier (voir console)");
        console.log("Calendar API response:", data);
        setEvents([]);
        return;
      }

      const mapped: EconEvent[] = data
        .map((x: any) => ({
          id: String(x.CalendarId ?? x.CalendarID ?? x.CalendarID ?? x.CalendarId ?? x.CalendarID ?? x.CalendarID),
          dateUtcISO: x.Date, // UTC in ISO (doc) :contentReference[oaicite:4]{index=4}
          country: String(x.Country ?? ""),
          event: String(x.Event ?? ""),
          category: x.Category ? String(x.Category) : undefined,
          actual: x.Actual ? String(x.Actual) : undefined,
          previous: x.Previous ? String(x.Previous) : undefined,
          forecast: x.Forecast ? String(x.Forecast) : undefined,
          importance: Number(x.Importance ?? 1),
        }))
        .filter((e: EconEvent) => !!e.id && !!e.dateUtcISO && !!e.event);

      setEvents(mapped);
      setToast(`✅ ${mapped.length} événements chargés (heure de Paris)`);
    } catch (err) {
      console.error(err);
      setToast("❌ Impossible de charger les événements");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, rangeDays]);

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        const imp = mapImpact(e.importance);
        return impact === "ALL" ? true : imp === impact;
      })
      .filter((e) => (q.trim() ? e.event.toLowerCase().includes(q.trim().toLowerCase()) : true))
      .sort((a, b) => a.dateUtcISO.localeCompare(b.dateUtcISO));
  }, [events, impact, q]);

  // Alert engine (real events) — checks every 20s
  useEffect(() => {
    if (!alertsEnabled) return;

    const lead = Math.max(1, Math.min(120, Number(leadMin) || 10));
    const impacts = alertImpact === "High"
      ? new Set<Impact>(["High"])
      : new Set<Impact>(["High", "Medium"]);

    const tick = () => {
      const now = Date.now();

      events.forEach((e) => {
        const imp = mapImpact(e.importance);
        if (!impacts.has(imp)) return;

        const t = new Date(e.dateUtcISO).getTime();
        const diffMin = Math.round((t - now) / 60000);

        const key = `${e.id}-${lead}`;
        if (diffMin <= lead && diffMin >= lead - 1 && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);

          setToast(`📣 ${imp} dans ~${lead} min • ${e.event} (${e.country})`);
          playAlertSound(imp);

          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`News ${imp} dans ~${lead} min`, {
              body: `${e.event} • ${fmtParisTime(e.dateUtcISO)} (Paris) • ${e.country}`,
            });
          }
        }
      });
    };

    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [alertsEnabled, leadMin, alertImpact, events, soundEnabled]);

  async function enableAlerts() {
    setToast("🔔 Activation des alertes...");
    ensureAudioUnlocked();
    setSoundEnabled(true);

    if (typeof Notification === "undefined") {
      setToast("✅ Alertes actives (popup+son). Pas de notif système.");
      setAlertsEnabled(true);
      return;
    }

    if (Notification.permission === "granted") {
      setToast("✅ Alertes actives (popup+son+notif).");
      setAlertsEnabled(true);
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setToast("✅ Permission accordée. Alertes actives.");
      setAlertsEnabled(true);
    } else {
      setToast(`⚠️ Permission: ${perm}. Alertes actives (popup+son).`);
      setAlertsEnabled(true);
    }
  }

  function disableAlerts() {
    setToast("🛑 Alertes désactivées.");
    setAlertsEnabled(false);
  }

  async function testAlert() {
    ensureAudioUnlocked();
    setSoundEnabled(true);
    setToast("✅ Test alertes + son");
    await playAlertSound("High");
  }

  const stats = useMemo(() => {
    const high = filtered.filter((e) => mapImpact(e.importance) === "High").length;
    const med = filtered.filter((e) => mapImpact(e.importance) === "Medium").length;
    const low = filtered.filter((e) => mapImpact(e.importance) === "Low").length;
    return { total: filtered.length, high, med, low };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="px-4 py-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--panel)] shadow-2xl text-sm">
            {toast}
            <button
              className="ml-3 text-xs text-[color:var(--muted)] hover:text-white"
              onClick={() => setToast(null)}
            >
              fermer
            </button>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Calendrier <span className="text-[color:var(--gold)]">économique</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Événements réels + affichage en <b>heure de Paris</b>.
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
              value={rangeDays}
              onChange={(e) => setRangeDays(e.target.value)}
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
              value={impact}
              onChange={(e) => setImpact(e.target.value as any)}
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            >
              <option value="ALL">Tous</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs text-white/70 mb-1">Recherche</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: CPI, NFP..."
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white placeholder:text-white/30
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </label>

          <div className="flex items-end gap-3">
            <Button variant="secondary" onClick={fetchEvents}>
              {loading ? "Chargement..." : "Rafraîchir"}
            </Button>
          </div>
        </div>
      </div>

      {/* Alerts panel */}
      <Card>
        <CardBody>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">
                Alertes <span className="text-[color:var(--gold)]">news</span>
              </div>
              <div className="text-sm text-[color:var(--muted)] mt-1">
                Popup + notification + son (Paris time).
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
                value={alertImpact}
                onChange={(e) => setAlertImpact(e.target.value as any)}
                className="mt-3 w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                           outline-none focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              >
                <option value="High">High uniquement</option>
                <option value="High+Medium">High + Medium</option>
              </select>
            </CardSubCard>

            <CardSubCard>
              <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Minutes avant</div>
              <input
                value={leadMin}
                onChange={(e) => setLeadMin(e.target.value)}
                placeholder="10"
                className="mt-3 w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white placeholder:text-white/30
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
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">High</div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--danger)]">{stats.high}</div>
        </CardSubCard>
        <CardSubCard>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Medium</div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--warning)]">{stats.med}</div>
        </CardSubCard>
        <CardSubCard>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Low</div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--muted)]">{stats.low}</div>
        </CardSubCard>
      </div>

      {/* Events list */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Événements</div>
            <div className="text-xs text-[color:var(--muted)]">
              Heure: <b>Europe/Paris</b>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">
                {loading ? "Chargement..." : "Aucun événement."}
              </div>
            ) : (
              filtered.map((e) => {
                const imp = mapImpact(e.importance);
                return (
                  <CardSubCard
                    key={e.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-[90px]">
                        <div className="text-sm font-semibold">{fmtParisTime(e.dateUtcISO)}</div>
                        <div className="text-[11px] text-[color:var(--muted)]">{parisYMD(e.dateUtcISO)}</div>
                      </div>

                      <ImpactBadge impact={imp} />

                      <div>
                        <div className="font-semibold">{e.event}</div>
                        <div className="text-xs text-[color:var(--muted)] mt-1">
                          {e.country} {e.category ? `• ${e.category}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
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
              })
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
