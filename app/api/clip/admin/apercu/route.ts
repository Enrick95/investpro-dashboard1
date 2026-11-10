import { CLIPPER_COLUMNS, authenticateClipAdmin, ClipError, clipErrorResponse, clipJson, clipperSpacePayload } from "@/lib/clip/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aperçu admin : renvoie exactement ce que voit un clippeur dans son espace (lecture seule). */
export async function GET(request: Request) {
  try {
    const ctx = await authenticateClipAdmin(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    const id = new URL(request.url).searchParams.get("clipper") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ClipError("Clippeur introuvable.", 404);
    const { data, error } = await ctx.db.from("clip_clippers").select(CLIPPER_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    const clipper = data as unknown as (Record<string, unknown> & { id: string }) | null;
    if (!clipper) throw new ClipError("Clippeur introuvable.", 404);
    return clipJson({ email: null, owner: false, ...(await clipperSpacePayload(ctx.db, clipper)) });
  } catch (error) {
    return clipErrorResponse(error);
  }
}
