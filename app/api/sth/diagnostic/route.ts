import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return Response.json(
        { diagnostic: "SESSION_NON_RECONNUE" },
        { status: 401, headers }
      );
    }

    const ids = (process.env.STH_PILOT_USER_IDS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    return Response.json({
      diagnostic: ids.includes(user.id)
        ? "COMPTE_AUTORISE"
        : "UUID_NON_AUTORISE",
      mon_uuid: user.id,
      liste_pilote_configuree: ids.length > 0,
      environnement: process.env.VERCEL_ENV || "inconnu"
    }, { headers });
  } catch {
    return Response.json(
      { diagnostic: "ERREUR_CONFIGURATION_AUTH" },
      { status: 500, headers }
    );
  }
}
