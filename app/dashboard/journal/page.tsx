"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { loadTrades, saveTrades } from "../../../lib/tradesStore";
import { loadMt5Accounts, Mt5Account } from "../../../lib/mt5Store";
import { syncMt5HistoryToTrades } from "../../../lib/mt5sync";
import { pushNotif } from "../../../lib/notifyStore";
import { ZoomIn } from "lucide-react";

type Trade = any;

/* --------------------------------- Helpers -------------------------------- */
function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function clampDays(v: number) {
  return Math.max(1, Math.min(365, v));
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(v: any) {
  return typeof v === "string" ? v : "";
}

/**
 * Convertit une date trade en "YYYY-MM-DD" (clé de group)
 * Accepte:
 * - "2026-01-27"
 * - "27/01/2026"
 * - timestamp ms/sec
 */
function dayKeyFromTrade(t: Trade) {
  const raw = t?.date ?? t?.closedAt ?? t?.openTime ?? t?.time ?? "";
  if (typeof raw === "number") {
    const ms = raw > 10_000_000_000 ? raw : raw * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "unknown";
  }

  const s = String(raw || "").trim();
  if (!s) return "unknown";

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // fallback Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return "unknown";
}

function frDayLabel(iso: string) {
  if (iso === "unknown") return "Date inconnue";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function badgeResultClass(r: string) {
  if (r === "WIN")
    return "border-[color:var(--success)] bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (r === "LOSS")
    return "border-[color:var(--danger)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
  if (r === "BE") return "border-white/10 bg-white/5 text-white/70";
  return "border-white/10 bg-white/5 text-white/70";
}

/* ---------------------------- Images restrictions --------------------------- */
const MAX_IMG_BYTES = 3 * 1024 * 1024; // 3MB
const ALLOWED_IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];

function bytesToMb(b: number) {
  return Math.round((b / (1024 * 1024)) * 100) / 100;
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------------------------------- Page ---------------------------------- */
export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<"Tous" | "WIN" | "LOSS" | "BE">("Tous");

  // edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);

  // ✅ tags chips
  const [tagDraft, setTagDraft] = useState("");

  // sync modal
  const [openSync, setOpenSync] = useState(false);
  const [mt5Accounts, setMt5Accounts] = useState<Mt5Account[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [days, setDays] = useState("30");

  const [busy, setBusy] = useState(false);

  // UI: expand/collapse par jour
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  // ✅ pagination par jour
  const PAGE_SIZE = 10;
  const [dayPage, setDayPage] = useState<Record<string, number>>({});

  // ✅ image viewer (lightbox)
  const [openImg, setOpenImg] = useState(false);
  const [imgSrc, setImgSrc] = useState<string>("");
  const [imgTitle, setImgTitle] = useState<string>("Image");

  function openImage(src: string, title?: string) {
    setImgSrc(src);
    setImgTitle(title || "Image");
    setOpenImg(true);
  }

  useEffect(() => {
    const t = loadTrades();
    setTrades(t);

    const list = loadMt5Accounts().filter((a) => a.status === "CONNECTED");
    setMt5Accounts(list);
    if (list.length) setSelectedIds([list[0].id]);
  }, []);

  const filteredSorted = useMemo(() => {
    const s = q.trim().toLowerCase();

    const base = trades
      .filter((t) => (result === "Tous" ? true : String(t?.result ?? "") === result))
      .filter((t) => {
        if (!s) return true;
        const hay = `${safeStr(t?.symbol)} ${safeStr(t?.market)} ${(Array.isArray(t?.tags) ? t.tags : [])
          .join(" ")} ${safeStr(t?.note)}`.toLowerCase();
        return hay.includes(s);
      });

    // tri par date DESC
    const withTs = base.map((t) => {
      const key = dayKeyFromTrade(t);
      const ts = key === "unknown" ? 0 : new Date(key + "T00:00:00").getTime();
      return { t, key, ts };
    });

    withTs.sort((a, b) => b.ts - a.ts);
    return withTs;
  }, [trades, q, result]);

  const grouped = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const x of filteredSorted) {
      if (!map.has(x.key)) map.set(x.key, []);
      map.get(x.key)!.push(x.t);
    }

    const entries = Array.from(map.entries()).map(([day, list]) => {
      const pnl = list.reduce((s, t) => s + safeNum(t?.pnl), 0);
      const win = list.filter((t) => String(t?.result) === "WIN").length;
      const loss = list.filter((t) => String(t?.result) === "LOSS").length;
      const be = list.filter((t) => String(t?.result) === "BE").length;
      const total = list.length;
      const winrate = total > 0 ? (win / total) * 100 : 0;

      const rrVals = list
        .map((t) => safeNum(t?.rr ?? t?.riskReward))
        .filter((n) => Number.isFinite(n) && n !== 0);
      const rrAvg = rrVals.length ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : 0;

      return { day, list, pnl, win, loss, be, total, winrate, rrAvg };
    });

    entries.sort((a, b) => {
      const ta = a.day === "unknown" ? 0 : new Date(a.day + "T00:00:00").getTime();
      const tb = b.day === "unknown" ? 0 : new Date(b.day + "T00:00:00").getTime();
      return tb - ta;
    });

    return entries;
  }, [filteredSorted]);

  const globalStats = useMemo(() => {
    const all = filteredSorted.map((x) => x.t);
    const pnl = all.reduce((s, t) => s + safeNum(t?.pnl), 0);
    const win = all.filter((t) => String(t?.result) === "WIN").length;
    const loss = all.filter((t) => String(t?.result) === "LOSS").length;
    const be = all.filter((t) => String(t?.result) === "BE").length;
    const total = all.length;
    const winrate = total > 0 ? (win / total) * 100 : 0;

    const rrVals = all
      .map((t) => safeNum(t?.rr ?? t?.riskReward))
      .filter((n) => Number.isFinite(n) && n !== 0);
    const rrAvg = rrVals.length ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : 0;

    return { pnl, win, loss, be, total, winrate, rrAvg };
  }, [filteredSorted]);

  function persist(next: Trade[]) {
    setTrades(next);
    saveTrades(next);
  }

  function removeTrade(id: string) {
    const next = trades.filter((t) => t.id !== id);
    persist(next);
    pushNotif({ kind: "info", title: "Journal", message: "Trade supprimé.", ttlMs: 6000 });
  }

  function openEditTrade(t: Trade) {
    setEditTrade({
      ...t,
      tags: Array.isArray(t?.tags) ? [...t.tags] : [],
      images: Array.isArray(t?.images) ? [...t.images] : [],
    });
    setTagDraft("");
    setOpenEdit(true);
  }

  function saveEdit() {
    if (!editTrade) return;
    const next = trades.map((t) => (t.id === editTrade.id ? editTrade : t));
    persist(next);
    setOpenEdit(false);
    pushNotif({ kind: "success", title: "Journal", message: "Trade modifié.", ttlMs: 7000 });
  }

  function toggleAccount(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function setPresetDays(n: number) {
    setDays(String(clampDays(n)));
  }

  async function doSync() {
    if (selectedIds.length === 0) {
      pushNotif({ kind: "warning", title: "Sync MT5", message: "Sélectionne au moins 1 compte.", ttlMs: 9000 });
      return;
    }

    try {
      setBusy(true);

      const to = Math.floor(Date.now() / 1000);
      const parsed = Number(String(days).replace(",", "."));
      const d = clampDays(Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30);
      const from = to - d * 24 * 3600;

      let totalAdded = 0;
      for (const id of selectedIds) {
        const a = mt5Accounts.find((x) => x.id === id);
        if (!a) continue;

        const added = await syncMt5HistoryToTrades({
          broker: a.broker,
          server: a.server,
          login: a.login,
          password: a.password ?? "",
          from_ts: from,
          to_ts: to,
        });

        totalAdded += Number(added || 0);
      }

      const updated = loadTrades();
      setTrades(updated);

      pushNotif({
        kind: "success",
        title: "Sync MT5",
        message: `Sync terminé : +${totalAdded} trades (${d} jours)`,
        ttlMs: 9000,
      });

      setOpenSync(false);
    } catch (e: any) {
      pushNotif({
        kind: "error",
        title: "Sync MT5",
        message: "Erreur : " + String(e?.message ?? e),
        ttlMs: 12000,
      });
    } finally {
      setBusy(false);
    }
  }

  function clearAllTrades() {
    saveTrades([]);
    setTrades([]);
    pushNotif({ kind: "warning", title: "Journal", message: "Tous les trades ont été supprimés.", ttlMs: 9000 });
  }

  function toggleDay(day: string) {
    setOpenDays((prev) => {
      const next = { ...prev, [day]: !prev[day] };
      return next;
    });
    // reset page quand on ouvre/ferme
    setDayPage((prev) => ({ ...prev, [day]: 0 }));
  }

  function expandAll(open: boolean) {
    const next: Record<string, boolean> = {};
    const pages: Record<string, number> = {};
    for (const g of grouped) {
      next[g.day] = open;
      pages[g.day] = 0;
    }
    setOpenDays(next);
    setDayPage((prev) => ({ ...prev, ...pages }));
  }

  /* -------------------------------- Images -------------------------------- */
  async function addImages(files: FileList | null) {
    if (!editTrade) return;
    if (!files || files.length === 0) return;

    const current: string[] = Array.isArray(editTrade.images) ? editTrade.images : [];
    if (current.length >= 3) {
      pushNotif({ kind: "warning", title: "Images", message: "Max 3 images par trade.", ttlMs: 8000 });
      return;
    }

    const picked = Array.from(files).slice(0, 3 - current.length);

    for (const f of picked) {
      if (!ALLOWED_IMG_TYPES.includes(f.type)) {
        pushNotif({
          kind: "warning",
          title: "Images",
          message: `Format refusé: ${f.type || "inconnu"} (jpg/png/webp seulement)`,
          ttlMs: 9000,
        });
        continue;
      }
      if (f.size > MAX_IMG_BYTES) {
        pushNotif({
          kind: "warning",
          title: "Images",
          message: `Image trop lourde: ${bytesToMb(f.size)}MB (max 3MB).`,
          ttlMs: 9000,
        });
        continue;
      }

      const dataUrl = await fileToDataURL(f);
      const next = [...current, dataUrl].slice(0, 3);
      setEditTrade({ ...editTrade, images: next });
    }
  }

  function removeImageAt(idx: number) {
    if (!editTrade) return;
    const current: string[] = Array.isArray(editTrade.images) ? editTrade.images : [];
    const next = current.filter((_, i) => i !== idx);
    setEditTrade({ ...editTrade, images: next });
  }

  /* ------------------------------ Tags (chips) ------------------------------ */
  function normalizeTag(s: string) {
    return s.trim().replace(/\s+/g, " ");
  }

  function addTagFromDraft() {
    if (!editTrade) return;
    const v = normalizeTag(tagDraft);
    if (!v) return;

    const current: string[] = Array.isArray(editTrade.tags) ? editTrade.tags : [];
    const exists = current.some((x) => String(x).toLowerCase() === v.toLowerCase());
    if (exists) {
      setTagDraft("");
      return;
    }

    if (current.length >= 20) {
      pushNotif({ kind: "warning", title: "Tags", message: "Max 20 tags par trade.", ttlMs: 7000 });
      return;
    }

    setEditTrade({ ...editTrade, tags: [...current, v] });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    if (!editTrade) return;
    const current: string[] = Array.isArray(editTrade.tags) ? editTrade.tags : [];
    setEditTrade({ ...editTrade, tags: current.filter((t) => t !== tag) });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Journal de trading</h1>
          <p className="text-[color:var(--muted)] mt-1">
            Trades manuels + MT5 Sync. Rapports & classement utilisent ces données.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setOpenSync(true)}>
            Sync MT5
          </Button>
          <Button variant="secondary" onClick={() => expandAll(true)} type="button">
            Tout ouvrir
          </Button>
          <Button variant="secondary" onClick={() => expandAll(false)} type="button">
            Tout fermer
          </Button>
          <Button variant="danger" onClick={clearAllTrades}>
            Tout supprimer
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <div className="text-xs text-[color:var(--muted)]">PnL total (filtré)</div>
            <div
              className={
                (globalStats.pnl >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]") +
                " mt-1 text-2xl font-semibold"
              }
            >
              {fmt(globalStats.pnl)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-[color:var(--muted)]">Trades</div>
            <div className="mt-1 text-2xl font-semibold text-white">{globalStats.total}</div>
            <div className="mt-2 text-xs text-white/50">
              WIN {globalStats.win} • LOSS {globalStats.loss} • BE {globalStats.be}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-[color:var(--muted)]">Winrate</div>
            <div className="mt-1 text-2xl font-semibold text-white">{fmt(globalStats.winrate)}%</div>
            <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden border border-white/10">
              <div
                className="h-full bg-[color:var(--gold)]"
                style={{ width: `${Math.min(100, Math.max(0, globalStats.winrate))}%` }}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-[color:var(--muted)]">RR moyen</div>
            <div className="mt-1 text-2xl font-semibold text-white">{globalStats.rrAvg ? fmt(globalStats.rrAvg) : "—"}</div>
            <div className="mt-2 text-xs text-white/40">Basé sur rr / riskReward si présent</div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="block md:col-span-2">
              <div className="text-sm text-white/70 mb-2">Recherche</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="btc, london, news..."
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                           text-white placeholder:text-white/30 outline-none
                           focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Résultat</div>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value as any)}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                           text-white outline-none
                           focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              >
                <option value="Tous">Tous</option>
                <option value="WIN">WIN</option>
                <option value="LOSS">LOSS</option>
                <option value="BE">BE</option>
              </select>
            </label>

            <CardSubCard>
              <div className="text-xs text-[color:var(--muted)]">Jours affichés</div>
              <div className="mt-1 text-lg font-semibold text-white">{grouped.length}</div>
              <div className="mt-2 text-xs text-white/40">Groupé par date</div>
            </CardSubCard>
          </div>
        </CardBody>
      </Card>

      {/* Grouped by day */}
      <div className="space-y-4">
        {grouped.length === 0 ? (
          <Card>
            <CardBody>
              <div className="text-sm text-[color:var(--muted)]">
                Aucun trade pour ces filtres. Lance une Sync MT5 ou ajoute des trades manuels.
              </div>
            </CardBody>
          </Card>
        ) : null}

        {grouped.map((g) => {
          const isOpen = !!openDays[g.day];

          // ✅ pagination calc
          const totalPages = Math.max(1, Math.ceil(g.list.length / PAGE_SIZE));
          const page = Math.min(dayPage[g.day] ?? 0, totalPages - 1);
          const start = page * PAGE_SIZE;
          const slice = g.list.slice(start, start + PAGE_SIZE);

          return (
            <Card key={g.day}>
              <CardBody className="space-y-3">
                {/* Day header */}
                <button
                  type="button"
                  onClick={() => toggleDay(g.day)}
                  className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] flex items-center justify-center text-[color:var(--gold)] font-semibold">
                      {g.total}
                    </div>
                    <div>
                      <div className="font-semibold text-white capitalize">{frDayLabel(g.day)}</div>
                      <div className="text-xs text-[color:var(--muted)]">
                        WIN {g.win} • LOSS {g.loss} • BE {g.be} • Winrate {fmt(g.winrate)}%{" "}
                        {g.rrAvg ? `• RR ${fmt(g.rrAvg)}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={
                        (g.pnl >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]") +
                        " text-lg font-semibold"
                      }
                    >
                      {fmt(g.pnl)}
                    </div>
                    <div className="text-white/60">{isOpen ? "▲" : "▼"}</div>
                  </div>
                </button>

                {/* Trades list */}
                {isOpen ? (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    {slice.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-col md:flex-row md:items-center gap-4 px-3 py-3 rounded-2xl border border-white/10 bg-black/10"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate">
                            {t.symbol ?? "—"}{" "}
                            <span className="text-[color:var(--muted)]">
                              • {t.market ?? "—"} {t.time ? `• ${t.time}` : ""}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2 items-center">
                            <span
                              className={
                                "text-[10px] px-2 py-0.5 rounded-full border " +
                                badgeResultClass(String(t.result ?? ""))
                              }
                            >
                              {t.result ?? "—"}
                            </span>

                            {Array.isArray(t?.tags)
                              ? t.tags.map((x: string) => (
                                  <span
                                    key={x}
                                    className="text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                                  >
                                    {x}
                                  </span>
                                ))
                              : null}

                            {t?.rr || t?.riskReward ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70">
                                RR {fmt(safeNum(t.rr ?? t.riskReward))}
                              </span>
                            ) : null}
                          </div>

                          {t.note ? <div className="mt-2 text-xs text-[color:var(--muted)]">{t.note}</div> : null}

                          {/* Images preview (mini) + click to enlarge */}
                          {Array.isArray(t?.images) && t.images.length ? (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                              {t.images.slice(0, 3).map((src: string, i: number) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => openImage(src, `${t.symbol ?? "Trade"} • Image ${i + 1}`)}
                                  className="group shrink-0 w-24 h-16 rounded-xl overflow-hidden border border-white/10 bg-black/10 relative"
                                  title="Clique pour agrandir"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt={`img-${i}`} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/35 backdrop-blur-[1px] flex items-center justify-center">
                                    <ZoomIn className="h-5 w-5 text-white/90" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="text-right min-w-[140px]">
                          <div className="text-xs text-[color:var(--muted)]">PnL</div>
                          <div
                            className={
                              (safeNum(t?.pnl) >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]") +
                              " text-lg font-semibold"
                            }
                          >
                            {fmt(safeNum(t?.pnl))}
                          </div>

                          <div className="text-xs text-[color:var(--muted)] mt-2">Discipline</div>
                          <div className="text-white font-semibold">{safeNum(t?.discipline)}/10</div>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => openEditTrade(t)}>
                            Modifier
                          </Button>
                          <Button variant="danger" onClick={() => removeTrade(t.id)}>
                            Supprimer
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* ✅ Mini pagination si +10 trades */}
                    {totalPages > 1 ? (
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2">
                        <div className="text-xs text-white/40">
                          Trades {start + 1}-{Math.min(start + PAGE_SIZE, g.list.length)} / {g.list.length}
                          {" • "}
                          Page {page + 1}/{totalPages}
                        </div>

                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => setDayPage((prev) => ({ ...prev, [g.day]: Math.max(0, page - 1) }))}
                            disabled={page <= 0}
                          >
                            Précédent
                          </Button>
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() =>
                              setDayPage((prev) => ({ ...prev, [g.day]: Math.min(totalPages - 1, page + 1) }))
                            }
                            disabled={page >= totalPages - 1}
                          >
                            Suivant
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Edit modal */}
      <Modal
        open={openEdit}
        title="Modifier le trade"
        onClose={() => setOpenEdit(false)}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpenEdit(false)}>
              Annuler
            </Button>
            <Button onClick={saveEdit}>Enregistrer</Button>
          </div>
        }
      >
        {editTrade ? (
          <div className="space-y-4">
            <label className="block">
              <div className="text-sm text-white/70 mb-2">Symbol</div>
              <input
                value={editTrade.symbol ?? ""}
                onChange={(e) => setEditTrade({ ...editTrade, symbol: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Date</div>
              <input
                value={editTrade.date ?? ""}
                onChange={(e) => setEditTrade({ ...editTrade, date: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
              <div className="mt-2 text-xs text-white/40">Format conseillé : YYYY-MM-DD ou JJ/MM/AAAA</div>
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">PnL</div>
              <input
                value={String(editTrade.pnl ?? "")}
                onChange={(e) => setEditTrade({ ...editTrade, pnl: Number(String(e.target.value).replace(",", ".")) })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Résultat</div>
              <select
                value={editTrade.result ?? "WIN"}
                onChange={(e) => setEditTrade({ ...editTrade, result: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              >
                <option value="WIN">WIN</option>
                <option value="LOSS">LOSS</option>
                <option value="BE">BE</option>
              </select>
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Discipline</div>
              <input
                value={String(editTrade.discipline ?? 0)}
                onChange={(e) =>
                  setEditTrade({ ...editTrade, discipline: Number(String(e.target.value).replace(",", ".")) })
                }
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
            </label>

            {/* ✅ TAGS chips */}
            <label className="block">
              <div className="text-sm text-white/70 mb-2">Tags</div>

              <div className="flex flex-wrap gap-2 mb-2">
                {(Array.isArray(editTrade.tags) ? editTrade.tags : []).map((t: string) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-2 text-[11px] px-3 py-1 rounded-full
                               border border-[color:var(--gold-border)]
                               bg-[color:var(--gold-soft)]
                               text-[color:var(--gold)]"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="h-5 w-5 rounded-full border border-white/10 bg-black/30 hover:bg-black/50
                                 flex items-center justify-center text-white/80"
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTagFromDraft();
                  }
                  if (e.key === "Backspace" && !tagDraft) {
                    const current: string[] = Array.isArray(editTrade.tags) ? editTrade.tags : [];
                    if (current.length) removeTag(current[current.length - 1]);
                  }
                }}
                placeholder="Tape un tag puis Entrée"
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                           text-white placeholder:text-white/30 outline-none
                           focus:border-[color:var(--gold-border)]
                           focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
              />

              <div className="mt-2 text-xs text-white/40">Entrée = ajoute • Backspace vide = supprime le dernier</div>
            </label>

            {/* Images */}
            <label className="block">
              <div className="text-sm text-white/70 mb-2">Images (max 3 • 3MB max)</div>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => addImages(e.target.files)}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />

              <div className="mt-3 grid grid-cols-3 gap-3">
                {(Array.isArray(editTrade?.images) ? editTrade.images : []).map((src: string, i: number) => (
                  <div key={i} className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/10">
                    <button
                      type="button"
                      onClick={() => openImage(src, `${editTrade.symbol ?? "Trade"} • Image ${i + 1}`)}
                      className="group block w-full"
                      title="Clique pour agrandir"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`img-${i}`} className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/35 backdrop-blur-[1px] flex items-center justify-center">
                        <ZoomIn className="h-5 w-5 text-white/90" />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => removeImageAt(i)}
                      className="absolute top-2 right-2 px-2 py-1 rounded-xl text-xs border border-white/10 bg-black/60 hover:bg-black/80"
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 text-xs text-white/40">Formats: jpg / png / webp • Taille max: 3MB</div>
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Note</div>
              <input
                value={editTrade.note ?? ""}
                onChange={(e) => setEditTrade({ ...editTrade, note: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
            </label>
          </div>
        ) : null}
      </Modal>

      {/* Sync modal */}
      <Modal
        open={openSync}
        title="Sync MT5"
        onClose={() => setOpenSync(false)}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpenSync(false)}>
              Annuler
            </Button>
            <Button onClick={doSync} disabled={busy}>
              {busy ? "Sync..." : "Lancer Sync"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-[color:var(--muted)]">Choisis les comptes MT5 à synchroniser.</div>

          <div className="space-y-2">
            {mt5Accounts.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">
                Aucun compte MT5 connecté. Va sur Comptes et clique “Tester”.
              </div>
            ) : (
              mt5Accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAccount(a.id)}
                  className={[
                    "w-full text-left px-4 py-3 rounded-2xl border transition flex items-center justify-between",
                    selectedIds.includes(a.id)
                      ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                      : "border-[color:var(--border)] bg-black/20 hover:bg-white/5",
                  ].join(" ")}
                  type="button"
                >
                  <div>
                    <div className="font-semibold text-white">{a.label}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {a.broker} • {a.server}
                    </div>
                  </div>
                  <div className="text-lg">{selectedIds.includes(a.id) ? "✅" : "⬜"}</div>
                </button>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPresetDays(7)} type="button">
              7j
            </Button>
            <Button variant="secondary" onClick={() => setPresetDays(30)} type="button">
              30j
            </Button>
            <Button variant="secondary" onClick={() => setPresetDays(60)} type="button">
              60j
            </Button>
            <Button variant="secondary" onClick={() => setPresetDays(90)} type="button">
              90j
            </Button>
            <Button variant="secondary" onClick={() => setPresetDays(180)} type="button">
              180j
            </Button>
            <Button variant="secondary" onClick={() => setPresetDays(365)} type="button">
              365j
            </Button>
          </div>

          <label className="block">
            <div className="text-sm text-white/70 mb-2">Période (jours)</div>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="30"
              className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
            />
            <div className="mt-2 text-xs text-white/40">Par défaut: 30 jours • Min: 1 • Max: 365</div>
          </label>
        </div>
      </Modal>

      {/* ✅ Lightbox image */}
      <Modal
        open={openImg}
        title={imgTitle}
        onClose={() => setOpenImg(false)}
        maxWidthClassName="max-w-5xl"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpenImg(false)}>
              Fermer
            </Button>
          </div>
        }
      >
        <div className="flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={imgTitle}
            className="max-h-[70vh] w-auto rounded-2xl border border-white/10"
          />
        </div>
      </Modal>
    </div>
  );
}
