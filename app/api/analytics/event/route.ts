import { NextResponse } from "next/server";
import { requireUser } from "@/lib/brokers/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await request.json();
    const eventName = String(body?.event_name || "page_view").slice(0, 80);
    const pagePath = String(body?.page_path || "").slice(0, 500);
    const sessionId = String(body?.session_id || "").slice(0, 120);
    const props = body?.properties && typeof body.properties === "object" ? body.properties : {};
    await supabase.from("product_events").insert({
      user_id: user.id,
      session_id: sessionId || null,
      event_name: eventName,
      page_path: pagePath || null,
      properties: props,
    });
    return NextResponse.json({ ok: true });
  } catch {
    // L'analytics ne doit jamais casser l'expérience utilisateur.
    return NextResponse.json({ ok: true });
  }
}
