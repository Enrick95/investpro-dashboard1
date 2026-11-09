import {
  ACCOUNT_COLUMNS,
  CAMPAIGN_COLUMNS,
  CLIPPER_COLUMNS,
  CLIP_COLUMNS,
  PAYOUT_COLUMNS,
  assertSameOrigin,
  authenticateClip,
  ClipError,
  clipErrorResponse,
  clipJson,
  freezeDueClips,
  readJson,
  text,
} from "@/lib/clip/server";
import { CLIP_PLATFORMS, PAYOUT_METHODS, normalizeHandle, normalizePhone, normalizeTelegram, type ClipPlatform, type PayoutMethod } from "@/lib/clip/rules";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClipperRecord = { id: string; status: string; display_name: string };

async function findClipper(db: SupabaseClient, userId: string): Promise<ClipperRecord | null> {
  const { data, error } = await db.from("clip_clippers").select("id,status,display_name").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as unknown as ClipperRecord | null) ?? null;
}

export async function GET(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    const { db, user } = ctx;
    const clipperResult = await db.from("clip_clippers").select(CLIPPER_COLUMNS).eq("user_id", user.id).maybeSingle();
    if (clipperResult.error) throw clipperResult.error;
    const clipper = clipperResult.data as unknown as (Record<string, unknown> & { id: string }) | null;
    if (!clipper) {
      const candidate = await db.from("clip_candidates").select("id,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (candidate.error) throw candidate.error;
      return clipJson({ email: user.email ?? null, owner: ctx.owner, clipper: null, candidate: candidate.data ?? null });
    }
    await freezeDueClips(db, clipper.id);
    const [accounts, campaigns, clips, payouts] = await Promise.all([
      db.from("clip_accounts").select(ACCOUNT_COLUMNS).eq("clipper_id", clipper.id).order("created_at", { ascending: true }),
      db.from("clip_campaigns").select(CAMPAIGN_COLUMNS).in("status", ["active", "ended"]).order("starts_on", { ascending: false }).limit(30),
      db.from("clip_clips").select(CLIP_COLUMNS).eq("clipper_id", clipper.id).order("created_at", { ascending: false }).limit(300),
      db.from("clip_payouts").select(PAYOUT_COLUMNS).eq("clipper_id", clipper.id).order("paid_at", { ascending: false }).limit(36),
    ]);
    if (accounts.error) throw accounts.error;
    if (campaigns.error) throw campaigns.error;
    if (clips.error) throw clips.error;
    if (payouts.error) throw payouts.error;
    const { admin_note: _note, user_id: _user, ...publicClipper } = clipper;
    void _note;
    void _user;
    return clipJson({
      email: user.email ?? null,
      owner: ctx.owner,
      clipper: publicClipper,
      accounts: accounts.data ?? [],
      campaigns: campaigns.data ?? [],
      clips: clips.data ?? [],
      payouts: payouts.data ?? [],
    });
  } catch (error) {
    return clipErrorResponse(error);
  }
}

/** Moyen de paiement et coordonnées du clippeur. */
export async function PATCH(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const clipper = await findClipper(ctx.db, ctx.user.id);
    if (!clipper) throw new ClipError("Ton espace clippeur n'est pas encore ouvert.", 403);
    const body = await readJson(request);
    const update: Record<string, string | null> = {};
    if ("payout_method" in body) {
      const method = body.payout_method;
      if (method !== null && !(typeof method === "string" && (PAYOUT_METHODS as readonly string[]).includes(method))) throw new ClipError("Moyen de paiement inconnu.");
      update.payout_method = (method as PayoutMethod | null) ?? null;
    }
    if ("payout_details" in body) {
      const details = text(body, "payout_details");
      if (details.length > 200) throw new ClipError("Coordonnées de paiement : 200 caractères maximum.");
      update.payout_details = details || null;
    }
    if ("whatsapp" in body) {
      const raw = text(body, "whatsapp");
      const phone = raw ? normalizePhone(raw) : null;
      if (raw && !phone) throw new ClipError("Numéro WhatsApp au format international, par exemple +33612345678.");
      update.whatsapp = phone;
    }
    if ("telegram" in body) {
      const raw = text(body, "telegram");
      const telegram = raw ? normalizeTelegram(raw) : null;
      if (raw && !telegram) throw new ClipError("Pseudo Telegram invalide.");
      update.telegram = telegram;
    }
    if (!Object.keys(update).length) throw new ClipError("Rien à enregistrer.");
    const { error } = await ctx.db.from("clip_clippers").update(update).eq("id", clipper.id);
    if (error) throw error;
    return clipJson({ ok: true });
  } catch (error) {
    return clipErrorResponse(error);
  }
}

/** Ajout ou retrait d'un compte TikTok, Instagram ou YouTube. */
export async function POST(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const clipper = await findClipper(ctx.db, ctx.user.id);
    if (!clipper) throw new ClipError("Ton espace clippeur n'est pas encore ouvert.", 403);
    const body = await readJson(request);
    const action = text(body, "action");
    if (action === "add_account") {
      const platform = text(body, "platform");
      if (!(CLIP_PLATFORMS as readonly string[]).includes(platform)) throw new ClipError("Choisis TikTok, Instagram ou YouTube.");
      const handle = normalizeHandle(text(body, "handle"));
      if (!handle) throw new ClipError("Nom de compte invalide (lettres, chiffres, point, tiret).");
      const followersRaw = body.followers;
      const followers = followersRaw === null || followersRaw === undefined || followersRaw === "" ? null : Math.round(Number(followersRaw));
      if (followers !== null && (!Number.isFinite(followers) || followers < 0 || followers > 1_000_000_000)) throw new ClipError("Nombre d'abonnés invalide.");
      const { count, error: countError } = await ctx.db.from("clip_accounts").select("id", { count: "exact", head: true }).eq("clipper_id", clipper.id);
      if (countError) throw countError;
      if ((count ?? 0) >= 12) throw new ClipError("12 comptes maximum.");
      const { data, error } = await ctx.db
        .from("clip_accounts")
        .insert({ clipper_id: clipper.id, platform: platform as ClipPlatform, handle, followers })
        .select(ACCOUNT_COLUMNS)
        .single();
      if (error) {
        if (error.code === "23505") throw new ClipError("Ce compte est déjà rattaché à un clippeur.", 409);
        throw error;
      }
      return clipJson({ account: data });
    }
    if (action === "remove_account") {
      const id = text(body, "id");
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ClipError("Compte introuvable.", 404);
      const { error } = await ctx.db.from("clip_accounts").delete().eq("id", id).eq("clipper_id", clipper.id);
      if (error) throw error;
      return clipJson({ ok: true });
    }
    throw new ClipError("Action inconnue.");
  } catch (error) {
    return clipErrorResponse(error);
  }
}
