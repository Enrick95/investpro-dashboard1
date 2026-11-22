"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Demande de lien « mot de passe oublié ».
 *
 * Le client du site (PKCE) garde un code dans le navigateur qui fait la demande : le lien reçu par e-mail ne
 * marchait donc que dans ce même navigateur. Or on l'ouvre souvent ailleurs (l'appli Gmail ouvre Safari, la demande
 * venait du navigateur de Telegram…) et la page affichait « Auth session missing! ». Ici, le flux implicite met la
 * session de récupération dans le lien lui-même : il marche sur n'importe quel appareil. La page /reset-password la
 * reprend avec setSession, puis retire les jetons de l'adresse.
 */
export function createRecoveryRequestClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "sb-recovery-request" },
  });
}

export type RecoveryLink = { kind: "tokens"; accessToken: string; refreshToken: string } | { kind: "code"; code: string } | { kind: "error" } | { kind: "none" };

/** Lit ce que le lien de récupération a mis dans l'adresse : jetons (#access_token…), ancien code PKCE (?code=) ou erreur. */
export function readRecoveryLink(search: string, hash: string): RecoveryLink {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  if (fragment.get("error") || fragment.get("error_code") || query.get("error") || query.get("error_code")) return { kind: "error" };
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "tokens", accessToken, refreshToken };
  const code = query.get("code");
  if (code) return { kind: "code", code };
  return { kind: "none" };
}
