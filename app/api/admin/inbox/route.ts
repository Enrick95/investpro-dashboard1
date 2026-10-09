import { authenticateAdmin } from "@/lib/admin/permissions";
import { canAdmin } from "@/lib/admin/permissions";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


function getAdminIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function verifyAdmin(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return {
      response: NextResponse.json(
        { error: "Configuration Supabase serveur incomplète." },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return {
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await publicClient.auth.getUser(token);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!await canAdmin(user.id, "inbox")) {
    return {
      response: NextResponse.json(
        { error: "Accès administrateur refusé." },
        { status: 403 }
      ),
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, requester: user };
}


async function safe<T>(promise: PromiseLike<any>, fallback: T) {
  try {
    const result = await promise;
    if (result?.error) return { data: fallback, available: false };
    return { data: (result?.data ?? fallback) as T, available: true };
  } catch {
    return { data: fallback, available: false };
  }
}

export async function GET(request: Request) {
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin } = verified as any;

  const [tickets, bugs, deletions] = await Promise.all([
    safe<any[]>(
      admin
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      []
    ),
    safe<any[]>(
      admin
        .from("bug_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      []
    ),
    safe<any[]>(
      admin
        .from("account_deletion_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(100),
      []
    ),
  ]);

  const userIds = Array.from(
    new Set([
      ...tickets.data.map((x: any) => x.user_id),
      ...bugs.data.map((x: any) => x.user_id),
      ...deletions.data.map((x: any) => x.user_id),
    ].filter(Boolean))
  );

  const profileMap = new Map<string, any>();
  if (userIds.length) {
    const { data } = await admin
      .from("profiles")
      .select("id,username,plan")
      .in("id", userIds);
    for (const row of data || []) profileMap.set(row.id, row);
  }

  const authMap = new Map<string, any>();
  for (const id of userIds.slice(0, 500)) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user) authMap.set(id, data.user);
  }

  function member(userId: string) {
    const profile = profileMap.get(userId) || {};
    const auth = authMap.get(userId) || {};
    return {
      id: userId,
      username:
        profile.username ||
        auth.user_metadata?.username ||
        auth.email?.split("@")[0] ||
        "Trader",
      email: auth.email || "",
      plan: String(profile.plan || "free").toLowerCase(),
    };
  }

  return NextResponse.json({
    available: {
      support_tickets: tickets.available,
      bug_reports: bugs.available,
      account_deletion_requests: deletions.available,
    },
    stats: {
      open_support: tickets.data.filter((x: any) =>
        ["open", "in_progress"].includes(String(x.status))
      ).length,
      open_bugs: bugs.data.filter((x: any) =>
        ["open", "investigating"].includes(String(x.status))
      ).length,
      pending_deletions: deletions.data.filter((x: any) =>
        ["pending", "processing"].includes(String(x.status))
      ).length,
      total:
        tickets.data.length + bugs.data.length + deletions.data.length,
    },
    items: [
      ...tickets.data.map((x: any) => ({
        kind: "support",
        id: x.id,
        user_id: x.user_id,
        member: member(x.user_id),
        title: x.subject,
        message: x.message,
        status: x.status,
        admin_reply: x.admin_reply || "",
        admin_note: x.admin_note || "",
        created_at: x.created_at,
        updated_at: x.updated_at,
      })),
      ...bugs.data.map((x: any) => ({
        kind: "bug",
        id: x.id,
        user_id: x.user_id,
        member: member(x.user_id),
        title: x.location,
        message: x.description,
        status: x.status,
        admin_note: x.admin_note || "",
        page_url: x.page_url || "",
        images: Array.isArray(x.images) ? x.images : [],
        created_at: x.created_at,
        updated_at: x.updated_at,
      })),
      ...deletions.data.map((x: any) => ({
        kind: "deletion",
        id: x.id,
        user_id: x.user_id,
        member: member(x.user_id),
        title: "Demande de suppression de compte",
        message: x.email_snapshot || "",
        status: x.status,
        admin_note: x.admin_note || "",
        created_at: x.requested_at,
        updated_at: x.handled_at || x.cancelled_at || x.requested_at,
      })),
    ].sort((a: any, b: any) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    ),
  });
}

export async function PATCH(request: Request) {
  const pcheck=await authenticateAdmin(request,"inbox_write");
  if("error" in pcheck)return NextResponse.json({error:pcheck.error},{status:pcheck.status});
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin, requester } = verified as any;
  const body = await request.json();

  const kind = String(body?.kind || "");
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  const adminNote = String(body?.admin_note || "").slice(0, 8000);
  const adminReply = String(body?.admin_reply || "").slice(0, 8000);

  if (!id || !["support", "bug", "deletion"].includes(kind)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  if (kind === "support") {
    const allowed = ["open", "in_progress", "answered", "resolved", "closed"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const payload: any = {
      status,
      admin_note: adminNote || null,
      assigned_admin_id: requester.id,
      updated_at: new Date().toISOString(),
    };

    if (adminReply) {
      payload.admin_reply = adminReply;
      payload.answered_at = new Date().toISOString();
    }

    if (status === "closed") payload.closed_at = new Date().toISOString();

    const { error } = await admin
      .from("support_tickets")
      .update(payload)
      .eq("id", id);

    if (error) throw error;
  }

  if (kind === "bug") {
    const allowed = ["open", "investigating", "resolved", "closed"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const payload: any = {
      status,
      admin_note: adminNote || null,
      assigned_admin_id: requester.id,
      updated_at: new Date().toISOString(),
    };

    if (status === "resolved" || status === "closed") {
      payload.resolved_at = new Date().toISOString();
    }

    const { error } = await admin
      .from("bug_reports")
      .update(payload)
      .eq("id", id);

    if (error) throw error;
  }

  if (kind === "deletion") {
    const allowed = ["pending", "processing", "resolved", "rejected", "cancelled"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const { error } = await admin
      .from("account_deletion_requests")
      .update({
        status,
        admin_note: adminNote || null,
        handled_by: requester.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
  }

  try {
    await admin.from("admin_action_logs").insert({
      admin_user_id: requester.id,
      target_user_id: body?.user_id || requester.id,
      action: `inbox_${kind}_${status}`,
      details: {
        item_id: id,
        note: adminNote || null,
        has_reply: Boolean(adminReply),
      },
    });
  } catch {}

  return NextResponse.json({ ok: true });
}
