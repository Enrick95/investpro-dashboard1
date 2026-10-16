"use client";

import { vipRequest } from "@/lib/vip/client";
import { ensurePushSubscription, loadPushSetup, pushReminderKey, pushSetupFingerprint, readyPushRegistration, savePushChannels, type PushSetup, type PushSetupRequest } from "./setup";

export const pushSetupRequest: PushSetupRequest = (path, init) => vipRequest<unknown>(path, init);

/** Call after a permission request made directly from an explicit user gesture. */
export async function activateConfiguredPush(): Promise<PushSetup> {
  const setup = await loadPushSetup(pushSetupRequest);
  const registration = await readyPushRegistration(navigator.serviceWorker);
  const subscription = await ensurePushSubscription(registration, setup.publicKey);
  await savePushChannels(subscription, setup, pushSetupRequest);
  try { localStorage.setItem(pushReminderKey(setup), JSON.stringify({ confirmed: pushSetupFingerprint(setup) })); } catch { /* Storage does not determine delivery success. */ }
  window.dispatchEvent(new Event("investpro:push-setup-changed"));
  return setup;
}
