import { authenticateAdmin } from "@/lib/admin/permissions";
import { canAdmin } from "@/lib/admin/permissions";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { decryptCopierPassword } from "@/lib/copier/requestCrypto";
import { createCopierNotice, sendCopierEmail, sendCopierPush } from "@/lib/copier/notifications";
import { serverCatalog } from "@/lib/metasync/server-catalog";
import { seal } from "@/lib/metasync/hosted";
import { database, digest } from "@/lib/metasync/server";

async function startApprovedMasterSync(admin: any, row: any): Promise<"started" | "existing" | "failed" | "not_requested"> {
  if (row.metasync_sync_consent !== true) return "not_requested";
  if (process.env.VERCEL_ENV === "preview" || !/^[a-f0-9]{64}$/.test(process.env.METASYNC_HOSTED_ENCRYPTION_KEY ?? "") || !/^[a-f0-9]{64}$/.test(process.env.METASYNC_HOSTED_WORKER_TOKEN ?? "")) return "failed";

  try {
    const catalog = await serverCatalog();
    const platform = String(row.platform || "").toUpperCase();
    const server = String(row.server || "").trim();
    const broker = catalog.find((candidate) => candidate.platform === platform && candidate.server.trim().toLowerCase() === server.toLowerCase());
    if (!broker || !/^[A-Z]{3}$/.test(String(row.metasync_currency || "")) || !["real", "demo", "prop"].includes(String(row.metasync_account_type || ""))) return "failed";

    const { data: existing, error: lookupError } = await admin.from("investpro_mt_connections")
      .select("id").eq("user_id", row.user_id).eq("platform", platform).eq("login", String(row.login)).eq("server", server).limit(1).maybeSingle();
    if (lookupError) return "failed";
    if (existing) return "existing";

    let password = decryptCopierPassword(String(row.password_cipher || ""));
    try {
      const { error } = await database().rpc("investpro_hosted_pair_auto", {
        p_user: row.user_id,
        p_platform: broker.platform,
        p_login: String(row.login).trim(),
        p_server: broker.server,
        p_currency: row.metasync_currency,
        p_type: row.metasync_account_type,
        p_broker: broker.id,
        p_secret: seal(password, String(row.user_id)),
        p_hash: digest(randomBytes(32).toString("hex")),
      });
      return error ? "failed" : "started";
    } finally {
      password = "";
    }
  } catch {
    // Activation must remain successful if the optional balance sync cannot start.
    return "failed";
  }
}

async function verifyAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishable || !service) {
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

  const auth = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!await canAdmin(user.id, "copier")) {
    return {
      response: NextResponse.json(
        { error: "Accès administrateur refusé." },
        { status: 403 }
      ),
    };
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, requester: user };
}

export async function GET(request: Request) {
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin } = verified as any;

  const { data, error } = await admin
    .from("copier_account_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: "Impossible de charger les demandes." },
      { status: 500 }
    );
  }

  const userIds: string[] = Array.from(
    new Set<string>(
      (data || [])
        .map((row: any) => String(row.user_id || ""))
        .filter((id: string) => Boolean(id))
    )
  );

  const profileMap = new Map<string, any>();
  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,username,plan")
      .in("id", userIds);

    for (const row of profiles || []) profileMap.set(row.id, row);
  }

  const authMap = new Map<string, any>();
  for (const id of userIds.slice(0, 300)) {
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    if (authUser?.user) authMap.set(id, authUser.user);
  }

  const { data: associations } = await admin.from("copier_master_ownership")
    .select("request_id,provider_master_id");
  const associationMap = new Map((associations || []).map((m: any) => [m.request_id, m.provider_master_id]));
  const requests = (data || []).map((row: any) => {
    const profile = profileMap.get(row.user_id) || {};
    const auth = authMap.get(row.user_id) || {};

    return {
      id: row.id,
      user_id: row.user_id,
      provider_user_id: row.provider_user_id,
      provider_master_id: associationMap.get(row.id) || "",
      alias: row.alias,
      broker: row.broker || "",
      platform: row.platform,
      login: row.login,
      server: row.server,
      note: row.note || "",
      status: row.status,
      admin_note: row.admin_note || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      activated_at: row.activated_at,
      member: {
        username:
          profile.username ||
          auth.user_metadata?.username ||
          auth.email?.split("@")[0] ||
          "Trader",
        email: auth.email || "",
        plan: String(profile.plan || "free").toLowerCase(),
      },
    };
  });

  return NextResponse.json({
    pending_count: requests.filter((x: any) =>
      ["pending", "processing"].includes(String(x.status))
    ).length,
    requests,
  });
}

