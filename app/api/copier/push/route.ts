import { NextResponse } from "next/server";
import { authenticateVip, readVipJson, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { validPushEndpoint, validPushKeys } from "@/lib/vip/push-validation";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const configured = Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  return NextResponse.json({ publicKey: configured ? publicKey : null, available: configured }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

export async function POST(request: Request) {
  try {
    // Same validated bearer/cookie identity as the VIP channel, without requiring VIP membership.
    const access = await authenticateVip(request);
    if ("error" in access) return vipJson({ error: access.error, code: access.status === 401 ? "push_auth_required" : "push_unavailable" }, access.status);
    const body = await readVipJson(request);
    const subscription = body.subscription as { endpoint?: unknown; keys?: unknown } | undefined;
    if (!subscription || !validPushEndpoint(subscription.endpoint) || !validPushKeys(subscription.keys)) return vipJson({ error: "Abonnement aux alertes invalide.", code: "push_invalid_subscription" }, 400);
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) return vipJson({ error: "Les alertes sont temporairement indisponibles.", code: "push_unavailable" }, 503);
    const values = {
      endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
      user_agent: (request.headers.get("user-agent") || "").slice(0, 500), updated_at: new Date().toISOString(),
    };
    // ON CONFLICT DO NOTHING never rewrites ownership, even if two accounts race to enroll.
    const { error: insertError } = await access.db.from("copier_push_subscriptions").upsert({ user_id: access.user.id, ...values }, { onConflict: "endpoint", ignoreDuplicates: true });
    if (insertError) throw insertError;
    // Only its current owner may refresh keys; user_id is deliberately absent from the update.
    const { data, error } = await access.db.from("copier_push_subscriptions").update(values).eq("endpoint", values.endpoint).eq("user_id", access.user.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return vipJson({ error: "Cet appareil utilise encore une ancienne inscription aux alertes. Réactivez les alertes pour ce compte.", code: "push_endpoint_owned" }, 409);
    return vipJson({ ok: true });
  } catch (error) {
    // Raw database errors can contain endpoint/encryption values; never log them.
    if (!(error instanceof VipRequestError)) console.error("[copier-push][register]", { code: error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "unknown" });
    return vipJson({ error: error instanceof VipRequestError ? error.message : "Impossible d’activer les alertes sur cet appareil.", code: error instanceof VipRequestError && error.status === 403 ? "push_origin_denied" : "push_save_unavailable" }, error instanceof VipRequestError ? error.status : 503);
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await authenticateVip(request);
    if ("error" in access) return vipJson({ error: access.error, code: access.status === 401 ? "push_auth_required" : "push_unavailable" }, access.status);
    const body = await readVipJson(request);
    if (!validPushEndpoint(body.endpoint)) return vipJson({ error: "Appareil invalide." }, 400);
    const { error } = await access.db.from("copier_push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", access.user.id);
    if (error) throw error;
    return vipJson({ ok: true });
  } catch (error) {
    return vipJson({ error: error instanceof VipRequestError ? error.message : "Impossible de désactiver les alertes sur cet appareil." }, error instanceof VipRequestError ? error.status : 503);
  }
}
