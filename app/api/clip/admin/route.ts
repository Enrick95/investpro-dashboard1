import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_COLUMNS,
  CAMPAIGN_COLUMNS,
  CANDIDATE_COLUMNS,
  CLIPPER_COLUMNS,
  CLIP_COLUMNS,
  PAYOUT_COLUMNS,
  assertSameOrigin,
  authenticateClipAdmin,
  ClipError,
  clipErrorResponse,
  clipJson,
  freezeDueClips,
  httpsUrl,
  optionalText,
  readJson,
  temporaryPassword,
  text,
  trackingCodeFrom,
} from "@/lib/clip/server";
import { clipAmount, cycleFor, num, PAYOUT_LABEL, round2, type CampaignRow, type PayoutMethod } from "@/lib/clip/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

function uuid(body: Body, key: string): string {
  const value = text(body, key);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ClipError("Élément introuvable.", 404);
  return value;
}

function numberField(body: Body, key: string, min: number, max: number, label: string, integer: boolean, fallback?: number): number {
  const raw = body[key];
  if ((raw === undefined || raw === null || raw === "") && fallback !== undefined) return fallback;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(/\s/g, "").replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(value) || value < min || value > max) throw new ClipError(`${label} invalide.`);
  return integer ? Math.round(value) : round2(value);
}

function isoDate(body: Body, key: string, label: string): string {
  const value = text(body, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) throw new ClipError(`${label} invalide.`);
  return value;
}

