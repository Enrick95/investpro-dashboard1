import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerIds } from "../admin/permissions";

type AdminActivity = { id: string; event_key: string; kind: "requested" | "approved" | "denied"; title: string; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const adminPaths = new Set(["/dashboard/admin?tool=vip&view=requests", "/dashboard/admin?tool=vip&view=members"]);
const activityKey = /^vip:admin:(request|approved|denied):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only known admin destinations and this recipient's activity key are accepted. */
export function vipAdminActivityHref(eventKey: string, userId: string, href: unknown): string | null {
  if (!uuid.test(userId) || !eventKey.endsWith(`:${userId}`) || !activityKey.test(eventKey.slice(0, -(userId.length + 1)))) return null;
  return typeof href === "string" && adminPaths.has(href) ? href : null;
}

/** Future-only database trigger events, with durable/idempotent fan-out to current VIP reviewers. */
export async function queueVipAdminActivity(db: SupabaseClient) {
  if (process.env.VERCEL_ENV !== "production") return { queued: 0, preview: true };
  const { data: events, error: eventError } = await db.from("vip_admin_activity_events")
    .select("id,event_key,kind,title,message").is("dispatched_at", null).order("created_at", { ascending: true }).limit(50);
  if (eventError) throw new Error("VIP_ADMIN_ACTIVITY_READ_FAILED");
  if (!events?.length) return { queued: 0 };
  const { data: staff, error: staffError } = await db.from("admin_staff_permissions").select("user_id,permissions").eq("enabled", true);
  if (staffError) throw new Error("VIP_ADMIN_RECIPIENTS_FAILED");
  const recipients = [...new Set([...ownerIds(), ...(staff || [])
    .filter(value => Array.isArray(value.permissions) && value.permissions.includes("users_write"))
    .map(value => value.user_id as string)])].filter(value => uuid.test(value));
  if (!recipients.length) return { queued: 0, pending: true };
  let queued = 0;
  for (const event of events as AdminActivity[]) {
    // Events are created by a service-only database trigger, never reconstructed from history.
    if (!uuid.test(event.id) || !activityKey.test(event.event_key) || !["requested", "approved", "denied"].includes(event.kind)) throw new Error("VIP_ADMIN_ACTIVITY_INVALID");
    const href = event.kind === "approved" ? "/dashboard/admin?tool=vip&view=members" : "/dashboard/admin?tool=vip&view=requests";
    const notices = recipients.map(user_id => ({ user_id, event_key: `${event.event_key}:${user_id}`, title: event.title, message: event.message, href }));
    const feed = await db.from("investpro_notifications").upsert(notices, { onConflict: "event_key", ignoreDuplicates: true });
    if (feed.error) throw new Error("VIP_ADMIN_FEED_QUEUE_FAILED");
    const push = await db.from("vip_notification_outbox").upsert(notices.map(row => ({ ...row, kind: "admin_event" })), { onConflict: "event_key", ignoreDuplicates: true });
    if (push.error) throw new Error("VIP_ADMIN_PUSH_QUEUE_FAILED");
    const done = await db.from("vip_admin_activity_events").update({ dispatched_at: new Date().toISOString() }).eq("id", event.id).is("dispatched_at", null);
    if (done.error) throw new Error("VIP_ADMIN_ACTIVITY_TRACKING_FAILED");
    queued += notices.length;
  }
  return { queued };
}
