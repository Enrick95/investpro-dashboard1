"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { loadTrades, saveTrades } from "../../../lib/tradesStore";
import { loadMt5Accounts, Mt5Account } from "../../../lib/mt5Store";
import { syncMt5HistoryToTrades } from "../../../lib/mt5sync";
import { pushNotif } from "../../../lib/notifyStore"; // ✅ notifications globales

type Trade = any;

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function clampDays(v: number) {
  return Math.max(1, Math.min(365, v));
}

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<"Tous" | "WIN" | "LOSS" | "BE">("Tous");

  // edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);

  // sync modal
  const [openSync, setOpenSync] = useState(false);
  const [mt5Accounts, setMt5Accounts] = useState<Mt5Account[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [days, setDays] = useState("30"); // ✅ default 30 jours

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTrades(loadTrades());
    const list = loadMt5Accounts().filter((a) => a.status === "CONNECTED");
    setMt5Accounts(list);
    if (list.length) setSelectedIds([list[0].id]);
  }, []);

  const stats = useMemo(() => {
    const pnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    return { pnl };
  }, [trades]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return trades
      .filter((t) => (result === "Tous" ? true : t.result === result))
      .filter((t) => {
        if (!s) return true;
        const hay = `${t.symbol ?? ""} ${t.market ?? ""} ${(t.tags ?? []).join(" ")} ${t.note ?? ""}`.toLowerCase();
        return hay.includes(s);
      });
  }, [trades, q, result]);

  function removeTrade(id: string) {
    const next = trades.filter((t) => t.id !== id);
    setTrades(next);
    saveTrades(next);
    pushNotif({ kind: "info", title: "Journal", message: "Trade supprimé.", ttlMs: 6000 });
  }

  function openEditTrade(t: Trade) {
    setEditTrade({ ...t, tags: Array.isArray(t.tags) ? [...t.tags] : [] });
    setOpenEdit(true);
  }

  function saveEdit() {
    if (!editTrade) return;
    const next = trades.map((t) => (t.id === editTrade.id ? editTrade : t));
    setTrades(next);
    saveTrades(next);
    setOpenEdit(false);
    pushNotif({ kind: "success", title: "Journal", message: "Trade modifié.", ttlMs: 7000 });
  }

  function toggle(id: string) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Journal de trading</h1>
          <p className="text-[color:var(--muted)] mt-1">
            Trades manuels + MT5 Sync. Rapports & classement utilisent ces données.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setOpenSync(true)}>
            Sync MT5
          </Button>
          <Button variant="danger" onClick={clearAllTrades}>
            Tout supprimer
          </Button>
        </div>
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
              <div className="text-xs text-[color:var(--muted)]">PnL total</div>
              <div
                className={
                  (stats.pnl >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]") +
                  " mt-1 text-lg font-semibold"
                }
              >
                {fmt(stats.pnl)}
              </div>
            </CardSubCard>
          </div>
        </CardBody>
      </Card>

      {/* Trades */}
      <div className="space-y-3">
        {filtered.map((t) => (
          <Card key={t.id}>
            <CardBody className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <div className="font-semibold text-white">
                  {t.symbol} <span className="text-[color:var(--muted)]">• {t.market} • {t.date}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70">
                    {t.result}
                  </span>
                  {(t.tags ?? []).map((x: string) => (
                    <span
                      key={x}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                    >
                      {x}
                    </span>
                  ))}
                </div>
                {t.note ? <div className="mt-2 text-xs text-[color:var(--muted)]">{t.note}</div> : null}
              </div>

              <div className="text-right min-w-[140px]">
                <div className="text-xs text-[color:var(--muted)]">PnL</div>
                <div
                  className={
                    (Number(t.pnl) >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]") +
                    " text-lg font-semibold"
                  }
                >
                  {fmt(Number(t.pnl) || 0)}
                </div>
                <div className="text-xs text-[color:var(--muted)] mt-2">Discipline</div>
                <div className="text-white font-semibold">{t.discipline ?? 0}/10</div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => openEditTrade(t)}>
                  Modifier
                </Button>
                <Button variant="danger" onClick={() => removeTrade(t.id)}>
                  Supprimer
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
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
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">PnL</div>
              <input
                value={String(editTrade.pnl ?? "")}
                onChange={(e) => setEditTrade({ ...editTrade, pnl: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Discipline</div>
              <input
                value={String(editTrade.discipline ?? 0)}
                onChange={(e) => setEditTrade({ ...editTrade, discipline: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Tags (espaces)</div>
              <input
                value={(editTrade.tags ?? []).join(" ")}
                onChange={(e) => setEditTrade({ ...editTrade, tags: e.target.value.split(" ").filter(Boolean) })}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white outline-none"
              />
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
          <div className="text-sm text-[color:var(--muted)]">
            Choisis les comptes MT5 à synchroniser.
          </div>

          <div className="space-y-2">
            {mt5Accounts.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">
                Aucun compte MT5 connecté. Va sur Comptes et clique “Tester”.
              </div>
            ) : (
              mt5Accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
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

          {/* presets */}
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
            <div className="mt-2 text-xs text-white/40">
              Par défaut: 30 jours • Min: 1 • Max: 365
            </div>
          </label>
        </div>
      </Modal>
    </div>
  );
}
