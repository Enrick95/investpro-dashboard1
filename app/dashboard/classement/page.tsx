"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";

import { loadLeaderboard, upsertLeaderboardUser } from "../../../lib/uiStore";
import { getCurrentAccount, setLeaderboardVisibility } from "../../../lib/authStore";
import { loadTrades } from "../../../lib/tradesStore";
import { pushNotif } from "../../../lib/notifyStore";

import { Lock, Unlock } from "lucide-react";

/* -------------------------------- Types -------------------------------- */
type MediaTransform = { zoom: number; panX: number; panY: number };

type LeaderUser = {
  username: string;
  tag?: string;
  bio?: string;
  profitUsd?: number;
  showOnLeaderboard?: boolean;

  // stats public (optionnels)
  tradesTotal?: number;
  winrate?: number;
  rrAvg?: number;

  // legacy avatar
  avatarDataUrl?: string;

  // ✅ new media (IndexedDB)
  avatarMediaId?: string;
  bannerMediaId?: string;
  avatarTransform?: MediaTransform;
  bannerTransform?: MediaTransform;

  // privacy (legacy)
  hideTrades?: boolean;
};

/* ----------------------------- Helpers UI ----------------------------- */
function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}
function money(n: any) {
  const v = Number(n ?? 0);
  return `$${v.toFixed(2)}`;
}
function initialsOf(username: string) {
  return (username || "IP").slice(0, 2).toUpperCase();
}

/* ------------------------- IndexedDB (avatars) ------------------------- */
const IDB_DB = "investpro_media_db_v1";
const IDB_STORE = "files";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_open_failed"));
  });
}

async function idbGetBlob(id: string): Promise<Blob | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error || new Error("idb_get_failed"));
  });
}

/* ------------------------------ UI blocks ------------------------------ */
function Avatar({
  username,
  avatarDataUrl,
  avatarMediaId,
  avatarSrc,
  size = 44,
}: {
  username: string;
  avatarDataUrl?: string;
  avatarMediaId?: string;
  avatarSrc?: string; // resolved objectURL from IDB (cache)
  size?: number;
}) {
  const src = avatarSrc || avatarDataUrl || "";
  return (
    <div
      className="relative rounded-full border border-[color:var(--gold-border)] bg-[color:var(--panel-2)]
                 overflow-hidden flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      title={username}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-[color:var(--gold)]">
          {initialsOf(username)}
        </span>
      )}
    </div>
  );
}

function RankPill({ rank }: { rank: number }) {
  const top3 = rank <= 3;
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center h-8 min-w-[56px] px-3 rounded-2xl border text-sm font-semibold",
        top3
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
          : "border-white/10 bg-black/20 text-white/70"
      )}
    >
      #{rank}
    </span>
  );
}

function TopBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold
                 border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
    >
      TOP 10
    </span>
  );
}

function ProfitPill({ profitUsd }: { profitUsd: number }) {
  const v = Number(profitUsd ?? 0);
  return (
    <div className="text-right">
      <div
        className={cx(
          "text-sm font-semibold",
          v >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
        )}
      >
        {money(v)}
      </div>
      <div className="text-[10px] text-[color:var(--muted)]">profit</div>
    </div>
  );
}

/* -------------------------- Stats from trades -------------------------- */
function computePublicStatsFromTrades(trades: any[]) {
  const list = Array.isArray(trades) ? trades : [];
  const total = list.length;
  const win = list.filter((t) => t.result === "WIN").length;
  const winrate = total > 0 ? (win / total) * 100 : 0;

  const rrVals = list
    .map((t) => Number(t.rr))
    .filter((x) => Number.isFinite(x));
  const rrAvg = rrVals.length ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : undefined;

  return { tradesTotal: total, winrate, rrAvg };
}

