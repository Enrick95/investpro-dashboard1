import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

/**
 * Suivi d'une demande « nouveau membre » depuis la page anonyme. Le jeton reste dans le navigateur du client,
 * seule son empreinte est en base. La réponse ne contient que l'état du dossier, jamais le lien du canal :
 * il n'existe qu'après création du compte avec la même adresse e-mail (route claim).
 */
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production") return json({ error: "Le suivi est disponible depuis le site principal." }, 403);
  if (!sameOrigin(request)) return json({ error: "Origine de la requête refusée." }, 403);
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!TOKEN.test(token)) return json({ error: "Dossier introuvable." }, 404);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: "Le suivi est indisponible." }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.from("vip_member_applications")
    .select("id,status,rejection_reason,claim_expires_at,claimed_user_id")
    .eq("suivi_token_hash", hash)
    .maybeSingle();
  if (error) return json({ error: "Le suivi est temporairement indisponible." }, 503);
  if (!data) return json({ error: "Dossier introuvable." }, 404);

  const claimed = data.status === "claimed" || Boolean(data.claimed_user_id);
  const expired = data.status === "approved" && !claimed && (!data.claim_expires_at || new Date(data.claim_expires_at).getTime() <= Date.now());
  const open = data.status === "approved" && !claimed && !expired;
  return json({
    status: claimed ? "claimed" : data.status,
    expired,
    claimUrl: open ? `/vip/nouveau-membre/compte?application=${encodeURIComponent(data.id)}` : null,
    rejectionReason: data.status === "denied" ? data.rejection_reason : null,
  });
}
