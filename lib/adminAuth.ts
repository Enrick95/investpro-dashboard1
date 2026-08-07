"use client";

import { getCurrentAccount, updateAccount } from "./authStore";

const LS_ADMIN_UNLOCK = "investpro_admin_unlock_v1";

export function isAdminAccount(acc: any): boolean {
  if (!acc) return false;

  // 1) par username (env)
  const raw = (process.env.NEXT_PUBLIC_ADMIN_USERS || "").trim();
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (list.includes(String(acc.username || "").toLowerCase())) return true;

  // 2) par tag contenant ADMIN
  const tag = String(acc.tag || "").toUpperCase();
  if (tag.includes("ADMIN")) return true;

  // 3) admin “unlock” local (après code)
  try {
    const u = JSON.parse(localStorage.getItem(LS_ADMIN_UNLOCK) || "null");
    if (u?.username && String(u.username).toLowerCase() === String(acc.username || "").toLowerCase()) {
      return true;
    }
  } catch {}

  return false;
}

/** Code admin (pour actions sensibles), optionnel */
export function getAdminCode(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_CODE || "").trim();
}

export function verifyAdminCode(code: string): boolean {
  const real = getAdminCode();
  if (!real) return false;
  return String(code || "").trim() === real;
}

/** “Débloque” l’admin localement après code */
export function unlockAdminWithCode(code: string): { ok: boolean; error?: string } {
  const acc = getCurrentAccount();
  if (!acc) return { ok: false, error: "Non connecté." };

  if (!verifyAdminCode(code)) return { ok: false, error: "Code invalide." };

  // stock unlock local
  localStorage.setItem(LS_ADMIN_UNLOCK, JSON.stringify({ username: acc.username, at: Date.now() }));

  // bonus : ajoute ADMIN dans le tag (dev)
  const tag = String(acc.tag || "");
  if (!tag.toUpperCase().includes("ADMIN")) {
    updateAccount({ tag: `${tag} ADMIN` });
  }

  return { ok: true };
}

export function hasAdminAccess(): boolean {
  return isAdminAccount(getCurrentAccount());
}
