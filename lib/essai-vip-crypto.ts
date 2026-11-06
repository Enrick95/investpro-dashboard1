import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Chiffrement du mot de passe du compte DÉMO de l'essai VIP (clé dédiée, dérivée du secret serveur). */
function key() {
  const secret = process.env.FUTURES_CREDENTIALS_KEY;
  if (!secret) throw new Error("ESSAI_KEY_MISSING");
  return createHash("sha256").update(`investpro:essai-vip-demo-password:${secret}`).digest();
}

export function encryptEssaiDemoPassword(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptEssaiDemoPassword(payload: string): string {
  const [version, iv, tag, data] = String(payload || "").split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("ESSAI_PAYLOAD_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
