"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { Card, CardBody, CardSubCard } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";

import { loadLeaderboard } from "../../../../lib/uiStore";
import { getCurrentAccount } from "../../../../lib/authStore";
import { pushNotif } from "../../../../lib/notifyStore";

import {
  ArrowLeft,
  EyeOff,
  Trophy,
  DollarSign,
  Medal,
  Lock,
  MoreHorizontal,
  Pin,
  Flag,
  Trash2,
  Smile,
  Paperclip,
  Search,
} from "lucide-react";

/* -------------------------------- Types -------------------------------- */
type MediaTransform = {
  zoom: number; // 1..3
  panX: number; // -1..1
  panY: number; // -1..1
};

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

type LeaderUser = {
  username: string;
  tag?: string;
  bio?: string;
  profitUsd?: number;
  showOnLeaderboard?: boolean;

  // privacy
  hideTrades?: boolean;

  // public stats (fallback leaderboard)
  tradesCount?: number;
  tradesTotal?: number;
  winrate?: number;
  rrAvg?: number;

  // public trades (fallback leaderboard)
  publicTrades?: PublicTrade[];

  // legacy media
  avatarDataUrl?: string;
  bannerDataUrl?: string;

  // no-loss media (IndexedDB)
  avatarMediaId?: string;
  bannerMediaId?: string;
  avatarTransform?: MediaTransform;
  bannerTransform?: MediaTransform;
};

