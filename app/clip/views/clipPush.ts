"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipApiError, clipApi } from "@/lib/clip/client";
import { clipPathNow } from "./clipPath";
import { isClipStandalone } from "./InstallClip";

/**
 * Notifications des nouvelles vidéos sur le téléphone du clippeur.
 * install : iPhone hors de l'app installée (Safari ne les reçoit que depuis l'écran d'accueil).
 * unsupported : navigateur sans notifications (navigateur intégré de TikTok, Instagram…).
 */
export type ClipPushState = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

class PushSetupError extends Error {}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new PushSetupError("Le téléphone ne répond pas, réessaie.")), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

/** Clé VAPID (base64url) en octets pour l'abonnement. */
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

async function saveOnServer(subscription: PushSubscription): Promise<void> {
  await clipApi("/api/clip/push", { method: "POST", body: { subscription: subscription.toJSON(), home: clipPathNow("/clip/login") } });
}

/** À la déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
export async function clipPushForget(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const subscription = await within(currentSubscription(), 2500);
    if (!subscription) return;
    await within(clipApi("/api/clip/push", { method: "DELETE", body: { endpoint: subscription.endpoint } }), 2500).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  } catch {
    // la déconnexion continue quoi qu'il arrive
  }
}

export function useClipPush(enabled: boolean) {
  const [state, setState] = useState<ClipPushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      if (!pushSupported()) {
        if (!cancelled) setState(isIOS() && !isClipStandalone() ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const subscription = Notification.permission === "granted" ? await within(currentSubscription(), 4000) : null;
        if (cancelled) return;
        setState(subscription ? "on" : "off");
        // Rattache le téléphone au clippeur connecté (et le réinscrit s'il avait été effacé du serveur).
        if (subscription) void saveOnServer(subscription).catch(() => undefined);
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  /** À appeler directement depuis un tap : le téléphone affiche sa demande d'autorisation. */
  const enable = useCallback(async () => {
    if (!enabled || busy) return;
    if (!pushSupported()) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = await clipApi<{ publicKey: string | null }>("/api/clip/push", { auth: false });
      if (!publicKey) throw new PushSetupError("Les notifications sont momentanément indisponibles, réessaie plus tard.");
      const key = keyBytes(publicKey);
      await navigator.serviceWorker.register("/sw.js");
      const registration = await within(navigator.serviceWorker.ready, 10_000);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !sameKey(subscription, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await saveOnServer(subscription);
      setState("on");
    } catch (cause) {
      setError(cause instanceof ClipApiError || cause instanceof PushSetupError ? cause.message : "Activation impossible sur ce téléphone pour le moment, réessaie.");
    } finally {
      setBusy(false);
    }
  }, [enabled, busy]);

  const disable = useCallback(async () => {
    if (!enabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const subscription = await within(currentSubscription(), 4000).catch(() => null);
      if (subscription) {
        // Même si le serveur ne répond pas, un abonnement retiré du téléphone ne reçoit plus rien.
        await clipApi("/api/clip/push", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => false);
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [enabled, busy]);

  return { state, busy, error, enable, disable };
}
