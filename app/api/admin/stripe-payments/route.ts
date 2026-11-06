import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liste des clients VIP payés via Stripe (propriétaire uniquement). */
export async function GET(request: Request) {
  const context = await authenticateAdmin(request);
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.access.owner) return NextResponse.json({ error: "Accès réservé au propriétaire." }, { status: 403 });
  const { data, error } = await context.admin.from("vip_stripe_payments")
    .select("id,full_name,email,phone,telegram_username,amount_total,currency,status,invite_url,invite_created_at,channel_joined_at,channel_username,removed_at,last_payment_at,created_at")
    .order("created_at", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: "Impossible de charger les paiements Stripe." }, { status: 503 });
  return NextResponse.json({ payments: data || [] }, { headers: { "Cache-Control": "no-store" } });
}
