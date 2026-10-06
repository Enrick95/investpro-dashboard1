import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { error: "Configuration Supabase incomplète." },
        { status: 500 }
      );
    }

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Session invalide." }, { status: 401 });
    }

    const body = await request.json();
    const location = String(body?.where || "").trim();
    const description = String(body?.description || "").trim();
    const pageUrl = String(body?.url || "").slice(0, 1500);
    const userAgent = String(body?.userAgent || "").slice(0, 1500);
    const images = Array.isArray(body?.images) ? body.images.slice(0, 6) : [];

    if (location.length < 3 || location.length > 240) {
      return NextResponse.json(
        { error: "Précise où le bug se produit." },
        { status: 400 }
      );
    }

    if (description.length < 10 || description.length > 10000) {
      return NextResponse.json(
        { error: "La description doit contenir entre 10 et 10 000 caractères." },
        { status: 400 }
      );
    }

    const safeImages = images
      .filter((item: any) => String(item?.mime || "").startsWith("image/"))
      .map((item: any) => ({
        name: String(item?.name || "").slice(0, 180),
        mime: String(item?.mime || "").slice(0, 100),
        size: Math.max(0, Math.min(Number(item?.size || 0), 2_000_000)),
        dataUrl: String(item?.dataUrl || "").slice(0, 2_200_000),
      }));

    const { data, error } = await supabase
      .from("bug_reports")
      .insert({
        user_id: user.id,
        location,
        description,
        page_url: pageUrl || null,
        user_agent: userAgent || null,
        images: safeImages,
        status: "open",
      })
      .select("id")
      .single();

    if (error) {
      console.error("bug report insert:", error);
      return NextResponse.json(
        { error: "Impossible d’enregistrer ce rapport de bug." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur." },
      { status: 500 }
    );
  }
}
