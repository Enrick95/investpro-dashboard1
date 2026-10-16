"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Smartphone } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest, type VipAccess } from "@/lib/vip/client";
import { activateConfiguredPush } from "@/lib/push/activation-client";
import { PushSetupError, pushSetupErrorText } from "@/lib/push/setup";

/** Explicit opt-in only: opening administration never prompts for notifications. */
export default function AdminPhoneAlerts() {
  const { locale, t } = useLocale();
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    vipRequest<VipAccess>("/api/vip/access", { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setAdmin(result.admin === true);
    }).catch(() => { /* Server verification fails closed. */ });
    return () => controller.abort();
  }, []);

  async function enable() {
    if (!admin || busy) return;
    setMessage("");
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage(tr("Ouvrez InvestPro dans un navigateur compatible ou depuis l’application installée pour activer les alertes.", "Open InvestPro in a compatible browser or installed web app to enable alerts.")); return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (ios && !installed) {
      setMessage(tr("Sur iPhone : ouvrez InvestPro dans Safari → Partager → Sur l’écran d’accueil. Ouvrez ensuite son icône et activez les alertes ici. iOS 16.4 minimum.", "On iPhone: open InvestPro in Safari → Share → Add to Home Screen. Then open its icon and enable alerts here. Requires iOS 16.4 or later.")); return;
    }
    setBusy(true);
    try {
      // Invoke synchronously from the click before any network await, including on iOS.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(tr("Notifications non autorisées. Vous pouvez les activer dans les réglages de votre appareil.", "Notifications were not allowed. You can enable them in your device settings."));
      const setup = await activateConfiguredPush();
      if (!setup.channels.includes("vip")) throw new PushSetupError("unavailable");
      setActive(true); setMessage(tr("Alertes administrateur activées sur cet appareil : nouvelles demandes et validations VIP. La cloche InvestPro reste disponible sur le site.", "Admin alerts are enabled on this device for new VIP applications and approvals. The InvestPro notification bell remains available on the site."));
    } catch (cause) { setMessage(cause instanceof PushSetupError ? pushSetupErrorText(cause, locale === "en") : cause instanceof Error ? t(cause.message) : tr("Impossible d’activer les alertes.", "Could not enable alerts.")); }
    finally { setBusy(false); }
  }

  if (!admin) return null;
  return <div className="min-w-0 space-y-2">
    <button type="button" onClick={() => void enable()} disabled={busy || active} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#766037] bg-[#252413] px-4 py-2 text-sm text-[#ffcf78] disabled:opacity-60">
      {active ? <BellRing size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
      {busy ? tr("Activation…", "Enabling…") : active ? tr("Alertes activées", "Alerts enabled") : tr("Activer mes alertes admin", "Enable my admin alerts")}
    </button>
    {message && <p role="status" className="flex max-w-xl items-start gap-2 text-xs leading-relaxed text-[#c9d5c3]"><Smartphone size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{message}</p>}
  </div>;
}
