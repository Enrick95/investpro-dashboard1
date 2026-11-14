import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_COLUMNS,
  CAMPAIGN_COLUMNS,
  CANDIDATE_COLUMNS,
  CLIPPER_COLUMNS,
  CLIP_COLUMNS,
  PAYOUT_COLUMNS,
  ADMIN_VIDEO_COLUMNS,
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
import { notifyNewVideo, type NotifyResult } from "@/lib/clip/notify";
import { dueViewClips, refreshClipViews } from "@/lib/clip/views";
import { captureLinks, type CaptureRow } from "@/lib/clip/captures";
import { clipValue, cycleFor, DEFAULT_CLIP_AMOUNT, num, PAYOUT_LABEL, REFERRAL_BONUS, REFERRAL_CLIPS, round2, type PayoutMethod } from "@/lib/clip/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La publication d'une vidéo envoie les notifications et les e-mails avant de répondre.
export const maxDuration = 60;

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
    const [campaigns, clippers, accounts, clips, candidates, payouts, snapshots, clicks, videos] = await Promise.all([
      db.from("clip_campaigns").select(CAMPAIGN_COLUMNS).order("starts_on", { ascending: false }).limit(100),
      db.from("clip_clippers").select(CLIPPER_COLUMNS).order("created_at", { ascending: true }).limit(500),
      db.from("clip_accounts").select(ACCOUNT_COLUMNS).order("created_at", { ascending: true }).limit(3000),
      db.from("clip_clips").select(CLIP_COLUMNS).order("created_at", { ascending: false }).limit(1500),
      db.from("clip_candidates").select(CANDIDATE_COLUMNS).order("created_at", { ascending: false }).limit(300),
      db.from("clip_payouts").select(PAYOUT_COLUMNS).order("paid_at", { ascending: false }).limit(300),
      db.from("clip_view_snapshots").select("clip_id,views,recorded_at").gte("recorded_at", since).order("recorded_at", { ascending: true }).limit(20000),
      db.from("clip_click_stats").select("clipper_id,total,last30").limit(1000),
      db.from("clip_videos").select(ADMIN_VIDEO_COLUMNS).order("created_at", { ascending: false }).limit(200),
    ]);
    for (const result of [campaigns, clippers, accounts, clips, candidates, payouts, snapshots, clicks, videos]) if (result.error) throw result.error;
    // Captures des stats envoyées par les clippeurs (les plus récentes) : bonus, l'admin s'ouvre même sans elles.
    const captureRows = await db.from("clip_captures").select("id,clip_id,clipper_id,path,created_at").not("confirmed_at", "is", null).order("created_at", { ascending: false }).limit(600);
    if (captureRows.error) console.error("Captures des stats illisibles :", captureRows.error.message);
    const captures = captureRows.error ? [] : await captureLinks(db, (captureRows.data ?? []) as unknown as CaptureRow[]);
    return clipJson({
      captures,
      campaigns: campaigns.data ?? [],
      clippers: clippers.data ?? [],
      accounts: accounts.data ?? [],
      clips: clips.data ?? [],
      candidates: candidates.data ?? [],
      payouts: payouts.data ?? [],
      snapshots: snapshots.data ?? [],
      clicks: clicks.data ?? [],
      videos: videos.data ?? [],
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
  const candidate = data as unknown as { user_id: string; display_name: string; whatsapp: string; telegram: string | null; accounts: string; availability: string; sample_url: string | null; referred_by: string | null; status: string } | null;
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
        referred_by: candidate.referred_by,
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
  const platforms = text(body, "platforms") || "TikTok · Instagram · YouTube Shorts · Facebook";
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
    amount_per_clip: numberField(body, "amount_per_clip", 0, 1000, "Montant par clip validé", false, DEFAULT_CLIP_AMOUNT),
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
    // Montant choisi à la validation ; à défaut, celui proposé par la campagne.
    let amount: number;
    if (body.amount === undefined || body.amount === null || body.amount === "") {
      const found = await db.from("clip_clips").select("campaign_id").eq("id", id).maybeSingle();
      if (found.error) throw found.error;
      const campaignId = (found.data as unknown as { campaign_id: string } | null)?.campaign_id;
      if (!campaignId) throw new ClipError("Clip introuvable.", 404);
      const campaign = await db.from("clip_campaigns").select("amount_per_clip").eq("id", campaignId).maybeSingle();
      if (campaign.error) throw campaign.error;
      amount = round2(num((campaign.data as unknown as { amount_per_clip: number | string } | null)?.amount_per_clip ?? DEFAULT_CLIP_AMOUNT));
    } else {
      amount = numberField(body, "amount", 0, 10_000, "Montant du clip", false);
    }
    const { data, error } = await db.from("clip_clips").update({ status: "approved", amount, reject_reason: null, reviewed_at: now }).eq("id", id).eq("status", "review").select("id");
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

/** Bonus sur un clip validé et pas encore payé (clip qui cartonne). */
async function clipBonus(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const bonus = numberField(body, "bonus", 0, 10_000, "Bonus", false, 0);
  const { data, error } = await db.from("clip_clips").update({ bonus }).eq("id", id).eq("status", "approved").is("payout_id", null).select("id");
  if (error) throw error;
  if (!data?.length) throw new ClipError("Ce clip n'est pas validé ou il est déjà payé.", 409);
  return { ok: true };
}

async function saveVideo(db: SupabaseClient, body: Body) {
  const id = body.id ? uuid(body, "id") : null;
  const title = text(body, "title");
  if (title.length < 2 || title.length > 120) throw new ClipError("Titre de la vidéo : 2 à 120 caractères.");
  const url = httpsUrl(text(body, "url"), "Lien de la vidéo");
  const note = optionalText(body, "note", 600, "Note");
  const campaignRaw = text(body, "campaign_id");
  const record = { title, url, note, campaign_id: campaignRaw ? uuid(body, "campaign_id") : null };
  const result = id
    ? await db.from("clip_videos").update(record).eq("id", id).select(ADMIN_VIDEO_COLUMNS).single()
    : await db.from("clip_videos").insert(record).select(ADMIN_VIDEO_COLUMNS).single();
  if (result.error) throw result.error;
  // Les clippeurs ne sont prévenus qu'à la publication : modifier une vidéo ne renvoie rien.
  if (id || body.notify !== true) return { video: result.data, notified: null };
  const video = result.data as unknown as { id: string; title: string; note: string | null; campaign_id: string | null };
  return { video: result.data, notified: await notifyVideo(db, video) };
}

/** Vidéo déjà publiée sans prévenir (ou avant les notifications) : on prévient une seule fois. */
async function notifyExistingVideo(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const { data, error } = await db.from("clip_videos").select("id,title,note,campaign_id,notified_at").eq("id", id).maybeSingle();
  if (error) throw error;
  const video = data as unknown as { id: string; title: string; note: string | null; campaign_id: string | null; notified_at: string | null } | null;
  if (!video) throw new ClipError("Vidéo introuvable.", 404);
  // Réservé avant l'envoi : un double clic ne prévient les clippeurs qu'une fois.
  const { data: claimed, error: claimError } = await db.from("clip_videos").update({ notified_at: new Date().toISOString() }).eq("id", id).is("notified_at", null).select("id");
  if (claimError) throw claimError;
  if (!claimed?.length) throw new ClipError("Les clippeurs ont déjà été prévenus pour cette vidéo.", 409);
  const notified = await notifyVideo(db, video);
  // Rien n'est parti : le bouton « Prévenir » revient pour réessayer.
  if ("error" in notified) await db.from("clip_videos").update({ notified_at: null }).eq("id", id);
  return { notified };
}

/** Notification + e-mail aux clippeurs. La vidéo reste publiée même si l'envoi échoue. */
async function notifyVideo(db: SupabaseClient, video: { id: string; title: string; note: string | null; campaign_id: string | null }): Promise<NotifyResult | { error: true }> {
  try {
    let campaign: string | null = null;
    if (video.campaign_id) {
      const { data } = await db.from("clip_campaigns").select("title,status").eq("id", video.campaign_id).maybeSingle();
      const row = data as unknown as { title: string; status: string } | null;
      // Une campagne en brouillon n'est pas encore visible des clippeurs : on ne la nomme pas.
      if (row?.status === "active") campaign = row.title;
    }
    const notified = await notifyNewVideo(db, { id: video.id, title: video.title, note: video.note, campaign });
    const { error } = await db.from("clip_videos").update({ notified_at: new Date().toISOString(), notified_push: notified.push, notified_email: notified.email }).eq("id", video.id);
    if (error) console.error("[clip-notify] bilan non enregistré", error.code);
    return notified;
  } catch (error) {
    console.error("[clip-notify] envoi impossible", error instanceof Error ? error.message : "inconnu");
    return { error: true };
  }
}

/** Supprime une campagne sans clip. Avec des clips, on la termine : leur historique et leurs paiements restent. */
async function deleteCampaign(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const { count, error: countError } = await db.from("clip_clips").select("id", { count: "exact", head: true }).eq("campaign_id", id);
  if (countError) throw countError;
  if (count) throw new ClipError(`Cette campagne a déjà ${count} clip${count > 1 ? "s" : ""} : passe-la en « Terminée » pour l'arrêter, leur historique et leurs paiements restent.`, 409);
  // Les vidéos rattachées restent dans l'espace des clippeurs, simplement sans campagne.
  const { error } = await db.from("clip_campaigns").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function deleteVideo(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const { error } = await db.from("clip_videos").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

/** Bouton « Actualiser les vues » : relève tout de suite les vues TikTok et YouTube des clips récents. */
async function refreshAllViews(db: SupabaseClient) {
  const clips = await dueViewClips(db, 60);
  const result = await refreshClipViews(db, clips, 45_000);
  return { clips: clips.length, ...result };
}

async function setViews(db: SupabaseClient, body: Body) {
  const id = uuid(body, "id");
  const views = numberField(body, "views", 0, 10_000_000_000, "Nombre de vues", true);
  const { data, error } = await db.from("clip_clips").select("id,frozen_views,status").eq("id", id).maybeSingle();
  if (error) throw error;
  const clip = data as unknown as { frozen_views: number | null; status: string } | null;
  if (!clip) throw new ClipError("Clip introuvable.", 404);
  if (clip.status === "rejected") throw new ClipError("Ce clip a été refusé.", 409);
  // Les vues ne servent plus qu'aux statistiques : on peut les mettre à jour même après le paiement.
  const update: Record<string, number | string> = { views, views_updated_at: new Date().toISOString() };
  if (clip.frozen_views !== null && clip.frozen_views !== undefined) update.frozen_views = views;
  const { error: updateError } = await db.from("clip_clips").update(update).eq("id", id);
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

  // Clips validés pas encore payés : chacun rapporte son montant et son bonus.
  const clipsResult = await db.from("clip_clips").select("id,amount,bonus,views,frozen_views").eq("clipper_id", clipperId).eq("status", "approved").is("payout_id", null).limit(500);
  if (clipsResult.error) throw clipsResult.error;
  const clips = (clipsResult.data ?? []) as unknown as { id: string; amount: number | string | null; bonus: number | string | null; views: number | string; frozen_views: number | string | null }[];

  // Primes de parrainage : filleuls avec assez de clips validés, prime pas encore versée.
  const refereesResult = await db.from("clip_clippers").select("id").eq("referred_by", clipperId).is("referral_payout_id", null).limit(200);
  if (refereesResult.error) throw refereesResult.error;
  const refereeIds = ((refereesResult.data ?? []) as unknown as { id: string }[]).map((row) => row.id);
  let eligible: string[] = [];
  if (refereeIds.length) {
    const counts = await db.from("clip_clips").select("clipper_id").eq("status", "approved").in("clipper_id", refereeIds).limit(5000);
    if (counts.error) throw counts.error;
    const approvedBy = new Map<string, number>();
    for (const row of (counts.data ?? []) as unknown as { clipper_id: string }[]) approvedBy.set(row.clipper_id, (approvedBy.get(row.clipper_id) ?? 0) + 1);
    eligible = refereeIds.filter((id) => (approvedBy.get(id) ?? 0) >= REFERRAL_CLIPS);
  }
  const referral = round2(eligible.length * REFERRAL_BONUS);

  if (!clips.length && bonus === 0 && referral === 0) throw new ClipError("Rien à payer pour ce clippeur.");
  const base = round2(clips.reduce((sum, clip) => sum + clipValue(clip), 0));
  const viewsTotal = clips.reduce((sum, clip) => sum + num(clip.frozen_views ?? clip.views), 0);
  const total = round2(Math.max(0, base + referral + bonus - deduction));
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
      referral_amount: referral,
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
  if (eligible.length) {
    const { error: referralError } = await db.from("clip_clippers").update({ referral_payout_id: payoutId }).in("id", eligible).is("referral_payout_id", null);
    if (referralError) throw referralError;
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
      case "refresh_views":
        return clipJson(await refreshAllViews(ctx.db));
      case "set_views":
        return clipJson(await setViews(ctx.db, body));
      case "clip_bonus":
        return clipJson(await clipBonus(ctx.db, body));
      case "save_video":
        return clipJson(await saveVideo(ctx.db, body));
      case "delete_video":
        return clipJson(await deleteVideo(ctx.db, body));
      case "notify_video":
        return clipJson(await notifyExistingVideo(ctx.db, body));
      case "delete_campaign":
        return clipJson(await deleteCampaign(ctx.db, body));
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
