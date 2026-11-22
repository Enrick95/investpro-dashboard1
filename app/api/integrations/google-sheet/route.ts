import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { SHEET_APPLICATION_COLUMNS, SHEET_REQUEST_COLUMNS, SHEET_TRIAL_COLUMNS, sheetSignups, sheetTrials } from "@/lib/integrations/google-sheet";

// Lu par le script du Google Sheet d'Enrick (toutes les 5 minutes), avec sa clé secrète. Le site ne garde que l'empreinte
// SHA-256 de cette clé (GOOGLE_SHEET_SYNC_KEY_SHA256) : la clé elle-même n'existe que dans le script du Sheet.
// Lecture seule : les inscriptions VIP et les demandes d'essai, sans preuve, mot de passe ni compte MetaTrader.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
}

function authorized(request: Request) {
  const expected = (process.env.GOOGLE_SHEET_SYNC_KEY_SHA256 ?? "").trim().toLowerCase();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^[0-9a-f]{64}$/.test(expected) || token.length < 32) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(expected, "hex"));
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Accès refusé." }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: "Service indisponible." }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [applications, requests, trials] = await Promise.all([
    db.from("vip_member_applications").select(SHEET_APPLICATION_COLUMNS).order("created_at", { ascending: true }).limit(5000),
    db.from("vip_access_requests").select(SHEET_REQUEST_COLUMNS).eq("request_kind", "new").order("created_at", { ascending: true }).limit(5000),
    db.from("essai_vip_leads").select(SHEET_TRIAL_COLUMNS).order("submitted_at", { ascending: true }).limit(5000),
  ]);
  if (applications.error || requests.error || trials.error) {
    console.error("GOOGLE_SHEET_EXPORT_READ_FAILED");
    return json({ error: "Lecture des inscriptions impossible. Nouvel essai au prochain passage." }, 503);
  }
  return json({
    generatedAt: new Date().toISOString(),
    inscriptions: sheetSignups((applications.data ?? []) as Record<string, unknown>[], (requests.data ?? []) as Record<string, unknown>[]),
    essais: sheetTrials((trials.data ?? []) as Record<string, unknown>[]),
  });
}
