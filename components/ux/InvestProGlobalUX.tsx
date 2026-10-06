"use client";

import { useEffect, useState } from "react";
import { ArrowUp, CheckCircle2, WifiOff } from "lucide-react";

export default function InvestProGlobalUX() {
  const [online, setOnline] = useState(true);
  const [showTop, setShowTop] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const onOnline = () => {
      setOnline(true);
      setRestored(true);
      window.setTimeout(() => setRestored(false), 2400);
    };
    const onOffline = () => setOnline(false);
    const onScroll = () => setShowTop(window.scrollY > 700);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      {!online ? (
        <div className="ip-network-banner is-offline">
          <WifiOff size={14} />
          Connexion internet interrompue — tes données ne peuvent pas être synchronisées pour le moment.
        </div>
      ) : null}

      {restored ? (
        <div className="ip-network-banner is-restored">
          <CheckCircle2 size={14} />
          Connexion rétablie.
        </div>
      ) : null}

      {showTop ? (
        <button
          type="button"
          className="ip-scroll-top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Retour en haut"
          title="Retour en haut"
        >
          <ArrowUp size={16} />
        </button>
      ) : null}
    </>
  );
}