type Att = {
  id: string;
  kind: "gif" | "video" | "audio";
  name: string;
  mime: string;
  dataUrl: string; // en mémoire; persist() le vide pour quota
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

/* ------------------------------ Helpers ------------------------------ */
const IDB_DB = "investpro_media_db_v1";
const IDB_STORE = "files";

function defaultTransform(): MediaTransform {
  return { zoom: 1, panX: 0, panY: 0 };
}

function initialsOf(username: string) {
  return (username || "IP").slice(0, 2).toUpperCase();
}

function money(n: any) {
  const v = Number(n ?? 0);
  return `$${v.toFixed(2)}`;
}

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

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

/** ✅ même clé que la page profil -> synchro */
function commentsKeyFor(username: string) {
  return `investpro_profile_comments_v2_${(username || "unknown").toLowerCase()}`;
}

/** ✅ bio synchro depuis /profil */
function publicProfileKeyFor(username: string) {
  return `investpro_public_profile_v1_${(username || "unknown").toLowerCase()}`;
}

/** ✅ trades/stats publics synchro depuis /profil */
function publicTradesKeyFor(username: string) {
  return `investpro_public_trades_v1_${(username || "unknown").toLowerCase()}`;
}
function publicStatsKeyFor(username: string) {
  return `investpro_public_stats_v1_${(username || "unknown").toLowerCase()}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ------------------------------ IndexedDB ------------------------------ */
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

/* -------------------------- Attachments helpers -------------------------- */
function detectKind(file: File): Att["kind"] | null {
  const t = (file.type || "").toLowerCase();
  if (t === "image/gif") return "gif";
  if (t === "video/mp4") return "video";
  if (t === "audio/mpeg") return "audio";
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read_failed"));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(file);
  });
}

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

export default function ClassementUserPage() {
  const params = useParams<{ username: string }>();
  const usernameParam = decodeURIComponent(String(params?.username || ""));
  const me = getCurrentAccount();

  /* ------------------- Leaderboard user lookup ------------------- */
  const rows = useMemo(() => {
    return (loadLeaderboard() as any[])
      .filter((u) => u?.showOnLeaderboard)
      .map((u) => ({ ...u, profitUsd: Number(u?.profitUsd ?? 0) }))
      .sort((a, b) => (b?.profitUsd ?? 0) - (a?.profitUsd ?? 0)) as LeaderUser[];
  }, []);

  const user = useMemo(() => {
    const u = rows.find((x) => String(x.username).toLowerCase() === usernameParam.toLowerCase());
    return u || null;
  }, [rows, usernameParam]);

  const rank = useMemo(() => {
    if (!user) return null;
    const idx = rows.findIndex((x) => x.username === user.username);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, user]);

  const isTop10 = rank !== null && rank <= 10;

  /* ------------------- Resolve banner/avatar (IndexedDB) ------------------- */
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");

  useEffect(() => {
  let alive = true;

  async function loadMedia() {
    if (!user) {
      setAvatarUrl("");
      setBannerUrl("");
      return;
    }

    // avatar
    if (user.avatarMediaId) {
      try {
        const blob = await idbGetBlob(user.avatarMediaId);
        if (!alive) return;
        setAvatarUrl(blob ? URL.createObjectURL(blob) : user.avatarDataUrl || "");
      } catch {
        setAvatarUrl(user.avatarDataUrl || "");
      }
    } else {
      setAvatarUrl(user.avatarDataUrl || "");
    }

    // banner
    if (user.bannerMediaId) {
      try {
        const blob = await idbGetBlob(user.bannerMediaId);
        if (!alive) return;
        setBannerUrl(blob ? URL.createObjectURL(blob) : user.bannerDataUrl || "");
      } catch {
        setBannerUrl(user.bannerDataUrl || "");
      }
    } else {
      setBannerUrl(user.bannerDataUrl || "");
    }
  }

  loadMedia();
  return () => {
    alive = false;
  };
}, [user]);


  /* ------------------- Viewer avatar (for comments) ------------------- */
  const [myAvatarUrl, setMyAvatarUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function loadMyAvatar() {
      if (!me) {
        setMyAvatarUrl("");
        return;
      }

      // if you store your avatar in IDB
      if (me.avatarMediaId) {
        try {
          const blob = await idbGetBlob(me.avatarMediaId);
          if (!alive) return;
          if (blob) {
            setMyAvatarUrl(URL.createObjectURL(blob));
            return;
          }
        } catch {
          // ignore
        }
      }

      setMyAvatarUrl(me.avatarDataUrl || "");
    }

    loadMyAvatar();
    return () => {
      alive = false;
    };
  }, [me?.avatarMediaId, me?.avatarDataUrl]);

  /* ------------------- Read public profile/trades/stats from /profil ------------------- */
  const [publicProfile, setPublicProfile] = useState<{ bio?: string; tag?: string } | null>(null);
  const [publicFromProfileTrades, setPublicFromProfileTrades] = useState<PublicTrade[]>([]);
  const [publicFromProfileStats, setPublicFromProfileStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    const u = user?.username || usernameParam;
    if (!u) return;

    try {
      const prof = safeJsonParse<{ bio?: string; tag?: string }>(localStorage.getItem(publicProfileKeyFor(u)));
      setPublicProfile(prof && typeof prof === "object" ? prof : null);
    } catch {
      setPublicProfile(null);
    }

    if (user?.hideTrades === true) {
      setPublicFromProfileTrades([]);
      setPublicFromProfileStats(null);
      return;
    }

    const tKey = publicTradesKeyFor(u);
    const sKey = publicStatsKeyFor(u);

    const trades = safeJsonParse<PublicTrade[]>(localStorage.getItem(tKey));
    const stats = safeJsonParse<PublicStats>(localStorage.getItem(sKey));

    setPublicFromProfileTrades(Array.isArray(trades) ? trades : []);
    setPublicFromProfileStats(stats && typeof stats === "object" ? stats : null);
  }, [user?.username, user?.hideTrades, usernameParam]);

  /* ------------------- Stats + public trades ------------------- */
  const profit = Number(user?.profitUsd ?? 0);
  const profitClass = profit >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]";

  const tradesPrivate = user?.hideTrades === true;

  // ✅ Trades: profil d’abord (vrai), sinon fallback leaderboard
  const publicTrades: PublicTrade[] =
    publicFromProfileTrades.length
      ? publicFromProfileTrades
      : Array.isArray(user?.publicTrades)
      ? user!.publicTrades!
      : [];

  // ✅ Stats: profil d’abord
  const tradesTotal =
    publicFromProfileStats?.tradesTotal ??
    (typeof user?.tradesTotal === "number" && Number.isFinite(user.tradesTotal)
      ? user.tradesTotal
      : typeof user?.tradesCount === "number" && Number.isFinite(user.tradesCount)
      ? user.tradesCount
      : null);

  const winrate =
    (typeof publicFromProfileStats?.winrate === "number" ? publicFromProfileStats.winrate : null) ??
    (typeof user?.winrate === "number" && Number.isFinite(user.winrate) ? user.winrate : null);

  const rrAvg =
    (typeof publicFromProfileStats?.rrAvg === "number" ? publicFromProfileStats.rrAvg : null) ??
    (typeof user?.rrAvg === "number" && Number.isFinite(user.rrAvg) ? user.rrAvg : null);

  // ✅ Bio: profil d’abord
  const bioText = (publicProfile?.bio ?? user?.bio ?? "").trim();
  const tagText = (publicProfile?.tag ?? user?.tag ?? "").trim();

  // ✅ Pagination public trades (10/page)
  const PUBLIC_TRADES_PER_PAGE = 10;
  const [publicTradesPage, setPublicTradesPage] = useState(1);

  const totalPublicTradePages = useMemo(() => {
    const n = Math.ceil((publicTrades?.length || 0) / PUBLIC_TRADES_PER_PAGE);
    return Math.max(1, n);
  }, [publicTrades]);

  const pagedPublicTrades = useMemo(() => {
    const page = Math.min(Math.max(1, publicTradesPage), totalPublicTradePages);
    const start = (page - 1) * PUBLIC_TRADES_PER_PAGE;
    return (publicTrades || []).slice(start, start + PUBLIC_TRADES_PER_PAGE);
  }, [publicTrades, publicTradesPage, totalPublicTradePages]);

  useEffect(() => {
    setPublicTradesPage(1);
  }, [user?.username]);

  useEffect(() => {
    if (publicTradesPage > totalPublicTradePages) setPublicTradesPage(totalPublicTradePages);
    if (publicTradesPage < 1) setPublicTradesPage(1);
  }, [publicTradesPage, totalPublicTradePages]);

  const bannerT = user?.bannerTransform || defaultTransform();
  const avatarT = user?.avatarTransform || defaultTransform();
  const bannerTranslateX = `${bannerT.panX * 18}%`;
  const bannerTranslateY = `${bannerT.panY * 18}%`;
  const avatarTranslateX = `${avatarT.panX * 18}%`;
  const avatarTranslateY = `${avatarT.panY * 18}%`;

  /* ------------------- Comments (synced with profile) ------------------- */
  const commentsKey = useMemo(() => {
    const u = user?.username || usernameParam || "unknown";
    return commentsKeyFor(u);
  }, [user?.username, usernameParam]);

  const COMMENTS_PER_PAGE = 10;

  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reactOpenId, setReactOpenId] = useState<string | null>(null);

  const [commentsPage, setCommentsPage] = useState(1);
  const commentsTopRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(commentsKey);
      const arr = raw ? JSON.parse(raw) : [];
      setComments(Array.isArray(arr) ? arr : []);
    } catch {
      setComments([]);
    }
  }, [commentsKey]);

  function persist(next: Comment[]) {
    const sorted = [...next].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt
    );
    const pruned = sorted.slice(0, 120);
    setComments(pruned);

    // strip attachments dataUrl to avoid localStorage quota
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
      localStorage.setItem(commentsKey, JSON.stringify(light));
    } catch {
      // ignore
    }
  }

  const totalCommentPages = useMemo(() => {
    const n = Math.ceil((comments.length || 0) / COMMENTS_PER_PAGE);
    return Math.max(1, n);
  }, [comments.length]);

  const pagedComments = useMemo(() => {
    const page = Math.min(Math.max(1, commentsPage), totalCommentPages);
    const start = (page - 1) * COMMENTS_PER_PAGE;
    return comments.slice(start, start + COMMENTS_PER_PAGE);
  }, [comments, commentsPage, totalCommentPages]);

  useEffect(() => {
    if (commentsPage > totalCommentPages) setCommentsPage(totalCommentPages);
    if (commentsPage < 1) setCommentsPage(1);
  }, [commentsPage, totalCommentPages]);

  // close popovers
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement;

      if (!(composerRef.current && composerRef.current.contains(t))) setEmojiOpen(false);
      if (!t.closest?.("[data-comment-menu]")) setMenuOpenId(null);
      if (!t.closest?.("[data-react-picker]")) setReactOpenId(null);
    }

    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
          ttlMs: 9000,
        });
        continue;
      }

      if (f.size > 6 * 1024 * 1024) {
        pushNotif({
          kind: "warning",
          title: "Trop lourd",
          message: `${f.name} > 6MB.`,
          ttlMs: 9000,
        });
        continue;
      }

      const dataUrl = await readFileAsDataUrl(f);
      next.push({ id: safeId("att"), kind: k, name: f.name, mime: f.type, dataUrl });
    }

    setAtts(next);
  }

  function removeAtt(id: string) {
    setAtts((p) => p.filter((x) => x.id !== id));
  }

  function canDelete(c: Comment) {
    return !!me?.username && c.author.username === me.username;
  }

  function postComment() {
    const content = text.trim();
    if (!content && atts.length === 0) return;

    const authorName = me?.username || "Visiteur";
    const c: Comment = {
      id: safeId("c"),
      createdAt: Date.now(),
      // ✅ use myAvatarUrl for proper avatar
      author: { username: authorName, tag: me?.tag, avatarDataUrl: myAvatarUrl || me?.avatarDataUrl },
      text: content,
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

    pushNotif({ kind: "success", title: "Commentaire", message: "Commentaire publié.", ttlMs: 6000 });
  }

  function togglePin(id: string) {
    persist(comments.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }

  function report(id: string) {
    persist(comments.map((c) => (c.id === id ? { ...c, reported: true } : c)));
    pushNotif({ kind: "warning", title: "Signalement", message: "Commentaire signalé.", ttlMs: 9000 });
  }

  function del(id: string) {
    persist(comments.filter((c) => c.id !== id));
    pushNotif({ kind: "info", title: "Commentaire", message: "Commentaire supprimé.", ttlMs: 6000 });
  }

  function toggleReaction(commentId: string, emoji: string) {
    const userName = me?.username || "Visiteur";

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

  // guard (must be after hooks)
  if (!user) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>

        <Card>
          <CardBody>
            <div className="text-white font-semibold">Profil introuvable</div>
            <div className="text-sm text-[color:var(--muted)] mt-1">
              Cet utilisateur n’est pas (ou plus) public dans le classement.
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top actions */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>

        <div className="text-xs text-white/40">Profil public (depuis le classement)</div>
      </div>

      {/* Header profil public */}
      <Card>
        <CardBody className="p-0">
          <div className="relative overflow-visible">
            {/* Banner */}
            <div className="relative w-full aspect-[3/1] max-h-[220px] bg-black/30 border-b border-white/10">
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
                        "radial-gradient(900px 300px at 30% 0%, rgba(214,179,95,.16), transparent 60%), rgba(0,0,0,.35)",
                    }}
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
              </div>

              {/* Avatar + pseudo */}
              <div className="absolute left-6 -bottom-10 flex items-end gap-4 z-30">
                <div className="relative w-24 h-24 rounded-full border-2 border-[color:var(--gold-border)] bg-[color:var(--panel-2)]
                                overflow-hidden shadow-xl">
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
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl font-semibold text-[color:var(--gold)]">{initialsOf(user.username)}</span>
                    </div>
                  )}
                </div>

                <div className="pb-2">
                  <div className="text-xl font-semibold text-white flex items-center gap-2 drop-shadow-[0_2px_10px_rgba(0,0,0,.6)]">
                    <span>{user.username}</span>
                    <span className="text-sm text-white/50">{tagText ?? ""}</span>

                    {isTop10 ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold
                                   border border-[color:var(--gold-border)]
                                   bg-[color:var(--gold-soft)]
                                   text-[color:var(--gold)]"
                      >
                        TOP 10
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-white/60">Profil public</div>
                </div>
              </div>
            </div>

            <div className="h-12" />
          </div>

          {/* Bio + Stats + Trades */}
          <div className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bio + Trades */}
              <div className="lg:col-span-2">
                <div className="text-sm text-white/70">Bio</div>
                <div className="mt-2 rounded-2xl border border-[color:var(--border)] bg-black/20 p-4 text-sm text-white/85">
                  {bioText ? bioText : <span className="text-white/40">—</span>}
                </div>

                {/* Historique trades */}
                <div className="mt-4">
                  <div className="text-sm text-white/70">Historique trades</div>

                  {tradesPrivate ? (
                    <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-4 flex items-center gap-3">
                      <Lock className="w-5 h-5 text-white/60" />
                      <div className="text-sm">
                        <div className="text-white font-semibold">Historique privé</div>
                        <div className="text-white/50 text-xs">Cet utilisateur a masqué son historique de trades.</div>
                      </div>
                    </div>
                  ) : publicTrades.length ? (
                    <div className="mt-2 rounded-2xl border border-white/10 bg-black/15 p-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-white/70">
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2">Date</th>
                            <th className="text-left py-2">Symbol</th>
                            <th className="text-left py-2">PNL</th>
                            <th className="text-left py-2">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedPublicTrades.map((t) => (
                            <tr key={t.id} className="border-b border-white/5">
                              <td className="py-2">{t.date ?? "—"}</td>
                              <td className="py-2">{t.symbol ?? "—"}</td>
                              <td
                                className={
                                  Number(t.pnl) >= 0
                                    ? "py-2 text-[color:var(--success)]"
                                    : "py-2 text-[color:var(--danger)]"
                                }
                              >
                                {Number(t.pnl ?? 0).toFixed(2)}
                              </td>
                              <td className="py-2">{t.result ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="mt-2 text-[11px] text-white/40">
                        Affichage: {PUBLIC_TRADES_PER_PAGE} trades par page.
                      </div>

                      {/* ✅ mini pagination trades publics */}
                      {publicTrades.length > PUBLIC_TRADES_PER_PAGE ? (
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-xs text-white/40">
                            Page {publicTradesPage} / {totalPublicTradePages} • {publicTrades.length} trades publics
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={publicTradesPage <= 1}
                              onClick={() => setPublicTradesPage((p) => Math.max(1, p - 1))}
                              className={[
                                "h-9 px-3 rounded-xl border text-sm transition",
                                publicTradesPage <= 1
                                  ? "border-white/10 bg-black/20 text-white/30 cursor-not-allowed"
                                  : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                              ].join(" ")}
                            >
                              Précédent
                            </button>

                            <button
                              type="button"
                              disabled={publicTradesPage >= totalPublicTradePages}
                              onClick={() => setPublicTradesPage((p) => Math.min(totalPublicTradePages, p + 1))}
                              className={[
                                "h-9 px-3 rounded-xl border text-sm transition",
                                publicTradesPage >= totalPublicTradePages
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
                  ) : (
                    <div className="mt-2 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/70">
                      Historique public activé, mais aucune donnée publique n’est disponible (MVP).
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <CardSubCard className="p-4">
                  <div className="text-xs text-white/50">Stats</div>

                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 inline-flex items-center gap-2">
                        <Medal className="w-4 h-4" /> Rang
                      </span>
                      <span className="text-white font-semibold">{rank ? `#${rank}` : "—"}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60 inline-flex items-center gap-2">
                        <DollarSign className="w-4 h-4" /> Profit
                      </span>
                      <span className={cx("font-semibold", profitClass)}>{money(profit)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60 inline-flex items-center gap-2">
                        <Trophy className="w-4 h-4" /> Trades
                      </span>
                      <span className="text-white font-semibold">{tradesTotal ?? "—"}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Winrate</span>
                      <span className="text-white font-semibold">{winrate === null ? "—" : `${winrate.toFixed(1)}%`}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">RR moyen</span>
                      <span className="text-white font-semibold">{rrAvg === null ? "—" : rrAvg.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-white/40">
                    Données: bio/trades/stats depuis le profil (si dispo) sinon fallback classement.
                  </div>
                </CardSubCard>

                <Button variant="secondary" onClick={() => (window.location.href = "/dashboard/classement")}>
                  Retour au classement
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-xs text-white/50 flex items-center gap-2">
              <EyeOff className="w-4 h-4" />
              Les infos privées & détails sensibles ne sont pas accessibles depuis le classement.
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ---------------- COMMENTS (synced with profile) ---------------- */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-white">Commentaires</div>
            <div className="text-xs text-white/40">{comments.length}/120</div>
          </div>
                    {/* composer */}
          <div ref={composerRef} className="rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4 relative">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full border border-white/10 bg-black/20 flex items-center justify-center shrink-0 mt-1 overflow-hidden">
                {myAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={myAvatarUrl} alt="me" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-white/70">{initialsOf(me?.username || "IP")}</span>
                )}
              </div>

              <div className="flex-1">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  className="w-full p-3 rounded-xl bg-black/15 border border-white/10 text-white outline-none
                             focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)] transition
                             placeholder:text-white/30"
                  placeholder="Écrire un commentaire…"
                />

                {/* attachments chips */}
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

                <input
                  id="comment-attach"
                  type="file"
                  multiple
                  accept="image/gif,video/mp4,audio/mpeg"
                  onChange={(e) => addAttachments(e.target.files)}
                  className="hidden"
                />

                <div className="mt-3 flex items-center gap-2">
                  {/* attach */}
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition inline-flex items-center justify-center text-white/70"
                    title="Ajouter un fichier (GIF / MP4 / MP3)"
                    onClick={() => document.getElementById("comment-attach")?.click()}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {/* emoji */}
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
                        setText((p) => (p + emo).slice(0, 2000));
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
                  Les commentaires sont synchronisés avec la page profil (même navigateur).
                </div>
              </div>
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
                        const src =
                          me?.username && c.author.username === me.username
                            ? myAvatarUrl
                            : (c.author.avatarDataUrl || "");
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
                            {c.author.tag ? <span className="text-xs text-white/40">{c.author.tag}</span> : null}
                            {c.pinned ? <span className="text-[11px] text-[color:var(--gold)]">Épinglé</span> : null}
                            {c.reported ? <span className="text-[11px] text-red-200/80">Signalé</span> : null}
                          </div>
                          <div className="text-[11px] text-white/40">{fmtAgo(c.createdAt)}</div>
                        </div>

                        {/* menu */}
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

                      {c.text ? <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap break-words">{c.text}</div> : null}

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
                                            {/* reactions + picker */}
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
                      setTimeout(() => commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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
                      setTimeout(() => commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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
  );
}

