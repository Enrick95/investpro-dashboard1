import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_HEADER = 'X-InvestPro-MT-Token';
const TOKEN_TTL_SECONDS = 30 * 60;
const CLOCK_SKEW_SECONDS = 60;
const TOKEN_PURPOSE = 'investpro:metasync:request-proof:v1';
const USER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN = /^v1\.([1-9][0-9]{9})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/;

function proofKey(): Buffer | null {
  const secret = process.env.METASYNC_HOSTED_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/.test(secret)) return null;
  // Separate this signing key from the encryption purpose of the source key.
  return createHmac('sha256', Buffer.from(secret, 'hex')).update(TOKEN_PURPOSE).digest();
}

function signature(key: Buffer, userId: string, payload: string): Buffer {
  return createHmac('sha256', key).update(`${TOKEN_PURPOSE}\n${userId}\n${payload}`).digest();
}

/** A short-lived proof returned only to the authenticated account by the API. */
export function issueHostedRequestToken(userId: string): string | null {
  if (!USER_ID.test(userId)) return null;
  try {
    const key = proofKey();
    if (!key) return null;
    const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const payload = `v1.${expires}.${randomBytes(24).toString('base64url')}`;
    return `${payload}.${signature(key, userId, payload).toString('base64url')}`;
  } catch {
    return null;
  }
}

/** This proof supplements origin checks; it never replaces authentication. */
export function verifyHostedRequestToken(req: Request, userId: string): boolean {
  if (!USER_ID.test(userId)) return false;
  const value = req.headers.get(TOKEN_HEADER);
  if (!value || value.length > 160) return false;
  const match = TOKEN.exec(value);
  if (!match) return false;
  const expires = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS) return false;
  try {
    const key = proofKey();
    if (!key) return false;
    const received = Buffer.from(match[3], 'base64url');
    // Buffer accepts noncanonical base64: reject alternate trailing-bit encodings.
    if (received.length !== 32 || received.toString('base64url') !== match[3]) return false;
    const payload = `v1.${match[1]}.${match[2]}`;
    return timingSafeEqual(signature(key, userId, payload), received);
  } catch {
    return false;
  }
}
