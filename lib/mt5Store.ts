export type Mt5Status = "DISCONNECTED" | "CONNECTED" | "ERROR";

export type Mt5Snapshot = {
  balance: number;
  equity: number;
  profit: number; // profit actuel (equity - balance ou info MT5)
  currency: string;
  updatedAt: number;
};

export type Mt5Account = {
  id: string;
  label: string;
  broker: string;
  server: string;
  login: string;

  // IMPORTANT: en prod ne jamais stocker le mot de passe côté navigateur.
  // Ici c'est démo. Plus tard, ce sera stocké côté VPS/serveur.
  password?: string;

  status: Mt5Status;
  lastError?: string;

  snapshot?: Mt5Snapshot;
};

const KEY = "investpro_mt5_accounts_v1";

export function loadMt5Accounts(): Mt5Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveMt5Accounts(list: Mt5Account[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
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
