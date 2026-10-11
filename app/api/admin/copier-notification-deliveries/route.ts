import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { sendCopierEmail, sendCopierPush } from "@/lib/copier/notifications";

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request, "copier");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from("copier_notification_deliveries")
    .select("id,event_key,user_id,channel,title,message,href,status,attempts,last_error,updated_at")
    .in("status", ["failed", "skipped"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Impossible de charger le suivi des notifications." }, { status: 500 });
  return NextResponse.json({ deliveries: data || [] });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request, "copier_write");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const id = String(body?.id || "");
    if (!id || id.length > 100) return NextResponse.json({ error: "Notification invalide." }, { status: 400 });
    const { data: delivery, error } = await auth.admin.from("copier_notification_deliveries")
      .select("id,event_key,user_id,channel,title,message,href,status")
      .eq("id", id).maybeSingle();
    if (error || !delivery) return NextResponse.json({ error: "Notification introuvable." }, { status: 404 });
    if (!["failed", "skipped"].includes(delivery.status)) return NextResponse.json({ error: "Cette notification n’est pas à relancer." }, { status: 409 });
    const result = delivery.channel === "email"
      ? await sendCopierEmail(auth.admin, delivery.event_key, delivery.user_id, delivery.title, delivery.message, delivery.href, true)
      : await sendCopierPush(auth.admin, delivery.event_key, delivery.user_id, delivery.title, delivery.message, delivery.href, true);
    return NextResponse.json({ ok: result.sent, reason: result.reason || null });
  } catch (error) {
    console.error("[copier-notification-deliveries][POST]", error);
    return NextResponse.json({ error: "Impossible de relancer la notification." }, { status: 500 });
  }
}
