import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { sendCopierEmail, sendCopierPush } from "@/lib/copier/notifications";

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request, "copier");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  let query = auth.admin.from("copier_notification_deliveries")
    .select("id,event_key,user_id,channel,title,message,href,status,attempts,last_error,updated_at")
    .in("status", ["failed", "skipped"])
    .order("updated_at", { ascending: false })
    .limit(100);
  query = archived ? query.not("acknowledged_at", "is", null) : query.is("acknowledged_at", null);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Impossible de charger le suivi des notifications." }, { status: 500 });
  return NextResponse.json({ deliveries: data || [], archived });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request, "copier_write");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const action = String(body?.action || "retry");
    if (action === "archive_all") {
      const { error } = await auth.admin.from("copier_notification_deliveries")
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user.id })
        .in("status", ["failed", "skipped"])
        .is("acknowledged_at", null);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const id = String(body?.id || "");
    if (!id || id.length > 100) return NextResponse.json({ error: "Notification invalide." }, { status: 400 });
    const { data: delivery, error } = await auth.admin.from("copier_notification_deliveries")
      .select("id,event_key,user_id,channel,title,message,href,status,acknowledged_at")
      .eq("id", id).maybeSingle();
    if (error || !delivery) return NextResponse.json({ error: "Notification introuvable." }, { status: 404 });
    if (action === "archive" || action === "restore") {
      if (!["failed", "skipped"].includes(delivery.status)) {
        return NextResponse.json({ error: "Cette notification ne peut pas être archivée." }, { status: 409 });
      }
      if (action === "restore" && !delivery.acknowledged_at) {
        return NextResponse.json({ error: "Cette notification n’est pas archivée." }, { status: 409 });
      }
      const { error: updateError } = await auth.admin.from("copier_notification_deliveries")
        .update(action === "archive"
          ? { acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user.id }
          : { acknowledged_at: null, acknowledged_by: null })
        .eq("id", id);
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true });
    }
    if (action !== "retry") return NextResponse.json({ error: "Action invalide." }, { status: 400 });
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
