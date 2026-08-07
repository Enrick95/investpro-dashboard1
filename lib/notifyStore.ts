"use client";

/**
 * notifyStore.ts
 * - Toasts (affichage temporaire)
 * - Inbox (historique) + unread count
 * - Settings (mute + volume + sons par type)
 *
 * ✅ Relié à prefsStore:
 * - Filtre par type (enabled[kind]) : si OFF -> pas de notif
 * - Volume & mute viennent de prefsStore (Paramètres)
 * - toggleMute / setVolume / setMuted mettent à jour prefsStore
 */

import { useEffect, useState } from "react";
import { getPrefs, patchPrefs } from "./prefsStore";

export type NotifKind =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "admin"
  | "live"
  | "video"
  | "pending"
  | "tp"
  | "sl"
  | "be";

export type Notif = {
  id: string;
  kind: NotifKind;
  title: string;
  message?: string;
  url?: string;
  createdAt: number; // ms
  ttlMs: number;
  read: boolean;
};

export type NotifSettings = {
  // ✅ maintenant on garde ici uniquement le mapping son par type
  // mute/volume viennent de prefsStore
  soundByKind: Partial<Record<NotifKind, string>>;
};

export type NotifsSnapshot = {
  toasts: Notif[];
  inbox: Notif[];
  unread: number;

  // exposé pour compat (header etc)
  settings: {
    muted: boolean;
    volume: number;
    soundByKind: Partial<Record<NotifKind, string>>;
  };
};

const LS_SOUNDBY = "investpro_notifs_soundbykind_v1";
const LS_INBOX = "investpro_notifs_inbox_v1";

const MAX_INBOX = 50;
const EXPIRE_MS = 24 * 3600 * 1000;

let state: NotifsSnapshot = {
  toasts: [],
  inbox: [],
  unread: 0,
  settings: {
    muted: false, // sera sync depuis prefsStore
    volume: 0.8, // sera sync depuis prefsStore
    soundByKind: {
      live: "/sounds/live.mp3",
      video: "/sounds/video.mp3",
      admin: "/sounds/admin.mp3",
      warning: "/sounds/warn.mp3",
      error: "/sounds/error.mp3",
      success: "/sounds/success.mp3",
      info: "/sounds/info.mp3",
      pending: "/sounds/pending.mp3",
      tp: "/sounds/tp.mp3",
      sl: "/sounds/sl.mp3",
      be: "/sounds/be.mp3",
    },
  },
};

type Listener = (s: NotifsSnapshot) => void;
const listeners = new Set<Listener>();

function isBrowser() {
  return typeof window !== "undefined";
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function recomputeUnread() {
  state.unread = state.inbox.reduce((n, x) => n + (x.read ? 0 : 1), 0);
}

function emit() {
  recomputeUnread();
  for (const l of listeners) l(state);
}

function saveSoundByKind() {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(LS_SOUNDBY, JSON.stringify(state.settings.soundByKind));
  } catch {}
}

function saveInbox() {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(LS_INBOX, JSON.stringify(state.inbox));
  } catch {}
}

function syncFromPrefs() {
  if (!isBrowser()) return;
  try {
    const p = getPrefs();
    state.settings.muted = !!p.notif.muted;
    state.settings.volume = Math.max(0, Math.min(1, Number(p.notif.volume ?? 0.8)));
  } catch {
    // si prefsStore pas prêt, on garde les valeurs actuelles
  }
}

function safeLoad() {
  if (!isBrowser()) return;

  // sync prefs (mute/volume)
  syncFromPrefs();

  // soundByKind
  try {
    const raw = localStorage.getItem(LS_SOUNDBY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.settings.soundByKind = {
        ...state.settings.soundByKind,
        ...(parsed || {}),
      };
    }
  } catch {}

  // inbox
  try {
    const raw = localStorage.getItem(LS_INBOX);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) state.inbox = parsed;
    }
  } catch {}

  // expire + clamp
  const now = Date.now();
  state.inbox = state.inbox.filter((n) => now - n.createdAt <= EXPIRE_MS);
  if (state.inbox.length > MAX_INBOX) state.inbox = state.inbox.slice(0, MAX_INBOX);

  emit();
}

let loadedOnce = false;
function ensureLoaded() {
  if (!isBrowser()) return;
  if (loadedOnce) return;
  loadedOnce = true;

  safeLoad();

  // ✅ écoute les changements de prefs (Paramètres)
  window.addEventListener("investpro:prefs_updated", () => {
    syncFromPrefs();
    emit();
  });
}

