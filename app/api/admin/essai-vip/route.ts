import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "qualified", "demo_active", "completed", "converted", "lost"] as const;
const TEMPERATURES = ["unclassified", "hot", "warm", "cold"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownerContext(request: Request) {
  const context = await authenticateAdmin(request);
  if ("error" in context) return { response: NextResponse.json({ error: context.error }, { status: context.status }) };
  if (!context.access.owner) return { response: NextResponse.json({ error: "Accès réservé au propriétaire." }, { status: 403 }) };
  return { context };
}

export async function GET(request: Request) {
  const auth = await ownerContext(request);
  if ("response" in auth) return auth.response;
  try {
    const { data, error } = await auth.context.admin.from("essai_vip_leads").select("*").order("submitted_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return NextResponse.json({ leads: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Impossible de charger les demandes Essai VIP." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const auth = await ownerContext(request);
  if ("response" in auth) return auth.response;
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_by: auth.context.user.id, updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: "Étape invalide." }, { status: 400 });
    patch.status = body.status;
  }
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== "string" || !(TEMPERATURES as readonly string[]).includes(body.temperature)) return NextResponse.json({ error: "Température invalide." }, { status: 400 });
    patch.temperature = body.temperature;
  }
  for (const key of ["broker_affiliation_verified", "demo_account_verified", "copy_linked", "channel_joined"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") return NextResponse.json({ error: "Avancement invalide." }, { status: 400 });
      patch[key] = body[key];
    }
  }
  for (const [key, max] of [["admin_notes", 4000], ["copier_account_reference", 100]] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || body[key].length > max) return NextResponse.json({ error: "Texte trop long." }, { status: 400 });
      patch[key] = body[key].trim() || null;
    }
  }
  if (body.next_follow_up_on !== undefined) {
    if (body.next_follow_up_on !== null && (typeof body.next_follow_up_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.next_follow_up_on))) return NextResponse.json({ error: "Date de relance invalide." }, { status: 400 });
    patch.next_follow_up_on = body.next_follow_up_on || null;
  }
  if (body.mark_contacted === true) patch.last_contacted_at = new Date().toISOString();
  try {
    const { data, error } = await auth.context.admin.from("essai_vip_leads").update(patch).eq("id", body.id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    return NextResponse.json({ lead: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Impossible d’enregistrer le suivi." }, { status: 503 });
  }
}
