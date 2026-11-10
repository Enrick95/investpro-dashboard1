"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ENRICK_TIKTOK_HANDLE, ENRICK_TIKTOK_URL, ENRICK_YOUTUBE_HANDLE, ENRICK_YOUTUBE_URL, REFERRAL_BONUS, REFERRAL_CLIPS } from "@/lib/clip/rules";

/** Diaporama « Pour bien démarrer » : page d'inscription, attente de réponse et première visite de l'espace. */

export type StartSlide = { key: string; icon: "phone" | "film" | "check" | "gift"; title: string; text: string; ctas?: { label: string; href: string }[] };

export function startSlides(where: "join" | "space"): StartSlide[] {
  const space = where === "space";
  return [
    {
      key: "start",
      icon: "phone",
      title: "Commence dès aujourd'hui",
      text: `Prends mes vidéos sur mon TikTok ${ENRICK_TIKTOK_HANDLE} et sur ma chaîne YouTube ${ENRICK_YOUTUBE_HANDLE}, coupe les meilleurs passages et republie-les sur tous tes réseaux : TikTok, Instagram, YouTube Shorts, Facebook, Snapchat, X…`,
      ctas: [{ label: "Mon TikTok", href: ENRICK_TIKTOK_URL }, { label: "Ma chaîne YouTube", href: ENRICK_YOUTUBE_URL }],
    },
    {
      key: "long",
      icon: "film",
      title: "Mes vidéos longues, ici",
      text: space
        ? "Je poste mes vidéos longues dans l'onglet Campagnes, rubrique « Vidéos à clipper » : télécharge-les et tires-en plusieurs clips."
        : "Je poste aussi mes vidéos longues directement dans ton espace : tu les télécharges et tu en tires plusieurs clips.",
    },
    {
      key: "submit",
      icon: "check",
      title: "Colle ton lien, je valide",
      text: space
        ? "Ton clip est en ligne ? Colle son lien dans « Soumettre ». Je le regarde, je le valide, et il entre dans ton prochain versement."
        : "Une fois accepté, tu colles le lien de chaque clip dans ton espace. Je le valide, et il entre dans ton prochain versement.",
    },
    {
      key: "referral",
      icon: "gift",
      title: "Invite tes potes",
      text: space
        ? `Avec ton lien de parrainage (sur l'accueil), tu touches ${REFERRAL_BONUS} € quand un clippeur que tu as invité a ${REFERRAL_CLIPS} clips validés.`
        : `Une fois dans l'équipe, ton lien de parrainage te rapporte ${REFERRAL_BONUS} € pour chaque clippeur invité qui a ${REFERRAL_CLIPS} clips validés.`,
    },
  ];
}

const ICONS: Record<StartSlide["icon"], ReactNode> = {
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 9.2v5.6l4.3-2.8z" /></>,
  film: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.7 2.7L16.2 9.5" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12" /><path d="M12 8.5C10.5 5 7 5 7 7s3 1.5 5 1.5zM12 8.5C13.5 5 17 5 17 7s-3 1.5-5 1.5z" /></>,
};

const CSS = ".ipc-slides{scrollbar-width:none}.ipc-slides::-webkit-scrollbar{display:none}";

