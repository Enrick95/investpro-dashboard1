"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let installed = isStandaloneMode();
    const mobile = window.matchMedia("(max-width: 900px)");
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const timer = window.setTimeout(() => {
      setStandalone(installed);
      setTab(isIOSDevice() ? "ios" : "android");
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
      if (installed) { setBannerVisible(false); setGuideOpen(false); }
    };
    const onMobile = () => setBannerVisible(!installed && mobile.matches && canOfferInstall());
    const onOpenGuide = () => {
      if (installed) return;
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

  if (standalone) return null;

  return (
    <>
      {bannerVisible && !guideOpen ? (
        <aside className="ip-install-banner" aria-label="Installer InvestPro">
          <Smartphone size={25} aria-hidden="true" />
          <div className="ip-install-banner-copy">
            <strong>InvestPro sur ton téléphone</strong>
            <span>Ajoute l’app à ton écran d’accueil.</span>
          </div>
          <button type="button" className="ip-install-banner-action" onClick={() => { setInstallError(""); setGuideOpen(true); }}>Installer</button>
          <button type="button" className="ip-install-banner-dismiss" onClick={remindLater} aria-label="Me le rappeler plus tard"><X size={17} /></button>
        </aside>
      ) : null}
      {guideOpen ? (
        <div className="ip-install-overlay">
          <button
            type="button"
            aria-label="Fermer"
            className="ip-install-backdrop"
            onClick={closeGuide}
          />

          <section className="ip-install-modal" role="dialog" aria-modal="true" aria-labelledby="ip-install-title">
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
              Installe InvestPro comme une <span>vraie app.</span>
            </h2>

            <p className="ip-install-subtitle">
              Accède à ton espace directement depuis ton écran d’accueil, sans chercher le site à chaque fois.
            </p>

            <div className="ip-install-benefits">
              <span><Check size={13} /> Accès en 1 clic</span>
              <span><Check size={13} /> iPhone & Android</span>
              <span><Check size={13} /> Aucun App Store</span>
            </div>

            <div className="ip-install-tabs">
              <button
                type="button"
                onClick={() => setTab("ios")}
                className={tab === "ios" ? "active" : ""}
              >
                <Apple size={17} />
                iPhone
              </button>

              <button
                type="button"
                onClick={() => setTab("android")}
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
                  text="Puis confirme avec « Ajouter ». InvestPro apparaîtra avec tes applications."
                />
              </div>
            ) : (
              <div className="ip-install-steps">
                <InstallStep
                  number="1"
                  icon={<Smartphone size={17} />}
                  title="Ouvre InvestPro dans Chrome"
                  text="Utilise Chrome sur ton téléphone Android."
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
                  text="Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil »."
                />
              </div>
            )}

            {tab === "android" && deferredPrompt ? (
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
              onClick={markInstalled}
            >
              <Check size={16} />
              J’ai terminé l’installation
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
        .ip-install-overlay, .ip-install-banner { display: none; }

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

          .ip-install-overlay {
            position: fixed;
            inset: 0;
            z-index: 1900;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding: 14px 12px calc(14px + env(safe-area-inset-bottom));
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
            max-height: 88vh;
            overflow-y: auto;
            border: 1px solid rgba(224,182,79,.28);
            border-radius: 26px;
            padding: 22px 18px 18px;
            background:
              radial-gradient(circle at 100% 0, rgba(224,182,79,.08), transparent 34%),
              #0c0e0c;
            box-shadow: 0 32px 90px rgba(0,0,0,.72);
            scrollbar-width: none;
          }

          .ip-install-modal::-webkit-scrollbar {
            display: none;
          }

          .ip-install-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 38px;
            height: 38px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,.08);
            background: rgba(255,255,255,.035);
            display: grid;
            place-items: center;
            color: rgba(255,255,255,.68);
          }

          .ip-install-badge {
            width: fit-content;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 7px 10px;
            border: 1px solid rgba(224,182,79,.25);
            border-radius: 999px;
            background: rgba(224,182,79,.07);
            color: var(--gold, #e0b64f);
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .12em;
            text-transform: uppercase;
          }

          .ip-install-title {
            margin-top: 17px;
            max-width: 430px;
            color: white;
            font-size: clamp(25px, 7vw, 34px);
            line-height: 1.03;
            letter-spacing: -.035em;
            font-weight: 800;
          }

          .ip-install-title span {
            color: var(--gold, #e0b64f);
          }

          .ip-install-subtitle {
            margin-top: 10px;
            max-width: 480px;
            color: rgba(255,255,255,.48);
            font-size: 12px;
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
            font-size: 9px;
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
            grid-template-columns: 42px 34px minmax(0,1fr);
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
            font-size: 11px;
            font-weight: 750;
          }

          .ip-install-step-text {
            margin-top: 2px;
            color: rgba(255,255,255,.38);
            font-size: 9px;
            line-height: 1.45;
          }

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
            height: 36px;
            border: 0;
            background: transparent;
            color: rgba(255,255,255,.34);
            font-size: 9px;
          }
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
