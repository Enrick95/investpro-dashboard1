import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/clip/server";
import { TRACKED_LINK_TARGET } from "@/lib/clip/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lien traqué d'un clippeur : compte le clic puis renvoie vers le lien en bio d'Enrick. */
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const target = new URL(TRACKED_LINK_TARGET);
  if (/^[a-z0-9-]{3,40}$/.test(code)) {
    try {
      const db = serviceDb();
      const { data } = await db.from("clip_clippers").select("id").eq("tracking_code", code).maybeSingle();
      const clipper = data as unknown as { id: string } | null;
      if (clipper) {
        await db.from("clip_link_clicks").insert({ clipper_id: clipper.id });
        target.searchParams.set("c", code);
      }
    } catch {
      // Le lien doit toujours rediriger, même si le comptage échoue.
    }
  }
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}
