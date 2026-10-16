"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import { activateConfiguredPush, pushSetupRequest } from "@/lib/push/activation-client";
import { loadPushSetup, pushReminderKey, pushSetupFingerprint, pushSetupErrorText, readyPushRegistration, savePushChannels, shouldOfferPush, subscriptionUsesKey, type PushSetup } from "@/lib/push/setup";

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function iosDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function supported() { return window.isSecureContext && "Notification" in window && "PushManager" in window && "serviceWorker" in navigator; }
function readReminder(setup: PushSetup) { try { return localStorage.getItem(pushReminderKey(setup)); } catch { return null; } }
function remember(setup: PushSetup, record: { until?: number; confirmed?: string }) {
  try { localStorage.setItem(pushReminderKey(setup), JSON.stringify(record)); } catch { /* Setup also works when storage is unavailable. */ }
}

export default function PwaPushPrompt() {
  const { locale } = useLocale();
  const english = locale === "en";
  const tr = useCallback((fr: string, en: string) => english ? en : fr, [english]);
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const [setup, setSetup] = useState<PushSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [canEnable, setCanEnable] = useState(false);
  const busyRef = useRef(false);
  const manualRef = useRef(false);
  const lifecycleRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    let controller: AbortController | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCheck = 0;
    let lastPermission: NotificationPermission | undefined;
    let accountId: string | null = null;
    const recentSync = new Map<string, { endpoint: string; at: number }>();
    const invalidateActivation = () => { lifecycleRef.current++; busyRef.current = false; };
    async function check(explicit = false, forceSync = explicit) {
      if (busyRef.current) return;
      setBusy(false);
      lastCheck = Date.now();
      lastPermission = "Notification" in window ? Notification.permission : undefined;
      const version = ++generation;
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      if (explicit) { manualRef.current = true; setManual(true); setVisible(true); if (forceSync) { setSuccess(""); setError(""); } }
      const available = supported() && (!iosDevice() || standaloneMode());
      setCanEnable(false);
      if (!available) {
        if (explicit) setError(iosDevice()
          ? tr("Sur iPhone, ajoutez InvestPro à l’écran d’accueil puis ouvrez son icône pour activer les alertes.", "On iPhone, add InvestPro to your Home Screen and open its icon to enable alerts.")
          : tr("Ouvrez InvestPro dans Chrome sur Android pour activer les notifications.", "Open InvestPro in Chrome on Android to enable notifications."));
        return;
      }
      if (Notification.permission === "denied") {
        if (explicit) setError(iosDevice()
          ? tr("Les notifications sont bloquées. Vérifiez les autorisations InvestPro dans les réglages de votre iPhone.", "Notifications are blocked. Check InvestPro permissions in your iPhone settings.")
          : tr("Notifications bloquées. Dans Chrome : informations du site → Autorisations → Notifications → Autoriser. Vérifiez aussi les notifications de Chrome dans les réglages Android.", "Notifications are blocked. In Chrome: site information → Permissions → Notifications → Allow. Also check Chrome notifications in Android settings."));
        else setVisible(false);
        return;
      }
      try {
        const current = await loadPushSetup(pushSetupRequest, signal);
        const registration = await readyPushRegistration(navigator.serviceWorker);
        const existing = await registration.pushManager.getSubscription();
        if (!mounted || version !== generation || signal.aborted || busyRef.current) return;
        accountId = current.userId;
        setSetup(current); setError(""); setCanEnable(true);
        if (Notification.permission === "granted" && existing && subscriptionUsesKey(existing, current.publicKey)) {
          // Reconcile previously granted subscriptions with both server channels, without asking permission or creating an endpoint.
          try {
            const syncKey = current.userId + ":" + pushSetupFingerprint(current);
            const previous = recentSync.get(syncKey);
            if (forceSync || !previous || previous.endpoint !== existing.endpoint || Date.now() - previous.at >= 5 * 60000) {
              await savePushChannels(existing, current, pushSetupRequest, signal);
              if (!mounted || version !== generation || signal.aborted || busyRef.current) return;
              recentSync.set(syncKey, { endpoint: existing.endpoint, at: Date.now() });
            }
            if (!mounted || version !== generation || signal.aborted || busyRef.current) return;
            remember(current, { confirmed: pushSetupFingerprint(current) });
            if (explicit) setSuccess(tr("Vos alertes sont actives et associées à ce compte.", "Your alerts are active and linked to this account."));
          } catch (cause) {
            if (!mounted || version !== generation || signal.aborted || busyRef.current) return;
            manualRef.current = true; setError(pushSetupErrorText(cause, english)); setManual(true); setVisible(true); return;
          }
        }
        if (explicit || shouldOfferPush(readReminder(current), current, Notification.permission, existing)) setVisible(true);
        else setVisible(false);
      } catch (cause) {
        if (!mounted || version !== generation || signal.aborted || busyRef.current) return;
        setSetup(null); setCanEnable(false);
        if (explicit) setError(pushSetupErrorText(cause, english));
      }
    }
    void check();
    const open = () => { void check(true); };
    const refresh = () => {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      const permission = "Notification" in window ? Notification.permission : undefined;
      // Coalesce focus/visibility events; a permission change after visiting Android settings is checked immediately.
      const delay = permission !== lastPermission ? 0 : Math.max(200, 5000 - (Date.now() - lastCheck));
      refreshTimer = setTimeout(() => { if (mounted && !busyRef.current) void check(manualRef.current, false); }, delay);
    };
    const auth = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      // Supabase can emit SIGNED_IN on focus for the same account. Preserve an open settings/permission flow.
      if (event !== "SIGNED_OUT" && accountId && session?.user.id === accountId) { refresh(); return; }
      accountId = null;
      generation++; invalidateActivation(); controller?.abort(); recentSync.clear(); manualRef.current = false; setSetup(null); setVisible(false); setManual(false); setBusy(false);
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      if (event !== "SIGNED_OUT") queueMicrotask(() => { if (mounted) void check(); });
    });
    window.addEventListener("investpro:open-push-settings", open);
    window.addEventListener("investpro-vip-access-changed", refresh);
    window.addEventListener("appinstalled", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted = false; generation++; invalidateActivation(); controller?.abort(); if (refreshTimer !== undefined) clearTimeout(refreshTimer); auth.data.subscription.unsubscribe(); window.removeEventListener("investpro:open-push-settings", open); window.removeEventListener("investpro-vip-access-changed", refresh); window.removeEventListener("appinstalled", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [english, tr]);

  function dismiss() {
    if (setup && !success) remember(setup, { until: Date.now() + 7 * 86400000 });
    setVisible(false); setManual(false); manualRef.current = false;
  }
  async function enableNotifications() {
    if (busy || !canEnable) return;
    const version = lifecycleRef.current;
    busyRef.current = true; manualRef.current = true;
    setBusy(true); setManual(true); setError(""); setSuccess("");
    try {
      // Keep this directly in the click handler: iOS requires an explicit user gesture.
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (version !== lifecycleRef.current) return;
      if (permission !== "granted") {
        setError(permission === "denied"
          ? tr("Les notifications sont bloquées dans les réglages de cet appareil. Autorisez-les pour InvestPro dans votre navigateur.", "Notifications are blocked in device settings. Allow them for InvestPro in your browser.")
          : tr("Autorisation non accordée. Vous pouvez réessayer avec ce bouton.", "Permission was not granted. You can retry using this button."));
        return;
      }
      const current = await activateConfiguredPush();
      if (version !== lifecycleRef.current) return;
      setSetup(current); remember(current, { confirmed: pushSetupFingerprint(current) });
      setSuccess(current.channels.includes("vip")
        ? tr("Alertes InvestPro et VIP activées sur cet appareil.", "InvestPro and VIP alerts are enabled on this device.")
        : tr("Alertes InvestPro activées. Les alertes VIP pourront être ajoutées après validation de votre accès.", "InvestPro alerts are enabled. VIP alerts can be added once your access is approved."));
    } catch (cause) { if (version === lifecycleRef.current) setError(pushSetupErrorText(cause, english)); }
    finally { if (version === lifecycleRef.current) { busyRef.current = false; setBusy(false); } }
  }
  if (!visible) return null;
  return <aside role="dialog" aria-label={tr("Notifications InvestPro", "InvestPro notifications")} className={(manual ? "ip-push-settings" : "ip-push-prompt") + " fixed inset-x-3 bottom-24 z-[1200] mx-auto max-w-md rounded-2xl border border-[color:var(--gold-border)] bg-[#11130f] p-4 shadow-2xl shadow-black/50 sm:inset-x-auto sm:bottom-6 sm:right-6"}>
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><Bell size={18} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{tr("Vos notifications InvestPro", "Your InvestPro notifications")}</div><p className="mt-1 text-xs leading-5 text-white/55">{tr("Activez les alertes de votre compte et les publications VIP si votre accès est validé. Sur Android, l’activation fonctionne aussi directement dans votre navigateur.", "Enable account alerts and VIP posts if your access is approved. On Android, you can also enable alerts directly in your browser.")}</p></div><button type="button" onClick={dismiss} disabled={busy} aria-label={tr("Fermer", "Close")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/45"><X size={16} /></button></div>
    {error && <div className="mt-3"><p role="alert" className="text-xs leading-5 text-amber-200">{error}</p><button type="button" disabled={busy} onClick={() => window.dispatchEvent(new Event("investpro:open-push-settings"))} className="mt-2 min-h-11 text-xs text-[color:var(--gold)]">{tr("Vérifier mes réglages", "Check my settings")}</button></div>}
    {success && <p role="status" className="mt-3 flex gap-2 text-xs leading-5 text-emerald-200"><Check size={15} className="shrink-0" aria-hidden="true" />{success}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={dismiss} disabled={busy} className="min-h-11 flex-1 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-white/65">{success ? tr("Fermer", "Close") : tr("Plus tard · 7 jours", "Later · 7 days")}</button>{!success && <button type="button" onClick={() => void enableNotifications()} disabled={busy || !canEnable} className="min-h-11 flex-1 rounded-xl bg-[color:var(--gold)] px-3 text-xs font-bold text-black disabled:opacity-60">{busy ? tr("Activation…", "Enabling…") : tr("Activer / réparer mes alertes", "Enable / repair my alerts")}</button>}</div>
    <p className="mt-3 text-[11px] leading-5 text-white/40">{tr("Vous retrouverez ce réglage dans Plus → Notifications. Installer InvestPro ajoute aussi son icône à votre téléphone.", "You can reopen this setting from More → Notifications. Installing InvestPro also adds its icon to your phone.")}</p>
  </aside>;
}
