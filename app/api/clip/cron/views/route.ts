import { timingSafeEqual } from "node:crypto";
import { clipJson, serviceDb } from "@/lib/clip/server";
import { dueViewClips, refreshClipViews } from "@/lib/clip/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Toutes les 3 h (vercel.json) : relève les vues TikTok et YouTube des clips récents. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  if (!secret || given.byteLength !== expected.byteLength || !timingSafeEqual(given, expected)) return clipJson({ error: "Accès refusé." }, 401);
  if (process.env.VERCEL_ENV !== "production") return clipJson({ error: "Relevé exécuté uniquement sur le site principal." }, 403);
  try {
    const db = serviceDb();
    const clips = await dueViewClips(db, 150);
    const result = await refreshClipViews(db, clips, 100_000);
    console.info("[clip-views] relevé", { clips: clips.length, ...result });
    return clipJson({ ok: true, clips: clips.length, ...result });
  } catch (error) {
    console.error("[clip-views] relevé impossible", error instanceof Error ? error.message : "inconnu");
    return clipJson({ error: "Relevé impossible." }, 500);
  }
}
