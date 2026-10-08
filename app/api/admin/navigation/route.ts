import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { defaultVisibility, navigationDefinitions } from "@/lib/navigation/config";

function adminIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !service) return { error: "Configuration Supabase incomplète.", status: 500 } as const;

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "Non authentifié.", status: 401 } as const;

  const publicClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await publicClient.auth.getUser(token);
  if (error || !user) return { error: "Session invalide.", status: 401 } as const;
  if (!adminIds().includes(user.id)) return { error: "Accès administrateur refusé.", status: 403 } as const;

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin, user } as const;
}

export async function GET(request: Request) {
  const auth = await getAdmin(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("investpro_navigation_settings")
    .select("key,visible,updated_at")
    .order("key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visibility = { ...defaultVisibility() } as Record<string, boolean>;
  for (const row of data || []) visibility[row.key] = Boolean(row.visible);

  return NextResponse.json({ definitions: navigationDefinitions, visibility });
}

export async function POST(request: Request) {
  const auth = await getAdmin(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null) as { key?: string; visible?: boolean } | null;
  const definition = navigationDefinitions.find((item) => item.key === body?.key);
  if (!definition || typeof body?.visible !== "boolean") {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  // Les accès essentiels ne peuvent pas être coupés depuis l'admin.
  if (["dashboard", "profile"].includes(definition.key) && body.visible === false) {
    return NextResponse.json({ error: "Cette rubrique essentielle doit rester visible." }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("investpro_navigation_settings")
    .upsert({
      key: definition.key,
      visible: body.visible,
      label: definition.label,
      group_name: definition.group,
      sort_order: definition.order,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, key: definition.key, visible: body.visible });
}
