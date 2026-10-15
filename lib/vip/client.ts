"use client";

import { createClient } from "@/lib/supabase/client";
import type { VipMembership, VipAccessResponse } from "./types";

export type { VipMembership };
export type { VipPost, VipPostCategory, VipReaction, VipPostReactions, VipMediaUpload, VipMediaUploadPreparation } from "./types";
export type VipAccess = VipAccessResponse;
export class VipApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function vipRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) throw new VipApiError("Connectez-vous pour accéder à votre espace.", 401);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body && !(typeof FormData !== "undefined" && init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new VipApiError(typeof payload?.error === "string" ? payload.error : typeof payload?.message === "string" ? payload.message : "Cette action est indisponible. Réessayez dans un instant.", response.status);
  return payload as T;
}
export function vipDate(value: string | null | undefined, locale: "fr" | "en" = "fr") {
  if (!value) return locale === "en" ? "No expiry" : "Sans échéance";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(date);
}
export function safeHttps(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
