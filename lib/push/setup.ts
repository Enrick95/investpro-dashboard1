export type PushChannel = "copier" | "vip";
export type PushSetup = { userId: string; publicKey: string; channels: PushChannel[] };
export type PushSetupRequest = (path: string, init?: RequestInit) => Promise<unknown>;
export type PushSaveFailure = { channel: PushChannel; code?: string; status?: number };
export class PushSetupError extends Error {
  code: "unavailable" | "config_mismatch" | "worker_timeout" | "subscription_reset_failed" | "saving_failed";
  channels: PushChannel[];
  failures: PushSaveFailure[];
  constructor(code: PushSetupError["code"], channels: PushChannel[] = [], failures: PushSaveFailure[] = []) { super(code); this.code = code; this.channels = channels; this.failures = failures; }
}

function config(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return row.available === true && typeof row.publicKey === "string" && /^[A-Za-z0-9_-]{80,100}$/.test(row.publicKey) ? row.publicKey : null;
}

/** Only the verified member/admin response selects VIP alerts, never browser metadata. */
export async function loadPushSetup(request: PushSetupRequest, signal?: AbortSignal): Promise<PushSetup> {
  const [copier, vip, access] = await Promise.all([
    request("/api/copier/push", { signal }), request("/api/vip/push", { signal }), request("/api/vip/access", { signal }),
  ]);
  if (!access || typeof access !== "object") throw new PushSetupError("unavailable");
  const account = access as { user?: { id?: unknown }; active?: unknown; admin?: unknown };
  if (typeof account.user?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(account.user.id)) throw new PushSetupError("unavailable");
  const copierKey = config(copier), vipKey = config(vip);
  const needsVip = account.active === true || account.admin === true;
  if (needsVip && !vipKey) throw new PushSetupError("unavailable");
  if (copierKey && vipKey && copierKey !== vipKey) throw new PushSetupError("config_mismatch");
  const channels: PushChannel[] = [...(copierKey ? ["copier" as const] : []), ...(needsVip && vipKey ? ["vip" as const] : [])];
  const publicKey = needsVip ? vipKey : copierKey;
  if (!publicKey || !channels.length) throw new PushSetupError("unavailable");
  return { userId: account.user.id, publicKey, channels };
}

export function pushKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(value)) throw new PushSetupError("unavailable");
  const raw = atob((value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new PushSetupError("unavailable");
  return bytes;
}

export function subscriptionUsesKey(subscription: PushSubscription, publicKey: string): boolean {
  const actual = subscription.options?.applicationServerKey;
  if (!actual) return false;
  const bytes = new Uint8Array(actual), expected = pushKeyBytes(publicKey);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

/** Calling ready alone can wait forever. Registration and timeout are explicit here. */
export async function readyPushRegistration(workers: ServiceWorkerContainer, timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { const registration = await workers.getRegistration("/") || await workers.register("/sw.js"); return registration.active ? registration : await workers.ready; })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PushSetupError("worker_timeout")), timeoutMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Explicit activation only. A changed VAPID key requires replacing the old native subscription. */
export async function ensurePushSubscription(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing && subscriptionUsesKey(existing, publicKey)) return existing;
  if (existing && !(await existing.unsubscribe())) throw new PushSetupError("subscription_reset_failed");
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyBytes(publicKey) });
}

/** One native endpoint is enrolled into both independent delivery channels when eligible. */
export async function savePushChannels(subscription: PushSubscription, setup: PushSetup, request: PushSetupRequest, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const body = JSON.stringify({ subscription: subscription.toJSON() });
  const results = await Promise.allSettled(setup.channels.map(channel => request(`/api/${channel}/push`, { method: "POST", body, signal })));
  const failures: PushSaveFailure[] = [];
  results.forEach((result, index) => {
    if (result.status !== "rejected") return;
    const reason = result.reason as { code?: unknown; status?: unknown } | undefined;
    const allowed = ["push_auth_required", "push_vip_inactive", "push_unavailable", "push_invalid_subscription", "push_endpoint_owned", "push_device_limit", "push_origin_denied", "push_save_unavailable"];
    failures.push({ channel: setup.channels[index], code: typeof reason?.code === "string" && allowed.includes(reason.code) ? reason.code : undefined, status: typeof reason?.status === "number" ? reason.status : undefined });
  });
  if (failures.length) throw new PushSetupError("saving_failed", failures.map(failure => failure.channel), failures);
}

