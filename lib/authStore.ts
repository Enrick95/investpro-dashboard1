// lib/authStore.ts
type MediaTransform = {
  zoom: number; // 1..3
  panX: number; // -1..1
  panY: number; // -1..1
};

export type Account = {
  username: string;
  password: string; // DEMO ONLY
  tag: string;

  avatarDataUrl?: string;
  avatarMediaId?: string;
  avatarTransform?: MediaTransform;

  bannerDataUrl?: string;
  bannerMediaId?: string;
  bannerTransform?: MediaTransform;

  bio?: string;
  showOnLeaderboard?: boolean;
  profitUsd?: number;
  hideTrades?: boolean;

  tradesTotal?: number;
  winrate?: number;
  rrAvg?: number;

  verified?: boolean;
  plan?: string;
  subscription?: string;
  email?: string;
};

const KEY_ACCOUNTS = "investpro_accounts_v1";
const KEY_SESSION = "investpro_session_v1";
const ACCOUNT_UPDATED_EVENT = "investpro:account_updated";

function emitAccountUpdated(acc: Account | null) {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT, { detail: acc }));
  } catch {}
}

function loadAccounts(): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_ACCOUNTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAccounts(arr: Account[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(arr));
}

export function getSession(): { username: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(username: string | null) {
  if (typeof window === "undefined") return;
  if (!username) localStorage.removeItem(KEY_SESSION);
  else localStorage.setItem(KEY_SESSION, JSON.stringify({ username }));
}

export function getCurrentAccount(): Account | null {
  const s = getSession();
  if (!s) return null;
  const acc = loadAccounts().find(
    (a) => a.username.toLowerCase() === s.username.toLowerCase()
  );
  return acc ?? null;
}

function genTag() {
  const n = Math.floor(Math.random() * 10000);
  return "#" + String(n).padStart(4, "0");
}

/* -------------------- AUTH -------------------- */
export function signUp(username: string, password: string) {
  const u = username.trim();
  if (!u || !password) return { ok: false, error: "Pseudo/mot de passe requis" };

  const accounts = loadAccounts();
  const exists = accounts.some((a) => a.username.toLowerCase() === u.toLowerCase());
  if (exists) return { ok: false, error: "Pseudo déjà utilisé" };

  const acc: Account = {
    username: u,
    password,
    tag: genTag(),
    profitUsd: 0,
    showOnLeaderboard: false,
  };

  accounts.push(acc);
  saveAccounts(accounts);
  setSession(u);
  emitAccountUpdated(acc);

  return { ok: true };
}

export function signIn(username: string, password: string) {
  const u = username.trim();
  const accounts = loadAccounts();
  const acc = accounts.find((a) => a.username.toLowerCase() === u.toLowerCase());
  if (!acc) return { ok: false, error: "Compte introuvable" };
  if (acc.password !== password) return { ok: false, error: "Mot de passe incorrect" };

  setSession(acc.username);
  emitAccountUpdated(acc);
  return { ok: true };
}

export function signOut() {
  setSession(null);
  emitAccountUpdated(null);
}

export function updateAccount(patch: Partial<Account>) {
  const s = getSession();
  if (!s) return null;

  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.username.toLowerCase() === s.username.toLowerCase());
  if (idx < 0) return null;

  accounts[idx] = { ...accounts[idx], ...patch };
  saveAccounts(accounts);
  emitAccountUpdated(accounts[idx]);
  return accounts[idx];
}

export function setLeaderboardVisibility(isPublic: boolean) {
  return updateAccount({ showOnLeaderboard: isPublic });
}

/* -------------------- ADMIN PERMS (DEV) -------------------- */
export function isAdmin(acc?: Account | null): boolean {
  const a = acc ?? getCurrentAccount();
  if (!a) return false;

  // 1) Tag contient ADMIN
  const tag = String(a.tag || "").toUpperCase();
  if (tag.includes("ADMIN")) return true;

  // 2) Username match env
  const envUser = (process.env.NEXT_PUBLIC_ADMIN_USER || "").trim().toLowerCase();
  if (envUser && a.username.toLowerCase() === envUser) return true;

  return false;
}

/** DEV: te donne le tag ADMIN sur ton compte connecté */
export function grantAdminToCurrent() {
  const a = getCurrentAccount();
  if (!a) return null;
  if (String(a.tag || "").toUpperCase().includes("ADMIN")) return a;

  const nextTag = `${a.tag} ADMIN`.replace(/\s+/g, " ").trim();
  return updateAccount({ tag: nextTag });
}
