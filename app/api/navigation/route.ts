import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { defaultVisibility, navigationDefinitions } from "@/lib/navigation/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const defaults = defaultVisibility();
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) return NextResponse.json({ visibility: defaults });

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin
      .from("investpro_navigation_settings")
      .select("key,visible");

    if (error) return NextResponse.json({ visibility: defaults });

    const visibility = { ...defaults } as Record<string, boolean>;
    for (const row of data || []) {
      if (navigationDefinitions.some((item) => item.key === row.key)) {
        visibility[row.key] = Boolean(row.visible);
      }
    }

    return NextResponse.json({ visibility }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ visibility: defaults });
  }
}
