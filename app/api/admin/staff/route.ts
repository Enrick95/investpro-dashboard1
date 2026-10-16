import { NextResponse } from "next/server";
import { authenticateAdmin, PERMISSIONS, isOwner } from "@/lib/admin/permissions";
import { normalizeStaffUserId, staffSearchMatch, validateStaffSearch, type StaffSearchMatch } from "@/lib/admin/staff-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Authorization, Cookie" } });
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request, "staff");
  if ("error" in auth) return reply({ error: auth.error }, auth.status);
  if (!auth.access.owner) return reply({ error: "La gestion de l’équipe est réservée au propriétaire." }, 403);
  const search = new URL(request.url).searchParams;
  try {
    if (search.has("search")) {
      if (search.getAll("search").length !== 1) return reply({ error: "Une seule recherche est autorisée." }, 400);
      const validation = validateStaffSearch(search.get("search"));
      if (!validation.ok) return reply({ error: validation.error }, 400);
      const matches = new Map<string, StaffSearchMatch>();
      // Reuse the owner member listing's Auth + profiles schema. Only ten
      // whitelisted matches leave this handler, never raw Auth records.
      for (let page = 1; page <= 20 && matches.size < 10; page++) {
        const { data, error } = await auth.admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const users = data?.users || [];
        const ids = users.map(user => normalizeStaffUserId(user.id)).filter((id): id is string => Boolean(id));
        const profiles = ids.length ? await auth.admin.from("profiles").select("id,username").in("id", ids) : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const names = new Map<string, unknown>((profiles.data || []).map(row => [String(row.id).toLowerCase(), row.username]));
        for (const user of users) {
          const match = staffSearchMatch(user, names.get(String(user.id).toLowerCase()), validation.query, isOwner(user.id));
          if (match) matches.set(match.user_id, match);
          if (matches.size >= 10) break;
        }
        if (users.length < 1000) break;
      }
      return reply({ matches: [...matches.values()] });
    }
    const { data, error } = await auth.admin.from("admin_staff_permissions").select("user_id,permissions,enabled,updated_at").order("updated_at", { ascending: false });
    if (error) return reply({ error: "Migration staff manquante ou impossible à lire" }, 503);
    return reply({ items: data || [] });
  } catch { return reply({ error: "La recherche de membres est momentanément indisponible." }, 503); }
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request, "staff");
  if ("error" in auth) return reply({ error: auth.error }, auth.status);
  if (!auth.access.owner) return reply({ error: "La gestion de l’équipe est réservée au propriétaire." }, 403);
  const body = await request.json().catch(() => ({}));
  const userId = normalizeStaffUserId(body?.user_id);
  if (!userId) return reply({ error: "Sélectionnez un membre dans la recherche. Un pseudo ne peut pas remplacer son identifiant de compte (UUID)." }, 400);
  if (isOwner(userId)) return reply({ error: "Ce compte est un propriétaire protégé. Ses droits ne peuvent pas être modifiés depuis l’équipe." }, 400);
  const { data: target, error: targetError } = await auth.admin.auth.admin.getUserById(userId);
  if (targetError || !target?.user) return reply({ error: "Utilisateur introuvable" }, 404);
  const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions.filter((value: unknown): value is string => typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value)))] : [];
  if (permissions.length !== body.permissions?.length) return reply({ error: "Permission non reconnue" }, 400);
  const enabled = body.enabled === true;
  const { error } = await auth.admin.from("admin_staff_permissions").upsert({ user_id: userId, permissions, enabled, updated_at: new Date().toISOString(), updated_by: auth.user.id });
  if (error) return reply({ error: "Enregistrement impossible" }, 503);
  await auth.admin.from("admin_staff_audit").insert({ actor_id: auth.user.id, target_user_id: userId, action: enabled ? "permissions_updated" : "access_revoked", permissions });
  return reply({ ok: true });
}
