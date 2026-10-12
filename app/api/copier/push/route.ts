import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuration serveur incomplète.");
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const configured = Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  return NextResponse.json({ publicKey: configured ? publicKey : null, available: configured }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

    const body = await request.json();
    const subscription = body?.subscription;
    const endpoint = String(subscription?.endpoint || "");
    const p256dh = String(subscription?.keys?.p256dh || "");
    const authKey = String(subscription?.keys?.auth || "");
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 }); }
    if (parsed.protocol !== "https:" || endpoint.length > 4096 || p256dh.length > 256 || authKey.length > 128) {
      return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
    }
    if (!p256dh || !authKey || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) {
      return NextResponse.json({ error: "Les notifications push ne sont pas encore configurées." }, { status: 503 });
    }

    const admin = adminClient();
    const { error } = await admin.from("copier_push_subscriptions").upsert({
      user_id: user.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: (request.headers.get("user-agent") || "").slice(0, 500),
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[copier-push][POST]", error);
    return NextResponse.json({ error: "Impossible d’activer les notifications sur cet appareil." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    const body = await request.json();
    const endpoint = String(body?.endpoint || "");
    if (!endpoint || endpoint.length > 4096) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
    const { error } = await adminClient().from("copier_push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[copier-push][DELETE]", error);
    return NextResponse.json({ error: "Impossible de désactiver les notifications sur cet appareil." }, { status: 503 });
  }
}