export async function GET(request: Request) {
  try {
    const ctx = await authenticateClipAdmin(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    const { db } = ctx;
    await freezeDueClips(db);
    const since = new Date(Date.now() - 92 * 86_400_000).toISOString();
    const [campaigns, clippers, accounts, clips, candidates, payouts, snapshots, clicks] = await Promise.all([
      db.from("clip_campaigns").select(CAMPAIGN_COLUMNS).order("starts_on", { ascending: false }).limit(100),
      db.from("clip_clippers").select(CLIPPER_COLUMNS).order("created_at", { ascending: true }).limit(500),
      db.from("clip_accounts").select(ACCOUNT_COLUMNS).order("created_at", { ascending: true }).limit(3000),
      db.from("clip_clips").select(CLIP_COLUMNS).order("created_at", { ascending: false }).limit(1500),
      db.from("clip_candidates").select(CANDIDATE_COLUMNS).order("created_at", { ascending: false }).limit(300),
      db.from("clip_payouts").select(PAYOUT_COLUMNS).order("paid_at", { ascending: false }).limit(300),
      db.from("clip_view_snapshots").select("clip_id,views,recorded_at").gte("recorded_at", since).order("recorded_at", { ascending: true }).limit(20000),
      db.from("clip_click_stats").select("clipper_id,total,last30").limit(1000),
    ]);
    for (const result of [campaigns, clippers, accounts, clips, candidates, payouts, snapshots, clicks]) if (result.error) throw result.error;
    return clipJson({
      campaigns: campaigns.data ?? [],
      clippers: clippers.data ?? [],
      accounts: accounts.data ?? [],
      clips: clips.data ?? [],
      candidates: candidates.data ?? [],
      payouts: payouts.data ?? [],
      snapshots: snapshots.data ?? [],
      clicks: clicks.data ?? [],
    });
  } catch (error) {
    return clipErrorResponse(error);
  }
}

async function acceptCandidate(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const status = text(body, "status") === "active" ? "active" : "test";
  const { data, error } = await db.from("clip_candidates").select(CANDIDATE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  const candidate = data as unknown as { user_id: string; display_name: string; whatsapp: string; telegram: string | null; accounts: string; availability: string; sample_url: string | null; status: string } | null;
  if (!candidate) throw new ClipError("Candidature introuvable.", 404);
  if (candidate.status !== "new") throw new ClipError("Cette candidature a déjà été traitée.", 409);
  const already = await db.from("clip_clippers").select("id").eq("user_id", candidate.user_id).maybeSingle();
  if (already.error) throw already.error;
  if (!already.data) {
    const note = `Candidature : ${candidate.accounts} · ${candidate.availability}${candidate.sample_url ? ` · exemple : ${candidate.sample_url}` : ""}`.slice(0, 1000);
    let created = false;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const { error: insertError } = await db.from("clip_clippers").insert({
        user_id: candidate.user_id,
        display_name: candidate.display_name,
        whatsapp: candidate.whatsapp,
        telegram: candidate.telegram,
        tracking_code: trackingCodeFrom(candidate.display_name),
        status,
        admin_note: note,
      });
      if (!insertError) created = true;
      else if (insertError.code !== "23505") throw insertError;
    }
    if (!created) throw new ClipError("Impossible d'ouvrir l'espace de ce clippeur, réessaie.", 409);
  }
  const { error: updateError } = await db.from("clip_candidates").update({ status: "accepted", reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "new");
  if (updateError) throw updateError;
  return { ok: true };
}

async function refuseCandidate(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const { data, error } = await db.from("clip_candidates").update({ status: "refused", reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "new").select("id");
  if (error) throw error;
  if (!data?.length) throw new ClipError("Cette candidature a déjà été traitée.", 409);
  return { ok: true };
}

async function updateClipper(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const update: Record<string, string | null> = {};
  if ("status" in body) {
    const status = text(body, "status");
    if (!["test", "active", "paused"].includes(status)) throw new ClipError("Statut inconnu.");
    update.status = status;
  }
  if ("admin_note" in body) update.admin_note = optionalText(body, "admin_note", 1000, "Note");
  if (!Object.keys(update).length) throw new ClipError("Rien à enregistrer.");
  const { error } = await db.from("clip_clippers").update(update).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function verifyAccount(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const { error } = await db.from("clip_accounts").update({ verified: body.verified === true }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function saveCampaign(db: SupabaseClient, body: Body) {
  const id = body.id ? uuid(body, "id") : null;
  const title = text(body, "title");
  if (title.length < 3 || title.length > 80) throw new ClipError("Titre de campagne : 3 à 80 caractères.");
  const platforms = text(body, "platforms") || "TikTok · Shorts · Reels";
  if (platforms.length > 80) throw new ClipError("Plateformes : 80 caractères maximum.");
  const brief = text(body, "brief");
  if (brief.length > 2000) throw new ClipError("Brief : 2 000 caractères maximum.");
  const forbidden = text(body, "forbidden");
  if (forbidden.length > 600) throw new ClipError("Interdits : 600 caractères maximum.");
  const rushesRaw = text(body, "rushes_url");
  const startsOn = isoDate(body, "starts_on", "Date de début");
  const endsOn = isoDate(body, "ends_on", "Date de fin");
  if (endsOn < startsOn) throw new ClipError("La fin doit être après le début.");
  const statusRaw = text(body, "status");
  const record = {
    title,
    platforms,
    brief,
    forbidden,
    rushes_url: rushesRaw ? httpsUrl(rushesRaw, "Lien des rushs") : null,
    starts_on: startsOn,
    ends_on: endsOn,
    quota_per_clipper: numberField(body, "quota_per_clipper", 1, 500, "Objectif de clips", true, 10),
    rate_per_1000: numberField(body, "rate_per_1000", 0, 100, "Tarif pour 1 000 vues", false, 1),
    min_views: numberField(body, "min_views", 0, 10_000_000, "Minimum de vues", true, 8000),
    max_per_clip: numberField(body, "max_per_clip", 0, 100_000, "Plafond par clip", false, 150),
    vip_bonus: numberField(body, "vip_bonus", 0, 10_000, "Bonus VIP", false, 20),
    status: ["draft", "active", "ended"].includes(statusRaw) ? statusRaw : "active",
  };
  if (id) {
    const { data, error } = await db.from("clip_campaigns").update(record).eq("id", id).select(CAMPAIGN_COLUMNS).single();
    if (error) throw error;
    return { campaign: data };
  }
  const { data, error } = await db.from("clip_campaigns").insert(record).select(CAMPAIGN_COLUMNS).single();
  if (error) throw error;
  return { campaign: data };
}

async function reviewClip(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const decision = text(body, "decision");
  const now = new Date().toISOString();
  if (decision === "approved") {
    const { data, error } = await db.from("clip_clips").update({ status: "approved", reject_reason: null, reviewed_at: now }).eq("id", id).eq("status", "review").select("id");
    if (error) throw error;
    if (!data?.length) throw new ClipError("Ce clip a déjà été traité.", 409);
    return { ok: true };
  }
  if (decision === "rejected") {
    const reason = text(body, "reason");
    if (reason.length < 2 || reason.length > 200) throw new ClipError("Indique le motif du refus.");
    const { data, error } = await db.from("clip_clips").update({ status: "rejected", reject_reason: reason, reviewed_at: now }).eq("id", id).in("status", ["review", "approved"]).is("payout_id", null).select("id");
    if (error) throw error;
    if (!data?.length) throw new ClipError("Ce clip ne peut plus être refusé.", 409);
    return { ok: true };
  }
  throw new ClipError("Décision inconnue.");
}

async function setViews(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const views = numberField(body, "views", 0, 10_000_000_000, "Nombre de vues", true);
  const { data, error } = await db.from("clip_clips").select("id,payout_id,frozen_views,status").eq("id", id).maybeSingle();
  if (error) throw error;
  const clip = data as unknown as { payout_id: string | null; frozen_views: number | null; status: string } | null;
  if (!clip) throw new ClipError("Clip introuvable.", 404);
  if (clip.payout_id) throw new ClipError("Ce clip est déjà payé.", 409);
  if (clip.status === "rejected") throw new ClipError("Ce clip a été refusé.", 409);
  const update: Record<string, number | string> = { views, views_updated_at: new Date().toISOString() };
  if (clip.frozen_views !== null && clip.frozen_views !== undefined) update.frozen_views = views;
  const { error: updateError } = await db.from("clip_clips").update(update).eq("id", id).is("payout_id", null);
  if (updateError) throw updateError;
  const { error: snapshotError } = await db.from("clip_view_snapshots").insert({ clip_id: id, views });
  if (snapshotError) throw snapshotError;
  return { ok: true };
}

async function pay(db: SupabaseClient, body: Body) {
  const clipperId = uuid(body, "clipper_id");
  const bonus = numberField(body, "bonus", 0, 10_000, "Bonus", false, 0);
  const deduction = numberField(body, "deduction", 0, 100_000, "Retenue", false, 0);
  const proof = optionalText(body, "proof", 300, "Preuve de paiement");
  const clipperResult = await db.from("clip_clippers").select("id,payout_method").eq("id", clipperId).maybeSingle();
  if (clipperResult.error) throw clipperResult.error;
  const clipper = clipperResult.data as unknown as { id: string; payout_method: PayoutMethod | null } | null;
  if (!clipper) throw new ClipError("Clippeur introuvable.", 404);
  const clipsResult = await db.from("clip_clips").select("id,campaign_id,frozen_views").eq("clipper_id", clipperId).eq("status", "approved").not("frozen_views", "is", null).is("payout_id", null).limit(500);
  if (clipsResult.error) throw clipsResult.error;
  const clips = (clipsResult.data ?? []) as unknown as { id: string; campaign_id: string; frozen_views: number | string }[];
  if (!clips.length && bonus === 0) throw new ClipError("Rien à payer pour ce clippeur.");
  const campaignIds = [...new Set(clips.map((clip) => clip.campaign_id))];
  const campaignsResult = campaignIds.length ? await db.from("clip_campaigns").select(CAMPAIGN_COLUMNS).in("id", campaignIds) : { data: [], error: null };
  if (campaignsResult.error) throw campaignsResult.error;
  const campaigns = new Map<string, CampaignRow>(((campaignsResult.data ?? []) as unknown as CampaignRow[]).map((campaign): [string, CampaignRow] => [campaign.id, campaign]));
  let base = 0;
  let viewsTotal = 0;
  for (const clip of clips) {
    const campaign = campaigns.get(clip.campaign_id);
    const views = num(clip.frozen_views);
    viewsTotal += views;
    if (campaign) base += clipAmount(views, campaign);
  }
  base = round2(base);
  const total = round2(Math.max(0, base + bonus - deduction));
  const cycle = cycleFor(new Date());
  const { data: payout, error: payoutError } = await db
    .from("clip_payouts")
    .insert({
      clipper_id: clipperId,
      cycle_start: cycle.start,
      cycle_end: cycle.end,
      clips_count: clips.length,
      views_total: viewsTotal,
      base_amount: base,
      bonus_amount: bonus,
      deduction_amount: deduction,
      total,
      method: clipper.payout_method ? PAYOUT_LABEL[clipper.payout_method] : null,
      proof,
    })
    .select(PAYOUT_COLUMNS)
    .single();
  if (payoutError) throw payoutError;
  const payoutId = (payout as unknown as { id: string }).id;
  if (clips.length) {
    const { error: linkError } = await db.from("clip_clips").update({ payout_id: payoutId }).in("id", clips.map((clip) => clip.id)).is("payout_id", null);
    if (linkError) throw linkError;
  }
  return { payout };
}

/** Mot de passe provisoire, seulement pour les comptes créés depuis l'espace clippeurs. */
async function resetPassword(db: SupabaseClient, body: Body) {
  const id = uuid(body, "clipper_id");
  const { data, error } = await db.from("clip_clippers").select("id,user_id").eq("id", id).maybeSingle();
  if (error) throw error;
  const clipper = data as unknown as { id: string; user_id: string } | null;
  if (!clipper) throw new ClipError("Clippeur introuvable.", 404);
  const found = await db.auth.admin.getUserById(clipper.user_id);
  if (found.error || !found.data.user) throw new ClipError("Compte introuvable.", 404);
  if (found.data.user.app_metadata?.clip_signup !== true) {
    throw new ClipError("Ce compte n'a pas été créé depuis l'espace clippeurs : son mot de passe ne se change pas ici.", 409);
  }
  const password = temporaryPassword();
  const { error: updateError } = await db.auth.admin.updateUserById(clipper.user_id, { password });
  if (updateError) throw updateError;
  return { password };
}

export async function POST(request: Request) {
  try {
    const ctx = await authenticateClipAdmin(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const body = await readJson(request);
    const action = text(body, "action");
    switch (action) {
      case "accept_candidate":
        return clipJson(await acceptCandidate(ctx.db, body));
      case "refuse_candidate":
        return clipJson(await refuseCandidate(ctx.db, body));
      case "update_clipper":
        return clipJson(await updateClipper(ctx.db, body));
      case "verify_account":
        return clipJson(await verifyAccount(ctx.db, body));
      case "save_campaign":
        return clipJson(await saveCampaign(ctx.db, body));
      case "review_clip":
        return clipJson(await reviewClip(ctx.db, body));
      case "set_views":
        return clipJson(await setViews(ctx.db, body));
      case "pay":
        return clipJson(await pay(ctx.db, body));
      case "reset_password":
        return clipJson(await resetPassword(ctx.db, body));
      default:
        throw new ClipError("Action inconnue.");
    }
  } catch (error) {
    return clipErrorResponse(error);
  }
}
