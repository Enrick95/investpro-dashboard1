import { createCipheriv, createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

export type ProjectXAccount = {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
  isVisible: boolean;
};

const DEFAULT_BASE_URL = "https://api.topstepx.com";

export function projectXBaseUrl() {
  return (process.env.PROJECTX_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Configuration Supabase serveur incomplète.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  const accessToken = header.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw new Error("UNAUTHORIZED");

  const supabase = adminSupabase();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { user: data.user, supabase };
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`ProjectX a renvoyé une réponse invalide (${response.status}).`);
  }
  return data;
}

export async function projectXLogin(userName: string, apiKey: string) {
  const response = await fetch(`${projectXBaseUrl()}/api/Auth/loginKey`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain" },
    body: JSON.stringify({ userName, apiKey }),
    cache: "no-store",
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.success || !data?.token) {
    if (data?.errorCode === 3) {
      throw new Error("Identifiants ProjectX incorrects. Vérifie ton username et ta clé API.");
    }
    if (data?.errorCode === 7) {
      throw new Error("ProjectX demande d’accepter des accords sur la plateforme avant la connexion.");
    }
    if (data?.errorCode === 9) {
      throw new Error("Ton compte ProjectX n’a pas d’abonnement API actif.");
    }
    if (data?.errorCode === 10) {
      throw new Error("L’authentification par clé API est désactivée pour cette firme ProjectX.");
    }
    throw new Error(data?.errorMessage || "Connexion ProjectX impossible.");
  }

  return String(data.token);
}

export async function projectXAccounts(sessionToken: string): Promise<ProjectXAccount[]> {
  const response = await fetch(`${projectXBaseUrl()}/api/Account/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/plain",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ onlyActiveAccounts: true }),
    cache: "no-store",
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.success || !Array.isArray(data?.accounts)) {
    throw new Error(data?.errorMessage || "Impossible de récupérer les comptes ProjectX.");
  }

  return data.accounts.map((account: any) => ({
    id: Number(account.id),
    name: String(account.name || `ProjectX ${account.id}`),
    balance: Number(account.balance || 0),
    canTrade: Boolean(account.canTrade),
    isVisible: account.isVisible !== false,
  }));
}

export function encryptProjectXApiKey(apiKey: string) {
  const secret = process.env.FUTURES_CREDENTIALS_KEY;
  if (!secret || secret.length < 24) {
    throw new Error("FUTURES_CREDENTIALS_KEY_MISSING");
  }

  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export type ProjectXTrade = {
  id: number;
  accountId: number;
  contractId: string;
  creationTimestamp: string;
  price: number;
  profitAndLoss: number | null;
  fees: number;
  side: number;
  size: number;
  voided: boolean;
  orderId: number;
};

export function decryptProjectXApiKey(ciphertext: string, ivB64: string, tagB64: string) {
  const secret = process.env.FUTURES_CREDENTIALS_KEY;
  if (!secret || secret.length < 24) throw new Error("FUTURES_CREDENTIALS_KEY_MISSING");
  const key = createHash("sha256").update(secret).digest();
  const { createDecipheriv } = require("crypto") as typeof import("crypto");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export async function projectXTrades(sessionToken: string, accountId: number, startTimestamp: string, endTimestamp?: string) {
  const response = await fetch(`${projectXBaseUrl()}/api/Trade/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/plain",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ accountId, startTimestamp, endTimestamp: endTimestamp || null }),
    cache: "no-store",
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.success || !Array.isArray(data?.trades)) {
    throw new Error(data?.errorMessage || "Impossible de récupérer l’historique ProjectX.");
  }
  return data.trades as ProjectXTrade[];
}

export async function projectXContract(sessionToken: string, contractId: string) {
  const response = await fetch(`${projectXBaseUrl()}/api/Contract/searchById`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/plain",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ contractId }),
    cache: "no-store",
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.success || !data?.contract) return null;
  return data.contract as { id: string; name?: string; description?: string; symbolId?: string };
}