function kindEnabled(kind: NotifKind) {
  if (!isBrowser()) return true;
  try {
    const p = getPrefs();
    const enabled = p?.notif?.enabled?.[kind];
    // par défaut true si absent
    return enabled !== false;
  } catch {
    return true;
  }
}

function playSound(kind: NotifKind) {
  if (!isBrowser()) return;

  // ✅ sync prefs avant de jouer
  syncFromPrefs();

  if (state.settings.muted) return;

  const src = state.settings.soundByKind[kind];
  if (!src) return;

  try {
    const a = new Audio(src);
    // ✅ volume vient des paramètres
    a.volume = Math.max(0, Math.min(1, state.settings.volume));
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

/* ---------------- PUBLIC API ---------------- */

export function pushNotif(input: {
  kind?: NotifKind;
  title: string;
  message?: string;
  url?: string;
  ttlMs?: number;
}) {
  ensureLoaded();

  const kind = (input.kind ?? "info") as NotifKind;

  // ✅ filtre par type (Paramètres)
  if (!kindEnabled(kind)) return;

  const now = Date.now();
  const n: Notif = {
    id: uid(),
    kind,
    title: input.title,
    message: input.message,
    url: input.url,
    createdAt: now,
    ttlMs: typeof input.ttlMs === "number" ? input.ttlMs : 15000,
    read: false,
  };

  // visible toasts (max 4)
  state.toasts = [n, ...state.toasts].slice(0, 4);

  // inbox
  state.inbox = [n, ...state.inbox];
  state.inbox = state.inbox.filter((x) => now - x.createdAt <= EXPIRE_MS).slice(0, MAX_INBOX);

  playSound(n.kind);

  saveInbox();
  emit();

  // auto dismiss toast after ttl
  const ttl = Math.max(2000, Math.min(60000, n.ttlMs));
  if (isBrowser()) {
    window.setTimeout(() => dismissToast(n.id), ttl);
  }
}

export function dismissToast(id: string) {
  ensureLoaded();
  state.toasts = state.toasts.filter((t) => t.id !== id);
  emit();
}

// ✅ compat ToastHub: removeNotif = dismissToast
export function removeNotif(id: string) {
  dismissToast(id);
}

export function markRead(id: string) {
  ensureLoaded();
  state.inbox = state.inbox.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveInbox();
  emit();
}

export function markAllRead() {
  ensureLoaded();
  state.inbox = state.inbox.map((n) => ({ ...n, read: true }));
  saveInbox();
  emit();
}

export function clearInbox() {
  ensureLoaded();
  state.inbox = [];
  state.toasts = [];
  saveInbox();
  emit();
}

/* ---------------- Settings bridgés vers prefsStore ---------------- */

export function toggleMute() {
  ensureLoaded();
  try {
    const p = getPrefs();
    patchPrefs({ notif: { ...p.notif, muted: !p.notif.muted } });
  } catch {
    state.settings.muted = !state.settings.muted;
    emit();
  }
}

export function setMuted(muted: boolean) {
  ensureLoaded();
  try {
    const p = getPrefs();
    patchPrefs({ notif: { ...p.notif, muted: !!muted } });
  } catch {
    state.settings.muted = !!muted;
    emit();
  }
}

export function setVolume(v: number) {
  ensureLoaded();
  const vol = Math.max(0, Math.min(1, v));
  try {
    const p = getPrefs();
    patchPrefs({ notif: { ...p.notif, volume: vol } });
  } catch {
    state.settings.volume = vol;
    emit();
  }
}

/* son par type reste géré ici */
export function setSoundForKind(kind: NotifKind, src: string | null) {
  ensureLoaded();
  const next = { ...state.settings.soundByKind };
  if (!src) delete next[kind];
  else next[kind] = src;
  state.settings.soundByKind = next;
  saveSoundByKind();
  emit();
}

export function getSettings() {
  ensureLoaded();
  syncFromPrefs();
  return state.settings;
}

export function getNotifsSnapshot(): NotifsSnapshot {
  ensureLoaded();
  syncFromPrefs();
  return state;
}

/**
 * ✅ IMPORTANT (hydration-safe):
 * - Pas de ensureLoaded() ici, pour éviter tout chargement pendant un render React.
 * - Le hook useNotifs() fera ensureLoaded() dans un useEffect après montage.
 */
export function subscribeNotifs(fn: Listener) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/* React hook (hydration-safe) */
export function useNotifs() {
  const [, bump] = useState(0);

  useEffect(() => {
    ensureLoaded();
    // sync prefs immédiatement
    syncFromPrefs();

    return subscribeNotifs(() => bump((x) => x + 1));
  }, []);

  return state;
}
