import { NextResponse } from "next/server";
import { assertSameOrigin, authenticateClip, ClipError, clipErrorResponse, clipJson, readJson, text } from "@/lib/clip/server";
import { clipPushConfig } from "@/lib/clip/notify";
import { validPushEndpoint, validPushKeys } from "@/lib/vip/push-validation";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notifications des nouvelles vidéos sur le téléphone du clippeur. */

async function clipperId(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db.from("clip_clippers").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const row = data as unknown as { id: string } | null;
  if (!row) throw new ClipError("Ton espace clippeur n'est pas encore ouvert.", 403);
  return row.id;
}

/** Clé publique pour abonner le téléphone (null si les notifications ne sont pas configurées). */
export async function GET() {
  const config = clipPushConfig();
  return NextResponse.json({ publicKey: config.available ? config.publicKey : null }, { headers: { "Cache-Control": "public, max-age=300" } });
}

/** Abonne ce téléphone ; s'il servait à un autre compte clippeur, il passe au compte connecté. */
export async function POST(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    if (!clipPushConfig().available) throw new ClipError("Les notifications sont momentanément indisponibles.", 503);
    const id = await clipperId(ctx.db, ctx.user.id);
    const body = await readJson(request);
    const subscription = body.subscription as { endpoint?: unknown; keys?: unknown } | undefined;
    if (!subscription || !validPushEndpoint(subscription.endpoint) || !validPushKeys(subscription.keys)) throw new ClipError("Abonnement aux notifications invalide.");
    const { error } = await ctx.db.from("clip_push_subscriptions").upsert(
      {
        clipper_id: id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        home: text(body, "home") === "/clip/login" ? "/clip/login" : "/login",
        user_agent: (request.headers.get("user-agent") || "").slice(0, 500) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
    return clipJson({ ok: true });
  } catch (error) {
    return clipErrorResponse(error);
  }
}

/** Désabonne ce téléphone (bouton du profil ou déconnexion). */
export async function DELETE(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const id = await clipperId(ctx.db, ctx.user.id);
    const body = await readJson(request);
    if (!validPushEndpoint(body.endpoint)) throw new ClipError("Appareil inconnu.");
    const { error } = await ctx.db.from("clip_push_subscriptions").delete().eq("endpoint", body.endpoint).eq("clipper_id", id);
    if (error) throw error;
    return clipJson({ ok: true });
  } catch (error) {
    return clipErrorResponse(error);
  }
}
