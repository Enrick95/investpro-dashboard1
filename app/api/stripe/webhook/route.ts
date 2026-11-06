import { vipDatabase } from "@/lib/vip/membership-server";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/stripe/vip-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Webhook Stripe (abonnement VIP). Le secret de signature vient uniquement de STRIPE_WEBHOOK_SECRET. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return Response.json({ error: "Webhook non configuré." }, { status: 503 });
  const payload = await request.text();
  if (payload.length > 512_000 || !verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) return Response.json({ error: "Signature invalide." }, { status: 400 });
  let event: { id?: string; type?: string; livemode?: boolean; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(payload); } catch { return Response.json({ error: "Données invalides." }, { status: 400 }); }
  // Seul le site principal agit (évite un double lien si une préversion recevait aussi l'événement).
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return Response.json({ received: true, skipped: "preview" });
  try {
    await handleStripeEvent(vipDatabase(), event);
    return Response.json({ received: true });
  } catch {
    console.error("STRIPE_WEBHOOK_FAILED", event?.type || "unknown");
    return Response.json({ error: "Traitement impossible, Stripe va réessayer." }, { status: 500 });
  }
}
