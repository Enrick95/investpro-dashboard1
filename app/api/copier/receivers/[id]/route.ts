import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Appeler seulement après déconnexion confirmée du moteur de copie.
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: "Suppression indisponible : configuration serveur manquante." }, { status: 503 });
    const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: receiver, error: readError } = await admin.from("copier_receivers")
      .select("id,status,user_id")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (readError) return NextResponse.json({ error: "Impossible de vérifier le compte receveur." }, { status: 500 });
    if (!receiver) return NextResponse.json({ error: "Compte receveur introuvable." }, { status: 404 });
    // La route moteur /api/sth met le compte en pause uniquement après confirmation du partenaire.
    if (receiver.status !== "paused") return NextResponse.json({ error: "Déconnecte d’abord ce receveur du moteur de copie." }, { status: 409 });
    const { error: deleteError } = await admin.from("copier_receivers")
      .delete().eq("id", id).eq("user_id", user.id).eq("status", "paused");
    if (deleteError) return NextResponse.json({ error: "La base a refusé la suppression. Le receveur est déconnecté ; aucun autre compte n’a été modifié." }, { status: 500 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Suppression indisponible. Réessaie après avoir vérifié l’état du receveur." }, { status: 500 });
  }
}
