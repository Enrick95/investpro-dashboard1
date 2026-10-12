
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { encryptCopierPassword } from "@/lib/copier/requestCrypto";
import { copierAdminUserIds, createCopierNotice, sendCopierEmail, sendCopierPush } from "@/lib/copier/notifications";

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishable || !service) {
    throw new Error("Configuration Supabase serveur incomplète.");
  }

  return {
    auth: createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    admin: createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function userFrom(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  const { auth } = clients();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

function publicRow(row: any) {
  return {
    id: row.id,
    alias: row.alias,
    broker: row.broker || "",
    platform: row.platform,
    login: row.login,
    server: row.server,
    status: row.status,
    note: row.note || "",
    admin_note: row.status === "rejected"
      ? String(row.admin_note || "").replace(/[<>]/g, "").replace(/\s+/g, " ").slice(0, 240)
      : "",
    provider_user_id: row.provider_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    activated_at: row.activated_at,
  };
}

export async function GET(request: Request) {
  try {
    const user = await userFrom(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const { admin } = clients();
    const { data, error } = await admin
      .from("copier_account_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const requestIds = (data || []).map((row: any) => String(row.id));
    const { data: ownershipRows, error: ownershipError } = requestIds.length
      ? await admin.from("copier_master_ownership").select("request_id,provider_master_id").eq("user_id", user.id).in("request_id", requestIds)
      : { data: [], error: null };
    if (ownershipError) console.error("[copier-request][GET] master ownership indisponible", ownershipError.message);
    const masterByRequest = new Map((ownershipRows || []).map((row: any) => [String(row.request_id), String(row.provider_master_id)]));
    const { data: removals, error: removalError } = await admin.from("copier_master_removal_requests")
      .select("request_id,provider_master_id,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    const removalByProvider = new Map<string, string>();
    const removalByAccount = new Map<string, { status: string; providerId: string }>();
    if (removalError) console.warn("[copier-request][GET] migration de retrait Master non appliquée");
    else {
      const requestsById = new Map((data || []).map((row: any) => [String(row.id), row]));
      for (const row of removals || []) {
        const providerId = String(row.provider_master_id);
        if (!removalByProvider.has(providerId)) removalByProvider.set(providerId, String(row.status));
        const original = requestsById.get(String(row.request_id));
        if (original) {
          const accountKey = `${original.platform}:${original.login}:${String(original.server).trim().toLowerCase()}`;
          if (!removalByAccount.has(accountKey)) removalByAccount.set(accountKey, { status: String(row.status), providerId });
        }
      }
    }

    return NextResponse.json({
      requests: (data || []).map((row: any) => {
        const ownedProviderId = masterByRequest.get(String(row.id)) || "";
        const accountKey = `${row.platform}:${row.login}:${String(row.server).trim().toLowerCase()}`;
        const historicalRemoval = removalByAccount.get(accountKey);
        const removalStatus = ownedProviderId
          ? removalByProvider.get(ownedProviderId) || ""
          : historicalRemoval?.status || "";
        return {
          ...publicRow(row),
          provider_master_id: ownedProviderId || (removalStatus === "completed" ? historicalRemoval?.providerId || "" : ""),
          removal_status: removalStatus,
        };
      }),
    });
  } catch (error) {
    console.error("[copier-request][GET]", error);
    return NextResponse.json(
      { error: "Impossible de charger les demandes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await userFrom(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const body = await request.json();

    if (body?.action === "request_removal") {
      const requestId = String(body?.requestId || "");
      if (!requestId || requestId.length > 100) return NextResponse.json({ error: "Compte Master invalide." }, { status: 400 });
      const { admin } = clients();
      const { data: selected, error: selectedError } = await admin.from("copier_account_requests")
        .select("id,alias,platform,login,server,status").eq("id", requestId).eq("user_id", user.id).maybeSingle();
      if (selectedError || !selected || selected.status !== "activated") return NextResponse.json({ error: "Ce compte Master n’est pas disponible pour un retrait." }, { status: 404 });

      const { data: matchingRequests, error: matchingError } = await admin.from("copier_account_requests")
        .select("id").eq("user_id", user.id).eq("platform", selected.platform).eq("login", selected.login).eq("server", selected.server).eq("status", "activated");
      if (matchingError) throw matchingError;
      const matchingIds = (matchingRequests || []).map((row: any) => String(row.id));
      const { data: ownership, error: ownershipError } = await admin.from("copier_master_ownership")
        .select("request_id,provider_master_id").eq("user_id", user.id).in("request_id", matchingIds);
      if (ownershipError || !ownership?.length) return NextResponse.json({ error: "Le compte Master n’est plus associé à cet espace." }, { status: 409 });
      const requestByProvider = new Map<string, string>();
      for (const row of ownership) requestByProvider.set(String(row.provider_master_id), String(row.request_id));
      const providerIds = [...requestByProvider.keys()];
      const { data: existing, error: existingError } = await admin.from("copier_master_removal_requests")
        .select("provider_master_id").eq("user_id", user.id).in("provider_master_id", providerIds).in("status", ["pending", "processing"]);
      if (existingError) return NextResponse.json({ error: "Le retrait Master n’est pas encore configuré. Contacte l’équipe InvestPro." }, { status: 503 });
      const alreadyPending = new Set((existing || []).map((row: any) => String(row.provider_master_id)));
      const toInsert = providerIds.filter((id) => !alreadyPending.has(id)).map((id) => ({ user_id: user.id, request_id: requestByProvider.get(id), provider_master_id: id }));
      if (!toInsert.length) return NextResponse.json({ error: "Une demande de retrait est déjà en cours pour ce compte." }, { status: 409 });
      const { data: removalRows, error: insertError } = await admin.from("copier_master_removal_requests").insert(toInsert).select("id,provider_master_id");
      if (insertError || !removalRows?.length) throw insertError || new Error("Removal request not recorded");

      const eventKey = `copier-master-removal-${removalRows[0].id}`;
      const title = "Demande de retrait Master reçue";
      const message = `La demande de retrait de ${selected.alias} a été transmise à l’équipe InvestPro. Le compte restera associé jusqu’à la confirmation du retrait.`;
      try { await createCopierNotice(admin, { eventKey, userId: user.id, title, message }); }
      catch (noticeError) { console.error("[copier-request] notification de retrait non enregistrée", noticeError); }
      for (const adminId of await copierAdminUserIds(admin)) {
        for (const removal of removalRows) {
          try { await createCopierNotice(admin, { eventKey: `copier-master-removal-admin-${removal.id}-${adminId}`, userId: adminId, title: "Demande de retrait d’un compte Master", message: `${selected.alias} · ${selected.platform} ${selected.login} · ${selected.server}`, href: "/dashboard/admin/copieur" }); }
          catch (noticeError) { console.error("[copier-request] alerte admin de retrait non enregistrée", noticeError); }
        }
      }
      const emailResult = await sendCopierEmail(admin, eventKey, user.id, title, message);
      if (!emailResult.sent && emailResult.reason !== "email_not_configured") console.error("[copier-request] e-mail de retrait non envoyé", emailResult.reason);
      const pushResult = await sendCopierPush(admin, eventKey, user.id, title, message);
      if (!pushResult.sent && !["push_not_configured", "no_active_subscription"].includes(pushResult.reason || "")) console.error("[copier-request] push de retrait non envoyée", pushResult.reason);
      return NextResponse.json({ ok: true, message: "Ta demande de retrait est envoyée. Le Master restera actif jusqu’à sa vérification par l’équipe InvestPro." });
    }

    const alias = String(body?.alias || "").trim();
    const broker = String(body?.broker || "").trim();
    const platform = String(body?.platform || "").toUpperCase();
    const login = String(body?.login || "").trim();
    const server = String(body?.server || "").trim();
    const password = String(body?.password || "");
    const note = String(body?.note || "").trim();

    if (!alias || !["MT4", "MT5"].includes(platform)) {
      return NextResponse.json(
        { error: "Alias et plateforme requis." },
        { status: 400 }
      );
    }

    if (!/^\d{1,20}$/.test(login)) {
      return NextResponse.json(
        { error: "Numéro de compte invalide." },
        { status: 400 }
      );
    }

    if (!server || server.length > 200 || !password || password.length > 256) {
      return NextResponse.json(
        { error: "Serveur ou mot de passe invalide." },
        { status: 400 }
      );
    }

    const syncConsent = body?.syncConsent === true;
    const syncCurrency = String(body?.syncCurrency || "").trim().toUpperCase();
    const syncType = String(body?.syncType || "");
    if (syncConsent && !/^[A-Z]{3}$/.test(syncCurrency)) {
      return NextResponse.json({ error: "Indique la devise exacte du compte pour activer MetaSync." }, { status: 400 });
    }
    if (syncConsent && !["real", "demo", "prop"].includes(syncType)) {
      return NextResponse.json({ error: "Sélectionne le type exact du compte pour activer MetaSync." }, { status: 400 });
    }

    const { admin } = clients();

    const { data: existing } = await admin
      .from("copier_account_requests")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .eq("login", login)
      .eq("server", server)
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Une demande est déjà en cours pour ce compte." },
        { status: 409 }
      );
    }

    const providerUserId = randomUUID();
    const passwordCipher = encryptCopierPassword(password);

    const { data, error } = await admin
      .from("copier_account_requests")
      .insert({
        user_id: user.id,
        provider_user_id: providerUserId,
        alias,
        broker: broker || null,
        platform,
        login,
        server,
        password_cipher: passwordCipher,
        note: note || null,
        metasync_sync_consent: syncConsent,
        metasync_currency: syncConsent ? syncCurrency : null,
        metasync_account_type: syncConsent ? syncType : null,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    const confirmation = "Votre demande d’activation de compte Master a bien été envoyée ! Notre équipe va procéder à sa vérification. Vous recevrez une notification dès que votre compte sera activé.";
    const title = "Demande de compte Master reçue";
    try {
      await createCopierNotice(admin, {
        eventKey: `copier-master-request-${data.id}`,
        userId: user.id,
        title,
        message: confirmation,
      });
    } catch (noticeError) {
      console.error("[copier-request] notification client non enregistrée", noticeError);
    }

    for (const adminId of await copierAdminUserIds(admin)) {
      try {
        await createCopierNotice(admin, {
          eventKey: `copier-master-request-admin-${data.id}-${adminId}`,
          userId: adminId,
          title: "Nouvelle demande de compte Master",
          message: `${alias} · ${platform} ${login} · ${server}`,
          href: "/dashboard/admin/copieur",
        });
      } catch (noticeError) {
        console.error("[copier-request] notification admin non enregistrée", noticeError);
      }
    }

    const eventKey = `copier-master-request-${data.id}`;
    const emailResult = await sendCopierEmail(admin, eventKey, user.id, title, confirmation);
    if (!emailResult.sent && emailResult.reason !== "email_not_configured") {
      console.error("[copier-request] e-mail de confirmation non envoyé", emailResult.reason);
    }
    const pushResult = await sendCopierPush(admin, eventKey, user.id, title, confirmation);
    if (!pushResult.sent && !["push_not_configured", "no_active_subscription"].includes(pushResult.reason || "")) console.error("[copier-request] push non envoyé", pushResult.reason);

    return NextResponse.json({
      ok: true,
      request: publicRow(data),
      message: confirmation,
    });
  } catch (error) {
    console.error("[copier-request][POST]", error);
    return NextResponse.json(
      { error: "Impossible d’envoyer la demande." },
      { status: 500 }
    );
  }
}
