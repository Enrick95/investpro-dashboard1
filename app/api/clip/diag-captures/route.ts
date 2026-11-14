import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { clipJson, serviceDb } from "@/lib/clip/server";
import { CAPTURE_BUCKET, imageBytesMatch } from "@/lib/clip/captures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contrôle temporaire de l'envoi des captures, sur les aperçus uniquement (retiré ensuite).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new Response("Not found", { status: 404 });
  const steps: Record<string, unknown> = {};
  const db = serviceDb();
  const bucket = db.storage.from(CAPTURE_BUCKET);
  const path = `diag/${randomUUID()}.png`;
  const extra: string[] = [];
  try {
    const signed = await bucket.createSignedUploadUrl(path, { upsert: false });
    steps.sign = signed.error ? signed.error.message : "ok";
    if (signed.data) {
      const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
      const up = await browser.storage.from(CAPTURE_BUCKET).uploadToSignedUrl(path, signed.data.token, new Blob([PNG], { type: "image/png" }), { contentType: "image/png" });
      steps.upload = up.error ? up.error.message : "ok";
      const again = await browser.storage.from(CAPTURE_BUCKET).uploadToSignedUrl(path, signed.data.token, new Blob([PNG], { type: "image/png" }), { contentType: "image/png" });
      steps.reuseToken = again.error ? `refused: ${again.error.message}` : "ACCEPTED";
      const otherPath = `diag/${randomUUID()}.png`;
      extra.push(otherPath);
      const signed2 = await bucket.createSignedUploadUrl(otherPath, { upsert: false });
      if (signed2.data) {
        const bad = await browser.storage.from(CAPTURE_BUCKET).uploadToSignedUrl(otherPath, signed2.data.token, new Blob(["hello"], { type: "text/plain" }), { contentType: "text/plain" });
        steps.wrongType = bad.error ? `refused: ${bad.error.message}` : "ACCEPTED";
      }
      const down = await bucket.download(path);
      steps.download = down.error ? down.error.message : `${down.data?.size ?? 0} bytes`;
      if (down.data) steps.magic = imageBytesMatch(new Uint8Array(await down.data.slice(0, 16).arrayBuffer()), "image/png");
      const links = await bucket.createSignedUrls([path], 60);
      const link = links.data?.[0]?.signedUrl ?? "";
      steps.links = links.error ? links.error.message : link ? "ok" : "missing";
      if (link) {
        const response = await fetch(link, { cache: "no-store" });
        steps.linkFetch = `${response.status} ${response.headers.get("content-type") ?? ""}`;
      }
      const anonymous = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${CAPTURE_BUCKET}/${path}`, { cache: "no-store" });
      steps.publicUrl = anonymous.status;
    }
  } catch (error) {
    steps.error = error instanceof Error ? error.message : String(error);
  } finally {
    const removed = await bucket.remove([path, ...extra]);
    steps.remove = removed.error ? removed.error.message : "ok";
  }
  return clipJson(steps);
}
