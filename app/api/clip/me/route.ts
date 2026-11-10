import {
  ACCOUNT_COLUMNS,
  CAMPAIGN_COLUMNS,
  CLIPPER_COLUMNS,
  CLIP_COLUMNS,
  PAYOUT_COLUMNS,
  assertPassword,
  assertSameOrigin,
  authenticateClip,
  authErrorCode,
  ClipError,
  clipErrorResponse,
  clipJson,
  freezeDueClips,
  readJson,
  readPassword,
  text,
  verifyPassword,
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
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const [accounts, campaigns, clips, payouts, monthClips, roster, clicks] = await Promise.all([
      db.from("clip_accounts").select(ACCOUNT_COLUMNS).eq("clipper_id", clipper.id).order("created_at", { ascending: true }),
      db.from("clip_campaigns").select(CAMPAIGN_COLUMNS).in("status", ["active", "ended"]).order("starts_on", { ascending: false }).limit(30),
      db.from("clip_clips").select(CLIP_COLUMNS).eq("clipper_id", clipper.id).order("created_at", { ascending: false }).limit(300),
      db.from("clip_payouts").select(PAYOUT_COLUMNS).eq("clipper_id", clipper.id).order("paid_at", { ascending: false }).limit(36),
      db.from("clip_clips").select("clipper_id,views,frozen_views").eq("status", "approved").gte("published_at", monthStart).limit(5000),
      db.from("clip_clippers").select("id").neq("status", "paused").limit(1000),
      db.from("clip_click_stats").select("total,last30").eq("clipper_id", clipper.id).maybeSingle(),
    ]);
    for (const result of [accounts, campaigns, clips, payouts, monthClips, roster, clicks]) if (result.error) throw result.error;

    // Classement du mois : vues des clips validés publiés ce mois-ci, parmi les clippeurs non suspendus.
    const totals = new Map<string, number>();
    for (const row of (roster.data ?? []) as unknown as { id: string }[]) totals.set(row.id, 0);
    for (const row of (monthClips.data ?? []) as unknown as { clipper_id: string; views: number | string; frozen_views: number | string | null }[]) {
      if (!totals.has(row.clipper_id)) continue;
      totals.set(row.clipper_id, (totals.get(row.clipper_id) ?? 0) + Number(row.frozen_views ?? row.views ?? 0));
    }
    const mine = totals.get(clipper.id) ?? 0;
    const rank = { position: [...totals.values()].filter((value) => value > mine).length + 1, total: totals.size, views: mine };
    const clickRow = clicks.data as unknown as { total: number | string; last30: number | string } | null;

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
      rank,
      clicks: { total: Number(clickRow?.total ?? 0), last30: Number(clickRow?.last30 ?? 0) },
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
    if ("display_name" in body) {
      const name = text(body, "display_name");
      if (name.length < 2 || name.length > 60) throw new ClipError("Nom affiché : 2 à 60 caractères.");
      update.display_name = name;
    }
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
    if (action === "change_password") {
      const current = readPassword(body, "current");
      const next = readPassword(body, "next");
      if (!ctx.user.email) throw new ClipError("Ce compte n'a pas d'adresse e-mail.", 409);
      assertPassword(next);
      if (current === next) throw new ClipError("Choisis un mot de passe différent de l'actuel.");
      if (!current || !(await verifyPassword(ctx.user.email, current))) throw new ClipError("Mot de passe actuel incorrect.");
      const { error } = await ctx.db.auth.admin.updateUserById(ctx.user.id, { password: next });
      if (error) {
        if (authErrorCode(error) === "weak_password") throw new ClipError("Mot de passe trop simple : 8 caractères minimum, avec des lettres et au moins un chiffre.");
        throw error;
      }
      return clipJson({ ok: true });
    }
    throw new ClipError("Action inconnue.");
  } catch (error) {
    return clipErrorResponse(error);
  }
}
