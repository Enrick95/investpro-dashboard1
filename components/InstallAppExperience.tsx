"use client";

import { useEffect, useRef, useState } from "react";
import {
  Apple,
  Check,
  Download,
  MonitorSmartphone,
  MoreVertical,
  Share,
  Smartphone,
  X,
} from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_REMINDER_KEY = "investpro-install-reminder-until-v2";

function canOfferInstall() {
  try {
    const until = Number(window.localStorage.getItem(INSTALL_REMINDER_KEY));
    return !Number.isFinite(until) || until <= Date.now();
  } catch { return true; }
}

function rememberInstallOffer(days: number) {
  try {
    window.localStorage.setItem(INSTALL_REMINDER_KEY, String(Date.now() + days * 86400000));
  } catch { /* Private browsing must not prevent opening or closing the invitation. */ }
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone =
    typeof navigator !== "undefined" &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return Boolean(mediaStandalone || iosStandalone);
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function InstallAppExperience() {
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<"ios" | "android">("ios");
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [installError, setInstallError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let installed = isStandaloneMode();
    const mobile = window.matchMedia("(max-width: 900px)");
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const timer = window.setTimeout(() => {
      setStandalone(installed);
      setBannerVisible(!installed && mobile.matches && canOfferInstall());
    }, 3000);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      installed = true;
      setBannerVisible(false);
      setGuideOpen(false);
      setDeferredPrompt(null);
      setStandalone(true);
      rememberInstallOffer(30);
    };
    const onDisplayMode = () => {
      installed = isStandaloneMode();
      setStandalone(installed);
      if (installed) setBannerVisible(false);
    };
    const onMobile = () => setBannerVisible(!installed && mobile.matches && canOfferInstall());
    const onOpenGuide = () => {
      installed = isStandaloneMode();
      setStandalone(installed);
      setTab(isIOSDevice() ? "ios" : "android");
      setInstallError("");
      setGuideOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("investpro:open-install-guide", onOpenGuide);
    mobile.addEventListener("change", onMobile);
    displayMode.addEventListener("change", onDisplayMode);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("investpro:open-install-guide", onOpenGuide);
      mobile.removeEventListener("change", onMobile);
      displayMode.removeEventListener("change", onDisplayMode);
    };
  }, []);

  useEffect(() => {
    if (!guideOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>(".ip-install-close")?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); setGuideOpen(false); return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      const outside = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [guideOpen]);

  function closeGuide() {
    setGuideOpen(false);
  }

  function remindLater() {
    rememberInstallOffer(7);
    setBannerVisible(false);
    setGuideOpen(false);
  }

  function markInstalled() {
    rememberInstallOffer(30);
    setBannerVisible(false);
    setGuideOpen(false);
  }

  async function installAndroid() {
    if (!deferredPrompt) return;
    setInstallError("");
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") markInstalled();
    } catch {
      setInstallError("L’installation directe n’est pas disponible. Utilise le menu Chrome indiqué ci-dessus.");
    } finally {
      setDeferredPrompt(null);
    }
  }

  return (
    <>
      {bannerVisible && !standalone && !guideOpen ? (
        <aside className="ip-install-banner" aria-label="Installer InvestPro">
          <Smartphone size={25} aria-hidden="true" />
          <div className="ip-install-banner-copy">
            <strong>InvestPro sur ton téléphone</strong>
            <span>Ajoute l’app à ton écran d’accueil.</span>
          </div>
          <button type="button" className="ip-install-banner-action" onClick={() => { setTab(isIOSDevice() ? "ios" : "android"); setInstallError(""); setGuideOpen(true); }}>Installer</button>
          <button type="button" className="ip-install-banner-dismiss" onClick={remindLater} aria-label="Me le rappeler plus tard"><X size={17} /></button>
        </aside>
      ) : null}
      {guideOpen ? (
        <div className="ip-install-overlay">
          <button
            type="button"
            aria-label="Fermer"
            tabIndex={-1}
            className="ip-install-backdrop"
            onClick={closeGuide}
          />

          <section ref={dialogRef} tabIndex={-1} className="ip-install-modal" role="dialog" aria-modal="true" aria-labelledby="ip-install-title" aria-describedby="ip-install-description">
            <button
              type="button"
              className="ip-install-close"
              onClick={closeGuide}
              aria-label="Fermer"
            >
              <X size={20} />
            </button>

            <div className="ip-install-badge">
              <MonitorSmartphone size={13} />
              InvestPro Mobile
            </div>

            <h2 id="ip-install-title" className="ip-install-title">
              {standalone ? <>Ton application <span>est déjà ouverte.</span></> : <>Installe InvestPro comme une <span>vraie app.</span></>}
            </h2>

            <p id="ip-install-description" className="ip-install-subtitle">
              {standalone ? "Tu utilises déjà InvestPro en mode application. Aucune nouvelle installation n’est nécessaire ici. Tu peux retrouver ci-dessous les étapes pour un autre téléphone." : "Accède à ton espace directement depuis ton écran d’accueil, sans chercher le site à chaque fois."}
            </p>

            <div className="ip-install-benefits">
              <span><Check size={13} /> Accès en 1 clic</span>
              <span><Check size={13} /> iPhone & Android</span>
              <span><Check size={13} /> Aucun App Store</span>
            </div>

            <div className="ip-install-tabs" aria-label="Choisir ton téléphone">
              <button
                type="button"
                onClick={() => setTab("ios")}
                aria-pressed={tab === "ios"}
                className={tab === "ios" ? "active" : ""}
              >
                <Apple size={17} />
                iPhone
              </button>

              <button
                type="button"
                onClick={() => setTab("android")}
                aria-pressed={tab === "android"}
                className={tab === "android" ? "active" : ""}
              >
                <Smartphone size={17} />
                Android
              </button>
            </div>

            {tab === "ios" ? (
              <div className="ip-install-steps">
                <InstallStep
                  number="1"
                  icon={<Apple size={17} />}
                  title="Ouvre InvestPro dans Safari"
                  text="Le raccourci iPhone s’ajoute directement depuis Safari."
                />
                <InstallStep
                  number="2"
                  icon={<Share size={17} />}
                  title="Appuie sur Partager"
                  text="Utilise l’icône de partage située dans la barre Safari."
                />
                <InstallStep
                  number="3"
                  icon={<Download size={17} />}
                  title="Choisis « Sur l’écran d’accueil »"
                  text="Active « Ouvrir comme app web » si proposé, puis confirme avec « Ajouter »."
                />
              </div>
            ) : (
              <div className="ip-install-steps">
                <InstallStep
                  number="1"
                  icon={<Smartphone size={17} />}
                  title="Ouvre InvestPro dans Chrome"
                  text="Utilise Chrome sur ton téléphone Android, Samsung inclus."
                />
                <InstallStep
                  number="2"
                  icon={<MoreVertical size={17} />}
                  title="Ouvre le menu ⋮"
                  text="Appuie sur les trois points en haut à droite."
                />
                <InstallStep
                  number="3"
                  icon={<Download size={17} />}
                  title="Installe l’application"
                  text="Choisis « Installer et créer un raccourci » ou « Installer l’application », puis confirme avec « Installer »."
                />
                <p className="ip-install-platform-note"><strong>Samsung Internet :</strong> touche l’icône d’installation dans la barre d’adresse si elle apparaît. Sinon, ouvre InvestPro dans Chrome et suis les étapes ci-dessus.</p>
              </div>
            )}

            {tab === "android" && deferredPrompt && !standalone ? (
              <button
                type="button"
                className="ip-install-primary"
                onClick={installAndroid}
              >
                <Download size={17} />
                Installer maintenant
              </button>
            ) : null}

            {installError ? <p role="alert" className="ip-install-subtitle">{installError}</p> : null}

            <button
              type="button"
              className="ip-install-done"
              onClick={standalone ? closeGuide : markInstalled}
            >
              <Check size={16} />
              {standalone ? "Fermer le guide" : "J’ai terminé l’installation"}
            </button>

            <button
              type="button"
              className="ip-install-later"
              onClick={remindLater}
            >
              Continuer plus tard
            </button>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .ip-install-banner { display: none; }

        @media (max-width: 900px) {
          .ip-install-banner {
            position: fixed;
            z-index: 1250;
            left: 12px;
            right: 12px;
            bottom: calc(88px + env(safe-area-inset-bottom));
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 10px 14px 14px;
            border: 1px solid rgba(224,182,79,.35);
            border-radius: 18px;
            background: #11140f;
            color: #e0b64f;
            box-shadow: 0 12px 40px rgba(0,0,0,.5);
          }
          .ip-install-banner-copy { flex: 1; min-width: 0; }
          .ip-install-banner-copy strong { display: block; color: white; font-size: 12px; line-height: 1.4; }
          .ip-install-banner-copy span { display: block; margin-top: 3px; color: rgba(255,255,255,.6); font-size: 10px; line-height: 1.4; }
          .ip-install-banner-action { min-height: 44px; padding: 0 12px; border: 0; border-radius: 11px; background: #e0b64f; color: #090a09; font-size: 11px; font-weight: 750; }
          .ip-install-banner-dismiss { display: grid; place-items: center; min-width: 32px; min-height: 44px; border: 0; background: transparent; color: rgba(255,255,255,.6); }
        }

          .ip-install-overlay {
            position: fixed;
            inset: 0;
            z-index: 1900;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
            box-sizing: border-box;
          }

          .ip-install-backdrop {
            position: absolute;
            inset: 0;
            border: 0;
            background: rgba(0,0,0,.80);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }

          .ip-install-modal {
            position: relative;
            z-index: 1;
            width: min(100%, 560px);
            min-width: 0;
            max-height: calc(100vh - 48px);
            max-height: calc(100dvh - 48px);
            overflow-y: auto;
            overscroll-behavior: contain;
            border: 1px solid rgba(224,182,79,.28);
            border-radius: 26px;
            padding: 26px 24px 22px;
            background:
              radial-gradient(circle at 100% 0, rgba(224,182,79,.08), transparent 34%),
              #0c0e0c;
            box-shadow: 0 32px 90px rgba(0,0,0,.72);
            scrollbar-width: thin;
            box-sizing: border-box;
          }

          .ip-install-modal * { box-sizing: border-box; }
          .ip-install-modal button:focus-visible {
            outline: 2px solid #e0b64f;
            outline-offset: 3px;
          }

          .ip-install-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 44px;
            height: 44px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,.08);
            background: rgba(255,255,255,.035);
            display: grid;
            place-items: center;
            color: rgba(255,255,255,.68);
          }

          .ip-install-badge {
            width: fit-content;
            max-width: calc(100% - 50px);
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 7px 10px;
            border: 1px solid rgba(224,182,79,.25);
            border-radius: 999px;
            background: rgba(224,182,79,.07);
            color: var(--gold, #e0b64f);
            font-size: 9px;
            font-weight: 800;
            letter-spacing: .12em;
            text-transform: uppercase;
          }

          .ip-install-title {
            margin-top: 17px;
            max-width: 430px;
            color: white;
            font-size: clamp(25px, 7vw, 34px);
            line-height: 1.13;
            letter-spacing: -.035em;
            font-weight: 800;
          }

          .ip-install-title span {
            color: var(--gold, #e0b64f);
          }

          .ip-install-subtitle {
            margin-top: 10px;
            max-width: 480px;
            color: rgba(255,255,255,.66);
            font-size: 13px;
            line-height: 1.6;
          }

          .ip-install-benefits {
            margin-top: 16px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px 12px;
          }

          .ip-install-benefits span {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: rgba(255,255,255,.66);
            font-size: 11px;
            font-weight: 650;
          }

          .ip-install-benefits svg {
            color: #34d399;
          }

          .ip-install-tabs {
            margin-top: 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .ip-install-tabs button {
            height: 48px;
            border-radius: 13px;
            border: 1px solid rgba(255,255,255,.08);
            background: rgba(255,255,255,.025);
            color: rgba(255,255,255,.44);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            font-size: 12px;
            font-weight: 750;
          }

          .ip-install-tabs button.active {
            border-color: rgba(224,182,79,.42);
            background: rgba(224,182,79,.09);
            color: var(--gold, #e0b64f);
          }

          .ip-install-steps {
            margin-top: 13px;
            display: grid;
            gap: 9px;
          }

          .ip-install-step {
            display: grid;
            grid-template-columns: 38px 24px minmax(0,1fr);
            gap: 10px;
            align-items: center;
            padding: 12px;
            border-radius: 15px;
            border: 1px solid rgba(255,255,255,.065);
            background: rgba(255,255,255,.025);
          }

          .ip-install-step-number {
            width: 38px;
            height: 38px;
            border-radius: 12px;
            display: grid;
            place-items: center;
            border: 1px solid rgba(224,182,79,.25);
            background: rgba(224,182,79,.09);
            color: var(--gold, #e0b64f);
            font-size: 14px;
            font-weight: 800;
          }

          .ip-install-step-icon {
            color: rgba(255,255,255,.48);
          }

          .ip-install-step-title {
            color: white;
            font-size: 13px;
            font-weight: 750;
            line-height: 1.5;
          }

          .ip-install-step-text {
            margin-top: 2px;
            color: rgba(255,255,255,.64);
            font-size: 12px;
            line-height: 1.65;
          }
          .ip-install-platform-note { margin: 5px 2px 0; color: rgba(255,255,255,.64); font-size: 12px; line-height: 1.7; }
          .ip-install-platform-note strong { color: rgba(255,255,255,.85); }

          .ip-install-primary,
          .ip-install-done,
          .ip-install-later {
            width: 100%;
            margin-top: 12px;
            border-radius: 13px;
            font-weight: 750;
          }

          .ip-install-primary {
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            border: 0;
            background: var(--gold, #e0b64f);
            color: #090a09;
            font-size: 12px;
          }

          .ip-install-done {
            height: 46px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            border: 1px solid rgba(224,182,79,.25);
            background: rgba(224,182,79,.075);
            color: var(--gold, #e0b64f);
            font-size: 11px;
          }

          .ip-install-later {
            min-height: 44px;
            border: 0;
            background: transparent;
            color: rgba(255,255,255,.60);
            font-size: 12px;
          }
        @media (max-width: 900px) {
          .ip-install-overlay { align-items: flex-end; padding: 14px 12px calc(14px + env(safe-area-inset-bottom)); }
          .ip-install-modal { max-height: calc(100vh - 28px - env(safe-area-inset-bottom)); max-height: calc(100dvh - 28px - env(safe-area-inset-bottom)); padding: 24px 18px 18px; }
        }
        @media (max-width: 420px) {
          .ip-install-step { grid-template-columns: 32px minmax(0,1fr); padding: 11px 10px; gap: 9px; align-items: start; }
          .ip-install-step-number { width: 30px; height: 30px; border-radius: 10px; font-size: 12px; }
          .ip-install-step-icon { display: none; }
          .ip-install-title { font-size: 27px; }
          .ip-install-benefits { gap: 7px 10px; }
        }
      `}</style>
    </>
  );
}

function InstallStep({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="ip-install-step">
      <div className="ip-install-step-number">{number}</div>
      <div className="ip-install-step-icon">{icon}</div>
      <div>
        <div className="ip-install-step-title">{title}</div>
        <div className="ip-install-step-text">{text}</div>
      </div>
    </div>
  );
}
