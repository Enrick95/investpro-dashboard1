import { NextResponse } from "next/server";
import { requireUser } from "@/lib/brokers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl(environment: string) {
  return environment === "demo"
    ? "https://demo.tradelocker.com/backend-api"
    : "https://live.tradelocker.com/backend-api";
}

function developerHeaders() {
  const key = process.env.TRADELOCKER_DEVELOPER_API_KEY;
  return key ? { "tl-developer-api-key": key } : {};
}

async function parse(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; }
  catch { throw new Error(`TradeLocker a renvoyé une réponse invalide (${response.status}).`); }
}

function normaliseAccounts(payload: any) {
  const raw = Array.isArray(payload) ? payload :
    Array.isArray(payload?.accounts) ? payload.accounts :
    Array.isArray(payload?.d) ? payload.d :
    Array.isArray(payload?.data) ? payload.data : [];

  return raw.map((item: any, index: number) => ({
    accountId: String(item?.accountId ?? item?.id ?? item?.account_id ?? ""),
    accNum: Number(item?.accNum ?? item?.acc_num ?? item?.accountNumber ?? index + 1),
    name: String(item?.name ?? item?.accountName ?? item?.title ?? `TradeLocker ${index + 1}`),
    currency: String(item?.currency ?? "USD"),
    status: String(item?.status ?? "ACTIVE"),
    type: String(item?.type ?? "live"),
  })).filter((item: any) => item.accountId && Number.isFinite(item.accNum));
}

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await request.json();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const server = String(body?.server || "").trim();
    const environment = String(body?.environment || "live").toLowerCase() === "demo" ? "demo" : "live";

    if (!email || !password || !server) {
      return NextResponse.json({ ok: false, error: "E-mail, mot de passe et serveur TradeLocker requis." }, { status: 400 });
    }

    const root = baseUrl(environment);
    const login = await fetch(`${root}/auth/jwt/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...developerHeaders() },
      body: JSON.stringify({ email, password, server }),
      cache: "no-store",
    });
    const loginJson = await parse(login);
    if (!login.ok || !loginJson?.accessToken) {
      return NextResponse.json({ ok: false, error: loginJson?.message || loginJson?.error || "Connexion TradeLocker refusée." }, { status: 400 });
    }

    const accountsResponse = await fetch(`${root}/auth/jwt/all-accounts`, {
      headers: { Authorization: `Bearer ${loginJson.accessToken}`, Accept: "application/json", ...developerHeaders() },
      cache: "no-store",
    });
    const accountsJson = await parse(accountsResponse);
    if (!accountsResponse.ok) {
      return NextResponse.json({ ok: false, error: accountsJson?.message || "Impossible de récupérer les comptes TradeLocker." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, accounts: normaliseAccounts(accountsJson), environment });
  } catch (error: any) {
    if (String(error?.message) === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: String(error?.message || "Erreur TradeLocker.") }, { status: 400 });
  }
}
