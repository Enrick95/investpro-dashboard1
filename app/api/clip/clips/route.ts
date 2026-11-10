import { CLIP_COLUMNS, assertSameOrigin, authenticateClip, ClipError, clipErrorResponse, clipJson, httpsUrl, readJson, text } from "@/lib/clip/server";
import { NETWORKS_TEXT, PLATFORM_LABEL, platformFromUrl, tiktokHandleFromUrl } from "@/lib/clip/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** Un clippeur soumet un clip publié : il part en revue chez l'admin. */
export async function POST(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const { db, user } = ctx;
    const clipperResult = await db.from("clip_clippers").select("id,status").eq("user_id", user.id).maybeSingle();
    if (clipperResult.error) throw clipperResult.error;
    const clipper = clipperResult.data as unknown as { id: string; status: string } | null;
    if (!clipper) throw new ClipError("Ton espace clippeur n'est pas encore ouvert.", 403);
    if (clipper.status === "paused") throw new ClipError("Ton compte clippeur est en pause. Écris à Enrick sur WhatsApp.", 403);

    const body = await readJson(request);
    const url = httpsUrl(text(body, "url"), "Lien du clip");
    const platform = platformFromUrl(url);
    if (!platform) throw new ClipError(`Colle le lien de ta vidéo (${NETWORKS_TEXT}).`);
    const titleRaw = text(body, "title");
    if (titleRaw && (titleRaw.length < 2 || titleRaw.length > 120)) throw new ClipError("Titre du clip : 2 à 120 caractères.");
    const campaignId = text(body, "campaign_id");
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) throw new ClipError("Choisis une campagne.");
    const day = text(body, "published_on");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ClipError("Indique la date de publication.");
    const publishedAt = new Date(`${day}T12:00:00Z`);
    if (Number.isNaN(publishedAt.getTime())) throw new ClipError("Date de publication invalide.");
    if (publishedAt.getTime() > Date.now() + DAY) throw new ClipError("La date de publication ne peut pas être dans le futur.");
    const checks = body.checks;
    if (!Array.isArray(checks) || checks.length !== 3 || !checks.every((value) => value === true)) throw new ClipError("Coche les 3 règles de la charte avant d'envoyer.");

    const campaignResult = await db.from("clip_campaigns").select("id,title,status,starts_on,ends_on").eq("id", campaignId).maybeSingle();
    if (campaignResult.error) throw campaignResult.error;
    const campaign = campaignResult.data as unknown as { id: string; title: string; status: string; starts_on: string; ends_on: string } | null;
    if (!campaign || campaign.status !== "active") throw new ClipError("Cette campagne n'est pas ouverte.");
    if (day < campaign.starts_on || day > campaign.ends_on) throw new ClipError(`Le clip doit être publié entre le ${campaign.starts_on} et le ${campaign.ends_on}.`);

    const accountsResult = await db.from("clip_accounts").select("platform,handle").eq("clipper_id", clipper.id).eq("platform", platform);
    if (accountsResult.error) throw accountsResult.error;
    const handles = ((accountsResult.data ?? []) as unknown as { handle: string }[]).map((account) => account.handle);
    if (!handles.length) throw new ClipError(`Ajoute d'abord ton compte ${PLATFORM_LABEL[platform]} dans ton profil.`);
    if (platform === "tiktok") {
      const handle = tiktokHandleFromUrl(url);
      if (handle && !handles.includes(handle)) throw new ClipError(`Le compte @${handle} n'est pas dans ton profil. Ajoute-le d'abord.`);
    }

    const { data, error } = await db
      .from("clip_clips")
      .insert({ clipper_id: clipper.id, campaign_id: campaign.id, platform, url, title: titleRaw || `${PLATFORM_LABEL[platform]} · ${campaign.title}`.slice(0, 120), published_at: publishedAt.toISOString() })
      .select(CLIP_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new ClipError("Ce clip a déjà été soumis.", 409);
      throw error;
    }
    return clipJson({ clip: data }, 201);
  } catch (error) {
    return clipErrorResponse(error);
  }
}
