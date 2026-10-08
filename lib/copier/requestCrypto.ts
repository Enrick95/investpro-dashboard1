
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key() {
  const secret = process.env.FUTURES_CREDENTIALS_KEY;
  if (!secret) {
    throw new Error("FUTURES_CREDENTIALS_KEY manquante.");
  }

  // Dérivation dédiée pour ne pas réutiliser directement la clé Futures.
  return createHash("sha256")
    .update(`investpro:copier-account-request:${secret}`)
    .digest();
}

export function encryptCopierPassword(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptCopierPassword(payload: string) {
  const [ivB64, tagB64, encryptedB64] = String(payload || "").split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Secret chiffré invalide.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64")
  );

  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const clear = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  return clear.toString("utf8");
}
