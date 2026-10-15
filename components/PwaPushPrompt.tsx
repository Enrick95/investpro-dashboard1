"use client";
import { useLocale } from "@/components/i18n/LocaleProvider";


import { useEffect, useState } from "react";
import { Bell, Check, X } from "lucide-react";

const SEEN_KEY = "investpro-push-prompt-dismissed-v1";

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function base64UrlToBytes(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export default function PwaPushPrompt() {
  const { t } = useLocale();

  const [visible, setVisible] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const showWhenReady = async () => {
      if (!mounted || !("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) return;
      if (Notification.permission === "denied") return;
      let alreadyDismissed = false;
      try { alreadyDismissed = window.localStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage may be disabled */ }
      if (alreadyDismissed) return;
      try {
        const response = await fetch("/api/copier/push", { cache: "no-store" });
        const data = await response.json();
        if (!mounted || !response.ok || !data.available || !data.publicKey) return;
        setPublicKey(String(data.publicKey));
        if (standaloneMode()) {
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          if (existing) {
            await fetch("/api/copier/push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscription: existing.toJSON() }),
            });
            return;
          }
          setVisible(true);
        }
      } catch {
        // Push setup may be unavailable while the site is being configured.
      }
    };
    void showWhenReady();
    const onInstalled = () => { void showWhenReady(); };
    window.addEventListener("appinstalled", onInstalled);
    return () => { mounted = false; window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage may be disabled */ }
    setVisible(false);
  }

  async function enableNotifications() {
    if (!publicKey || busy) return;
    setBusy(true);
    setError("");
    try {
      // This must remain directly inside the button gesture for browser permission UX.
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setError(permission === "denied" ? "Les notifications sont bloquées dans les réglages de cet appareil." : "Autorisation non accordée.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      const response = await fetch("/api/copier/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Activation impossible.");
      dismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Activation impossible sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <aside role="dialog" aria-label={t("Notifications InvestPro")} className="fixed inset-x-3 bottom-24 z-[70] mx-auto max-w-md rounded-2xl border border-[color:var(--gold-border)] bg-[#11130f] p-4 shadow-2xl shadow-black/50 sm:inset-x-auto sm:bottom-6 sm:right-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><Bell size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{t("Reste informé avec InvestPro")}</div>
          <p className="mt-1 text-xs leading-5 text-white/55">{t("Reçois les notifications importantes sur tes demandes de compte et tes réglages Copier. Tu peux changer d’avis dans les réglages de ton appareil.")}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t("Plus tard")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.06]"><X size={16} /></button>
      </div>
      {error ? <p role="status" className="mt-3 text-xs leading-5 text-amber-200">{t(error)}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={dismiss} className="min-h-10 flex-1 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-white/65">{t("Plus tard")}</button>
        <button type="button" onClick={() => void enableNotifications()} disabled={busy} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-3 text-xs font-bold text-black disabled:opacity-60">{busy ? t("Activation…") : <><Check size={14} /> {t(" Activer les notifications")}</>}</button>
      </div>
    </aside>
  );
}
