const PUSH_HOSTS = ["fcm.googleapis.com", "web.push.apple.com"];

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      (PUSH_HOSTS.includes(url.hostname) || url.hostname.endsWith(".push.services.mozilla.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export function validPushKeys(keys: unknown): keys is {p256dh:string;auth:string} {
  if (!keys || typeof keys !== "object") return false;
  const {p256dh,auth} = keys as Record<string,unknown>;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,30}$/.test(auth)) return false;
  try {
    const publicKey = Buffer.from(p256dh,"base64url");
    return publicKey.length === 65 && publicKey[0] === 4 && Buffer.from(auth,"base64url").length === 16;
  } catch { return false; }
}
