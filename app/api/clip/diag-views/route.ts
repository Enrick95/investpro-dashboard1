import { serviceDb } from "@/lib/clip/server";
import { readClipViews } from "@/lib/clip/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Diagnostic temporaire (préproduction seulement) : lecture des vues avec le module final, sans rien enregistrer. */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new Response("Not found", { status: 404 });
  const { data } = await serviceDb().from("clip_clips").select("ref,platform,url").order("ref").limit(20);
  const clips = (data ?? []) as { ref: string; platform: string; url: string }[];
  const results = await Promise.all(clips.map(async (clip) => ({ ref: clip.ref, platform: clip.platform, result: await readClipViews(clip.url, clip.platform) })));
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
