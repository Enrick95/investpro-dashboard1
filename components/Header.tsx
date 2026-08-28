"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "./ui/Button";
import { createClient } from "@/lib/supabase/client";

import {
  useNotifs,
  markAllRead,
  clearInbox,
  markRead,
  toggleMute,
} from "../lib/notifyStore";

import MaintenanceTicker from "./ui/MaintenanceTicker";
import { useAllMaintenance } from "../lib/adminStore";

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

type LiveState = {
  isLive: boolean;
  url?: string;
};

type ThemeMode = "dark" | "light" | "system";

type AccountProfile = {
  id: string;
  email: string;
  username: string;
  plan: string;
  xp: number;
  avatar_url?: string | null;
};

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
  if (kind === "admin" || kind === "success")
    return "bg-[color:var(--gold)]";
  if (kind === "pending") return "bg-[color:var(--border)]";

  return "bg-[color:var(--border)]";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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

export default function Header() {
  const supabase = useMemo(() => createClient(), []);

  const [acc, setAcc] = useState<AccountProfile | null>(null);
  const [mounted, setMounted] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [avatarSrc, setAvatarSrc] = useState<string>("");

  // LIVE
  const [live, setLive] = useState<LiveState>({
    isLive: false,
  });

  // Notifications
  const { inbox, unread, settings } = useNotifs();

  // Maintenance
  const maint = useAllMaintenance();

  const maintTerminal =
    maint.terminal.enabled && maint.terminal.endsAt > Date.now();

  const maintCopier =
    maint.copieur.enabled && maint.copieur.endsAt > Date.now();

  const showMaintBar = maintTerminal || maintCopier;

  // Notifications dropdown
  const [notifOpen, setNotifOpen] = useState(false);

  const notifBtnRef = useRef<HTMLButtonElement | null>(null);
  const notifPanelRef = useRef<HTMLDivElement | null>(null);

  const [notifPos, setNotifPos] = useState<{
    top: number;
    right: number;
  } | null>(null);

  const NOTIF_W = 360;
  const NOTIF_H = 560;

  // User dropdown
  const [userOpen, setUserOpen] = useState(false);

  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const userPanelRef = useRef<HTMLDivElement | null>(null);

  const [userPos, setUserPos] = useState<{
    top: number;
    right: number;
  } | null>(null);

  const USER_W = 320;
  const USER_H = 440;

  // Theme
  const [theme, setTheme] = useState<ThemeMode>("dark");

  /*
  |--------------------------------------------------------------------------
  | SUPABASE AUTH + PROFILE
  |--------------------------------------------------------------------------
  */

  async function loadCurrentUser() {
    try {
      setAuthLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setAcc(null);
        setAvatarSrc("");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, plan, xp, avatar_url")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Erreur profil Supabase :", profileError);
      }

      const username =
        profile?.username ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Utilisateur";

      const account: AccountProfile = {
        id: user.id,
        email: user.email || "",
        username,
        plan: String(profile?.plan || "free"),
        xp: Number(profile?.xp || 0),
        avatar_url: profile?.avatar_url || null,
      };

      setAcc(account);
      setAvatarSrc(account.avatar_url || "");
    } catch (error) {
      console.error("Erreur chargement utilisateur :", error);

      setAcc(null);
      setAvatarSrc("");
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);

    loadCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadCurrentUser();
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
  |--------------------------------------------------------------------------
  | THEME
  |--------------------------------------------------------------------------
  */

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
      const current =
        (localStorage.getItem("ip_theme") as ThemeMode | null) || "dark";

      if (current === "system") {
        applyTheme("system");
      }
    };

    mq.addEventListener?.("change", onChange);

    return () => {
      mq.removeEventListener?.("change", onChange);
    };
  }, []);

  function setThemeAndPersist(t: ThemeMode) {
    setTheme(t);
    localStorage.setItem("ip_theme", t);
    applyTheme(t);
  }

  /*
  |--------------------------------------------------------------------------
  | USER DISPLAY
  |--------------------------------------------------------------------------
  */

  const initials = useMemo(() => {
    const username = acc?.username?.trim();

    if (!username) return "IP";

    return username.slice(0, 2).toUpperCase();
  }, [acc]);

  const planLabel = useMemo(() => {
    if (!acc?.plan) return "FREE";

    return String(acc.plan).toUpperCase();
  }, [acc]);

  function go(href: string) {
    window.location.href = href;
  }

  async function logout() {
    try {
      await supabase.auth.signOut({
        scope: "local",
      });
    } catch (error) {
      console.error("Erreur déconnexion :", error);
    }

    setAcc(null);
    setAvatarSrc("");

    window.location.href = "/login";
  }

  /*
  |--------------------------------------------------------------------------
  | TIKTOK LIVE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let mountedLocal = true;

    const username = (
      process.env.NEXT_PUBLIC_TIKTOK_USERNAME || "enrick95__"
    ).trim();

    async function checkLive() {
      try {
        const r = await fetch("/api/live-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify({
            username,
          }),
          cache: "no-store",
        });

        const j = await r.json().catch(() => null);

        if (!mountedLocal) return;

        if (!r.ok || !j?.ok) {
          setLive({
            isLive: false,
          });

          return;
        }

        const isLive = j?.isLive === true;

        setLive({
          isLive,
          url:
            isLive && typeof j?.url === "string"
              ? j.url
              : undefined,
        });
      } catch {
        if (!mountedLocal) return;

        setLive({
          isLive: false,
        });
      }
    }

    checkLive();

    const id = window.setInterval(checkLive, 20_000);

    return () => {
      mountedLocal = false;
      window.clearInterval(id);
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | NOTIFICATIONS PANEL
  |--------------------------------------------------------------------------
  */

  function computeNotifPos() {
    const b = notifBtnRef.current;

    if (!b) return;

    const r = b.getBoundingClientRect();

    const top = r.bottom + 12;
    const right = window.innerWidth - r.right;

    const maxTop = Math.max(
      10,
      window.innerHeight - NOTIF_H - 10
    );

    const safeTop = clamp(top, 10, maxTop);

    const maxRight = Math.max(
      10,
      window.innerWidth - NOTIF_W - 10
    );

    const safeRight = clamp(right, 10, maxRight);

    setNotifPos({
      top: safeTop,
      right: safeRight,
    });
  }

  function openNotif() {
    if (userOpen) {
      closeUserSmooth();
    }

    computeNotifPos();
    setNotifOpen(true);
  }

  function closeNotifSmooth() {
    const el = notifPanelRef.current;

    if (!el) {
      setNotifOpen(false);
      return;
    }

    el.classList.remove(
      "animate-[notifIn_.22s_ease-out]"
    );

    el.classList.add(
      "animate-[notifOut_.18s_ease-in]"
    );

    window.setTimeout(() => {
      setNotifOpen(false);
    }, 160);
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
      if (e.key === "Escape") {
        closeNotifSmooth();
      }
    }

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [notifOpen]);

  /*
  |--------------------------------------------------------------------------
  | USER MENU
  |--------------------------------------------------------------------------
  */

  function computeUserPos() {
    const b = avatarRef.current;

    if (!b) return;

    const r = b.getBoundingClientRect();

    const top = r.bottom + 12;
    const right = window.innerWidth - r.right;

    const maxTop = Math.max(
      10,
      window.innerHeight - USER_H - 10
    );

    const safeTop = clamp(top, 10, maxTop);

    const maxRight = Math.max(
      10,
      window.innerWidth - USER_W - 10
    );

    const safeRight = clamp(right, 10, maxRight);

    setUserPos({
      top: safeTop,
      right: safeRight,
    });
  }

  function openUser() {
    if (notifOpen) {
      closeNotifSmooth();
    }

    computeUserPos();
    setUserOpen(true);
  }

  function closeUserSmooth() {
    const el = userPanelRef.current;

    if (!el) {
      setUserOpen(false);
      return;
    }

    el.classList.remove(
      "animate-[menuIn_.18s_ease-out]"
    );

    el.classList.add(
      "animate-[menuOut_.14s_ease-in]"
    );

    window.setTimeout(() => {
      setUserOpen(false);
    }, 120);
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
      if (e.key === "Escape") {
        closeUserSmooth();
      }
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
        className="
          w-full px-4 py-3 text-left
          border-b border-[color:var(--border)]
          hover:bg-[color:var(--panel-2)]
          transition flex items-center gap-3
        "
        type="button"
      >
        <span
          className="
            w-9 h-9 rounded-xl
            border border-[color:var(--border)]
            bg-[color:var(--panel-2)]
            flex items-center justify-center
          "
        >
          {props.icon}
        </span>

        <span className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[color:var(--text)]">
            {props.label}
          </div>

          {props.sub ? (
            <div className="text-xs text-[color:var(--muted)] mt-0.5">
              {props.sub}
            </div>
          ) : null}
        </span>

        {props.right ? (
          <span className="shrink-0">
            {props.right}
          </span>
        ) : null}
      </button>
    );
  }

  const iconMuted =
    "text-[color:var(--muted)]";

  const safeUnread = mounted ? unread : 0;
  const safeInbox = mounted ? inbox : [];

  return (
    <>
      {showMaintBar ? (
        <MaintenanceTicker
          maintTerminal={maintTerminal}
          maintCopier={maintCopier}
        />
      ) : null}

      <header
        className="
          h-16
          border-b border-[color:var(--border)]
          bg-[color:var(--panel)]
          backdrop-blur
          flex items-center
          px-4 lg:px-6
          relative z-[50]
        "
      >
        {/* Logo / marque sur mobile */}
        <button
          type="button"
          onClick={() => go("/dashboard")}
          className="lg:hidden flex items-center gap-2 min-w-0"
          title="Accueil InvestPro"
        >
          <span
            className="
              w-9 h-9 rounded-full
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              flex items-center justify-center
              text-xs font-bold text-[color:var(--gold)]
              shrink-0
            "
          >
            IP
          </span>

          <span className="text-[17px] font-semibold tracking-tight truncate">
            <span className="text-[color:var(--text)]">Invest</span>
            <span className="text-[color:var(--gold)]">Pro</span>
          </span>
        </button>

        <div className="hidden lg:flex items-center gap-3" />

        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          {/* LIVE */}
          {live.isLive ? (
            <a
              href={live.url || "https://www.tiktok.com/"}
              target="_blank"
              rel="noreferrer"
              className="
                group inline-flex items-center gap-2
                px-3 py-1.5 rounded-2xl
                border border-red-500/30
                bg-red-500/15
                hover:bg-red-500/20
                transition
              "
              title="Enrick est en live"
            >
              <span className="relative inline-flex">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="absolute -inset-1 rounded-full bg-red-500/40 blur-sm" />
              </span>

              <span className="text-xs font-semibold text-red-600 dark:text-red-200">
                LIVE
              </span>

              <span className="text-xs text-red-700/80 dark:text-red-100/80 hidden xl:inline">
                Enrick est en live
              </span>
            </a>
          ) : null}

          {/* Notifications */}
          <button
            ref={notifBtnRef}
            onClick={() =>
              notifOpen
                ? closeNotifSmooth()
                : openNotif()
            }
            className="
              relative w-10 h-10 rounded-2xl
              border border-[color:var(--border)]
              bg-[color:var(--panel-2)]
              hover:bg-[color:var(--panel)]
              transition flex items-center justify-center
            "
            title="Notifications"
            type="button"
          >
            <Bell
              size={18}
              className={iconMuted}
            />

            {safeUnread > 0 ? (
              <span
                className="
                  absolute -top-1 -right-1
                  min-w-[18px] h-[18px] px-1
                  rounded-full
                  bg-[color:var(--gold)]
                  text-black text-[10px] font-bold
                  flex items-center justify-center
                  shadow
                "
              >
                {badgeText(safeUnread)}
              </span>
            ) : null}
          </button>

          {/* UTILISATEUR CONNECTÉ */}
          {!authLoading && !acc ? (
            <Button
              onClick={() => {
                window.location.href = "/login";
              }}
            >
              Se connecter
            </Button>
          ) : null}

          {!authLoading && acc ? (
            <button
              type="button"
              onClick={() =>
                userOpen
                  ? closeUserSmooth()
                  : openUser()
              }
              className="
                hidden lg:flex
                items-center gap-3
                px-3 py-1.5
                rounded-2xl
                border border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
                hover:bg-[color:var(--panel-2)]
                transition
              "
            >
              <div className="text-right leading-tight">
                <div
                  className="
                    text-xs font-semibold
                    text-[color:var(--text)]
                    max-w-[130px]
                    truncate
                  "
                >
                  {acc.username}
                </div>

                <div
                  className="
                    text-[10px]
                    font-semibold
                    text-[color:var(--gold)]
                    mt-0.5
                  "
                >
                  Plan {planLabel}
                </div>
              </div>
            </button>
          ) : null}

          <div className="hidden sm:block text-xs text-[color:var(--muted)]">
            FR
          </div>

          {/* Avatar */}
          <button
            ref={avatarRef}
            onClick={() => {
              if (!acc) {
                window.location.href = "/login";
                return;
              }

              return userOpen
                ? closeUserSmooth()
                : openUser();
            }}
            className="
              w-10 h-10 rounded-full
              border border-[color:var(--gold-border)]
              bg-[color:var(--panel-2)]
              flex items-center justify-center
              overflow-hidden
              hover:bg-[color:var(--panel)]
              transition
            "
            title={
              acc
                ? "Menu utilisateur"
                : "Se connecter"
            }
            type="button"
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span
                className="
                  text-sm font-semibold
                  text-[color:var(--gold)]
                "
              >
                {initials}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* NOTIFICATIONS */}
      {notifOpen && notifPos
        ? createPortal(
            <div
              style={{
                position: "fixed",
                top: notifPos.top,
                right: notifPos.right,
                width:
                  typeof window !== "undefined"
                    ? Math.min(NOTIF_W, window.innerWidth - 20)
                    : NOTIF_W,
                height:
                  typeof window !== "undefined"
                    ? Math.min(NOTIF_H, window.innerHeight - 20)
                    : NOTIF_H,
                zIndex: 999999,
              }}
            >
              <div
                ref={notifPanelRef}
                className="
                  h-full rounded-2xl
                  border border-[color:var(--border)]
                  bg-[color:var(--panel)]
                  shadow-2xl
                  overflow-hidden
                  origin-top-right
                  animate-[notifIn_.22s_ease-out]
                "
              >
                <div
                  className="
                    p-4
                    border-b border-[color:var(--border)]
                    flex items-center justify-between
                  "
                >
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text)]">
                      Notifications
                    </div>

                    <div className="text-xs text-[color:var(--muted)] mt-0.5">
                      {safeUnread > 0
                        ? `${safeUnread} non lue(s)`
                        : "Tout est lu"}
                    </div>
                  </div>

                  <button
                    className="
                      w-9 h-9 rounded-xl
                      border border-[color:var(--border)]
                      bg-[color:var(--panel-2)]
                      hover:bg-[color:var(--panel)]
                      transition
                      flex items-center justify-center
                    "
                    onClick={closeNotifSmooth}
                    title="Fermer"
                    type="button"
                  >
                    <X
                      size={16}
                      className={iconMuted}
                    />
                  </button>
                </div>

                <div
                  className="
                    px-4 py-3
                    flex items-center gap-2
                    border-b border-[color:var(--border)]
                  "
                >
                  <button
                    onClick={markAllRead}
                    className="
                      px-3 h-9 rounded-xl
                      border border-[color:var(--border)]
                      bg-[color:var(--panel-2)]
                      hover:bg-[color:var(--panel)]
                      transition text-sm
                      flex items-center gap-2
                    "
                    type="button"
                  >
                    <CheckCheck
                      size={16}
                      className={iconMuted}
                    />

                    <span className="text-[color:var(--text)]">
                      Tout lu
                    </span>
                  </button>

                  <button
                    onClick={clearInbox}
                    className="
                      px-3 h-9 rounded-xl
                      border border-[color:var(--border)]
                      bg-[color:var(--panel-2)]
                      hover:bg-[color:var(--panel)]
                      transition text-sm
                      flex items-center gap-2
                    "
                    type="button"
                  >
                    <Trash2
                      size={16}
                      className={iconMuted}
                    />

                    <span className="text-[color:var(--text)]">
                      Vider
                    </span>
                  </button>

                  <button
                    onClick={toggleMute}
                    className="
                      ml-auto w-9 h-9 rounded-xl
                      border border-[color:var(--border)]
                      bg-[color:var(--panel-2)]
                      hover:bg-[color:var(--panel)]
                      transition
                      flex items-center justify-center
                    "
                    type="button"
                  >
                    {settings.muted ? (
                      <VolumeX
                        size={16}
                        className={iconMuted}
                      />
                    ) : (
                      <Volume2
                        size={16}
                        className={iconMuted}
                      />
                    )}
                  </button>
                </div>

                <div className="h-[420px] overflow-auto">
                  {!mounted ? (
                    <div className="p-6 text-sm text-[color:var(--muted)]">
                      Chargement…
                    </div>
                  ) : safeInbox.length === 0 ? (
                    <div className="p-6 text-sm text-[color:var(--muted)]">
                      Aucune notification.
                    </div>
                  ) : (
                    safeInbox
                      .slice(0, 30)
                      .map((n: any) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            markRead(n.id);

                            if (n.url) {
                              window.open(
                                n.url,
                                "_blank"
                              );
                            }
                          }}
                          className={[
                            "w-full text-left px-4 py-3 border-b border-[color:var(--border)] transition",
                            "hover:bg-[color:var(--panel-2)]",
                            n.read
                              ? "opacity-70"
                              : "opacity-100",
                          ].join(" ")}
                          type="button"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={[
                                "w-2.5 h-2.5 rounded-full mt-1.5",
                                kindDotClass(
                                  n.kind
                                ),
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

                              <div className="mt-2 text-[10px] text-[color:var(--muted)] uppercase tracking-wide">
                                {n.kind} •{" "}
                                {new Date(
                                  n.createdAt
                                ).toLocaleString(
                                  "fr-FR"
                                )}
                              </div>
                            </div>

                            {n.url ? (
                              <ExternalLink
                                size={16}
                                className="text-[color:var(--muted)] mt-1"
                              />
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
                  0% {
                    opacity: 0;
                    transform: translateY(-8px) scale(.985);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }

                @keyframes notifOut {
                  0% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                  100% {
                    opacity: 0;
                    transform: translateY(-6px) scale(.985);
                  }
                }
              `}</style>
            </div>,
            document.body
          )
        : null}

      {/* USER MENU */}
      {userOpen && userPos
        ? createPortal(
            <div
              style={{
                position: "fixed",
                top: userPos.top,
                right: userPos.right,
                width:
                  typeof window !== "undefined"
                    ? Math.min(USER_W, window.innerWidth - 20)
                    : USER_W,
                height:
                  typeof window !== "undefined"
                    ? Math.min(USER_H, window.innerHeight - 20)
                    : USER_H,
                zIndex: 999999,
              }}
            >
              <div
                ref={userPanelRef}
                className="
                  h-full rounded-2xl
                  border border-[color:var(--border)]
                  bg-[color:var(--panel)]
                  shadow-2xl
                  overflow-hidden
                  origin-top-right
                  animate-[menuIn_.18s_ease-out]
                "
              >
                <div
                  className="
                    p-4
                    border-b border-[color:var(--border)]
                    flex items-center gap-3
                  "
                >
                  <div
                    className="
                      w-11 h-11 rounded-2xl
                      border border-[color:var(--gold-border)]
                      bg-[color:var(--panel-2)]
                      flex items-center justify-center
                      overflow-hidden shrink-0
                    "
                  >
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarSrc}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-[color:var(--gold)]">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-[color:var(--text)] truncate">
                        {acc?.username ||
                          "Utilisateur"}
                      </div>

                      <span
                        className="
                          inline-flex items-center gap-1
                          px-2 py-0.5 rounded-full
                          text-[10px] font-bold
                          border border-emerald-500/30
                          bg-emerald-500/10
                          text-emerald-600
                          dark:text-emerald-200
                        "
                      >
                        <ShieldCheck size={12} />
                        Connecté
                      </span>
                    </div>

                    <div className="text-xs text-[color:var(--muted)] mt-0.5 truncate">
                      {acc?.email}
                    </div>

                    <div className="text-xs text-[color:var(--muted)] mt-1">
                      Plan :{" "}
                      <span className="text-[color:var(--gold)] font-semibold">
                        {planLabel}
                      </span>
                    </div>
                  </div>

                  <button
                    className="
                      w-9 h-9 rounded-xl
                      border border-[color:var(--border)]
                      bg-[color:var(--panel-2)]
                      hover:bg-[color:var(--panel)]
                      transition flex items-center justify-center
                    "
                    onClick={closeUserSmooth}
                    type="button"
                  >
                    <X
                      size={16}
                      className="text-[color:var(--muted)]"
                    />
                  </button>
                </div>

                <div className="overflow-auto h-[calc(100%-72px)]">
                  <MenuItem
                    icon={
                      <User
                        size={16}
                        className={iconMuted}
                      />
                    }
                    label="Mon profil"
                    sub="Infos et préférences"
                    onClick={() => {
                      closeUserSmooth();
                      go("/dashboard/profil");
                    }}
                  />

                  <MenuItem
                    icon={
                      <Crown
                        size={16}
                        className="text-[color:var(--gold)]"
                      />
                    }
                    label="Mon abonnement"
                    sub="Plan actuel + upgrade"
                    onClick={() => {
                      closeUserSmooth();
                      go(
                        "/dashboard/abonnement"
                      );
                    }}
                    right={
                      <span
                        className="
                          text-[10px]
                          px-2 py-0.5
                          rounded-full
                          border border-[color:var(--gold-border)]
                          bg-[color:var(--gold-soft)]
                          text-[color:var(--gold)]
                          font-bold
                        "
                      >
                        {planLabel}
                      </span>
                    }
                  />

                  <MenuItem
                    icon={
                      <CreditCard
                        size={16}
                        className={iconMuted}
                      />
                    }
                    label="Facturation"
                    sub="Historique d’achat + factures"
                    onClick={() => {
                      closeUserSmooth();
                      go(
                        "/dashboard/facturation"
                      );
                    }}
                  />

                  <MenuItem
                    icon={
                      <History
                        size={16}
                        className={iconMuted}
                      />
                    }
                    label="Historique"
                    sub="Connexions et activités"
                    onClick={() => {
                      closeUserSmooth();
                      go(
                        "/dashboard/historique"
                      );
                    }}
                  />

                  <MenuItem
                    icon={
                      <Settings
                        size={16}
                        className={iconMuted}
                      />
                    }
                    label="Paramètres"
                    sub="Notifications et préférences"
                    onClick={() => {
                      closeUserSmooth();
                      go(
                        "/dashboard/parametres"
                      );
                    }}
                  />

                  {/* THEME */}
                  <div className="border-b border-[color:var(--border)]">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span
                        className="
                          w-9 h-9 rounded-xl
                          border border-[color:var(--border)]
                          bg-[color:var(--panel-2)]
                          flex items-center justify-center
                        "
                      >
                        {theme === "dark" ? (
                          <Moon
                            size={16}
                            className={iconMuted}
                          />
                        ) : theme === "light" ? (
                          <Sun
                            size={16}
                            className={iconMuted}
                          />
                        ) : (
                          <Laptop
                            size={16}
                            className={iconMuted}
                          />
                        )}
                      </span>

                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[color:var(--text)]">
                          Thème
                        </div>

                        <div className="text-xs text-[color:var(--muted)] mt-0.5">
                          Clair / Foncé / Système
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setThemeAndPersist(
                              "light"
                            )
                          }
                          className={[
                            "px-2.5 h-8 rounded-xl border text-xs font-semibold transition",
                            theme === "light"
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)]",
                          ].join(" ")}
                          type="button"
                        >
                          Clair
                        </button>

                        <button
                          onClick={() =>
                            setThemeAndPersist(
                              "dark"
                            )
                          }
                          className={[
                            "px-2.5 h-8 rounded-xl border text-xs font-semibold transition",
                            theme === "dark"
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)]",
                          ].join(" ")}
                          type="button"
                        >
                          Foncé
                        </button>

                        <button
                          onClick={() =>
                            setThemeAndPersist(
                              "system"
                            )
                          }
                          className={[
                            "px-2.5 h-8 rounded-xl border text-xs font-semibold transition",
                            theme === "system"
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)]",
                          ].join(" ")}
                          type="button"
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* LOGOUT */}
                  <div className="p-4">
                    <button
                      onClick={() => {
                        closeUserSmooth();
                        logout();
                      }}
                      className="
                        w-full h-11
                        rounded-2xl
                        border border-rose-500/25
                        bg-rose-500/10
                        hover:bg-rose-500/15
                        transition
                        flex items-center justify-center gap-2
                        text-sm font-semibold
                        text-rose-600
                        dark:text-rose-200
                      "
                      type="button"
                    >
                      <LogOut size={16} />
                      Déconnexion
                    </button>

                    <div className="mt-3 text-[11px] text-[color:var(--muted)] text-center">
                      XP : {acc?.xp ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              <style>{`
                @keyframes menuIn {
                  0% {
                    opacity: 0;
                    transform: translateY(-6px) scale(.985);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }

                @keyframes menuOut {
                  0% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                  100% {
                    opacity: 0;
                    transform: translateY(-4px) scale(.985);
                  }
                }
              `}</style>
            </div>,
            document.body
          )
        : null}
    </>
  );
}