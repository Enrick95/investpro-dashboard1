"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Apple,
  Check,
  ChevronRight,
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

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone =
    typeof navigator !== "undefined" &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return Boolean(mediaStandalone || iosStandalone);
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(max-width: 900px)")?.matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function InstallAppExperience() {
  const pathname = usePathname();

  const [guideOpen, setGuideOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [tab, setTab] = useState<"ios" | "android">("ios");
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mobile = isMobileDevice();
    const standaloneNow = isStandaloneMode();

    setStandalone(standaloneNow);
    setTab(isIOSDevice() ? "ios" : "android");

    if (standaloneNow) {
      window.localStorage.setItem("investpro_app_installed", "1");
      setReminderOpen(false);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
    };

    const onInstalled = () => {
      window.localStorage.setItem("investpro_app_installed", "1");
      window.localStorage.removeItem("investpro_install_remind_after");
      setGuideOpen(false);
      setReminderOpen(false);
      setStandalone(true);
    };

    const onOpenGuide = () => {
      setGuideOpen(true);
      setReminderOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("investpro:open-install-guide", onOpenGuide);

    let timer: number | undefined;

    if (
      mobile &&
      !pathname.startsWith("/dashboard/onboarding") &&
      window.localStorage.getItem("investpro_app_installed") !== "1"
    ) {
      const remindAfter = Number(
        window.localStorage.getItem("investpro_install_remind_after") || 0
      );

      if (!remindAfter || Date.now() >= remindAfter) {
        timer = window.setTimeout(() => {
          setReminderOpen(true);
        }, 2200);
      }
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("investpro:open-install-guide", onOpenGuide);
    };
  }, [pathname]);

  function openGuide() {
    setReminderOpen(false);
    setGuideOpen(true);
  }

  function remindLater() {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      "investpro_install_remind_after",
      String(Date.now() + sevenDays)
    );
    setReminderOpen(false);
  }

  function closeGuide() {
    const oneDay = 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      "investpro_install_remind_after",
      String(Date.now() + oneDay)
    );
    setGuideOpen(false);
  }

  function markInstalled() {
    window.localStorage.setItem("investpro_app_installed", "1");
    window.localStorage.removeItem("investpro_install_remind_after");
    setGuideOpen(false);
    setReminderOpen(false);
  }

  async function installAndroid() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      window.localStorage.setItem("investpro_app_installed", "1");
      setGuideOpen(false);
      setReminderOpen(false);
    }

    setDeferredPrompt(null);
  }

  if (standalone) return null;

  return (
    <>
      {reminderOpen ? (
        <div className="ip-install-reminder">
          <button
            type="button"
            className="ip-install-reminder-close"
            aria-label="Plus tard"
            onClick={remindLater}
          >
            <X size={15} />
          </button>

          <div className="ip-install-reminder-icon">
            <Smartphone size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="ip-install-reminder-kicker">InvestPro Mobile</div>
            <div className="ip-install-reminder-title">
              Mets InvestPro sur ton écran d’accueil
            </div>
            <div className="ip-install-reminder-text">
              Ouvre ton Journal, tes comptes et tes rapports en 1 clic, comme une app.
            </div>
          </div>

          <button type="button" className="ip-install-reminder-btn" onClick={openGuide}>
            Voir comment
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}

      {guideOpen ? (
        <div className="ip-install-overlay">
          <button
            type="button"
            aria-label="Fermer"
            className="ip-install-backdrop"
            onClick={closeGuide}
          />

          <section className="ip-install-modal" role="dialog" aria-modal="true">
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

            <h2 className="ip-install-title">
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
              Me le rappeler plus tard
            </button>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .ip-install-reminder,
        .ip-install-overlay {
          display: none;
        }

        @media (max-width: 900px) {
          .ip-install-reminder {
            position: fixed;
            z-index: 1420;
            left: 12px;
            right: 12px;
            bottom: calc(86px + env(safe-area-inset-bottom));
            display: flex;
            align-items: center;
            gap: 11px;
            padding: 13px 13px 13px 12px;
            border: 1px solid rgba(224,182,79,.30);
            border-radius: 18px;
            background:
              radial-gradient(circle at 0 0, rgba(224,182,79,.12), transparent 42%),
              rgba(12,14,12,.97);
            box-shadow: 0 24px 65px rgba(0,0,0,.58);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
          }

          .ip-install-reminder-close {
            position: absolute;
            right: 8px;
            top: 7px;
            width: 26px;
            height: 26px;
            display: grid;
            place-items: center;
            border: 0;
            background: transparent;
            color: rgba(255,255,255,.35);
          }

          .ip-install-reminder-icon {
            width: 42px;
            height: 42px;
            border-radius: 13px;
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            color: var(--gold, #e0b64f);
            border: 1px solid rgba(224,182,79,.26);
            background: rgba(224,182,79,.08);
          }

          .ip-install-reminder-kicker {
            color: var(--gold, #e0b64f);
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .12em;
            text-transform: uppercase;
          }

          .ip-install-reminder-title {
            margin-top: 2px;
            color: white;
            font-size: 12px;
            font-weight: 750;
          }

          .ip-install-reminder-text {
            margin-top: 2px;
            padding-right: 4px;
            color: rgba(255,255,255,.43);
            font-size: 9px;
            line-height: 1.35;
          }

          .ip-install-reminder-btn {
            height: 38px;
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 0 10px;
            border-radius: 11px;
            border: 1px solid rgba(224,182,79,.28);
            background: rgba(224,182,79,.10);
            color: var(--gold, #e0b64f);
            font-size: 9px;
            font-weight: 750;
            margin-right: 14px;
          }

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
