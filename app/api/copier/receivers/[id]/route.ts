import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { partnerCall } from "@/lib/sth/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function result(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

// La fonction RPC existe en SQL, mais ce client Supabase ne fournit pas
// de schéma TypeScript généré : typer explicitement uniquement ces deux appels.
type LockRpcClient = {
  rpc: (name: "investpro_sth_acquire_lock" | "investpro_sth_release_lock", args: { p_token: string }) => Promise<{ data: boolean | null; error: unknown }>;
};
function lockRpc(client: ReturnType<typeof createAdminClient>, name: "investpro_sth_acquire_lock" | "investpro_sth_release_lock", token: string) {
  return (client as unknown as LockRpcClient).rpc(name, { p_token: token });
}

// Le propriétaire peut gérer ses receveurs indépendamment des droits pilote.
// Une suppression n'est jamais considérée comme réussie avant confirmation du partenaire.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  let admin: ReturnType<typeof createAdminClient> | undefined;
  let lock: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return result("Non authentifié.", 401);

    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(request.url).origin;
    if (!origin || origin !== expectedOrigin) return result("Origine non autorisée.", 403);

    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return result("Identifiant de receveur invalide.", 400);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return result("Configuration de la base indisponible.", 503);
    admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: receiver, error: readError } = await admin.from("copier_receivers")
      .select("id,user_id,provider_user_id,status")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (readError) return result("Impossible de vérifier le compte receveur.", 500);
    if (!receiver) return result("Compte receveur introuvable ou déjà supprimé.", 404);
    // Le schéma Supabase n'est pas typé ici : préciser la forme vérifiée de cette ligne.
    const receiverRow = receiver as unknown as {
      id: string;
      user_id: string;
      provider_user_id: string | null;
      status: string | null;
    };
    if (!receiverRow.provider_user_id) return result("Identifiant moteur manquant : contacte le support.", 409);

    // Ne jamais tenter une déconnexion via le serveur Preview.
    if (process.env.STH_ENABLED !== "true" || process.env.VERCEL_ENV === "preview") {
      return result("Déconnexion indisponible en Preview. Teste sur le domaine de production.", 503);
    }

    lock = randomUUID();
    const acquired = await lockRpc(admin, "investpro_sth_acquire_lock", lock);
    if (acquired.error) return result("Verrou du moteur indisponible.", 503);
    if (!acquired.data) return result("Une opération de copie est en cours. Réessaie dans quelques instants.", 409);

    // Appel partenaire côté serveur : aucun identifiant ou licence exposé au navigateur.
    const status = await partnerCall("disconnect", String(receiverRow.provider_user_id));
    if (status.isTradingAccountConnected) {
      return result("Le moteur indique encore ce receveur connecté. Suppression annulée.", 409);
    }

    const { data: removed, error: deleteError } = await admin.from("copier_receivers")
      .delete().eq("id", id).eq("user_id", user.id).select("id");
    if (deleteError || !removed || removed.length !== 1) {
      return result("Déconnexion confirmée, mais la suppression locale a échoué. Réessaie ou contacte le support.", 500);
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "BUSY") return result("Une opération est déjà en cours. Réessaie.", 409);
    if (code === "NOT_CONFIGURED") return result("Connexion partenaire non configurée.", 503);
    if (code === "UNKNOWN_RESULT") return result("Résultat du moteur incertain. Vérifie la connexion avant de réessayer.", 503);
    return result("Le moteur n'a pas confirmé la déconnexion. Aucun compte supprimé.", 502);
  } finally {
    if (admin && lock) {
      try { await lockRpc(admin, "investpro_sth_release_lock", lock); } catch {}
    }
  }
}
