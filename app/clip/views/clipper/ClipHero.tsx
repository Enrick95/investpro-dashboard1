"use client";

import type { CSSProperties, ReactNode } from "react";
import { NETWORKS_LIST } from "@/lib/clip/rules";

/**
 * Habillage animé de l'espace clippeurs : fond (lueurs, formats 9:16 qui montent, ciseaux,
 * lecture, vues) et en-tête de la page d'inscription (téléphone qui montre l'espace clippeur,
 * timeline coupée, notifications, réseaux qui défilent). Tout est en CSS, coupé si l'appareil
 * demande moins d'animations.
 */

const CSS = `
@keyframes ipch-rise { from { transform: translate3d(0, 0, 0) rotate(var(--r, 0deg)); } to { transform: translate3d(0, calc(-100vh - 260px), 0) rotate(calc(var(--r, 0deg) * -1)); } }
@keyframes ipch-glow { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(40px, -30px, 0) scale(1.15); } }
@keyframes ipch-toast { 0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.96); } 6%, 30% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } 38%, 100% { opacity: 0; transform: translate3d(0, -8px, 0) scale(0.98); } }
@keyframes ipch-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ipch-head { from { left: 0%; } to { left: 100%; } }
@keyframes ipch-swap-a { 0%, 4% { opacity: 1; } 8%, 92% { opacity: 0; } 96%, 100% { opacity: 1; } }
@keyframes ipch-swap-b { 0%, 4% { opacity: 0; } 8%, 92% { opacity: 1; } 96%, 100% { opacity: 0; } }
@keyframes ipch-pulse-gold { 0%, 100% { box-shadow: 0 0 0 0 rgba(240, 197, 117, 0.55); } 60% { box-shadow: 0 0 0 8px rgba(240, 197, 117, 0); } }
@keyframes ipch-marquee { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, 0, 0); } }
@keyframes ipch-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(145, 214, 208, 0.55); } 60% { box-shadow: 0 0 0 7px rgba(145, 214, 208, 0); } }
@keyframes ipch-snip { 0%, 40%, 100% { transform: translate(-50%, 0) rotate(0deg); } 48% { transform: translate(-50%, 0) rotate(-22deg); } 56% { transform: translate(-50%, 0) rotate(0deg); } }
@keyframes ipch-float { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, -8px, 0); } }
.ipch-gradient { background: linear-gradient(100deg, #F0C575 0%, #F7DDA4 45%, #91D6D0 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
@media (prefers-reduced-motion: reduce) { .ipch-anim, .ipch-anim * { animation: none !important; } .ipch-toast { opacity: 1 !important; } }
`;

type Drifter = { left: string; size: number; delay: number; duration: number; rotate: number; kind: "frame" | "scissors" | "play" | "eye" | "heart"; opacity: number };

const DRIFTERS: Drifter[] = [
  { left: "6%", size: 46, delay: -4, duration: 26, rotate: -8, kind: "frame", opacity: 0.16 },
  { left: "22%", size: 22, delay: -15, duration: 30, rotate: 12, kind: "scissors", opacity: 0.22 },
  { left: "38%", size: 58, delay: -9, duration: 34, rotate: 6, kind: "frame", opacity: 0.12 },
  { left: "55%", size: 20, delay: -22, duration: 28, rotate: -10, kind: "play", opacity: 0.22 },
  { left: "68%", size: 40, delay: -2, duration: 24, rotate: 10, kind: "frame", opacity: 0.15 },
  { left: "82%", size: 22, delay: -12, duration: 32, rotate: -6, kind: "eye", opacity: 0.2 },
  { left: "90%", size: 52, delay: -19, duration: 36, rotate: -12, kind: "frame", opacity: 0.12 },
  { left: "14%", size: 18, delay: -27, duration: 29, rotate: 8, kind: "heart", opacity: 0.2 },
  { left: "47%", size: 20, delay: -31, duration: 33, rotate: -14, kind: "scissors", opacity: 0.18 },
];

