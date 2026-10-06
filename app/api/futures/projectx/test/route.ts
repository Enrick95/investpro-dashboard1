import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TOPSTEP_API = "https://api.topstepx.com";

async function verifyUser(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return {
      response: NextResponse.json(
        { error: "Configuration Supabase incomplète." },
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
      response: NextResponse.json(
        { error: "Non authentifié." },
        { status: 401 }
      ),
    };
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      response: NextResponse.json(
        { error: "Session invalide." },
        { status: 401 }
      ),
    };
  }

  return { user };
}

function projectXMessage(code: number, fallback?: string | null) {
  if (code === 3) {
    return "Identifiants ProjectX invalides. Vérifie ton username TopstepX et ta clé API.";
  }

  if (code === 7) {
    return "Des accords ProjectX doivent encore être acceptés sur la plateforme.";
  }

  if (code === 9) {
    return "Aucun abonnement API ProjectX actif n’est lié à ce profil TopstepX.";
  }

  if (code === 10) {
    return "L’authentification par clé API est désactivée pour ce profil.";
  }

  return fallback || "Connexion ProjectX impossible.";
}

export async function POST(request: Request) {
  try {
    const verified = await verifyUser(request);
    if ("response" in verified && verified.response) return verified.response;

    const body = await request.json();
    const userName = String(body?.userName || "").trim();
    const apiKey = String(body?.apiKey || "").trim();

    if (!userName || !apiKey) {
      return NextResponse.json(
        { error: "Username et clé API requis." },
        { status: 400 }
      );
    }

    // 1) Login ProjectX. La clé n'est jamais enregistrée.
    const authResponse = await fetch(`${TOPSTEP_API}/api/Auth/loginKey`, {
      method: "POST",
      headers: {
        Accept: "text/plain",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userName,
        apiKey,
      }),
      cache: "no-store",
    });

    const authJson = await authResponse.json().catch(() => null);

    if (
      !authResponse.ok ||
      !authJson ||
      authJson.success !== true ||
      !authJson.token
    ) {
      const errorCode = Number(authJson?.errorCode || 0);

      return NextResponse.json(
        {
          error: projectXMessage(errorCode, authJson?.errorMessage),
          projectx_error_code: errorCode || null,
        },
        { status: 400 }
      );
    }

    // 2) Lecture des comptes uniquement.
    const accountsResponse = await fetch(`${TOPSTEP_API}/api/Account/search`, {
      method: "POST",
      headers: {
        Accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${authJson.token}`,
      },
      body: JSON.stringify({
        onlyActiveAccounts: true,
      }),
      cache: "no-store",
    });

    const accountsJson = await accountsResponse.json().catch(() => null);

    if (
      !accountsResponse.ok ||
      !accountsJson ||
      accountsJson.success !== true
    ) {
      return NextResponse.json(
        {
          error:
            accountsJson?.errorMessage ||
            "Authentification réussie, mais impossible de récupérer les comptes.",
          projectx_error_code: Number(accountsJson?.errorCode || 0) || null,
        },
        { status: 400 }
      );
    }

    const accounts = Array.isArray(accountsJson.accounts)
      ? accountsJson.accounts.map((account: any) => ({
          id: account.id,
          name: account.name || `Compte ${account.id}`,
          balance:
            typeof account.balance === "number" ? account.balance : null,
          canTrade: Boolean(account.canTrade),
          isVisible: Boolean(account.isVisible),
        }))
      : [];

    // Important : aucun token ProjectX ni clé API n'est retourné au navigateur.
    return NextResponse.json({
      ok: true,
      connection: "projectx",
      provider: "TopstepX",
      accounts,
      account_count: accounts.length,
      message:
        accounts.length > 0
          ? "Connexion ProjectX réussie."
          : "Connexion réussie, mais aucun compte actif n’a été trouvé.",
    });
  } catch (error: any) {
    console.error("ProjectX test connection:", error?.name || "UnknownError");

    return NextResponse.json(
      {
        error: "Impossible de contacter ProjectX pour le moment.",
      },
      { status: 500 }
    );
  }
}
