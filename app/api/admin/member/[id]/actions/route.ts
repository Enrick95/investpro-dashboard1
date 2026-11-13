import { canAdmin } from "@/lib/admin/permissions";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateAccessCode } from "@/lib/vip/access-account";

function getAdminIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getVerifiedAdmin(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return {
      response: NextResponse.json(
        { error: "Configuration Supabase serveur incomplète." },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!accessToken) {
    return {
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await publicClient.auth.getUser(accessToken);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!await canAdmin(user.id, "users_write")) {
    return {
      response: NextResponse.json(
        { error: "Accès administrateur refusé." },
        { status: 403 }
      ),
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, requester: user };
}

async function writeLog(
  admin: any,
  adminUserId: string,
  targetUserId: string,
  action: string,
  details: Record<string, unknown>
) {
  const { error } = await admin.from("admin_action_logs").insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
    details,
  });

  if (error) {
    console.error("Admin action log:", error);
    throw new Error(
      "Action effectuée mais journal admin impossible à enregistrer. Vérifie la migration Admin V4."
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const verified = await getVerifiedAdmin(request);

    if ("response" in verified && verified.response) return verified.response;

    const { admin, requester } = verified as any;
    const body = await request.json();
    const action = String(body?.action || "");

    const { data: targetData, error: targetError } =
      await admin.auth.admin.getUserById(id);

    if (targetError || !targetData.user) {
      return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    }

    const target = targetData.user;

    if (action === "suspend") {
      // Empêche l'admin connecté de se bannir lui-même par erreur.
      if (requester.id === id) {
        return NextResponse.json(
          { error: "Tu ne peux pas suspendre ton propre compte administrateur." },
          { status: 400 }
        );
      }

      const { error } = await admin.auth.admin.updateUserById(id, {
        // Suspension longue durée. Réversible avec ban_duration: "none".
        ban_duration: "876000h",
      });

      if (error) throw error;

      await writeLog(admin, requester.id, id, "member_suspended", {
        email: target.email || null,
      });

      return NextResponse.json({
        ok: true,
        message: "Membre suspendu.",
      });
    }

    if (action === "reactivate") {
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: "none",
      });

      if (error) throw error;

      await writeLog(admin, requester.id, id, "member_reactivated", {
        email: target.email || null,
      });

      return NextResponse.json({
        ok: true,
        message: "Membre réactivé.",
      });
    }

    if (action === "new_access_code") {
      // Membre qui a perdu son code d'accès (ou compte Google sans mot de passe) : un nouveau code devient le mot de
      // passe du compte. Il n'est renvoyé qu'une fois, à l'administrateur, et n'est ni stocké ni journalisé.
      const accessCode = generateAccessCode();
      const { error } = await admin.auth.admin.updateUserById(id, { password: accessCode });
      if (error) throw error;

      let logged = true;
      try {
        await writeLog(admin, requester.id, id, "access_code_reset", { email: target.email || null });
      } catch {
        logged = false; // Le code est déjà actif : l'administrateur doit le recevoir quand même.
      }

      return NextResponse.json(
        {
          ok: true,
          accessCode,
          email: target.email || null,
          message: logged ? "Nouveau code créé." : "Nouveau code créé (journal admin indisponible).",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (action === "change_plan") {
      const plan = String(body?.plan || "").toLowerCase();
      const allowedPlans = ["free", "pro", "elite"];

      if (!allowedPlans.includes(plan)) {
        return NextResponse.json(
          { error: "Plan invalide." },
          { status: 400 }
        );
      }

      const { data: updatedProfiles, error } = await admin
        .from("profiles")
        .update({ plan })
        .eq("id", id)
        .select("id,plan");

      if (error) throw error;

      if (!updatedProfiles?.length) {
        return NextResponse.json(
          { error: "Profil du membre introuvable." },
          { status: 404 }
        );
      }

      await writeLog(admin, requester.id, id, "plan_changed", {
        plan,
        email: target.email || null,
      });

      return NextResponse.json({
        ok: true,
        message: `Plan changé vers ${plan.toUpperCase()}.`,
      });
    }

    return NextResponse.json(
      { error: "Action administrateur inconnue." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("InvestPro admin action:", error);
    return NextResponse.json(
      { error: error?.message || "Action administrateur impossible." },
      { status: 500 }
    );
  }
}