export async function POST(request: Request) {
  const pcheck=await authenticateAdmin(request,"copier_write");
  if("error" in pcheck)return NextResponse.json({error:pcheck.error},{status:pcheck.status});
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin } = verified as any;
  const body = await request.json();

  if (String(body?.action || "") === "assign_master") {
    const requestId = String(body?.id || "");
    const masterId = String(body?.master_id || "").trim();
    if (!requestId || !masterId || masterId.length > 200)
      return NextResponse.json({ error: "Identifiant maître invalide." }, { status: 400 });
    const { data: reqRow, error: reqError } = await admin.from("copier_account_requests")
      .select("id,user_id,status").eq("id", requestId).maybeSingle();
    if (reqError || !reqRow) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    if (!["pending", "processing"].includes(String(reqRow.status))) return NextResponse.json({ error: "Cette demande ne peut plus être associée." }, { status: 409 });
    const { error } = await admin.from("copier_master_ownership").upsert(
      { provider_master_id: masterId, user_id: reqRow.user_id, request_id: reqRow.id },
      { onConflict: "request_id" }
    );
    if (error) return NextResponse.json({ error: "Association refusée : Master déjà attribué ou migration SQL manquante." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (String(body?.action || "") !== "reveal") {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const id = String(body?.id || "");
  const { data, error } = await admin
    .from("copier_account_requests")
    .select("password_cipher")
    .eq("id", id)
    .single();

  if (error || !data?.password_cipher) {
    return NextResponse.json(
      { error: "Demande introuvable." },
      { status: 404 }
    );
  }

  try {
    return NextResponse.json({
      password: decryptCopierPassword(data.password_cipher),
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de déchiffrer le mot de passe." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const pcheck=await authenticateAdmin(request,"copier_write");
  if("error" in pcheck)return NextResponse.json({error:pcheck.error},{status:pcheck.status});
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin, requester } = verified as any;
  const body = await request.json();

  const id = String(body?.id || "");
  const status = String(body?.status || "");
  const adminNote = String(body?.admin_note || "").trim();

  if (!id || !["pending", "processing", "activated", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  const { data: current, error: currentError } = await admin
    .from("copier_account_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (currentError || !current) {
    return NextResponse.json(
      { error: "Demande introuvable." },
      { status: 404 }
    );
  }

  if (status === "activated") {
    const { data: ownership, error: ownershipError } = await admin
      .from("copier_master_ownership")
      .select("provider_master_id")
      .eq("request_id", current.id)
      .eq("user_id", current.user_id)
      .maybeSingle();
    if (ownershipError || !ownership?.provider_master_id) {
      return NextResponse.json(
        { error: "Associe d’abord le véritable compte Master à cette demande. Le compte ne sera annoncé comme actif qu’après cette étape." },
        { status: 409 }
      );
    }
  }

  const patch: Record<string, unknown> = {
    status,
    admin_note: adminNote || null,
    handled_by: requester.id,
    updated_at: new Date().toISOString(),
  };

  if (status === "activated") {
    patch.activated_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("copier_account_requests")
    .update(patch)
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Impossible de mettre à jour la demande." },
      { status: 500 }
    );
  }

  const syncOutcome = status === "activated" && current.status !== "activated"
    ? await startApprovedMasterSync(admin, current)
    : "not_requested";

  if (current.status !== status && ["processing", "activated", "rejected"].includes(status)) {
    const alias = String(current.alias || "votre compte").slice(0, 80);
    const title = status === "activated"
      ? "Votre compte Master est activé"
      : status === "rejected"
        ? "Votre demande de compte Master a été refusée"
        : "Votre demande de compte Master est prise en charge";
    const reason = String(adminNote || "").replace(/[<>]/g, "").replace(/\s+/g, " ").slice(0, 240);
    const message = status === "activated"
      ? `Bonne nouvelle ! Votre compte Master ${alias} a été activé. Vous pouvez le retrouver dans InvestPro Copier et configurer vos comptes receveurs.${syncOutcome === "started" ? " La synchronisation du solde MetaSync démarre maintenant ; les montants apparaîtront après la première synchronisation." : syncOutcome === "existing" ? " Une connexion MetaSync existe déjà pour ce compte ; elle sera réutilisée pour afficher le solde." : syncOutcome === "failed" ? " La synchronisation automatique du solde n’a pas pu démarrer. Ouvre InvestPro Copier et lance MetaSync depuis les réglages du Master." : ""}`
      : status === "rejected"
        ? `Votre demande pour le compte ${alias} n’a pas pu être acceptée.${reason ? ` Motif : ${reason}` : " Contactez notre équipe pour connaître les étapes à suivre."}`
        : `Notre équipe traite actuellement votre demande pour le compte ${alias}. Vous recevrez une notification quand la vérification sera terminée.`;
    const eventKey = `copier-master-${status}-${current.id}`;
    try {
      await createCopierNotice(admin, {
        eventKey,
        userId: current.user_id,
        title,
        message,
      });
    } catch (noticeError) {
      console.error("[copier-master] notification non enregistrée", noticeError);
    }
    const emailResult = await sendCopierEmail(admin, eventKey, current.user_id, title, message);
    if (!emailResult.sent && emailResult.reason !== "email_not_configured") {
      console.error("[copier-master] e-mail non envoyé", emailResult.reason);
    }
    const pushResult = await sendCopierPush(admin, eventKey, current.user_id, title, message);
    if (!pushResult.sent && !["push_not_configured", "no_active_subscription"].includes(pushResult.reason || "")) console.error("[copier-master] push non envoyé", pushResult.reason);
  }
  return NextResponse.json({
    ok: true,
    metasync: syncOutcome,
    message:
      status === "activated"
        ? syncOutcome === "started"
          ? "Compte activé et synchronisation MetaSync démarrée. Le solde apparaîtra après la première synchronisation."
          : syncOutcome === "failed"
            ? "Compte activé. La synchronisation MetaSync automatique n’a pas pu démarrer ; le membre pourra la lancer depuis InvestPro Copier."
            : "Compte marqué actif : il est maintenant visible dans InvestPro Copier du membre."
        : "Demande mise à jour.",
  });
}
