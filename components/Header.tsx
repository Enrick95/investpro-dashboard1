"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "./ui/Button";
import { getCurrentAccount, signOut } from "../lib/authStore";
import {
  useNotifs,
  markAllRead,
  clearInbox,
  markRead,
  toggleMute,
} from "../lib/notifyStore";

import {
  Bell,
  X,
  VolumeX,
  Volume2,
  ExternalLink,
  Trash2,
  CheckCheck,
  User,
  Settings,
  CreditCard,
  Crown,
  LogOut,
  Sun,
  Moon,
  Laptop,
  ShieldCheck,
  History,
} from "lucide-react";

type LiveState = { isLive: boolean; url?: string };

function badgeText(n: number) {
  if (n <= 0) return "";
  if (n >= 10) return "+10";
  return String(n);
}

function kindDotClass(kind: string) {
  if (kind === "error") return "bg-red-500";
  if (kind === "warning") return "bg-amber-400";
  if (kind === "live") return "bg-red-500";
  if (kind === "video") return "bg-sky-400";
  if (kind === "tp") return "bg-emerald-400";
  if (kind === "sl") return "bg-rose-400";
  if (kind === "be") return "bg-cyan-400";
  if (kind === "admin" || kind === "success") return "bg-[color:var(--gold)]";
  if (kind === "pending") return "bg-[color:var(--border)]";
  return "bg-[color:var(--border)]";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type ThemeMode = "dark" | "light" | "system";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const setDark = () => root.classList.add("dark");
  const setLight = () => root.classList.remove("dark");

  if (mode === "system") {
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    prefersDark ? setDark() : setLight();
    return;
  }
  mode === "dark" ? setDark() : setLight();
}

/* -------------------- IndexedDB helpers (avatarMediaId) -------------------- */
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