export function StartSlides({ slides, label = "Pour bien démarrer", interval = 5500, bare = false }: { slides: StartSlide[]; label?: string; interval?: number; bare?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [reduced, setReduced] = useState(false);
  const count = slides.length;

  useEffect(() => {
    try {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(query.matches);
      if (query.matches) setStopped(true);
    } catch {
      setReduced(false);
    }
  }, []);

  const goTo = useCallback((index: number) => {
    const element = track.current;
    if (!element || !count) return;
    const next = ((index % count) + count) % count;
    element.scrollTo({ left: next * element.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setActive(next);
  }, [count, reduced]);

  useEffect(() => {
    if (hover || stopped || count < 2) return;
    const timer = window.setTimeout(() => goTo(active + 1), interval);
    return () => window.clearTimeout(timer);
  }, [active, hover, stopped, count, interval, goTo]);

  function onScroll() {
    const element = track.current;
    if (!element || !element.clientWidth) return;
    const index = Math.min(count - 1, Math.max(0, Math.round(element.scrollLeft / element.clientWidth)));
    if (index !== active) setActive(index);
  }

  return (
    <section
      aria-roledescription="carrousel"
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{ width: "100%", minWidth: "0", textAlign: "left", borderRadius: "20px", background: bare ? "transparent" : "#121511", border: bare ? "0" : "1px solid rgba(240,197,117,0.3)", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <style>{CSS}</style>
      <div ref={track} className="ipc-slides" onScroll={onScroll} onPointerDown={() => setStopped(true)} onTouchStart={() => setStopped(true)} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", overscrollBehaviorX: "contain" }}>
        {slides.map((slide, index) => (
          <div key={slide.key} role="group" aria-roledescription="diapositive" aria-label={`${index + 1} sur ${count}`} aria-hidden={index !== active} style={{ flex: "0 0 100%", minWidth: "0", scrollSnapAlign: "start", padding: bare ? "4px 2px 2px" : "18px 18px 8px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span aria-hidden="true" style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.14)", color: "#F0C575" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[slide.icon]}</svg>
              </span>
              <span style={{ fontSize: "12px", fontWeight: "800", letterSpacing: "0.08em", color: "#F0C575" }}>ÉTAPE {index + 1} / {count}</span>
            </div>
            <h3 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "18px", letterSpacing: "-0.01em", lineHeight: "1.3", color: "#F3EFE6" }}>{slide.title}</h3>
            <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "#C4C8BD" }}>{slide.text}</p>
            {slide.ctas?.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {slide.ctas.map((cta) => (
                  <a key={cta.href} href={cta.href} target="_blank" rel="noopener noreferrer" tabIndex={index === active ? 0 : -1} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(240,197,117,0.45)", color: "#F0C575", fontSize: "13.5px", fontWeight: "800", textDecoration: "none" }}>
                    {cta.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></svg>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {count > 1 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: bare ? "2px 0 0" : "0 8px 6px 10px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {slides.map((slide, index) => (
              <button key={slide.key} type="button" aria-label={`Voir l'étape ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => { setStopped(true); goTo(index); }} style={{ width: "32px", height: "44px", padding: "0", border: "0", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span aria-hidden="true" style={{ display: "block", width: index === active ? "22px" : "8px", height: "8px", borderRadius: "999px", background: index === active ? "#F0C575" : "rgba(255,255,255,0.22)", transition: reduced ? "none" : "width 0.25s ease" }} />
              </button>
            ))}
          </div>
          <button type="button" aria-label={stopped ? "Faire défiler les étapes" : "Arrêter le défilement"} onClick={() => setStopped((value) => !value)} style={{ width: "44px", height: "44px", padding: "0", border: "0", borderRadius: "12px", background: "transparent", color: "#A8ADA3", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">{stopped ? <path d="M8 5.5v13l10.5-6.5z" /> : <><rect x="6.5" y="5.5" width="3.6" height="13" rx="1" /><rect x="13.9" y="5.5" width="3.6" height="13" rx="1" /></>}</svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Fenêtre d'accueil affichée à la première ouverture de l'espace clippeur. */
export function StartPopup({ slides, firstName, onClose }: { slides: StartSlide[]; firstName: string; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return (
    <div onClick={(event) => { if (event.target === event.currentTarget) close.current(); }} style={{ position: "fixed", inset: "0", zIndex: 60, background: "rgba(5,6,5,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ipc-start-title" tabIndex={-1} style={{ width: "100%", maxWidth: "440px", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: "20px", borderRadius: "24px", background: "#0f110e", border: "1px solid rgba(240,197,117,0.35)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: "12px", outline: "none", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
            <h2 id="ipc-start-title" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "20px", letterSpacing: "-0.02em", lineHeight: "1.25" }}>Bienvenue {firstName} !</h2>
            <span style={{ fontSize: "13.5px", color: "#A8ADA3" }}>Tu peux déjà commencer, voici comment.</span>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => close.current()} style={{ flexShrink: "0", width: "44px", height: "44px", marginTop: "-6px", marginRight: "-8px", padding: "0", border: "0", borderRadius: "12px", background: "transparent", color: "#A8ADA3", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
          </button>
        </div>
        <StartSlides slides={slides} label="Pour bien démarrer" bare />
        <button type="button" onClick={() => close.current()} style={{ minHeight: "48px", padding: "0 18px", borderRadius: "14px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "14px", fontWeight: "800" }}>C&apos;est parti</button>
      </div>
    </div>
  );
}
