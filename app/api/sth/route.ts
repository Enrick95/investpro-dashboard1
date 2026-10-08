import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as databaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { partnerCall, lotValue } from "@/lib/sth/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const messages: Record<string, string> = {
  NOT_CONFIGURED: "Connexion partenaire non configurée.",
  UNKNOWN_RESULT: "Résultat non confirmé. Vérifiez le statut avant toute nouvelle action ; la demande a pu être exécutée.",
  BUSY: "Une opération est déjà en cours. Patientez puis vérifiez le statut.",
  LICENCE: "Licence partenaire à faire vérifier auprès de Social Trade Hub.",
  CAPACITY: "Capacité de la licence atteinte.",
  SERVER: "Serveur MetaTrader introuvable. Vérifiez son nom exact.",
  PROVIDER_REJECTED: "Demande refusée par Social Trade Hub. Vérifiez le compte et les paramètres.",
  LOTS: "Volume invalide ou supérieur à la limite du pilote.",
  INPUT: "Paramètres invalides.",
  DB: "La connexion base de données du copieur est indisponible.",
  RECEIVER: "Compte receveur introuvable.",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function permission() {
  const c = await createClient();
  const { data: { user } } = await c.auth.getUser();
  if (!user) return null;
  return (process.env.STH_PILOT_USER_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .includes(user.id)
    ? user
    : null;
}

function enabled() {
  return process.env.STH_ENABLED === "true" && process.env.VERCEL_ENV !== "preview";
}

function dbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error("DB");
  return databaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function providerUserFor(db: SupabaseClient, ownerId: string, receiverId?: string | null) {
  if (!receiverId || receiverId === "legacy") return ownerId;
  const { data, error } = await db
    .from("copier_receivers")
    .select("id,provider_user_id")
    .eq("id", receiverId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error || !data?.provider_user_id) throw Error("RECEIVER");
  return String(data.provider_user_id);
}

export async function GET(req: Request) {
  try {
    const user = await permission();
    if (!user) return json({ error: "Copieur bientôt disponible. Accès pilote réservé." }, 403);
    if (!enabled()) return json({ enabled: false, message: "Intégration préparée. Le pilote doit être activé sur le site principal." });

    const db = dbClient();
    const url = new URL(req.url);
    const receiverId = url.searchParams.get("receiverId");
    const providerUserId = await providerUserFor(db, user.id, receiverId);
    const status = await partnerCall("get-user-status", providerUserId);

    return json({
      enabled: true,
      status,
      receiverId: receiverId || "legacy",
      maxLots: Number(process.env.STH_MAX_LOTS || "0.10"),
      accountLimit: null,
    });
  } catch (e) {
    return json({ error: messages[(e as Error).message] || "Connexion indisponible." }, 503);
  }
}

export async function POST(req: Request) {
  let db: SupabaseClient | undefined;
  let lock: string | undefined;
  let createdReceiverId: string | undefined;

  try {
    const user = await permission();
    if (!user) return json({ error: "Accès pilote réservé." }, 403);
    if (!enabled()) return json({ error: "Pilote désactivé sur cet environnement." }, 403);

    const origin = process.env.STH_SITE_ORIGIN;
    if (
      !origin ||
      new URL(origin).origin !== origin ||
      !origin.startsWith("https://") ||
      req.headers.get("origin") !== origin
    ) {
      return json({ error: "Origine refusée." }, 403);
    }

    const raw = await req.text();
    if (raw.length > 16000) throw Error("INPUT");
    let b: any;
    try { b = JSON.parse(raw); } catch { throw Error("INPUT"); }

    db = dbClient();
    let endpoint = "";
    let payload: Record<string, unknown> = {};
    let providerUserId = user.id;
    let receiverId = typeof b.receiverId === "string" ? b.receiverId : null;

    if (b.action === "connect") {
      if (
        b.consent !== true ||
        typeof b.alias !== "string" || !b.alias.trim() || b.alias.length > 80 ||
        typeof b.login !== "string" || !/^\d{1,15}$/.test(b.login) ||
        typeof b.password !== "string" || !b.password || b.password.length > 256 ||
        typeof b.server !== "string" || !b.server.trim() || b.server.length > 200 ||
        !["MT4", "MT5"].includes(b.platform)
      ) throw Error("INPUT");

      if (receiverId) {
        providerUserId = await providerUserFor(db, user.id, receiverId);
      } else {
        const providerId = randomUUID();
        const { data, error } = await db
          .from("copier_receivers")
          .insert({
            user_id: user.id,
            provider_user_id: providerId,
            alias: b.alias.trim(),
            platform: b.platform,
            login: b.login,
            server: b.server.trim(),
            status: "connected",
            is_primary: false,
            config: { risk_mode: "fixed" },
          })
          .select("id,provider_user_id")
          .single();
        if (error || !data) throw Error("DB");
        createdReceiverId = String(data.id);
        receiverId = createdReceiverId;
        providerUserId = String(data.provider_user_id);
      }

      const defaultLots = lotValue(process.env.STH_DEFAULT_LOTS || "0.01");
      endpoint = "connect-customer-copier";
      payload = {
        MetatraderLogin: Number(b.login),
        MetatraderPassword: b.password,
        MetatraderServer: b.server.trim(),
        IsMT4: b.platform === "MT4",
        Lots: defaultLots,
      };
    } else if (b.action === "masters") {
      if (b.consent !== true || !Array.isArray(b.masters) || b.masters.length > 50) throw Error("INPUT");
      providerUserId = await providerUserFor(db, user.id, receiverId);
      const ids = new Set<string>();
      payload = {
        MasterAccounts: b.masters.map((m: any) => {
          if (typeof m.id !== "string" || !m.id || m.id.length > 200 || ids.has(m.id)) throw Error("INPUT");
          ids.add(m.id);
          return { id: m.id, lots: lotValue(m.lots) };
        }),
      };
      endpoint = "join-master-account";
    } else if (b.action === "disconnect" && b.consent === true) {
      providerUserId = await providerUserFor(db, user.id, receiverId);
      endpoint = "disconnect";
    } else {
      throw Error("INPUT");
    }

    const token = randomUUID();
    const acquired = await db.rpc("investpro_sth_acquire_lock", { p_token: token });
    if (acquired.error) throw Error("DB");
    if (!acquired.data) throw Error("BUSY");
    lock = token;

    const status = await partnerCall(endpoint, providerUserId, payload);

    if (receiverId && receiverId !== "legacy") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.action === "connect") {
        patch.status = "connected";
        patch.last_connected_at = new Date().toISOString();
      }
      if (b.action === "disconnect") patch.status = "paused";
      await db.from("copier_receivers").update(patch).eq("id", receiverId).eq("user_id", user.id);
    }

    return json({
      status,
      receiverId: receiverId || "legacy",
      message: "État confirmé par Social Trade Hub.",
    });
  } catch (e) {
    if (createdReceiverId && db) {
      try {
        await db.from("copier_receivers").update({ status: "error" }).eq("id", createdReceiverId);
      } catch {}
    }
    if ((e as Error).message === "UNKNOWN_RESULT") lock = undefined;
    return json({ error: messages[(e as Error).message] || "Connexion indisponible." }, 400);
  } finally {
    if (db && lock) {
      try { await db.rpc("investpro_sth_release_lock", { p_token: lock }); } catch {}
    }
  }
}
