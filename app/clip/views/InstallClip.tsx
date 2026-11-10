"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * L'app InvestPro Clip sur le téléphone : bandeau « Installer » puis guide iPhone / Android.
 * Sur Android (Chrome), l'installation se fait en un tap avec la fenêtre native du navigateur.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const OPEN_EVENT = "investproclip:install";
const REMIND_KEY = "ipc-install-until";
const DAY = 86_400_000;
const ICON = "/clip-app/icon-192.png";

/** Ouvre le guide d'installation depuis n'importe quel écran. */
export function openClipInstall() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Vrai quand le site tourne déjà comme une app installée. */
export function isClipStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone);
}

function mayRemind(): boolean {
  try {
    const until = Number(window.localStorage.getItem(REMIND_KEY));
    return !Number.isFinite(until) || until <= Date.now();
  } catch {
    return true;
  }
}

function snooze(days: number) {
  try {
    window.localStorage.setItem(REMIND_KEY, String(Date.now() + days * DAY));
  } catch {
    // navigation privée : le bandeau reviendra simplement plus tôt
  }
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Navigateur intégré d'une app (lien ouvert depuis une bio) : on ne peut rien y installer. */
function inAppBrowser(): string | null {
  const ua = navigator.userAgent;
  if (/musical_ly|bytedance|tiktok|trill_/i.test(ua)) return "TikTok";
  if (/instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/snapchat/i.test(ua)) return "Snapchat";
  return null;
}

const STEPS = {
  ios: [
    { title: "Ouvre investproclip.com dans Safari", text: "Si le lien s'est ouvert dans TikTok ou Instagram, passe d'abord dans Safari." },
    { title: "Touche Partager", text: "Le carré avec la flèche vers le haut, en bas de l'écran (ou dans le menu •••)." },
    { title: "Choisis « Sur l'écran d'accueil »", text: "Laisse « Ouvrir comme app web » activé, puis touche « Ajouter »." },
  ],
  android: [
    { title: "Ouvre investproclip.com dans Chrome", text: "Si le lien s'est ouvert dans TikTok ou Instagram, passe d'abord dans Chrome." },
    { title: "Ouvre le menu ⋮", text: "Les trois points, en haut à droite de Chrome." },
    { title: "Touche « Installer l'application »", text: "Ou « Ajouter à l'écran d'accueil », puis confirme." },
  ],
} as const;

export default function InstallClip() {
  const pathname = usePathname() ?? "";
  const off = /(^|\/)(admin|apercu)(\/|$)/.test(pathname);
  const [banner, setBanner] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ios" | "android">("ios");
  const [native, setNative] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [inApp, setInApp] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    setStandalone(isClipStandalone());
    setInApp(inAppBrowser());
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setNative(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      snooze(365);
      setBanner(false);
      setOpen(false);
      setNative(null);
      setStandalone(true);
    };
    const onOpen = () => {
      setTab(isIOS() ? "ios" : "android");
      setFailed(false);
      setOpen(true);
    };
    // Le clavier ouvert remonte les éléments fixes : on range le bandeau pendant la saisie.
    const onFocusIn = (event: FocusEvent) => {
      const element = event.target as HTMLElement | null;
      setTyping(Boolean(element && /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));
    };
    const onFocusOut = () => setTyping(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(OPEN_EVENT, onOpen);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(OPEN_EVENT, onOpen);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    if (off) {
      setBanner(false);
      return;
    }
    let tries = 0;
    let timer = 0;
    const check = () => {
      if (isClipStandalone() || !mayRemind() || !window.matchMedia("(max-width: 900px)").matches) return;
      // Une fenêtre est déjà ouverte (bienvenue, envoi…) : on repasse plus tard.
      if (document.querySelector('[aria-modal="true"]') && tries++ < 20) {
        timer = window.setTimeout(check, 3000);
        return;
      }
      setBanner(true);
    };
    timer = window.setTimeout(check, 4000);
    return () => window.clearTimeout(timer);
  }, [off]);

  useEffect(() => {
    if (!open) return;
    const dialog = sheet.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>(".ipci-close")?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]")).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  function later() {
    snooze(7);
    setBanner(false);
    setOpen(false);
  }

  function done() {
    if (!standalone) snooze(60);
    setBanner(false);
    setOpen(false);
  }

  async function installNow() {
    if (!native) return;
    setFailed(false);
    try {
      await native.prompt();
      const choice = await native.userChoice;
      snooze(choice.outcome === "accepted" ? 365 : 7);
      setBanner(false);
      setOpen(false);
    } catch {
      setFailed(true);
      setTab("android");
      setOpen(true);
    } finally {
      setNative(null);
    }
  }

  function onBannerInstall() {
    if (native && !inApp) {
      void installNow();
      return;
    }
    setTab(isIOS() ? "ios" : "android");
    setFailed(false);
    setOpen(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  const browser = tab === "ios" ? "Safari" : "Chrome";

  return (
    <>
      {banner && !open && !standalone && !typing && !off ? (
        <aside className="ipci-banner" aria-label="Installer l'app InvestPro Clip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON} alt="" width={44} height={44} className="ipci-icon" />
          <div className="ipci-banner-copy">
            <strong>InvestPro Clip sur ton téléphone</strong>
            <span>Ton espace clippeur en un tap, comme une vraie app.</span>
          </div>
          <button type="button" className="ipci-banner-cta" onClick={onBannerInstall}>Installer</button>
          <button type="button" className="ipci-banner-x" onClick={later} aria-label="Me le rappeler plus tard">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </aside>
      ) : null}

      {open ? (
        <div className="ipci-overlay">
          <button type="button" className="ipci-backdrop" aria-label="Fermer" tabIndex={-1} onClick={() => setOpen(false)} />
          <section ref={sheet} className="ipci-sheet" role="dialog" aria-modal="true" aria-labelledby="ipci-title" tabIndex={-1}>
            <span className="ipci-grip" aria-hidden="true" />
            <button type="button" className="ipci-close" onClick={() => setOpen(false)} aria-label="Fermer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>

            <div className="ipci-app">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ICON} alt="" width={56} height={56} />
              <div>
                <strong>InvestPro Clip</strong>
                <span>investproclip.com · gratuit</span>
              </div>
            </div>

            <h2 id="ipci-title" className="ipci-title">
              {standalone ? <>L&apos;app est <em>déjà installée</em>.</> : <>Installe l&apos;app en <em>3 étapes</em>.</>}
            </h2>
            <p className="ipci-sub">
              {standalone
                ? "Tu utilises déjà InvestPro Clip comme une app. Les étapes ci-dessous servent pour un autre téléphone."
                : "Ton espace clippeur sur ton écran d'accueil : campagnes, vidéos à clipper, envoi de clips et paiements, sans chercher le lien."}
            </p>
            <div className="ipci-perks">
              <span>Accès en 1 tap</span>
              <span>iPhone et Android</span>
              <span>Sans App Store</span>
            </div>

            {inApp ? (
              <div className="ipci-warn" role="note">
                <strong>Tu es dans le navigateur de {inApp}</strong>
                <span>L&apos;installation n&apos;y marche pas. Touche ••• puis « Ouvrir dans le navigateur », ou copie le lien et colle-le dans {isIOS() ? "Safari" : "Chrome"}.</span>
                <button type="button" onClick={() => void copyLink()}>{copied ? "Lien copié" : "Copier le lien"}</button>
              </div>
            ) : null}

            <div className="ipci-tabs" aria-label="Choisis ton téléphone">
              <button type="button" aria-pressed={tab === "ios"} onClick={() => setTab("ios")}>iPhone</button>
              <button type="button" aria-pressed={tab === "android"} onClick={() => setTab("android")}>Android</button>
            </div>

            <ol className="ipci-steps" aria-label={`Installer avec ${browser}`}>
              {STEPS[tab].map((step, index) => (
                <li key={step.title}>
                  <span className="ipci-num" aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong className="ipci-step-title">{step.title}</strong>
                    <span className="ipci-step-text">{step.text}</span>
                  </div>
                </li>
              ))}
            </ol>

            {tab === "android" && native && !inApp && !standalone ? (
              <button type="button" className="ipci-primary" onClick={() => void installNow()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
                Installer maintenant
              </button>
            ) : null}
            {failed ? <p role="alert" className="ipci-error">L&apos;installation directe n&apos;a pas marché : passe par le menu ⋮ de Chrome.</p> : null}

            <button type="button" className="ipci-done" onClick={done}>{standalone ? "Fermer" : "J'ai installé l'app"}</button>
            {standalone ? null : <button type="button" className="ipci-later" onClick={later}>Plus tard</button>}
          </section>
        </div>
      ) : null}

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.ipci-banner { position: fixed; z-index: 55; left: 12px; right: 12px; bottom: calc(88px + env(safe-area-inset-bottom)); max-width: 456px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 6px 12px 12px; border-radius: 20px; border: 1px solid rgba(240,197,117,0.38); background: linear-gradient(120deg, rgba(240,197,117,0.12), rgba(240,197,117,0) 55%), #121511; box-shadow: 0 18px 46px rgba(0,0,0,0.55); color: #F3EFE6; font-family: Manrope, system-ui, sans-serif; animation: ipci-up 0.45s cubic-bezier(0.2,0.8,0.2,1) both; }
.ipci-icon { flex: none; width: 44px; height: 44px; border-radius: 12px; box-shadow: 0 0 0 1px rgba(240,197,117,0.28); }
.ipci-banner-copy { flex: 1; min-width: 0; }
.ipci-banner-copy strong { display: block; font-size: 13px; line-height: 1.3; font-weight: 800; }
.ipci-banner-copy span { display: block; margin-top: 2px; font-size: 11.5px; line-height: 1.35; color: #A8ADA3; }
.ipci-banner-cta { flex: none; min-height: 44px; padding: 0 14px; border: 0; border-radius: 12px; background: #F0C575; color: #0b0d0b; font: 800 13px Manrope, system-ui, sans-serif; cursor: pointer; }
.ipci-banner-x { flex: none; display: grid; place-items: center; width: 34px; min-height: 44px; border: 0; background: transparent; color: #A8ADA3; cursor: pointer; }
.ipci-overlay { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-end; justify-content: center; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); }
.ipci-backdrop { position: absolute; inset: 0; border: 0; background: rgba(5,6,5,0.78); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: ipci-fade 0.25s ease both; }
.ipci-sheet { position: relative; width: 100%; max-width: 460px; max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); overflow-y: auto; overscroll-behavior: contain; padding: 10px 18px 14px; border-radius: 26px; border: 1px solid rgba(240,197,117,0.3); background: radial-gradient(circle at 100% 0, rgba(240,197,117,0.11), transparent 42%), radial-gradient(circle at 0 100%, rgba(145,214,208,0.07), transparent 45%), #0f110e; color: #F3EFE6; font-family: Manrope, system-ui, sans-serif; box-shadow: 0 28px 80px rgba(0,0,0,0.7); outline: none; animation: ipci-sheet 0.4s cubic-bezier(0.2,0.8,0.2,1) both; }
.ipci-grip { display: block; width: 40px; height: 4px; margin: 0 auto 8px; border-radius: 99px; background: rgba(255,255,255,0.16); }
.ipci-close { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #A8ADA3; cursor: pointer; }
.ipci-app { display: flex; align-items: center; gap: 12px; margin-top: 8px; padding-right: 52px; }
.ipci-app img { flex: none; width: 56px; height: 56px; border-radius: 15px; box-shadow: 0 0 0 1px rgba(240,197,117,0.3), 0 10px 26px rgba(240,197,117,0.14); }
.ipci-app strong { display: block; font-family: Unbounded, Manrope, sans-serif; font-weight: 600; font-size: 15px; letter-spacing: -0.02em; }
.ipci-app span { display: block; margin-top: 2px; font-size: 12px; color: #A8ADA3; }
.ipci-title { margin: 16px 0 0; font-family: Unbounded, Manrope, sans-serif; font-weight: 500; font-size: 22px; line-height: 1.2; letter-spacing: -0.02em; }
.ipci-title em { font-style: normal; color: #F0C575; }
.ipci-sub { margin: 8px 0 0; font-size: 13px; line-height: 1.55; color: #C4C8BD; }
.ipci-perks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.ipci-perks span { padding: 5px 10px; border-radius: 99px; background: rgba(145,214,208,0.08); border: 1px solid rgba(145,214,208,0.22); color: #91D6D0; font-size: 11px; font-weight: 700; }
.ipci-warn { margin-top: 14px; padding: 12px; border-radius: 16px; border: 1px solid rgba(242,180,90,0.4); background: rgba(242,180,90,0.08); display: flex; flex-direction: column; gap: 6px; }
.ipci-warn strong { color: #F2B45A; font-size: 13px; }
.ipci-warn span { font-size: 12.5px; line-height: 1.5; color: #E7E2D6; }
.ipci-warn button { align-self: flex-start; min-height: 40px; padding: 0 14px; border-radius: 11px; border: 1px solid rgba(242,180,90,0.5); background: transparent; color: #F2B45A; font: 800 12.5px Manrope, system-ui, sans-serif; cursor: pointer; }
.ipci-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 16px; padding: 4px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
.ipci-tabs button { min-height: 40px; border: 0; border-radius: 10px; background: transparent; color: #A8ADA3; font: 800 12.5px Manrope, system-ui, sans-serif; cursor: pointer; }
.ipci-tabs button[aria-pressed=true] { background: #F0C575; color: #0b0d0b; }
.ipci-steps { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ipci-steps li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; align-items: start; padding: 12px; border-radius: 16px; background: #121511; border: 1px solid rgba(255,255,255,0.07); }
.ipci-num { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 11px; background: rgba(240,197,117,0.12); border: 1px solid rgba(240,197,117,0.35); color: #F0C575; font-family: Unbounded, Manrope, sans-serif; font-size: 14px; font-weight: 600; }
.ipci-step-title { display: block; font-size: 13.5px; line-height: 1.35; }
.ipci-step-text { display: block; margin-top: 3px; font-size: 12px; line-height: 1.5; color: #A8ADA3; }
.ipci-primary, .ipci-done { width: 100%; min-height: 48px; margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; font: 800 14px Manrope, system-ui, sans-serif; cursor: pointer; }
.ipci-primary { border: 0; background: #F0C575; color: #0b0d0b; }
.ipci-done { border: 1px solid rgba(240,197,117,0.35); background: rgba(240,197,117,0.08); color: #F0C575; }
.ipci-later { display: block; margin: 4px auto 0; min-height: 44px; padding: 0 16px; border: 0; background: transparent; color: #A8ADA3; font: 700 13px Manrope, system-ui, sans-serif; cursor: pointer; }
.ipci-error { margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: #FF6F91; }
.ipci-banner button:focus-visible, .ipci-sheet button:focus-visible { outline: 2px solid #F0C575; outline-offset: 2px; }
@keyframes ipci-up { from { opacity: 0; transform: translate3d(0, 18px, 0); } to { opacity: 1; transform: none; } }
@keyframes ipci-sheet { from { opacity: 0; transform: translate3d(0, 40px, 0); } to { opacity: 1; transform: none; } }
@keyframes ipci-fade { from { opacity: 0; } to { opacity: 1; } }
@media (min-width: 640px) { .ipci-overlay { align-items: center; } }
@media (prefers-reduced-motion: reduce) { .ipci-banner, .ipci-sheet, .ipci-backdrop { animation: none; } }
`;