/** Explicit activation only: replace a native subscription left behind by another account once. */
export async function activatePushChannels(registration: ServiceWorkerRegistration, setup: PushSetup, request: PushSetupRequest): Promise<void> {
  const subscription = await ensurePushSubscription(registration, setup.publicKey);
  try { await savePushChannels(subscription, setup, request); }
  catch (error) {
    if (!(error instanceof PushSetupError) || !error.failures.length || error.failures.some(failure => failure.code !== "push_endpoint_owned")) throw error;
    // Keep server ownership strict. The browser revokes its old endpoint before requesting a new one.
    if (!(await subscription.unsubscribe())) throw new PushSetupError("subscription_reset_failed");
    const replacement = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyBytes(setup.publicKey) });
    // Some push services can briefly return the revoked endpoint; never transfer it between accounts.
    if (replacement.endpoint === subscription.endpoint) throw new PushSetupError("subscription_reset_failed");
    await savePushChannels(replacement, setup, request);
  }
}

export function pushReminderKey(setup: PushSetup): string { return "investpro-push-setup-v2:" + setup.userId; }
export function pushSetupFingerprint(setup: PushSetup): string { return setup.publicKey + ":" + setup.channels.join(","); }
export function shouldOfferPush(value: string | null, setup: PushSetup, permission: NotificationPermission, existing: PushSubscription | null, now = Date.now()): boolean {
  let record: { until?: unknown; confirmed?: unknown } = {};
  try { record = JSON.parse(value || "{}"); } catch { /* Old or malformed records cannot permanently hide setup. */ }
  if (!record || typeof record !== "object") record = {};
  if (permission === "granted" && existing && subscriptionUsesKey(existing, setup.publicKey) && record.confirmed === pushSetupFingerprint(setup)) return false;
  return !(typeof record.until === "number" && Number.isFinite(record.until) && record.until > now);
}

export function pushSetupErrorText(error: unknown, english = false): string {
  const tr = (fr: string, en: string) => english ? en : fr;
  if (error instanceof PushSetupError) {
    if (error.code === "worker_timeout") return tr("L’application prépare les alertes. Actualisez puis réessayez.", "The app is preparing alerts. Reload and try again.");
    if (error.code === "config_mismatch") return tr("La configuration des alertes est incohérente. Contactez le support InvestPro.", "The alert configuration is inconsistent. Contact InvestPro support.");
    if (error.code === "subscription_reset_failed") return tr("L’ancienne inscription aux alertes n’a pas pu être remplacée. Réessayez depuis ce navigateur.", "The previous alert subscription could not be replaced. Try again from this browser.");
    if (error.code === "saving_failed") {
      if (error.failures.some(failure => failure.status === 401 || failure.code === "push_auth_required")) return tr("Votre session a expiré. Reconnectez-vous à InvestPro, puis activez les alertes.", "Your session has expired. Sign in to InvestPro again, then enable alerts.");
      if (error.failures.some(failure => failure.code === "push_endpoint_owned")) return tr("Ce navigateur conserve une ancienne inscription aux alertes. Cliquez sur « Activer / réparer mes alertes » pour l’associer à votre compte actuel.", "This browser still has a previous alert subscription. Select “Enable / repair my alerts” to link it to your current account.");
      if (error.failures.some(failure => failure.code === "push_device_limit")) return tr("La limite d’appareils est atteinte. Contactez le support InvestPro pour gérer vos appareils.", "The device limit has been reached. Contact InvestPro support to manage your devices.");
      if (error.failures.some(failure => failure.code === "push_vip_inactive")) return tr("L’accès VIP de ce compte doit être validé avant d’activer les alertes VIP.", "This account’s VIP access must be approved before enabling VIP alerts.");
      if (error.failures.some(failure => failure.code === "push_origin_denied")) return tr("Rouvrez InvestPro depuis investprotrading.fr, puis réessayez l’activation des alertes.", "Reopen InvestPro at investprotrading.fr, then try enabling alerts again.");
      return tr("L’autorisation de cet appareil est accordée, mais l’enregistrement ", "Device permission is granted, but saving ") + error.channels.map(channel => channel === "vip" ? "VIP" : "InvestPro").join(" / ") + tr(" a échoué. Réessayez : vos alertes ne sont pas encore toutes confirmées.", " failed. Retry: not all alerts have been confirmed yet.");
    }
    return tr("Les alertes sont temporairement indisponibles. Réessayez dans un instant.", "Alerts are temporarily unavailable. Try again shortly.");
  }
  if (error && typeof error === "object" && "status" in error && error.status === 401) return tr("Connectez-vous à votre compte InvestPro pour activer les alertes.", "Sign in to your InvestPro account to enable alerts.");
  return tr("Impossible d’activer les alertes sur cet appareil. Vérifiez les autorisations du navigateur puis réessayez.", "Could not enable alerts on this device. Check browser permissions and try again.");
}
