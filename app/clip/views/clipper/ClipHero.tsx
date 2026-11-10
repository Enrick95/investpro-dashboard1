"use client";

import type { CSSProperties, ReactNode } from "react";
import { NETWORKS_LIST } from "@/lib/clip/rules";

/**
 * Habillage animé de l'espace clippeurs : fond (lueurs, formats 9:16 qui montent, ciseaux,
 * lecture, vues) et en-tête de la page d'inscription (téléphone avec sous-titres, timeline
 * coupée, notifications, réseaux qui défilent). Tout est en CSS, coupé si l'appareil
 * demande moins d'animations.
 */

const CSS = `
@keyframes ipch-rise { from { transform: translate3d(0, 0, 0) rotate(var(--r, 0deg)); } to { transform: translate3d(0, calc(-100vh - 260px), 0) rotate(calc(var(--r, 0deg) * -1)); } }
@keyframes ipch-glow { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(40px, -30px, 0) scale(1.15); } }
@keyframes ipch-toast { 0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.96); } 6%, 30% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } 38%, 100% { opacity: 0; transform: translate3d(0, -8px, 0) scale(0.98); } }
@keyframes ipch-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ipch-head { from { left: 0%; } to { left: 100%; } }
@keyframes ipch-word { 0%, 100% { background: transparent; color: #F3EFE6; } 8%, 30% { background: #F0C575; color: #0b0d0b; } 38% { background: transparent; color: #F3EFE6; } }
@keyframes ipch-marquee { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, 0, 0); } }
@keyframes ipch-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(145, 214, 208, 0.55); } 60% { box-shadow: 0 0 0 7px rgba(145, 214, 208, 0); } }
@keyframes ipch-draw { 0% { stroke-dashoffset: 260; } 55%, 100% { stroke-dashoffset: 0; } }
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

const WORDS = ["Entrée", "Gold", "en", "direct", "🔥"];

function Toast({ children, tone, style, delay }: { children: ReactNode; tone: "gold" | "teal"; style: CSSProperties; delay: number }) {
  return (
    <span className="ipch-toast" style={{ position: "absolute", display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 12px", borderRadius: "14px", background: "rgba(18,21,17,0.92)", border: tone === "gold" ? "1px solid rgba(240,197,117,0.45)" : "1px solid rgba(145,214,208,0.45)", boxShadow: "0 12px 30px rgba(0,0,0,0.45)", color: "#F3EFE6", fontSize: "12.5px", fontWeight: "800", whiteSpace: "nowrap", opacity: 0, animation: `ipch-toast 9s ease-in-out ${delay}s infinite`, ...style }}>
      {children}
    </span>
  );
}

function Phone() {
  return (
    <div style={{ position: "relative", width: "168px", height: "300px", borderRadius: "30px", padding: "8px", background: "linear-gradient(160deg, #23281f, #0e110d)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 30px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(240,197,117,0.08)", animation: "ipch-float 4s ease-in-out infinite alternate" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "23px", overflow: "hidden", background: "linear-gradient(180deg, #11150f 0%, #0b0d0b 100%)" }}>
        <div style={{ position: "absolute", top: "10px", left: "10px", right: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 7px", borderRadius: "999px", background: "rgba(255,111,145,0.16)", color: "#FF6F91", fontSize: "9.5px", fontWeight: "800", letterSpacing: "0.06em" }}><span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#FF6F91" }} />EN DIRECT</span>
          <span style={{ fontSize: "9.5px", fontWeight: "800", color: "#A8ADA3" }}>9:16</span>
        </div>
        <svg viewBox="0 0 150 120" width="100%" style={{ position: "absolute", top: "46px", left: "0" }} aria-hidden="true">
          {[[12, 70, 92, 60, 84], [26, 62, 86, 66, 78], [40, 58, 80, 52, 74], [54, 50, 74, 56, 66], [68, 44, 66, 40, 60], [82, 38, 60, 44, 52], [96, 30, 52, 26, 46], [110, 24, 46, 30, 40], [124, 16, 38, 12, 32]].map(([x, top, bottom, high, low], index) => {
            const up = index % 3 !== 1;
            return (
              <g key={x}>
                <line x1={x} x2={x} y1={high} y2={bottom + 6} stroke={up ? "#91D6D0" : "#FF6F91"} strokeWidth="1.2" opacity="0.7" />
                <rect x={x - 4} y={Math.min(top, low)} width="8" height={Math.abs(low - top) + 8} rx="1.5" fill={up ? "#91D6D0" : "#FF6F91"} opacity="0.85" />
              </g>
            );
          })}
          <path d="M6 98 L30 88 L48 90 L66 70 L84 72 L102 50 L120 44 L144 22" fill="none" stroke="#F0C575" strokeWidth="2" strokeLinecap="round" strokeDasharray="260" style={{ animation: "ipch-draw 6s ease-out infinite" }} />
        </svg>
        <div style={{ position: "absolute", left: "10px", right: "10px", bottom: "34px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "3px" }}>
          {WORDS.map((word, index) => (
            <span key={word} style={{ padding: "2px 5px", borderRadius: "6px", fontSize: "13px", fontWeight: "800", color: "#F3EFE6", textShadow: "0 1px 2px rgba(0,0,0,0.6)", animation: `ipch-word 3s ease-in-out ${index * 0.45}s infinite` }}>{word}</span>
          ))}
        </div>
        <div style={{ position: "absolute", left: "10px", right: "10px", bottom: "16px", height: "3px", borderRadius: "999px", background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: "#F0C575", transformOrigin: "left", animation: "ipch-progress 6s linear infinite" }} />
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
      <div aria-hidden="true" style={{ position: "relative", height: "330px", display: "flex", justifyContent: "center", alignItems: "center", marginTop: "4px" }}>
        <Phone />
        <Toast tone="teal" delay={0} style={{ top: "22px", left: "0" }}>
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
