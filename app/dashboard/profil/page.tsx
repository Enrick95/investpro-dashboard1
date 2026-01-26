"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";

import { getCurrentAccount, updateAccount } from "../../../lib/authStore";
import { loadTrades } from "../../../lib/tradesStore";
import { pushNotif } from "../../../lib/notifyStore";
import { getPlan } from "../../../lib/subscriptionStore";

import {
  Eye,
  EyeOff,
  Paperclip,
  Smile,
  Search,
  MoreHorizontal,
  Pin,
  Flag,
  Trash2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/* ---------------------------------- Types --------------------------------- */
type Att = {
  id: string;
  kind: "gif" | "video" | "audio";
  name: string;
  mime: string;
  dataUrl: string;
};

type Comment = {
  id: string;
  createdAt: number;
  pinned?: boolean;
  reported?: boolean;
  author: { username: string; tag?: string; avatarDataUrl?: string };
  text: string;
  attachments?: Att[];
  reactions?: Record<string, number>;
  reactedBy?: Record<string, string[]>; // emoji -> [usernames]
};

type MediaMode = "banner" | "avatar";

/** Transform stored (NO LOSS): zoom + pan normalized (relative to container) */
type MediaTransform = {
  zoom: number; // 1..3
  panX: number; // -1..1 (normalized)
  panY: number; // -1..1
};

type AccountMediaFields = {
  bannerMediaId?: string;
  bannerTransform?: MediaTransform;
  avatarMediaId?: string;
  avatarTransform?: MediaTransform;

  // legacy support
  bannerDataUrl?: string;
  avatarDataUrl?: string;

  bio?: string;
  hideTrades?: boolean;
};

/* -------------------- ✅ SYNC BIO (profil -> classement) -------------------- */
function publicProfileKeyFor(username: string) {
  return `investpro_public_profile_v1_${(username || "unknown").toLowerCase()}`;
}

/* -------------------- ✅ PUBLIC TRADES/STATS (profil -> classement) -------------------- */
type PublicTrade = {
  id: string;
  date?: string;
  symbol?: string;
  pnl?: number;
  result?: "WIN" | "LOSS" | "BE" | string;
};

type PublicStats = {
  tradesTotal: number;
  winrate: number; // 0..100
  rrAvg: number; // RR moyen
};

function publicTradesKeyFor(username: string) {
  return `investpro_public_trades_v1_${(username || "unknown").toLowerCase()}`;
}
function publicStatsKeyFor(username: string) {
  return `investpro_public_stats_v1_${(username || "unknown").toLowerCase()}`;
}

function toPublicTradeLight(t: any): PublicTrade {
  return {
    id: String(t?.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`),
    date: String(t?.date ?? t?.closedAt ?? t?.openedAt ?? ""),
    symbol: String(t?.symbol ?? ""),
    pnl: Number(t?.pnl ?? 0),
    result: t?.result ?? "",
  };
}

function computePublicStats(tradesList: any[]): PublicStats {
  const total = Array.isArray(tradesList) ? tradesList.length : 0;

  let wins = 0;

  let rrSum = 0;
  let rrCount = 0;

  for (const t of tradesList || []) {
    const res = String(t?.result ?? "").toUpperCase();
    if (res === "WIN") wins++;

    const rr = Number(t?.rr);
    if (Number.isFinite(rr)) {
      rrSum += rr;
      rrCount++;
    }
  }

  const winrate = total > 0 ? (wins / total) * 100 : 0;
  const rrAvg = rrCount > 0 ? rrSum / rrCount : 0;

  return { tradesTotal: total, winrate, rrAvg };
}

/* ✅ comments key per username (sync with classement/[username]) */
function commentsKeyFor(username: string) {
  return `investpro_profile_comments_v2_${(username || "unknown").toLowerCase()}`;
}

const IDB_DB = "investpro_media_db_v1";
const IDB_STORE = "files";

/* --------------------------------- Helpers -------------------------------- */
function safeId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function initialsOf(username: string) {
  const u = (username || "").trim();
  if (!u) return "IP";
  return u.slice(0, 2).toUpperCase();
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read_failed"));
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.readAsArrayBuffer(file);
  });
}

function detectKind(file: File): Att["kind"] | null {
  const t = (file.type || "").toLowerCase();
  if (t === "image/gif") return "gif";
  if (t === "video/mp4") return "video";
  if (t === "audio/mpeg") return "audio";
  return null;
}

function insertAtCursor(el: HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.value = next;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function resolveAuthorAvatar(c: Comment, me: any, myAvatarUrl: string) {
  if (me?.username && c.author.username === me.username) return myAvatarUrl || "";
  return c.author.avatarDataUrl || "";
}

function resolveAuthorTag(c: Comment, me: any) {
  if (me?.username && c.author.username === me.username) return me.tag || c.author.tag || "";
  return c.author.tag || "";
}

/* ------------------------------ IndexedDB Blob ------------------------------ */
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

async function idbPutBlob(id: string, blob: Blob) {
  const db = await idbOpen();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put({ id, blob, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("idb_put_failed"));
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
/* ---------------------------- Attachments render ---------------------------- */
function renderAttachment(a: Att) {
  if (!a.dataUrl) {
    return <div className="text-xs text-white/50">Fichier non conservé après refresh (stockage local).</div>;
  }

  if (a.kind === "gif") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.dataUrl} alt={a.name} className="max-h-[260px] w-auto rounded-xl border border-white/10" />;
  }

  if (a.kind === "video") {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video src={a.dataUrl} controls className="max-h-[260px] w-full rounded-xl border border-white/10" />;
  }

  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio src={a.dataUrl} controls className="w-full" />;
}

/* -------------------------- Emoji picker (compact) -------------------------- */
const EMOJIS = [
  "😀","😅","😂","🤣","😊","😍","😘","😎","😴","🤯","😡","🥶","🥵","🤔","🙏",
  "👍","👎","👏","🔥","💯","❤️","💛","💚","💙","💜","✨","✅","❌","⚡","🚀","👀","😭","🥲","😤","🤝","🫡","😮","😆","😋",
];

function EmojiPicker(props: { open: boolean; onPick: (e: string) => void }) {
  const { open, onPick } = props;
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const s = q.trim();
    if (!s) return EMOJIS;
    return EMOJIS.filter((e) => e.includes(s));
  }, [q]);

  if (!open) return null;

  return (
    <div className="absolute z-50 right-0 mt-2 w-[320px] rounded-2xl border border-white/10 bg-[color:var(--panel)] shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent outline-none text-sm text-white/80 placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="p-3 max-h-[260px] overflow-auto">
        <div className="grid grid-cols-9 gap-1.5">
          {list.map((e, i) => (
            <button
              key={`${e}-${i}`}
              type="button"
              onClick={() => onPick(e)}
              className="h-9 w-9 rounded-xl hover:bg-white/5 transition text-xl flex items-center justify-center"
              title={e}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------ No-loss Media Editor (CSS) ------------------------ */
type EditorState = {
  open: boolean;
  mode: MediaMode;
  objectUrl: string; // preview URL
  fileId: string; // IDB key
  transform: MediaTransform;
};

function defaultTransform(): MediaTransform {
  return { zoom: 1, panX: 0, panY: 0 };
}

function MediaEditorModal(props: {
  state: EditorState;
  busy: boolean;
  onClose: () => void;
  onApply: (fileId: string, transform: MediaTransform) => void;
}) {
  const { state, busy, onClose, onApply } = props;

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const [t, setT] = useState<MediaTransform>(state.transform);

  useEffect(() => {
    if (!state.open) return;
    setT(state.transform);
  }, [state.open, state.transform]);

  useEffect(() => {
    if (!state.open) return;
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.open]);

  const dragging = useRef(false);
  const start = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, panX: t.panX, panY: t.panY };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    const nx = start.current.panX + (size.w ? dx / size.w : 0);
    const ny = start.current.panY + (size.h ? dy / size.h : 0);

    setT((prev) => ({
      ...prev,
      panX: Math.max(-1, Math.min(1, nx)),
      panY: Math.max(-1, Math.min(1, ny)),
    }));
  }

  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false;
    start.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  function reset() {
    setT(defaultTransform());
  }

  function zoomBy(delta: number) {
    setT((p) => ({ ...p, zoom: Math.max(1, Math.min(3, +(p.zoom + delta).toFixed(2))) }));
  }

  const translateX = `${t.panX * 18}%`;
  const translateY = `${t.panY * 18}%`;

  const frameClass =
    state.mode === "banner"
      ? "rounded-2xl border border-white/10 bg-black/30 overflow-hidden"
      : "rounded-full border border-white/10 bg-black/30 overflow-hidden";

  return (
    <Modal
      open={state.open}
      title={state.mode === "banner" ? "Modifier la bannière" : "Modifier l'avatar"}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <RotateCcw className="w-4 h-4" />
            Réinitialiser
          </button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={() => onApply(state.fileId, t)} disabled={busy}>
              Appliquer
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-[color:var(--muted)]">
          Déplace l’image dans le cadre, puis ajuste le zoom. (Aucune perte de qualité)
        </div>

        <div className="flex justify-center">
          <div
            ref={frameRef}
            className={frameClass + " relative select-none touch-none"}
            style={{
              width: state.mode === "banner" ? "min(100%, 680px)" : "min(100%, 340px)",
              height: state.mode === "banner" ? 220 : 340,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.objectUrl}
              alt="preview"
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none"
              style={{
                transform: `translate(-50%, -50%) translate(${translateX}, ${translateY}) scale(${t.zoom})`,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div className="absolute inset-0 pointer-events-none ring-1 ring-white/10" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 shrink-0">Zoom</span>

          <button
            type="button"
            onClick={() => zoomBy(-0.1)}
            className="h-9 w-9 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
            title="Zoom -"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={t.zoom}
            onChange={(e) => setT((p) => ({ ...p, zoom: Number(e.target.value) }))}
            className="w-full"
            disabled={busy}
          />

          <button
            type="button"
            onClick={() => zoomBy(0.1)}
            className="h-9 w-9 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
            title="Zoom +"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="text-xs text-white/50 w-12 text-right">{Math.round(t.zoom * 100)}%</span>
        </div>

        <div className="text-xs text-white/40">Astuce : clique/glisse pour repositionner. (GIF animé supporté)</div>
      </div>
    </Modal>
  );
}
/* --------------------------------- Page ----------------------------------- */
export default function ProfilPage() {
  const [me, setMe] = useState<any>(null);

  // ✅ Hydration guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Media display URLs (from IDB blob -> objectURL)
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  // ✅ Trades (full list) + pagination (10/page)
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const TRADES_PER_PAGE = 10;
  const [tradesPage, setTradesPage] = useState(1);

  const totalTradesPages = useMemo(() => {
    const n = Math.ceil((allTrades?.length || 0) / TRADES_PER_PAGE);
    return Math.max(1, n);
  }, [allTrades]);

  const pagedTrades = useMemo(() => {
    const page = Math.min(Math.max(1, tradesPage), totalTradesPages);
    const start = (page - 1) * TRADES_PER_PAGE;
    return (allTrades || []).slice(start, start + TRADES_PER_PAGE);
  }, [allTrades, tradesPage, totalTradesPages]);

  useEffect(() => {
    if (tradesPage > totalTradesPages) setTradesPage(totalTradesPages);
    if (tradesPage < 1) setTradesPage(1);
  }, [tradesPage, totalTradesPages]);

  // Editor
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: "banner",
    objectUrl: "",
    fileId: "",
    transform: defaultTransform(),
  });
  const [busyMedia, setBusyMedia] = useState(false);

  // header measured sizes (kept, not mandatory)
  const bannerFrameRef = useRef<HTMLDivElement | null>(null);
  const avatarFrameRef = useRef<HTMLDivElement | null>(null);
  const [bannerFrameSize, setBannerFrameSize] = useState({ w: 0, h: 0 });
  const [avatarFrameSize, setAvatarFrameSize] = useState({ w: 0, h: 0 });

  // bio + privacy
  const [bio, setBio] = useState("");
  const [hideTrades, setHideTrades] = useState(false);

  // comments (synced)
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const composerRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reactOpenId, setReactOpenId] = useState<string | null>(null);

  // pagination comments
  const COMMENTS_PER_PAGE = 10;
  const [commentsPage, setCommentsPage] = useState(1);
  const commentsTopRef = useRef<HTMLDivElement | null>(null);

  const initials = useMemo(() => {
    const u = me?.username?.trim();
    if (!u) return "IP";
    return u.slice(0, 2).toUpperCase();
  }, [me]);

  const isOnline = true;

  const plan = useMemo(() => {
    try {
      return getPlan?.() ?? "—";
    } catch {
      return "—";
    }
  }, []);

  // ✅ pagination computed
  const totalCommentPages = useMemo(() => {
    const n = Math.ceil((comments?.length || 0) / COMMENTS_PER_PAGE);
    return Math.max(1, n);
  }, [comments]);

  const pagedComments = useMemo(() => {
    const page = Math.min(Math.max(1, commentsPage), totalCommentPages);
    const start = (page - 1) * COMMENTS_PER_PAGE;
    return (comments || []).slice(start, start + COMMENTS_PER_PAGE);
  }, [comments, commentsPage, totalCommentPages]);

  useEffect(() => {
    if (commentsPage > totalCommentPages) setCommentsPage(totalCommentPages);
    if (commentsPage < 1) setCommentsPage(1);
  }, [commentsPage, totalCommentPages]);

  // measure header frames
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (bannerFrameRef.current) {
        const r = bannerFrameRef.current.getBoundingClientRect();
        setBannerFrameSize({ w: r.width, h: r.height });
      }
      if (avatarFrameRef.current) {
        const r = avatarFrameRef.current.getBoundingClientRect();
        setAvatarFrameSize({ w: r.width, h: r.height });
      }
    });
    if (bannerFrameRef.current) ro.observe(bannerFrameRef.current);
    if (avatarFrameRef.current) ro.observe(avatarFrameRef.current);
    return () => ro.disconnect();
  }, []);

  // load account + comments (✅ key per username)
  useEffect(() => {
    const acc = getCurrentAccount();
    setMe(acc);
    setBio(String(acc?.bio ?? ""));
    setHideTrades(!!acc?.hideTrades);

    // ✅ publish profile snapshot once on load (bio sync)
    try {
      const u = String(acc?.username || "");
      if (u) {
        localStorage.setItem(
          publicProfileKeyFor(u),
          JSON.stringify({ bio: String(acc?.bio ?? ""), tag: String(acc?.tag ?? ""), updatedAt: Date.now() })
        );
      }
    } catch {}

    try {
      const key = commentsKeyFor(acc?.username || "unknown");
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      setComments(Array.isArray(arr) ? arr : []);
    } catch {
      setComments([]);
    }
  }, []);

  // ✅ load trades after mount (keep full list => pagination)
  useEffect(() => {
    if (!mounted) return;
    try {
      const list = loadTrades();
      setAllTrades(Array.isArray(list) ? list : []);
      setTradesPage(1);
    } catch {
      setAllTrades([]);
      setTradesPage(1);
    }
  }, [mounted]);

  /**
   * ✅ PUBLISH public trades + stats for classement/[username]
   * - hideTrades === false => publish
   * - hideTrades === true  => remove
   */
  useEffect(() => {
    if (!mounted) return;
    if (!me?.username) return;

    const u = String(me.username);
    const tKey = publicTradesKeyFor(u);
    const sKey = publicStatsKeyFor(u);

    try {
      if (hideTrades) {
        localStorage.removeItem(tKey);
        localStorage.removeItem(sKey);
        return;
      }

      // publish from ALL trades, store light(50)
      const all = loadTrades();
      const allTrades = Array.isArray(all) ? all : [];

      const light = allTrades.map(toPublicTradeLight).slice(0, 50);
      const stats = computePublicStats(allTrades);

      localStorage.setItem(tKey, JSON.stringify(light));
      localStorage.setItem(sKey, JSON.stringify(stats));
    } catch {
      // ignore
    }
  }, [mounted, me?.username, hideTrades]);

  // close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement;

      const root = composerRef.current;
      if (!(root && root.contains(t as any))) setEmojiOpen(false);

      if (!t.closest?.("[data-comment-menu]")) setMenuOpenId(null);
      if (!t.closest?.("[data-react-picker]")) setReactOpenId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // persist comments (✅ key per username + strip attachments dataUrl)
  function persist(next: Comment[]) {
    next.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt);
    const pruned = next.slice(0, 120);
    setComments(pruned);

    const light = pruned.map((c) => ({
      ...c,
      attachments: (c.attachments || []).map((a) => ({
        id: a.id,
        kind: a.kind,
        name: a.name,
        mime: a.mime,
        dataUrl: "",
      })),
    }));

    try {
      const key = commentsKeyFor(me?.username || "unknown");
      localStorage.setItem(key, JSON.stringify(light));
    } catch {
      // ignore
    }
  }

  // Load media from IndexedDB whenever account fields change
  useEffect(() => {
    let alive = true;

    async function run() {
      const acc: AccountMediaFields = (me || {}) as any;

      // banner
      if (acc.bannerMediaId) {
        const blob = await idbGetBlob(acc.bannerMediaId);
        if (!alive) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          setBannerUrl(url);
          return;
        }
      }
      // legacy fallback
      setBannerUrl(acc.bannerDataUrl || "");
    }

    run();
    return () => {
      alive = false;
    };
  }, [me?.bannerMediaId, me?.bannerDataUrl]);

  useEffect(() => {
    let alive = true;

    async function run() {
      const acc: AccountMediaFields = (me || {}) as any;

      // avatar
      if (acc.avatarMediaId) {
        const blob = await idbGetBlob(acc.avatarMediaId);
        if (!alive) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          setAvatarUrl(url);
          return;
        }
      }
      // legacy fallback
      setAvatarUrl(acc.avatarDataUrl || "");
    }

    run();
    return () => {
      alive = false;
    };
  }, [me?.avatarMediaId, me?.avatarDataUrl]);

  function saveBio() {
    const updated = updateAccount({ bio, hideTrades } as any);
    setMe(updated);

    // ✅ sync bio vers la page classement/[username]
    try {
      const u = String(updated?.username || me?.username || "");
      if (u) {
        localStorage.setItem(
          publicProfileKeyFor(u),
          JSON.stringify({
            bio: String(updated?.bio ?? bio ?? ""),
            tag: String(updated?.tag ?? me?.tag ?? ""),
            updatedAt: Date.now(),
          })
        );
      }
    } catch {}

    pushNotif({ kind: "success", title: "Profil", message: "Profil enregistré.", ttlMs: 9000 });
  }

  /** Select media => store Blob in IDB => open editor with objectURL */
  async function selectMedia(mode: MediaMode, file: File) {
    try {
      setBusyMedia(true);

      const ab = await readFileAsArrayBuffer(file);
      const blob = new Blob([ab], { type: file.type || "application/octet-stream" });
      const fileId = safeId(mode);

      await idbPutBlob(fileId, blob);

      const objectUrl = URL.createObjectURL(blob);

      setEditor({
        open: true,
        mode,
        objectUrl,
        fileId,
        transform: defaultTransform(),
      });
    } catch {
      pushNotif({
        kind: "error",
        title: "Image",
        message: "Impossible de préparer le fichier (IndexedDB).",
        ttlMs: 12000,
      });
    } finally {
      setBusyMedia(false);
    }
  }

  /** Apply editor => save ID + transform in account store */
  function applyMedia(mode: MediaMode, fileId: string, transform: MediaTransform) {
    try {
      setBusyMedia(true);

      const patch =
        mode === "banner"
          ? ({ bannerMediaId: fileId, bannerTransform: transform } as any)
          : ({ avatarMediaId: fileId, avatarTransform: transform } as any);

      const updated = updateAccount(patch);
      if (updated) setMe(updated);

      setMe((prev: any) => ({
        ...(prev || {}),
        ...(mode === "banner"
          ? { bannerMediaId: fileId, bannerTransform: transform }
          : { avatarMediaId: fileId, avatarTransform: transform, avatarDataUrl: "" }),
      }));

      setEditor({ open: false, mode, objectUrl: "", fileId: "", transform: defaultTransform() });

      pushNotif({
        kind: "success",
        title: mode === "banner" ? "Bannière" : "Avatar",
        message: "Média enregistré (sans perte).",
        ttlMs: 9000,
      });
    } catch {
      pushNotif({ kind: "error", title: "Image", message: "Impossible d'enregistrer.", ttlMs: 12000 });
    } finally {
      setBusyMedia(false);
    }
  }
  async function addAttachments(files: FileList | null) {
    if (!files) return;
    const next = [...atts];

    for (const f of Array.from(files)) {
      if (next.length >= 3) break;

      const k = detectKind(f);
      if (!k) {
        pushNotif({
          kind: "warning",
          title: "Fichier refusé",
          message: "Formats acceptés: GIF, MP4, MP3.",
          ttlMs: 11000,
        });
        continue;
      }

      if (f.size > 6 * 1024 * 1024) {
        pushNotif({ kind: "warning", title: "Trop lourd", message: `${f.name} > 6MB.`, ttlMs: 11000 });
        continue;
      }

      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onerror = () => rej(new Error("read_failed"));
        fr.onload = () => res(String(fr.result || ""));
        fr.readAsDataURL(f);
      });

      next.push({ id: safeId("att"), kind: k, name: f.name, mime: f.type, dataUrl });
    }

    setAtts(next);
  }

  function removeAtt(id: string) {
    setAtts((p) => p.filter((x) => x.id !== id));
  }

  function postComment() {
    const t = text.trim();
    if (!t && atts.length === 0) return;

    const c: Comment = {
      id: safeId("c"),
      createdAt: Date.now(),
      author: {
        username: me?.username || "User",
        tag: me?.tag,
        // ✅ use avatarUrl (objectURL) if available so comments show correct avatar
        avatarDataUrl: avatarUrl || me?.avatarDataUrl || "",
      },
      text: t,
      attachments: atts.length ? atts : undefined,
      reactions: {},
      reactedBy: {},
    };

    const next = [c, ...comments];
    setComments(next.slice(0, 120));
    persist(next);

    setText("");
    setAtts([]);
    setEmojiOpen(false);

    setCommentsPage(1);
    setTimeout(() => commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);

    pushNotif({ kind: "success", title: "Commentaire", message: "Commentaire publié.", ttlMs: 7000 });
  }

  function togglePin(id: string) {
    persist(comments.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }

  function report(id: string) {
    persist(comments.map((c) => (c.id === id ? { ...c, reported: true } : c)));
    pushNotif({ kind: "warning", title: "Signalement", message: "Commentaire signalé.", ttlMs: 10000 });
  }

  function del(id: string) {
    persist(comments.filter((c) => c.id !== id));
  }

  function canDelete(c: Comment) {
    return c.author.username === me?.username;
  }

  function toggleReaction(commentId: string, emoji: string) {
    const userName = me?.username || "User";

    const next = comments.map((c) => {
      if (c.id !== commentId) return c;

      const reactedBy = { ...(c.reactedBy || {}) };
      const set = new Set<string>(reactedBy[emoji] || []);
      if (set.has(userName)) set.delete(userName);
      else set.add(userName);
      reactedBy[emoji] = Array.from(set);

      const reactions = { ...(c.reactions || {}) };
      reactions[emoji] = reactedBy[emoji].length;

      return { ...c, reactedBy, reactions };
    });

    persist(next);
  }

  const bannerT: MediaTransform = (me?.bannerTransform as any) || defaultTransform();
  const avatarT: MediaTransform = (me?.avatarTransform as any) || defaultTransform();

  const bannerTranslateX = `${bannerT.panX * 18}%`;
  const bannerTranslateY = `${bannerT.panY * 18}%`;
  const avatarTranslateX = `${avatarT.panX * 18}%`;
  const avatarTranslateY = `${avatarT.panY * 18}%`;

  return (
    <div className="space-y-6">
      {/* Media editor modal */}
      <MediaEditorModal
        state={editor}
        busy={busyMedia}
        onClose={() => setEditor((p) => ({ ...p, open: false, objectUrl: "", fileId: "", transform: defaultTransform() }))}
        onApply={(fileId, transform) => applyMedia(editor.mode, fileId, transform)}
      />

      {/* TOP PROFILE HEADER */}
      <Card>
        <CardBody className="p-0">
          <div className="relative overflow-visible">
            {/* Banner */}
            <div ref={bannerFrameRef} className="relative w-full aspect-[3/1] max-h-[220px] bg-black/30 border-b border-white/10">
              <div className="absolute inset-0 overflow-hidden">
                {bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bannerUrl}
                    alt="banner"
                    className="absolute left-1/2 top-1/2 max-w-none"
                    style={{
                      transform: `translate(-50%, -50%) translate(${bannerTranslateX}, ${bannerTranslateY}) scale(${bannerT.zoom})`,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: 0.92,
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{
                      background:
                        "radial-gradient(900px 300px at 30% 0%, rgba(214,179,95,.18), transparent 60%), radial-gradient(700px 260px at 80% 20%, rgba(255,255,255,.08), transparent 55%), rgba(0,0,0,.35)",
                    }}
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
              </div>

              {/* Banner edit */}
              <div className="absolute top-4 right-4 z-20">
                <label
                  className="w-10 h-10 rounded-full border border-white/15 bg-black/35 hover:bg-black/50 transition flex items-center justify-center text-white text-xl cursor-pointer"
                  title="Changer bannière (GIF/PNG/JPG/WebP)"
                >
                  +
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busyMedia}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) selectMedia("banner", f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {/* Avatar block */}
              <div className="absolute left-6 -bottom-10 flex items-end gap-4 z-30">
                <div className="relative group">
                  <label
                    ref={avatarFrameRef}
                    className="relative w-24 h-24 rounded-full border-2 border-[color:var(--gold-border)] bg-[color:var(--panel-2)]
                              flex items-center justify-center overflow-hidden shadow-xl cursor-pointer"
                    title="Changer avatar (GIF/PNG/JPG/WebP)"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="absolute left-1/2 top-1/2 max-w-none"
                        style={{
                          transform: `translate(-50%, -50%) translate(${avatarTranslateX}, ${avatarTranslateY}) scale(${avatarT.zoom})`,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span className="text-2xl font-semibold text-[color:var(--gold)]">{initials}</span>
                    )}

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busyMedia}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) selectMedia("avatar", f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {/* Hover + */}
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                    <div className="w-9 h-9 rounded-full border border-white/15 bg-black/40 text-white flex items-center justify-center text-xl">
                      +
                    </div>
                  </div>

                  {/* Online dot */}
                  <div
                    className="absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-[color:var(--panel)]"
                    style={{ background: "var(--success)" }}
                    title={isOnline ? "En ligne" : "Hors ligne"}
                  />
                </div>

                <div className="pb-2">
                  <div className="text-xl font-semibold text-white flex items-center gap-2 drop-shadow-[0_2px_10px_rgba(0,0,0,.6)]">
                    <span>{me?.username}</span>
                    <span className="text-sm text-white/50">{me?.tag}</span>
                  </div>
                  <div className="text-sm text-white/60">Profil</div>
                </div>
              </div>
            </div>

            <div className="h-12" />
          </div>

          {/* Bio + infos privées */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="lg:col-span-2 space-y-3">
                <div className="text-sm text-white/70">Bio</div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full p-4 rounded-2xl bg-black/20 border border-[color:var(--border)]
                            text-white placeholder:text-white/30 outline-none
                            focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                  placeholder="Ta bio…"
                />
                <div className="flex justify-end">
                  <Button onClick={saveBio}>Enregistrer</Button>
                </div>
              </div>

              <div className="space-y-3">
                <CardSubCard className="p-4">
                  <div className="text-xs text-white/50">Infos privées</div>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Pseudo</span>
                      <span className="text-white">{me?.username ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Email</span>
                      <span className="text-white">{me?.email ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Plan</span>
                      <span className="text-[color:var(--gold)] font-semibold">{plan}</span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-white/40">Ces infos ne sont visibles que par toi.</div>
                </CardSubCard>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
           {/* STACK layout */}
      <div className="space-y-4">
        {/* Trades */}
        <Card>
          <CardBody>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white flex items-center gap-2">
                  Historique trades <span className="text-xs text-white/40">(10 par page)</span>
                </div>
                <div className="text-xs text-[color:var(--muted)] mt-1">Pour voir plus ➜ journal.</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !hideTrades;
                    setHideTrades(next);
                    setTradesPage(1);

                    // ✅ persiste dans le compte (et déclenche publish/unpublish via useEffect)
                    try {
                      const updated = updateAccount({ hideTrades: next } as any);
                      if (updated) setMe(updated);
                    } catch {
                      // ignore
                    }
                  }}
                  className={cx(
                    "h-10 px-3 rounded-2xl border text-sm transition inline-flex items-center gap-2",
                    hideTrades
                      ? "border-white/10 bg-black/25 text-white/70 hover:bg-white/5"
                      : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                  )}
                  title={hideTrades ? "Privé" : "Public"}
                >
                  {hideTrades ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span className="text-xs">{hideTrades ? "Privé" : "Public"}</span>
                </button>

                {!hideTrades ? (
                  <Button variant="secondary" onClick={() => (window.location.href = "/dashboard/journal")}>
                    Voir plus
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 relative overflow-x-auto">
              <div className={hideTrades ? "pointer-events-none select-none blur-[6px] opacity-70" : ""}>
                <table className="w-full text-sm">
                  <thead className="text-white/70">
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3">Date</th>
                      <th className="text-left py-3">Symbol</th>
                      <th className="text-left py-3">PNL</th>
                      <th className="text-left py-3">Result</th>
                    </tr>
                  </thead>

                  <tbody>
                    {!mounted ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-[color:var(--muted)]">
                          Chargement…
                        </td>
                      </tr>
                    ) : pagedTrades.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-[color:var(--muted)]">
                          Aucun trade.
                        </td>
                      </tr>
                    ) : (
                      pagedTrades.map((t: any) => (
                        <tr key={t.id} className="border-b border-white/5">
                          <td className="py-3">{t.date}</td>
                          <td className="py-3">{t.symbol}</td>
                          <td
                            className={
                              Number(t.pnl) >= 0
                                ? "py-3 text-[color:var(--success)]"
                                : "py-3 text-[color:var(--danger)]"
                            }
                          >
                            {Number(t.pnl).toFixed(2)}
                          </td>
                          <td className="py-3">{t.result}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* ✅ mini pagination trades */}
                {mounted && allTrades.length > TRADES_PER_PAGE ? (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-white/40">
                      Page {tradesPage} / {totalTradesPages} • {allTrades.length} trades
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={tradesPage <= 1}
                        onClick={() => setTradesPage((p) => Math.max(1, p - 1))}
                        className={[
                          "h-9 px-3 rounded-xl border text-sm transition",
                          tradesPage <= 1
                            ? "border-white/10 bg-black/20 text-white/30 cursor-not-allowed"
                            : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                        ].join(" ")}
                      >
                        Précédent
                      </button>

                      <button
                        type="button"
                        disabled={tradesPage >= totalTradesPages}
                        onClick={() => setTradesPage((p) => Math.min(totalTradesPages, p + 1))}
                        className={[
                          "h-9 px-3 rounded-xl border text-sm transition",
                          tradesPage >= totalTradesPages
                            ? "border-white/10 bg-black/20 text-white/30 cursor-not-allowed"
                            : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                        ].join(" ")}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {hideTrades ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="px-4 py-3 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md text-white/80 inline-flex items-center gap-3 shadow-xl">
                    <EyeOff className="w-5 h-5 text-white/70" />
                    <div className="text-sm">
                      <div className="font-semibold text-white">Privé</div>
                      <div className="text-xs text-white/50">Historique masqué</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {!hideTrades ? (
              <div className="mt-3 text-xs text-white/40">
                ✅ Historique publié : visible depuis le classement (RR moyen, winrate, nb trades + 50 derniers).
              </div>
            ) : (
              <div className="mt-3 text-xs text-white/40">🔒 Historique privé : invisible depuis le classement.</div>
            )}
          </CardBody>
        </Card>

        {/* Comments */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-white">Commentaires</div>
              <div className="text-xs text-white/40">{comments.length}/120</div>
            </div>

            {/* composer */}
            <div ref={composerRef} className="rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4 relative">
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-black/15 border border-white/10 text-white outline-none
                          focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)] transition
                          placeholder:text-white/30"
                placeholder="Écrire un commentaire…"
              />

              <input
                id="comment-attach"
                type="file"
                multiple
                accept="image/gif,video/mp4,audio/mpeg"
                onChange={(e) => addAttachments(e.target.files)}
                className="hidden"
              />

              {atts.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {atts.map((a) => (
                    <div
                      key={a.id}
                      className="px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-xs text-white/80 flex items-center gap-2 max-w-full"
                    >
                      <span className="text-white/60">{a.kind.toUpperCase()}</span>
                      <span className="text-white/50 truncate max-w-[180px]">{a.name}</span>
                      <button onClick={() => removeAtt(a.id)} className="ml-2 text-white/50 hover:text-white" type="button">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 w-9 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
                  title="Ajouter un fichier (GIF / MP4 / MP3)"
                  onClick={() => document.getElementById("comment-attach")?.click()}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
                    title="Emoji"
                    onClick={() => setEmojiOpen((v) => !v)}
                  >
                    <Smile className="w-4 h-4" />
                  </button>

                  <EmojiPicker
                    open={emojiOpen}
                    onPick={(emo) => {
                      if (taRef.current) insertAtCursor(taRef.current, emo);
                      else setText((p) => (p + emo).slice(0, 2000));
                      setEmojiOpen(false);
                    }}
                  />
                </div>

                <div className="ml-auto">
                  <Button onClick={postComment} disabled={!text.trim() && atts.length === 0}>
                    Publier
                  </Button>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-white/40">
                Commentaires synchronisés avec la page profil (même navigateur).
              </div>
            </div>
                        {/* list */}
            <div className="space-y-2">
              <div ref={commentsTopRef} />

              {comments.length === 0 ? (
                <div className="text-sm text-[color:var(--muted)]">Aucun commentaire.</div>
              ) : (
                pagedComments.map((c) => (
                  <div
                    key={c.id}
                    className={cx(
                      "rounded-2xl border border-white/10 bg-black/15 hover:bg-black/20 transition p-3",
                      c.pinned ? "ring-1 ring-[color:var(--gold-border)]" : ""
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-black/20 flex items-center justify-center shrink-0">
                        {(() => {
                          const src = resolveAuthorAvatar(c, me, avatarUrl);
                          return src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt="avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-white/70">{initialsOf(c.author.username)}</span>
                          );
                        })()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white/90 font-semibold truncate">{c.author.username}</span>
                              {resolveAuthorTag(c, me) ? (
                                <span className="text-xs text-white/40 shrink-0">{resolveAuthorTag(c, me)}</span>
                              ) : null}
                              {c.pinned ? <span className="text-[11px] text-[color:var(--gold)]">Épinglé</span> : null}
                              {c.reported ? <span className="text-[11px] text-red-200/80">Signalé</span> : null}
                            </div>
                            <div className="text-[11px] text-white/40">{fmtAgo(c.createdAt)}</div>
                          </div>

                          <div className="relative" data-comment-menu>
                            <button
                              type="button"
                              className="h-8 w-8 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
                              title="Actions"
                              onClick={() => setMenuOpenId((prev) => (prev === c.id ? null : c.id))}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {menuOpenId === c.id ? (
                              <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/10 bg-[color:var(--panel)] shadow-2xl overflow-hidden">
                                <button
                                  className="w-full px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition flex items-center gap-2"
                                  type="button"
                                  onClick={() => {
                                    togglePin(c.id);
                                    setMenuOpenId(null);
                                  }}
                                >
                                  <Pin className="w-4 h-4" />
                                  {c.pinned ? "Désépingler" : "Épingler"}
                                </button>

                                <button
                                  className={cx(
                                    "w-full px-3 py-2 text-sm hover:bg-white/5 transition flex items-center gap-2",
                                    c.reported ? "text-white/30 cursor-not-allowed" : "text-white/80"
                                  )}
                                  type="button"
                                  disabled={c.reported}
                                  onClick={() => {
                                    report(c.id);
                                    setMenuOpenId(null);
                                  }}
                                >
                                  <Flag className="w-4 h-4" />
                                  Signaler
                                </button>

                                {canDelete(c) ? (
                                  <button
                                    className="w-full px-3 py-2 text-sm text-red-200 hover:bg-red-500/10 transition flex items-center gap-2"
                                    type="button"
                                    onClick={() => {
                                      del(c.id);
                                      setMenuOpenId(null);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Supprimer
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {c.text ? (
                          <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap break-words">{c.text}</div>
                        ) : null}

                        {c.attachments?.length ? (
                          <div className="mt-3 space-y-2">
                            {c.attachments.map((a) => (
                              <div key={a.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                                {renderAttachment(a)}
                                <div className="mt-1 text-xs text-white/40 truncate">{a.name}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {Object.entries(c.reactions || {})
                            .filter(([, count]) => (count ?? 0) > 0)
                            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                            .map(([emo, count]) => (
                              <button
                                key={emo}
                                className="px-2.5 py-1 rounded-full border border-white/10 bg-black/20 hover:bg-white/5 transition text-sm text-white/80 inline-flex items-center gap-1.5"
                                type="button"
                                onClick={() => toggleReaction(c.id, emo)}
                              >
                                <span>{emo}</span>
                                <span className="text-white/50 text-xs">{count}</span>
                              </button>
                            ))}

                          <div className="relative" data-react-picker>
                            <button
                              type="button"
                              className="h-8 w-8 rounded-full border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
                              title="Ajouter une réaction"
                              onClick={() => setReactOpenId((v) => (v === c.id ? null : c.id))}
                            >
                              +
                            </button>

                            {reactOpenId === c.id ? (
                              <div className="absolute left-0 mt-2">
                                <EmojiPicker
                                  open={true}
                                  onPick={(emo) => {
                                    toggleReaction(c.id, emo);
                                    setReactOpenId(null);
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* pagination */}
              {comments.length > COMMENTS_PER_PAGE ? (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-white/40">
                    Page {commentsPage} / {totalCommentPages} • {comments.length} commentaires
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCommentsPage((p) => Math.max(1, p - 1));
                        setTimeout(
                          () => commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                          0
                        );
                      }}
                      disabled={commentsPage <= 1}
                      className={[
                        "h-9 px-3 rounded-xl border text-sm transition",
                        commentsPage <= 1
                          ? "border-white/10 bg-black/20 text-white/30 cursor-not-allowed"
                          : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                      ].join(" ")}
                    >
                      Précédent
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCommentsPage((p) => Math.min(totalCommentPages, p + 1));
                        setTimeout(
                          () => commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                          0
                        );
                      }}
                      disabled={commentsPage >= totalCommentPages}
                      className={[
                        "h-9 px-3 rounded-xl border text-sm transition",
                        commentsPage >= totalCommentPages
                          ? "border-white/10 bg-black/20 text-white/30 cursor-not-allowed"
                          : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                      ].join(" ")}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
     
  