export default function Header() {
  const [acc, setAcc] = useState<any>(null);

  // ✅ IMPORTANT: évite les mismatches SSR/CSR
  const [mounted, setMounted] = useState(false);

  // 🔥 avatarSrc = source affichée (IDB blob URL ou dataUrl)
  const [avatarSrc, setAvatarSrc] = useState<string>("");

  // LIVE state
  const [live, setLive] = useState<LiveState>({ isLive: false });

  // notifs
  const { inbox, unread, settings } = useNotifs();

  // 🔔 Notifications dropdown
  const [notifOpen, setNotifOpen] = useState(false);
  const notifBtnRef = useRef<HTMLButtonElement | null>(null);
  const notifPanelRef = useRef<HTMLDivElement | null>(null);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number } | null>(null);
  const NOTIF_W = 360;
  const NOTIF_H = 560;

  // 👤 User menu dropdown (avatar)
  const [userOpen, setUserOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const userPanelRef = useRef<HTMLDivElement | null>(null);
  const [userPos, setUserPos] = useState<{ top: number; right: number } | null>(null);
  const USER_W = 320;
  const USER_H = 440;

  // Theme
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Helper: load avatar from account (IDB first, else dataUrl)
  const currentObjectUrlRef = useRef<string>("");

  async function loadAvatarFromAcc(a: any) {
    try {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = "";
      }

      if (a?.avatarMediaId) {
        const blob = await idbGetBlob(String(a.avatarMediaId));
        if (blob) {
          const url = URL.createObjectURL(blob);
          currentObjectUrlRef.current = url;
          setAvatarSrc(url);
          return;
        }
      }

      setAvatarSrc(a?.avatarDataUrl || "");
    } catch {
      setAvatarSrc(a?.avatarDataUrl || "");
    }
  }

  useEffect(() => {
    setMounted(true);

    const a = getCurrentAccount();
    setAcc(a);
    loadAvatarFromAcc(a);

    function onAccUpdated(e: any) {
      const next = e?.detail ?? getCurrentAccount();
      setAcc(next);
      loadAvatarFromAcc(next);
    }

    window.addEventListener("investpro:account_updated", onAccUpdated as any);
    return () => {
      window.removeEventListener("investpro:account_updated", onAccUpdated as any);
      if (currentObjectUrlRef.current) URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? (localStorage.getItem("ip_theme") as ThemeMode | null)
        : null;
    const initial: ThemeMode = saved || "dark";
    setTheme(initial);
    applyTheme(initial);

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => {
      const current = (localStorage.getItem("ip_theme") as ThemeMode | null) || "dark";
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  function setThemeAndPersist(t: ThemeMode) {
    setTheme(t);
    localStorage.setItem("ip_theme", t);
    applyTheme(t);
  }

  const initials = useMemo(() => {
    const u = acc?.username?.trim();
    if (!u) return "IP";
    return u.slice(0, 2).toUpperCase();
  }, [acc]);

  const planLabel = acc?.plan || acc?.subscription || "Free";
  const isVerified =
    !!acc?.verified || String(acc?.tag || "").toLowerCase().includes("verified");

  function go(href: string) {
    window.location.href = href;
  }

  function logout() {
    signOut();
    setAcc(null);
    setAvatarSrc("");
    window.location.href = "/login";
  }

  // ✅ TikTok live poll
  useEffect(() => {
    let mountedLocal = true;
    const username = (process.env.NEXT_PUBLIC_TIKTOK_USERNAME || "enrick95__").trim();

    async function checkLive() {
      try {
        const r = await fetch("/api/live-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ username }),
          cache: "no-store",
        });
        const j = await r.json().catch(() => null);
        if (!mountedLocal) return;

        if (!r.ok || !j?.ok) {
          setLive({ isLive: false });
          return;
        }

        const isLive = j?.isLive === true;

        setLive({
          isLive,
          url: isLive && typeof j?.url === "string" ? j.url : undefined,
        });
      } catch {
        if (!mountedLocal) return;
        setLive({ isLive: false });
      }
    }

    checkLive();
    const id = window.setInterval(checkLive, 20_000);
    return () => {
      mountedLocal = false;
      window.clearInterval(id);
    };
  }, []);

  // -----------------------------
  // NOTIFICATIONS PANEL
  // -----------------------------
  function computeNotifPos() {
    const b = notifBtnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();

    const top = r.bottom + 12;
    const right = window.innerWidth - r.right;

    const maxTop = Math.max(10, window.innerHeight - NOTIF_H - 10);
    const safeTop = clamp(top, 10, maxTop);

    const maxRight = Math.max(10, window.innerWidth - NOTIF_W - 10);
    const safeRight = clamp(right, 10, maxRight);

    setNotifPos({ top: safeTop, right: safeRight });
  }

  function openNotif() {
    if (userOpen) closeUserSmooth();
    computeNotifPos();
    setNotifOpen(true);
  }

  function closeNotifSmooth() {
    const el = notifPanelRef.current;
    if (!el) {
      setNotifOpen(false);
      return;
    }
    el.classList.remove("animate-[notifIn_.22s_ease-out]");
    el.classList.add("animate-[notifOut_.18s_ease-in]");
    window.setTimeout(() => setNotifOpen(false), 160);
  }

  useEffect(() => {
    if (!notifOpen) return;
    const on = () => computeNotifPos();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  useEffect(() => {
    if (!notifOpen) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (notifBtnRef.current?.contains(t)) return;
      if (notifPanelRef.current?.contains(t)) return;
      closeNotifSmooth();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeNotifSmooth();
    }

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [notifOpen]);

  // -----------------------------
  // USER MENU PANEL
  // -----------------------------
  function computeUserPos() {
    const b = avatarRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();

    const top = r.bottom + 12;
    const right = window.innerWidth - r.right;

    const maxTop = Math.max(10, window.innerHeight - USER_H - 10);
    const safeTop = clamp(top, 10, maxTop);

    const maxRight = Math.max(10, window.innerWidth - USER_W - 10);
    const safeRight = clamp(right, 10, maxRight);

    setUserPos({ top: safeTop, right: safeRight });
  }

  function openUser() {
    if (notifOpen) closeNotifSmooth();
    computeUserPos();
    setUserOpen(true);
  }

  function closeUserSmooth() {
    const el = userPanelRef.current;
    if (!el) {
      setUserOpen(false);
      return;
    }
    el.classList.remove("animate-[menuIn_.18s_ease-out]");
    el.classList.add("animate-[menuOut_.14s_ease-in]");
    window.setTimeout(() => setUserOpen(false), 120);
  }

  useEffect(() => {
    if (!userOpen) return;
    const on = () => computeUserPos();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userOpen]);

  useEffect(() => {
    if (!userOpen) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (avatarRef.current?.contains(t)) return;
      if (userPanelRef.current?.contains(t)) return;
      closeUserSmooth();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeUserSmooth();
    }

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  function MenuItem(props: {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    onClick: () => void;
    right?: React.ReactNode;
  }) {
    return (
      <button
        onClick={props.onClick}
        className="w-full px-4 py-3 text-left border-b border-[color:var(--border)]
                   hover:bg-[color:var(--panel-2)] transition flex items-center gap-3"
        type="button"
      >
        <span className="w-9 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] flex items-center justify-center">
          {props.icon}
        </span>
        <span className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[color:var(--text)]">{props.label}</div>
          {props.sub ? (
            <div className="text-xs text-[color:var(--muted)] mt-0.5">{props.sub}</div>
          ) : null}
        </span>
        {props.right ? <span className="shrink-0">{props.right}</span> : null}
      </button>
    );
  }

  const iconMuted = "text-[color:var(--muted)]";

  // ✅ IMPORTANT: valeurs stables SSR -> CSR (badge + textes)
  const safeUnread = mounted ? unread : 0;
  const safeInbox = mounted ? inbox : [];

  return (
    <>
      <header className="h-16 border-b border-[color:var(--border)] bg-[color:var(--panel)] backdrop-blur flex items-center px-6 relative z-[50]">
        {/* LEFT (vide) */}
        <div className="flex items-center gap-3" />

        {/* RIGHT */}
        <div className="ml-auto flex items-center gap-3">
          {/* 🔴 LIVE */}
          {live.isLive ? (
            <a
              href={live.url || "https://www.tiktok.com/"}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl
                         border border-red-500/30 bg-red-500/15 hover:bg-red-500/20 transition"
              title="Enrick est en live (TikTok)"
            >
              <span className="relative inline-flex">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="absolute -inset-1 rounded-full bg-red-500/40 blur-sm" />
              </span>
              <span className="text-xs font-semibold text-red-600 dark:text-red-200">LIVE</span>
              <span className="text-xs text-red-700/80 dark:text-red-100/80 hidden md:inline">
                Enrick est en live
              </span>
            </a>
          ) : null}

          {/* 🔔 Notifications */}
          <button
            ref={notifBtnRef}
            onClick={() => (notifOpen ? closeNotifSmooth() : openNotif())}
            className="relative w-10 h-10 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)]
                       hover:bg-[color:var(--panel)] transition flex items-center justify-center"
            title="Notifications"
            type="button"
          >
            <Bell size={18} className={iconMuted} />

            {/* ✅ badge seulement après montage client -> plus de mismatch */}
            {safeUnread > 0 ? (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
                           bg-[color:var(--gold)] text-black text-[10px] font-bold
                           flex items-center justify-center shadow"
              >
                {badgeText(safeUnread)}
              </span>
            ) : null}
          </button>

          {/* Auth */}
          {!acc ? (
            <Button onClick={() => (window.location.href = "/login")}>Se connecter</Button>
          ) : (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]">
              <span className="w-2 h-2 rounded-full bg-[color:var(--gold)]" />
              <span className="text-xs font-semibold text-[color:var(--gold)]">
                {acc.username} {acc.tag}
              </span>
            </div>
          )}

          <div className="text-xs text-[color:var(--muted)]">FR</div>

          {/* Avatar -> menu */}
          <button
            ref={avatarRef}
            onClick={() => {
              if (!acc) return (window.location.href = "/login");
              return userOpen ? closeUserSmooth() : openUser();
            }}
            className="w-10 h-10 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--panel-2)]
                       flex items-center justify-center overflow-hidden hover:bg-[color:var(--panel)] transition"
            title={acc ? "Menu utilisateur" : "Se connecter"}
            type="button"
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-[color:var(--gold)]">{initials}</span>
            )}
          </button>
        </div>
      </header>

      {/* ✅ Notifications Panel en PORTAL */}
      {notifOpen && notifPos
        ? createPortal(
            <div
              style={{
                position: "fixed",
                top: notifPos.top,
                right: notifPos.right,
                width: NOTIF_W,
                height: NOTIF_H,
                zIndex: 999999,
              }}
            >
              <div
                ref={notifPanelRef}
                className="h-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)]
                           shadow-2xl overflow-hidden origin-top-right
                           animate-[notifIn_.22s_ease-out]"
              >
                <div className="p-4 border-b border-[color:var(--border)] flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text)]">Notifications</div>
                    <div className="text-xs text-[color:var(--muted)] mt-0.5">
                      {safeUnread > 0 ? `${safeUnread} non lue(s)` : "Tout est lu"}
                    </div>
                  </div>

                  <button
                    className="w-9 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)]
                               hover:bg-[color:var(--panel)] transition flex items-center justify-center"
                    onClick={closeNotifSmooth}
                    title="Fermer"
                    type="button"
                  >
                    <X size={16} className={iconMuted} />
                  </button>
                </div>

                <div className="px-4 py-3 flex items-center gap-2 border-b border-[color:var(--border)]">
                  <button
                    onClick={markAllRead}
                    className="px-3 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)]
                               hover:bg-[color:var(--panel)] transition text-sm
                               flex items-center gap-2"
                    title="Tout marquer comme lu"
                    type="button"
                  >
                    <CheckCheck size={16} className={iconMuted} />
                    <span className="text-[color:var(--text)]">Tout lu</span>
                  </button>

                  <button
                    onClick={clearInbox}
                    className="px-3 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)]
                               hover:bg-[color:var(--panel)] transition text-sm
                               flex items-center gap-2"
                    title="Vider"
                    type="button"
                  >
                    <Trash2 size={16} className={iconMuted} />
                    <span className="text-[color:var(--text)]">Vider</span>
                  </button>

                  <button
                    onClick={toggleMute}
                    className="ml-auto w-9 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)]
                               hover:bg-[color:var(--panel)] transition
                               flex items-center justify-center"
                    title={settings.muted ? "Activer le son" : "Couper le son"}
                    type="button"
                  >
                    {settings.muted ? (
                      <VolumeX size={16} className={iconMuted} />
                    ) : (
                      <Volume2 size={16} className={iconMuted} />
                    )}
                  </button>
                </div>

                <div className="h-[420px] overflow-auto">
                  {!mounted ? (
                    <div className="p-6 text-sm text-[color:var(--muted)]">
                      Chargement…
                    </div>
                  ) : safeInbox.length === 0 ? (
                    <div className="p-6 text-sm text-[color:var(--muted)]">Aucune notification.</div>
                  ) : (
                    safeInbox.slice(0, 30).map((n: any) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          markRead(n.id);
                          if (n.url) window.open(n.url, "_blank");
                        }}
                        className={[
                          "w-full text-left px-4 py-3 border-b border-[color:var(--border)] transition",
                          "hover:bg-[color:var(--panel-2)]",
                          n.read ? "opacity-70" : "opacity-100",
                        ].join(" ")}
                        type="button"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={[
                              "w-2.5 h-2.5 rounded-full mt-1.5",
                              kindDotClass(n.kind),
                            ].join(" ")}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-[color:var(--text)] truncate">
                              {n.title}
                            </div>
                            {n.message ? (
                              <div className="text-xs text-[color:var(--muted)] mt-1 line-clamp-2">
                                {n.message}
                              </div>
                            ) : null}

                            {/* ✅ toLocaleString peut varier SSR/CSR -> on le montre seulement après mounted */}
                            <div className="mt-2 text-[10px] text-[color:var(--muted)] uppercase tracking-wide">
                              {n.kind} •{" "}
                              {new Date(n.createdAt).toLocaleString("fr-FR")}
                            </div>
                          </div>

                          {n.url ? (
                            <span className="mt-1">
                              <ExternalLink size={16} className="text-[color:var(--muted)]" />
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="px-4 py-3 text-[11px] text-[color:var(--muted)] border-t border-[color:var(--border)]">
                  Clique dehors ou appuie sur ESC pour fermer.
                </div>
              </div>

              <style>{`
                @keyframes notifIn {
                  0% { opacity: 0; transform: translateY(-8px) scale(.985); }
                  100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes notifOut {
                  0% { opacity: 1; transform: translateY(0) scale(1); }
                  100% { opacity: 0; transform: translateY(-6px) scale(.985); }
                }
              `}</style>
            </div>,
            document.body
          )
        : null}

      {/* ✅ User Menu en PORTAL */}
      {userOpen && userPos
        ? createPortal(
            <div
              style={{
                position: "fixed",
                top: userPos.top,
                right: userPos.right,
                width: USER_W,
                height: USER_H,
                zIndex: 999999,
              }}
            >
              <div
                ref={userPanelRef}
                className="h-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)]
                           shadow-2xl overflow-hidden origin-top-right
                           animate-[menuIn_.18s_ease-out]"
              >
                <div className="p-4 border-b border-[color:var(--border)] flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--panel-2)]
                                  flex items-center justify-center overflow-hidden shrink-0">
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold text-[color:var(--gold)]">{initials}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-[color:var(--text)] truncate">
                        {acc?.username || "Utilisateur"}
                      </div>
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
                                         border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200">
                          <ShieldCheck size={12} />
                          Vérifié
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[color:var(--muted)] mt-0.5 truncate">
                      Plan: <span className="text-[color:var(--text)] font-semibold">{String(planLabel)}</span>
                    </div>
                  </div>

                  <button
                    className="w-9 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)]
                               hover:bg-[color:var(--panel)] transition flex items-center justify-center"
                    onClick={closeUserSmooth}
                    title="Fermer"
                    type="button"
                  >
                    <X size={16} className="text-[color:var(--muted)]" />
                  </button>
                </div>

                <div className="overflow-auto h-[calc(100%-72px)]">
                  <MenuItem
                    icon={<User size={16} className={iconMuted} />}
                    label="Mon profil"
                    sub="Infos, sécurité, préférences"
                    onClick={() => {
                      closeUserSmooth();
                      go("/dashboard/profil");
                    }}
                  />

                  <MenuItem
                    icon={<Crown size={16} className="text-[color:var(--gold)]" />}
                    label="Mon abonnement"
                    sub="Plan actuel + upgrade"
                    onClick={() => {
                      closeUserSmooth();
                      go("/dashboard/abonnement");
                    }}
                    right={
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] font-bold">
                        {String(planLabel)}
                      </span>
                    }
                  />

                  <MenuItem
                    icon={<CreditCard size={16} className={iconMuted} />}
                    label="Facturation"
                    sub="Historique d’achat + factures"
                    onClick={() => {
                      closeUserSmooth();
                      go("/dashboard/facturation");
                    }}
                  />

                  <MenuItem
                    icon={<History size={16} className={iconMuted} />}
                    label="Historique"
                    sub="Connexions et activités"
                    onClick={() => {
                      closeUserSmooth();
                      go("/dashboard/historique");
                    }}
                  />

                  <MenuItem
                    icon={<Settings size={16} className={iconMuted} />}
                    label="Paramètres"
                    sub="Notifications, sons, préférences"
                    onClick={() => {
                      closeUserSmooth();
                      go("/dashboard/parametres");
                    }}
                  />

                  {/* Theme */}
                  <div className="border-b border-[color:var(--border)]">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] flex items-center justify-center">
                        {theme === "dark" ? (
                          <Moon size={16} className={iconMuted} />
                        ) : theme === "light" ? (
                          <Sun size={16} className={iconMuted} />
                        ) : (
                          <Laptop size={16} className={iconMuted} />
                        )}
                      </span>

                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[color:var(--text)]">Thème</div>
                        <div className="text-xs text-[color:var(--muted)] mt-0.5">Clair / Foncé / Système</div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setThemeAndPersist("light")}
                          className={[
                            "px-2.5 h-8 rounded-xl border text-xs font-semibold transition",
                            theme === "light"
                              ? "border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--text)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)] hover:bg-[color:var(--panel-2)]",
                          ].join(" ")}
                          type="button"
                        >
                          Clair
                        </button>
                        <button
                          onClick={() => setThemeAndPersist("dark")}
                          className={[
                            "px-2.5 h-8 rounded-xl border text-xs font-semibold transition",
                            theme === "dark"
                              ? "border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--text)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)] hover:bg-[color:var(--panel-2)]",
                          ].join(" ")}
                          type="button"
                        >
                          Foncé
                        </button>
                        <button
                          onClick={() => setThemeAndPersist("system")}
                          className={[
                            "px-2.5 h-8 rounded-xl border text-xs font-semibold transition",
                            theme === "system"
                              ? "border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--text)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)] hover:bg-[color:var(--panel-2)]",
                          ].join(" ")}
                          type="button"
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Logout */}
                  <div className="p-4">
                    <button
                      onClick={() => {
                        closeUserSmooth();
                        logout();
                      }}
                      className="w-full h-11 rounded-2xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 transition
                                 flex items-center justify-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-200"
                      type="button"
                    >
                      <LogOut size={16} />
                      Déconnexion
                    </button>

                    <div className="mt-3 text-[11px] text-[color:var(--muted)] text-center">
                      Clique dehors ou appuie sur ESC pour fermer.
                    </div>
                  </div>
                </div>
              </div>

              <style>{`
                @keyframes menuIn {
                  0% { opacity: 0; transform: translateY(-6px) scale(.985); }
                  100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes menuOut {
                  0% { opacity: 1; transform: translateY(0) scale(1); }
                  100% { opacity: 0; transform: translateY(-4px) scale(.985); }
                }
              `}</style>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
