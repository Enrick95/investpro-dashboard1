import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { createCopierNotice, sendCopierEmail, sendCopierPush } from "@/lib/copier/notifications";

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request, "copier");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin.from("copier_master_removal_requests")
    .select("id,user_id,request_id,provider_master_id,status,admin_note,created_at,updated_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Impossible de charger les demandes de retrait. Applique d’abord la migration SQL." }, { status: 500 });

  const userIds = [...new Set((data || []).map((row) => row.user_id))];
  const requestIds = [...new Set((data || []).map((row) => row.request_id))];
  const [profilesResult, requestsResult] = await Promise.all([
    userIds.length ? auth.admin.from("profiles").select("id,username,plan").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    requestIds.length ? auth.admin.from("copier_account_requests").select("id,alias,platform,login,server,broker").in("id", requestIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const profiles = new Map((profilesResult.data || []).map((row: any) => [row.id, row]));
  const requests = new Map((requestsResult.data || []).map((row: any) => [String(row.id), row]));
  const authUsers = new Map<string, any>();
  await Promise.all(userIds.map(async (id) => {
    const { data: result } = await auth.admin.auth.admin.getUserById(id);
    if (result?.user) authUsers.set(id, result.user);
  }));

  return NextResponse.json({ requests: (data || []).map((row) => {
    const profile: any = profiles.get(row.user_id) || {};
    const user: any = authUsers.get(row.user_id) || {};
    const account: any = requests.get(String(row.request_id)) || {};
    return {
      ...row,
      account: { alias: account.alias || "Compte Master", platform: account.platform || "", login: account.login || "", server: account.server || "", broker: account.broker || "" },
      member: { username: profile.username || user.user_metadata?.username || user.email?.split("@")[0] || "Trader", email: user.email || "" },
    };
  }) });
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request, "copier_write");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const id = String(body?.id || "");
    const status = String(body?.status || "");
    const adminNote = String(body?.admin_note || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (!id || !["completed", "rejected"].includes(status)) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

    const { data: current, error: currentError } = await auth.admin.from("copier_master_removal_requests")
      .select("id,user_id,request_id,provider_master_id,status")
      .eq("id", id).maybeSingle();
    if (currentError || !current) return NextResponse.json({ error: "Demande de retrait introuvable." }, { status: 404 });
    if (current.status !== "pending" && current.status !== "processing") return NextResponse.json({ error: "Cette demande a déjà été traitée." }, { status: 409 });

    if (status === "completed") {
      // This is deliberately an admin confirmation after the Master has been detached in the copy system.
      const { data: completed, error } = await auth.admin.rpc("investpro_complete_master_removal", {
        p_request_id: id,
        p_admin_user_id: auth.user.id,
      });
      if (error) return NextResponse.json({ error: "Impossible de confirmer le retrait. Vérifie que la migration SQL est appliquée." }, { status: 500 });
      if (!completed) return NextResponse.json({ error: "Cette demande a déjà été traitée." }, { status: 409 });
    } else {
      const { data: updated, error } = await auth.admin.from("copier_master_removal_requests").update({
        status: "rejected", admin_note: adminNote || null, processed_by: auth.user.id, updated_at: new Date().toISOString(),
      }).eq("id", id).in("status", ["pending", "processing"]).select("id").maybeSingle();
      if (error || !updated) return NextResponse.json({ error: "Impossible de refuser cette demande." }, { status: 409 });
    }

    const { data: account } = await auth.admin.from("copier_account_requests").select("alias").eq("id", current.request_id).maybeSingle();
    const alias = account?.alias || "votre compte Master";
    const eventKey = `copier-master-removal-result-${id}-${status}`;
    const title = status === "completed" ? "Compte Master retiré" : "Demande de retrait refusée";
    const message = status === "completed"
      ? `Le compte Master ${alias} a été retiré de votre espace InvestPro Copier.`
      : `La demande de retrait de ${alias} a été refusée.${adminNote ? ` Motif : ${adminNote}` : ""}`;
    try {
      const notice = await createCopierNotice(auth.admin, { eventKey, userId: current.user_id, title, message, href: "/dashboard/copieur" });
      if (notice.inserted) {
        await Promise.all([
          sendCopierEmail(auth.admin, eventKey, current.user_id, title, message),
          sendCopierPush(auth.admin, eventKey, current.user_id, title, message),
        ]);
      }
    } catch (error) { console.error("[copier-master-removals] notification client non envoyée", error); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[copier-master-removals][PATCH]", error);
    return NextResponse.json({ error: "Impossible de traiter la demande." }, { status: 500 });
  }
}