/* -------------------------------- Page -------------------------------- */
export default function ClassementPage() {
  const [refresh, setRefresh] = useState(0);
  const [q, setQ] = useState("");

  // ✅ reactive account (instant UI update)
  const [me, setMe] = useState<any>(() => getCurrentAccount());
  const isPublic = !!me?.showOnLeaderboard;

  useEffect(() => {
    function onAccUpdated(e: any) {
      const next = e?.detail ?? getCurrentAccount();
      setMe(next);
    }
    window.addEventListener("investpro:account_updated", onAccUpdated as any);
    return () => window.removeEventListener("investpro:account_updated", onAccUpdated as any);
  }, []);

  // ✅ écoute l’event envoyé par Paramètres (profil public ON/OFF)
  useEffect(() => {
    function onLeaderboardUpdated(e: any) {
      const d = e?.detail;
      const username = String(d?.username || "");
      const visible = !!d?.visible;

      // refresh liste
      setRefresh((v) => v + 1);

      // si c'est toi, update local state pour que le bouton Public/Privé reflète le changement
      setMe((prev: any) => {
        if (!prev?.username) return prev;
        if (String(prev.username).toLowerCase() !== username.toLowerCase()) return prev;
        return { ...prev, showOnLeaderboard: visible };
      });
    }

    // storage (si autre onglet)
    function onStorage() {
      setRefresh((v) => v + 1);
      setMe(getCurrentAccount());
    }

    window.addEventListener("investpro:leaderboard_updated", onLeaderboardUpdated as any);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("investpro:leaderboard_updated", onLeaderboardUpdated as any);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const [openPrivacyModal, setOpenPrivacyModal] = useState(false);

  const rows = useMemo(() => {
    return loadLeaderboard()
      .filter((u: any) => u?.showOnLeaderboard)
      .map((u: any) => ({ ...u, profitUsd: Number(u?.profitUsd ?? 0) }))
      .sort((a: any, b: any) => (b?.profitUsd ?? 0) - (a?.profitUsd ?? 0)) as LeaderUser[];
  }, [refresh]);

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((u: any) => {
      const hay = `${u.username ?? ""} ${u.tag ?? ""} ${u.bio ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);

  // ✅ cache avatar objectURL by avatarMediaId
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    async function resolveVisibleAvatars() {
      const ids = new Set<string>();
      for (const u of top3) if (u?.avatarMediaId) ids.add(u.avatarMediaId);
      for (const u of filteredRows.slice(0, 25)) if (u?.avatarMediaId) ids.add(u.avatarMediaId);

      const toFetch = Array.from(ids).filter((id) => !avatarCache[id]);
      if (!toFetch.length) return;

      const next: Record<string, string> = {};
      for (const id of toFetch) {
        try {
          const blob = await idbGetBlob(id);
          if (!alive) return;
          if (blob) next[id] = URL.createObjectURL(blob);
        } catch {}
      }

      if (!alive) return;
      if (Object.keys(next).length) setAvatarCache((p) => ({ ...p, ...next }));
    }

    resolveVisibleAvatars();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top3, filteredRows]);

  const myRank = useMemo(() => {
    if (!me?.username) return null;
    const idx = rows.findIndex((x: any) => x.username === me.username);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, me?.username]);

  function refreshList() {
    setRefresh((v) => v + 1);
    pushNotif({ kind: "info", title: "Classement", message: "Liste rafraîchie.", ttlMs: 4500 });
  }

  function togglePopup() {
    if (!me) {
      pushNotif({
        kind: "warning",
        title: "Classement",
        message: "Connecte-toi pour changer la visibilité.",
        ttlMs: 9000,
      });
      return;
    }
    setOpenPrivacyModal(true);
  }

  function setPublic(nextPublic: boolean) {
    if (!me) {
      pushNotif({
        kind: "warning",
        title: "Classement",
        message: "Connecte-toi pour changer la visibilité.",
        ttlMs: 9000,
      });
      return;
    }

    const updated = setLeaderboardVisibility(nextPublic);
    if (!updated) {
      pushNotif({
        kind: "error",
        title: "Classement",
        message: "Impossible de modifier la visibilité.",
        ttlMs: 10000,
      });
      return;
    }

    setMe(updated);

    // ✅ stats (si pas déjà dans account, on calcule depuis trades)
    const t = loadTrades();
    const computed = computePublicStatsFromTrades(t);

    const payload: any = {
      ...updated,
      showOnLeaderboard: nextPublic,
      profitUsd: Number(updated.profitUsd ?? 0),
      bio: updated.bio ?? "",
      tag: updated.tag ?? "",
      hideTrades: !!updated.hideTrades,

      avatarDataUrl: updated.avatarDataUrl ?? "",
      avatarMediaId: updated.avatarMediaId,
      bannerMediaId: updated.bannerMediaId,
      avatarTransform: updated.avatarTransform,
      bannerTransform: updated.bannerTransform,

      tradesTotal: typeof updated.tradesTotal === "number" ? updated.tradesTotal : computed.tradesTotal,
      winrate: typeof updated.winrate === "number" ? updated.winrate : computed.winrate,
      rrAvg: typeof updated.rrAvg === "number" ? updated.rrAvg : computed.rrAvg,
    };

    upsertLeaderboardUser(payload);

    // ✅ ping instant (utile si d’autres pages écoutent)
    window.dispatchEvent(
      new CustomEvent("investpro:leaderboard_updated", {
        detail: { username: updated.username, visible: nextPublic },
      })
    );

    pushNotif({
      kind: "success",
      title: "Visibilité",
      message: nextPublic
        ? "Ton profil est maintenant PUBLIC (visible dans le classement)."
        : "Ton profil est maintenant PRIVÉ (masqué du classement).",
      ttlMs: 9000,
    });

    setOpenPrivacyModal(false);
    setRefresh((v) => v + 1);
  }

  return (
    <div className="space-y-6">
      {/* HERO */}
      <Card>
        <CardBody className="relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(900px 260px at 20% 0%, rgba(214,179,95,.18), transparent 60%), radial-gradient(700px 240px at 85% 10%, rgba(255,255,255,.06), transparent 55%)",
            }}
          />
          <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <div className="text-xs text-white/50">InvestPro • Classement</div>
              <h1 className="text-3xl font-semibold text-white mt-1">
                Classement <span className="text-[color:var(--gold)]">Profit</span>
              </h1>
              <div className="text-sm text-[color:var(--muted)] mt-2">
                Active ton profil public pour apparaître. Clique sur un joueur pour ouvrir son profil.
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="px-3 py-1.5 rounded-2xl border border-white/10 bg-black/20 text-xs text-white/70">
                  Membres publics : <b className="text-white">{rows.length}</b>
                </span>

                {me?.username ? (
                  <span className="px-3 py-1.5 rounded-2xl border border-white/10 bg-black/20 text-xs text-white/70">
                    Ton rang :{" "}
                    <b className="text-white">{myRank ? `#${myRank}` : isPublic ? "—" : "Privé"}</b>
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-2xl border border-white/10 bg-black/20 text-xs text-white/60">
                    Connecte-toi pour afficher ton rang.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              {/* Search */}
              <div className="w-full sm:w-[340px]">
                <div className="text-xs text-white/70 mb-1">Rechercher</div>
                <div className="relative">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Pseudo, tag, bio..."
                    className="w-full px-4 py-3 pr-10 rounded-2xl bg-black/20 border border-[color:var(--border)]
                               text-white placeholder:text-white/30 outline-none
                               focus:border-[color:var(--gold-border)]
                               focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={refreshList}>
                  Rafraîchir
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* TOP 3 */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">
                Podium <span className="text-[color:var(--gold)]">Top 3</span>
              </div>
              <div className="text-xs text-[color:var(--muted)] mt-1">Les 3 meilleurs profits</div>
            </div>
            <div className="text-xs text-white/40">Clique pour ouvrir le profil</div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {top3.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">Personne dans le classement pour l’instant.</div>
            ) : (
              top3.map((u, idx) => {
                const rank = idx + 1;
                const medal = rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉";
                const size = rank === 1 ? 72 : rank === 2 ? 60 : 56;

                return (
                  <Link
                    key={u.username}
                    href={`/dashboard/classement/${encodeURIComponent(u.username)}`}
                    className="block"
                  >
                    <div
                      className={cx(
                        "rounded-3xl border border-white/10 bg-black/20 hover:bg-white/5 transition p-5 cursor-pointer",
                        rank === 1 ? "ring-1 ring-[color:var(--gold-border)]" : ""
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <RankPill rank={rank} />
                        <span className="text-2xl">{medal}</span>
                      </div>

                      <div className="mt-4 flex items-center gap-4">
                        <div className="relative">
                          <Avatar
                            username={u.username}
                            avatarDataUrl={u.avatarDataUrl}
                            avatarMediaId={u.avatarMediaId}
                            avatarSrc={u.avatarMediaId ? avatarCache[u.avatarMediaId] : ""}
                            size={size}
                          />
                          <div className="absolute -left-2 -top-2">
                            <TopBadge show={true} />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-base font-semibold text-white truncate">{u.username}</div>
                          <div className="text-xs text-[color:var(--muted)] truncate">{u.tag ?? ""}</div>
                          <div className="mt-2">
                            <ProfitPill profitUsd={u.profitUsd ?? 0} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 text-xs text-white/40 line-clamp-2">{u.bio ?? "—"}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </CardBody>
      </Card>

      {/* LIST */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-white">Classement complet</div>
            <div className="text-xs text-white/40">
              {filteredRows.length} résultat{filteredRows.length > 1 ? "s" : ""}
            </div>
          </div>

          <div className="mt-4">
            {filteredRows.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">Aucun résultat pour “{q}”.</div>
            ) : (
              <div className="space-y-2">
                {filteredRows.map((u) => {
                  const rank = rows.findIndex((x) => x.username === u.username) + 1;
                  const isTop10 = rank > 0 && rank <= 10;

                  return (
                    <Link
                      key={u.username}
                      href={`/dashboard/classement/${encodeURIComponent(u.username)}`}
                      className="block"
                    >
                      <CardSubCard className="p-3 hover:bg-white/5 transition cursor-pointer">
                        <div className="flex items-center gap-3">
                          <RankPill rank={rank} />

                          <Avatar
                            username={u.username}
                            avatarDataUrl={u.avatarDataUrl}
                            avatarMediaId={u.avatarMediaId}
                            avatarSrc={u.avatarMediaId ? avatarCache[u.avatarMediaId] : ""}
                            size={44}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-white truncate">{u.username}</span>
                              <span className="text-[color:var(--muted)] text-sm shrink-0">{u.tag ?? ""}</span>
                              <TopBadge show={isTop10} />
                            </div>
                            <div className="text-xs text-[color:var(--muted)] line-clamp-1">{u.bio ?? "—"}</div>
                          </div>

                          <ProfitPill profitUsd={u.profitUsd ?? 0} />
                        </div>
                      </CardSubCard>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* VISIBILITY MODAL */}
      <Modal
        open={openPrivacyModal}
        title="Visibilité du profil"
        onClose={() => setOpenPrivacyModal(false)}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpenPrivacyModal(false)}>
              Annuler
            </Button>

            {isPublic ? (
              <Button variant="secondary" onClick={() => setPublic(false)} title="Tu disparais du classement">
                Rendre privé
              </Button>
            ) : (
              <Button onClick={() => setPublic(true)} title="Tu apparais dans le classement">
                Rendre public
              </Button>
            )}
          </div>
        }
      >
        <div className="text-sm text-[color:var(--muted)]">
          Un profil public est visible par tous les utilisateurs d’InvestPro via le classement.
        </div>

        <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-black/20 p-4 text-sm">
          <div className="text-white font-semibold">Statut actuel :</div>
          <div className="mt-1">
            {isPublic ? (
              <span className="text-[color:var(--success)] font-semibold">PUBLIC</span>
            ) : (
              <span className="text-[color:var(--danger)] font-semibold">PRIVÉ</span>
            )}
          </div>
          <div className="mt-2 text-xs text-white/40">
            {isPublic ? "Ton profil apparaît dans le classement." : "Ton profil est masqué (tu n’apparais pas dans le classement)."}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// FORCE_DEPLOY_123
