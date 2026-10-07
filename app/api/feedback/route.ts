import { NextResponse } from "next/server";
import { requireUser } from "@/lib/brokers/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const { data, error } = await supabase
      .from("user_feedback")
      .select("id,category,rating,message,page_path,status,created_at,updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ ok: true, feedback: data || [] });
  } catch (error: any) {
    if (String(error?.message) === "UNAUTHORIZED") return NextResponse.json({ ok: false, error: "Session expirée." }, { status: 401 });
    return NextResponse.json({ ok: false, error: "Feedback indisponible." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await request.json();
    const category = ["bug","idea","design","connection","other"].includes(String(body?.category)) ? String(body.category) : "other";
    const rating = Number(body?.rating || 0);
    const message = String(body?.message || "").trim();
    const pagePath = String(body?.page_path || "").slice(0, 500);
    if (message.length < 5 || message.length > 4000) return NextResponse.json({ ok: false, error: "Écris un message entre 5 et 4 000 caractères." }, { status: 400 });

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("user_feedback").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
    if (Number(count || 0) >= 10) return NextResponse.json({ ok: false, error: "Trop de messages envoyés. Réessaie dans une heure." }, { status: 429 });

    const { error } = await supabase.from("user_feedback").insert({
      user_id: user.id,
      category,
      rating: rating >= 1 && rating <= 5 ? rating : null,
      message,
      page_path: pagePath || null,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (String(error?.message) === "UNAUTHORIZED") return NextResponse.json({ ok: false, error: "Session expirée." }, { status: 401 });
    return NextResponse.json({ ok: false, error: String(error?.message || "Impossible d’envoyer le feedback.") }, { status: 500 });
  }
}
