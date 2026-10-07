import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Configuration Supabase serveur incomplète.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const supabase = adminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { user: data.user, supabase };
}

function credentialsSecret() {
  const secret = process.env.FUTURES_CREDENTIALS_KEY;
  if (!secret || secret.length < 24) throw new Error("FUTURES_CREDENTIALS_KEY_MISSING");
  return secret;
}

export function encryptBrokerCredentials(value: unknown) {
  const key = createHash("sha256").update(credentialsSecret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const raw = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptBrokerCredentials(ciphertext: string, iv: string, tag: string) {
  const key = createHash("sha256").update(credentialsSecret()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const raw = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(raw);
}

export function signOauthState(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", credentialsSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOauthState(state: string) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) throw new Error("OAUTH_STATE_INVALID");
  const expected = createHmac("sha256", credentialsSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("OAUTH_STATE_INVALID");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!parsed?.user_id || Number(parsed?.exp || 0) < Date.now()) throw new Error("OAUTH_STATE_EXPIRED");
  return parsed as { user_id: string; return_to?: string; exp: number };
}
