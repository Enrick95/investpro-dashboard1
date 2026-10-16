import type { User } from "@supabase/supabase-js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type StaffSearchMatch = { user_id: string; name: string; email: string; is_owner: boolean };

export function normalizeStaffUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return uuid.test(id) ? id.toLowerCase() : null;
}

export function validateStaffSearch(value: unknown): { ok: true; query: string } | { ok: false; error: string } {
  if (typeof value !== "string" || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) return { ok: false, error: "Recherche invalide. Saisissez un nom, un pseudo ou une adresse e-mail." };
  const query = value.normalize("NFC").trim();
  if (Array.from(query).length < 2 || Array.from(query).length > 254) return { ok: false, error: "Saisissez entre 2 et 254 caractères pour rechercher un membre." };
  return { ok: true, query };
}

function searchable(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

function displayText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, "").trim()).slice(0, limit).join("");
}

/** Auth metadata is display text only; the protected route decides authorization. */
export function staffSearchMatch(user: User, profileUsername: unknown, query: string, owner: boolean): StaffSearchMatch | null {
  const userId = normalizeStaffUserId(user.id);
  if (!userId) return null;
  const email = displayText(user.email, 254);
  const username = displayText(profileUsername, 80) || displayText(user.user_metadata?.username, 80);
  const fullName = displayText(user.user_metadata?.full_name, 160);
  const name = username || fullName || email.split("@")[0] || "Membre InvestPro";
  const needle = searchable(query);
  // Literal substring matching never passes user input to a SQL/PostgREST filter.
  if (![name, fullName, email, userId].some(value => searchable(value).includes(needle))) return null;
  return { user_id: userId, name, email, is_owner: owner };
}
