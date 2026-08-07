export type Mt5Status = "DISCONNECTED" | "CONNECTED" | "ERROR";

export type Mt5Snapshot = {
  balance: number;
  equity: number;
  profit: number; // profit actuel (equity - balance ou info MT5)
  currency: string;
  updatedAt: number;
};

export type MtPlatform = "MT4" | "MT5";

export type Mt5Account = {
  id: string;
  label: string;
  broker: string;
  server: string;
  login: string;

  // ✅ NEW: MT4 / MT5 (pour séparer brokers + endpoints)
  platform?: MtPlatform;

  // IMPORTANT: en prod ne jamais stocker le mot de passe côté navigateur.
  // Ici c'est démo. Plus tard, ce sera stocké côté VPS/serveur.
  password?: string;

  status: Mt5Status;
  lastError?: string;

  snapshot?: Mt5Snapshot;
};

const KEY = "investpro_mt5_accounts_v1";
export const MT5_EVT = "investpro:mt5_accounts_updated"; // ✅ exporté pour la page

export function loadMt5Accounts(): Mt5Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Mt5Account[]) : [];
  } catch {
    return [];
  }
}

export function saveMt5Accounts(list: Mt5Account[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    // ✅ permet à l’UI de refresh si un autre endroit update les comptes
    window.dispatchEvent(new CustomEvent(MT5_EVT, { detail: { count: list.length } }));
  } catch {
    // ignore
  }
}

export function upsertMt5Account(acc: Mt5Account) {
  const list = loadMt5Accounts();
  const idx = list.findIndex((x) => x.id === acc.id);
  if (idx >= 0) list[idx] = acc;
  else list.unshift(acc);
  saveMt5Accounts(list);
  return list;
}

export function removeMt5Account(id: string) {
  const list = loadMt5Accounts().filter((x) => x.id !== id);
  saveMt5Accounts(list);
  return list;
}

/* ----------------------------- Helpers (NEW) ----------------------------- */

/** ✅ valeur "compte USD" utilisée : equity si dispo sinon balance */
export function getMt5AccountUsd(acc?: Mt5Account | null): number {
  const eq = Number(acc?.snapshot?.equity ?? 0);
  if (Number.isFinite(eq) && eq > 0) return eq;

  const bal = Number(acc?.snapshot?.balance ?? 0);
  if (Number.isFinite(bal) && bal > 0) return bal;

  return 0;
}

/** ✅ patch snapshot (quand ton terminal/bridge reçoit les infos MT5) */
export function patchMt5AccountSnapshot(id: string, snap: Partial<Mt5Snapshot>) {
  const list = loadMt5Accounts();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return list;

  const cur = list[idx];
  const nextSnap: Mt5Snapshot = {
    balance: Number(snap.balance ?? cur.snapshot?.balance ?? 0),
    equity: Number(snap.equity ?? cur.snapshot?.equity ?? 0),
    profit: Number(snap.profit ?? cur.snapshot?.profit ?? 0),
    currency: String(snap.currency ?? cur.snapshot?.currency ?? "USD"),
    updatedAt: Number(snap.updatedAt ?? Date.now()),
  };

  list[idx] = { ...cur, snapshot: nextSnap };
  saveMt5Accounts(list);
  return list;
}