function Glyph({ kind, size }: { kind: Drifter["kind"]; size: number }) {
  if (kind === "frame") {
    return (
      <svg width={size} height={Math.round((size * 16) / 9)} viewBox="0 0 45 80" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="43" height="78" rx="8" stroke="#F0C575" strokeWidth="1.5" />
        <path d="M18.5 33v14l11-7z" fill="#F0C575" />
        <rect x="8" y="66" width="29" height="3" rx="1.5" fill="#F0C575" opacity="0.5" />
        <rect x="8" y="66" width="13" height="3" rx="1.5" fill="#F0C575" />
      </svg>
    );
  }
  const paths: Record<Exclude<Drifter["kind"], "frame">, ReactNode> = {
    scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></>,
    play: <path d="M8 5.5v13l10.5-6.5z" />,
    eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
    heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

/** Fond animé, derrière tout le contenu de la page. */
export function ClipBackdrop() {
  return (
    <div aria-hidden="true" className="ipch-anim" style={{ position: "fixed", inset: "0", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", top: "-140px", left: "-120px", width: "420px", height: "420px", borderRadius: "50%", background: "radial-gradient(circle, rgba(240,197,117,0.22) 0%, rgba(240,197,117,0) 70%)", animation: "ipch-glow 16s ease-in-out infinite alternate" }} />
      <div style={{ position: "absolute", bottom: "-160px", right: "-140px", width: "460px", height: "460px", borderRadius: "50%", background: "radial-gradient(circle, rgba(145,214,208,0.16) 0%, rgba(145,214,208,0) 70%)", animation: "ipch-glow 20s ease-in-out infinite alternate-reverse" }} />
      <div style={{ position: "absolute", inset: "0", backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "26px 26px", maskImage: "linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2))", WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2))" }} />
      {DRIFTERS.map((item, index) => (
        <span key={index} style={{ position: "absolute", left: item.left, top: "100%", opacity: item.opacity, willChange: "transform", animation: `ipch-rise ${item.duration}s linear ${item.delay}s infinite`, ["--r" as string]: `${item.rotate}deg` } as CSSProperties}>
          <Glyph kind={item.kind} size={item.size} />
        </span>
      ))}
    </div>
  );
}

function Toast({ children, tone, style, delay }: { children: ReactNode; tone: "gold" | "teal"; style: CSSProperties; delay: number }) {
  return (
    <span className="ipch-toast" style={{ position: "absolute", display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 12px", borderRadius: "14px", background: "rgba(18,21,17,0.92)", border: tone === "gold" ? "1px solid rgba(240,197,117,0.45)" : "1px solid rgba(145,214,208,0.45)", boxShadow: "0 12px 30px rgba(0,0,0,0.45)", color: "#F3EFE6", fontSize: "12.5px", fontWeight: "800", whiteSpace: "nowrap", opacity: 0, animation: `ipch-toast 9s ease-in-out ${delay}s infinite`, ...style }}>
      {children}
    </span>
  );
}

type DashClip = { title: string; network: string; views: string; viewsNext?: string; state: "review-validated" | "validated" | "paid" };

const DASH_CLIPS: DashClip[] = [
  { title: "clip-12", network: "TikTok", views: "2,1 k vues", viewsNext: "12,4 k vues", state: "review-validated" },
  { title: "clip-11", network: "Instagram", views: "18,2 k vues", state: "validated" },
  { title: "clip-10", network: "YouTube", views: "41,7 k vues", state: "paid" },
];

function DashChip({ tone, children, style }: { tone: "warn" | "teal" | "gold"; children: ReactNode; style?: CSSProperties }) {
  const colors = { warn: ["rgba(242,180,90,0.16)", "#F2B45A"], teal: ["rgba(145,214,208,0.16)", "#91D6D0"], gold: ["rgba(240,197,117,0.16)", "#F0C575"] }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 6px", borderRadius: "999px", background: colors[0], color: colors[1], fontSize: "8.5px", fontWeight: "800", whiteSpace: "nowrap", ...style }}>{children}</span>;
}

/** Téléphone qui montre l'espace clippeur : prochain versement, clips qui passent « Validé ». */
function Phone() {
  return (
    <div style={{ position: "relative", width: "192px", height: "352px", borderRadius: "30px", padding: "8px", background: "linear-gradient(160deg, #23281f, #0e110d)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 30px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(240,197,117,0.08)", animation: "ipch-float 4s ease-in-out infinite alternate" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "23px", overflow: "hidden", background: "linear-gradient(180deg, #11150f 0%, #0b0d0b 100%)", padding: "12px 10px 0", display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <svg width="14" height="14" viewBox="0 0 30 30"><rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="2.4" /><path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" /></svg>
            <span style={{ fontSize: "8px", fontWeight: "800", color: "#0b0d0b", background: "#F0C575", padding: "1px 4px", borderRadius: "999px" }}>CLIP</span>
          </span>
          <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(240,197,117,0.16)", color: "#F0C575", fontSize: "7.5px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>KL</span>
        </div>
        <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "12.5px", color: "#F3EFE6" }}>Salut Kevin</span>
        <div style={{ padding: "8px", borderRadius: "12px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "8px", fontWeight: "700", color: "#C4C8BD" }}>Prochain versement<DashChip tone="gold">lun. 16 nov.</DashChip></span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "13px", color: "#F0C575" }}>3 clips validés</span>
          <span style={{ height: "3px", borderRadius: "999px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <span style={{ display: "block", width: "100%", height: "100%", background: "#F0C575", transformOrigin: "left", animation: "ipch-progress 9s ease-in-out infinite" }} />
          </span>
        </div>
        <span style={{ fontSize: "8.5px", fontWeight: "800", color: "#A8ADA3", letterSpacing: "0.06em" }}>MES CLIPS</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {DASH_CLIPS.map((clip) => (
            <div key={clip.title} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px", borderRadius: "10px", background: "#181c16" }}>
              <span style={{ flexShrink: "0", width: "16px", height: "26px", borderRadius: "5px", background: "linear-gradient(160deg, rgba(240,197,117,0.35), rgba(145,214,208,0.25))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="#F3EFE6"><path d="M8 5.5v13l10.5-6.5z" /></svg>
              </span>
              <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ fontSize: "9.5px", fontWeight: "800", color: "#F3EFE6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip.network}</span>
                {clip.viewsNext ? (
                  <span style={{ position: "relative", height: "11px", fontSize: "8.5px", color: "#A8ADA3" }}>
                    <span style={{ position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", animation: "ipch-swap-a 9s ease-in-out infinite" }}>{clip.views}</span>
                    <span style={{ position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", color: "#F0C575", fontWeight: "700", opacity: 0, animation: "ipch-swap-b 9s ease-in-out infinite" }}>{clip.viewsNext}</span>
                  </span>
                ) : <span style={{ fontSize: "8.5px", color: "#A8ADA3", whiteSpace: "nowrap" }}>{clip.views}</span>}
              </span>
              {clip.state === "review-validated" ? (
                <span style={{ position: "relative", width: "50px", height: "15px", flexShrink: "0" }}>
                  <DashChip tone="warn" style={{ position: "absolute", right: "0", top: "0", animation: "ipch-swap-a 9s ease-in-out infinite" }}>En revue</DashChip>
                  <DashChip tone="teal" style={{ position: "absolute", right: "0", top: "0", opacity: 0, animation: "ipch-swap-b 9s ease-in-out infinite" }}>✓ Validé</DashChip>
                </span>
              ) : clip.state === "validated" ? <DashChip tone="teal">✓ Validé</DashChip> : <DashChip tone="gold">Payé</DashChip>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", flexShrink: "0", height: "36px", display: "flex", alignItems: "center", justifyContent: "space-around", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {[0, 1].map((index) => <span key={index} style={{ width: "14px", height: "3px", borderRadius: "999px", background: "rgba(255,255,255,0.2)" }} />)}
          <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#F0C575", color: "#0b0d0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", lineHeight: "1", animation: "ipch-pulse-gold 2.4s ease-out infinite" }}>+</span>
          {[2, 3].map((index) => <span key={index} style={{ width: "14px", height: "3px", borderRadius: "999px", background: "rgba(255,255,255,0.2)" }} />)}
        </div>
      </div>
    </div>
  );
}

function Timeline() {
  const segments = [18, 12, 22, 10, 16, 22];
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "300px", height: "38px", margin: "0 auto" }}>
      <div style={{ position: "absolute", top: "14px", left: "0", right: "0", display: "flex", gap: "3px" }}>
        {segments.map((width, index) => (
          <span key={index} style={{ flex: `${width} 1 0`, height: "16px", borderRadius: "5px", background: index === 2 || index === 4 ? "rgba(240,197,117,0.85)" : "rgba(255,255,255,0.12)", border: index === 2 || index === 4 ? "0" : "1px solid rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      <span style={{ position: "absolute", top: "8px", bottom: "0", width: "2px", borderRadius: "2px", background: "#91D6D0", boxShadow: "0 0 10px rgba(145,214,208,0.8)", animation: "ipch-head 6s linear infinite" }} />
      <span style={{ position: "absolute", top: "-6px", left: "44%", color: "#F0C575", transformOrigin: "50% 60%", animation: "ipch-snip 3s ease-in-out infinite" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></svg>
      </span>
    </div>
  );
}

/** Les réseaux où publier, qui défilent en continu. */
export function NetworksTicker() {
  const items = [...NETWORKS_LIST, ...NETWORKS_LIST];
  return (
    <div className="ipch-anim" style={{ position: "relative", overflow: "hidden", padding: "4px 0", maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}>
      <div style={{ display: "flex", width: "max-content", gap: "8px", animation: "ipch-marquee 22s linear infinite" }}>
        {items.map((name, index) => (
          <span key={`${name}-${index}`} aria-hidden={index >= NETWORKS_LIST.length} style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 13px", borderRadius: "999px", background: "rgba(18,21,17,0.85)", border: "1px solid rgba(255,255,255,0.12)", color: "#E6E2D8", fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: index % 2 ? "#91D6D0" : "#F0C575" }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** En-tête de la page d'inscription. */
export function JoinHero({ onJoin, onHow }: { onJoin: () => void; onHow: () => void }) {
  return (
    <section aria-labelledby="ipch-title" className="ipch-anim" style={{ display: "flex", flexDirection: "column", gap: "18px", paddingTop: "6px" }}>
      <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderRadius: "999px", background: "rgba(145,214,208,0.1)", border: "1px solid rgba(145,214,208,0.3)", color: "#91D6D0", fontSize: "12px", fontWeight: "800", letterSpacing: "0.04em" }}>
        <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#91D6D0", animation: "ipch-pulse 2s ease-out infinite" }} />
        Programme clippeurs · inscriptions ouvertes
      </span>
      <h1 id="ipch-title" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "600", fontSize: "clamp(26px, 7.4vw, 36px)", lineHeight: "1.1", letterSpacing: "-0.03em", color: "#F3EFE6" }}>
        Clippe mes vidéos.<br />Fais des vues.<br /><span className="ipch-gradient">Sois payé.</span>
      </h1>
      <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.55", color: "#C4C8BD" }}>Tu coupes les vidéos d&apos;Enrick95, tu les publies sur tes réseaux et chaque clip validé te rapporte. Inscription en 2 minutes, réponse sur WhatsApp.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button type="button" onClick={onJoin} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "50px", padding: "0 20px", borderRadius: "14px", border: "0", background: "linear-gradient(100deg, #F0C575, #F7DDA4)", color: "#0b0d0b", fontSize: "15px", fontWeight: "800", boxShadow: "0 10px 30px rgba(240,197,117,0.25)" }}>
          Je m&apos;inscris
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
        <button type="button" onClick={onHow} style={{ minHeight: "50px", padding: "0 18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(18,21,17,0.6)", color: "#F3EFE6", fontSize: "14px", fontWeight: "700" }}>Comment ça marche</button>
      </div>
      <div aria-hidden="true" style={{ position: "relative", height: "380px", display: "flex", justifyContent: "center", alignItems: "center", marginTop: "4px" }}>
        <Phone />
        <Toast tone="teal" delay={0} style={{ top: "70px", left: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Clip validé
        </Toast>
        <Toast tone="gold" delay={3} style={{ top: "120px", right: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0C575" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
          +12,4 k vues
        </Toast>
        <Toast tone="teal" delay={6} style={{ bottom: "40px", left: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></svg>
          3 clips tirés d&apos;une vidéo
        </Toast>
      </div>
      <Timeline />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: "800", letterSpacing: "0.08em", color: "#A8ADA3" }}>PUBLIE SUR TOUS TES RÉSEAUX</span>
        <NetworksTicker />
      </div>
    </section>
  );
}
