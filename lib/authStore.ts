type MediaTransform = {
  zoom: number; // 1..3
  panX: number; // -1..1
  panY: number; // -1..1
};

type Account = {
  username: string;
  password: string; // DEMO ONLY (pas sécurisé). Plus tard: backend + hash.
  tag: string; // généré, non modifiable

  // Legacy (dataURL)
  avatarDataUrl?: string;

  // ✅ New (no-loss via IndexedDB)
  avatarMediaId?: string;
  avatarTransform?: MediaTransform;

  // (si tu gères aussi la bannière dans le store)
  bannerDataUrl?: string;
  bannerMediaId?: string;
  bannerTransform?: MediaTransform;

  bio?: string;
  showOnLeaderboard?: boolean;
  profitUsd?: number;

  // selon ton app (tu l'utilises dans la page profil)
  hideTrades?: boolean;

  // vérification/plan (Header l’utilise)
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
  } catch {
    // ignore
  }
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
  const acc = loadAccounts().find((a) => a.username.toLowerCase() === s.username.toLowerCase());
  return acc ?? null;
}

function genTag() {
  const n = Math.floor(Math.random() * 10000);
  return "#" + String(n).padStart(4, "0");
}

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

  // ✅ informer l'app
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

  // ✅ informer l'app
  emitAccountUpdated(acc);

  return { ok: true };
}

export function signOut() {
  setSession(null);

  // ✅ informer l'app
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

  // ✅ informer l'app (Header/Menu/Profile etc.)
  emitAccountUpdated(accounts[idx]);

  return accounts[idx];
}

export function setLeaderboardVisibility(isPublic: boolean) {
  return updateAccount({ showOnLeaderboard: isPublic });
}
try {
  window.dispatchEvent(new CustomEvent("investpro:account_updated", { detail: updated }));
} catch {}
