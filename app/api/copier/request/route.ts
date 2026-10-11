
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

    return NextResponse.json({
      requests: (data || []).map(publicRow),
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
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    const confirmation = "Votre demande d’activation de compte Master a bien été envoyée ! Notre équipe va procéder à sa vérification. Vous recevrez une notification dès que votre compte sera activé.";
    const title = "Demande de compte Master reçue";
    let clientNoticeInserted = false;
    try {
      const notice = await createCopierNotice(admin, {
        eventKey: `copier-master-request-${data.id}`,
        userId: user.id,
        title,
        message: confirmation,
      });
      clientNoticeInserted = notice.inserted;
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
    const emailResult = clientNoticeInserted
      ? await sendCopierEmail(admin, eventKey, user.id, title, confirmation)
      : { sent: false, reason: "notification_not_recorded" };
    if (!emailResult.sent && emailResult.reason !== "email_not_configured") {
      console.error("[copier-request] e-mail de confirmation non envoyé", emailResult.reason);
    }
    if (clientNoticeInserted) {
      const pushResult = await sendCopierPush(admin, eventKey, user.id, title, confirmation);
      if (!pushResult.sent && !["push_not_configured", "no_active_subscription"].includes(pushResult.reason || "")) console.error("[copier-request] push non envoyé", pushResult.reason);
    }

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
