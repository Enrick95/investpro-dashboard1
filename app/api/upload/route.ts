import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs"; // obligatoire pour fs

// =======================
// CONFIG
// =======================
const MAX_BYTES = 50 * 1024 * 1024; // ✅ 50 MB

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "audio/mpeg", // mp3
]);

function extFromMime(mime: string) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    default:
      return "bin";
  }
}

// =======================
// POST /api/upload
// =======================
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Type de fichier non autorisé" },
        { status: 415 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Fichier trop volumineux (max 50MB)" },
        { status: 413 }
      );
    }

    // Convert to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Directory: /public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    // Safe filename
    const safeName = (file.name || "file")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "_");

    const ext = extFromMime(file.type);
    const filename = `${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}_${safeName}.${ext}`;

    const fullPath = path.join(uploadDir, filename);

    await fs.writeFile(fullPath, buffer);

    // Public URL
    const url = `/uploads/${filename}`;

    return NextResponse.json({
      ok: true,
      url,
      name: file.name,
      mime: file.type,
      size: file.size,
    });
  } catch (err: any) {
    console.error("UPLOAD ERROR:", err);
    return NextResponse.json(
      { ok: false, error: "Erreur upload serveur", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
