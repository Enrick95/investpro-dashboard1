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
@keyframes ipch-tour { 0%, 16% { transform: translate3d(0, 0, 0); } 20%, 36% { transform: translate3d(-16.6667%, 0, 0); } 40%, 56% { transform: translate3d(-33.3333%, 0, 0); } 60%, 76% { transform: translate3d(-50%, 0, 0); } 80%, 96% { transform: translate3d(-66.6667%, 0, 0); } 100% { transform: translate3d(-83.3333%, 0, 0); } }
@keyframes ipch-tab { 0%, 16% { transform: translate3d(0, 0, 0); } 20%, 36% { transform: translate3d(100%, 0, 0); } 40%, 56% { transform: translate3d(200%, 0, 0); } 60%, 76% { transform: translate3d(300%, 0, 0); } 80%, 96% { transform: translate3d(400%, 0, 0); } 100% { transform: translate3d(0, 0, 0); } }
@keyframes ipch-slot { 0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.96); } 4%, 16% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } 20%, 100% { opacity: 0; transform: translate3d(0, -8px, 0) scale(0.98); } }
@keyframes ipch-views-a { 0%, 3% { opacity: 1; } 5%, 95% { opacity: 0; } 97%, 100% { opacity: 1; } }
@keyframes ipch-views-b { 0%, 3% { opacity: 0; } 5%, 95% { opacity: 1; } 97%, 100% { opacity: 0; } }
@keyframes ipch-type { 0%, 40.5% { width: 0; } 43.5%, 99% { width: 100%; } 100% { width: 0; } }
@keyframes ipch-caret { 0% { opacity: 1; } 50% { opacity: 0; } }
@keyframes ipch-detect { 0%, 43.5% { opacity: 0; } 44.5%, 99% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ipch-tick-1 { 0%, 45% { opacity: 0.2; } 45.8%, 99% { opacity: 1; } 100% { opacity: 0.2; } }
@keyframes ipch-tick-2 { 0%, 46% { opacity: 0.2; } 46.8%, 99% { opacity: 1; } 100% { opacity: 0.2; } }
@keyframes ipch-tick-3 { 0%, 47% { opacity: 0.2; } 47.8%, 99% { opacity: 1; } 100% { opacity: 0.2; } }
@keyframes ipch-send-a { 0%, 49.5% { opacity: 1; } 50.5%, 99% { opacity: 0; } 100% { opacity: 1; } }
@keyframes ipch-send-b { 0%, 49.5% { opacity: 0; } 50.5%, 99% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ipch-review-a { 0%, 63% { opacity: 1; } 65%, 99% { opacity: 0; } 100% { opacity: 1; } }
@keyframes ipch-review-b { 0%, 63% { opacity: 0; } 65%, 99% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ipch-steps { 0%, 81% { transform: scaleY(0); } 90%, 99% { transform: scaleY(1); } 100% { transform: scaleY(0); } }
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

/** Notification calée sur un écran du téléphone (5 écrans de 3 s). */
function Toast({ children, tone, style, slot, delay }: { children: ReactNode; tone: "gold" | "teal"; style: CSSProperties; slot: number; delay?: number }) {
  return (
    <span className="ipch-toast" style={{ position: "absolute", display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 12px", borderRadius: "14px", background: "rgba(18,21,17,0.92)", border: tone === "gold" ? "1px solid rgba(240,197,117,0.45)" : "1px solid rgba(145,214,208,0.45)", boxShadow: "0 12px 30px rgba(0,0,0,0.45)", color: "#F3EFE6", fontSize: "12.5px", fontWeight: "800", whiteSpace: "nowrap", opacity: 0, animation: `ipch-slot 15s ease-in-out ${delay ?? slot * 3}s infinite`, ...style }}>
      {children}
    </span>
  );
}

function DashChip({ tone, children, style }: { tone: "warn" | "teal" | "gold"; children: ReactNode; style?: CSSProperties }) {
  const colors = { warn: ["rgba(242,180,90,0.16)", "#F2B45A"], teal: ["rgba(145,214,208,0.16)", "#91D6D0"], gold: ["rgba(240,197,117,0.16)", "#F0C575"] }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 6px", borderRadius: "999px", background: colors[0], color: colors[1], fontSize: "8.5px", fontWeight: "800", whiteSpace: "nowrap", ...style }}>{children}</span>;
}

const T = "15s";
const SCREEN: CSSProperties = { flex: "0 0 16.6667%", minWidth: "0", height: "100%", padding: "0 10px", display: "flex", flexDirection: "column", gap: "7px", overflow: "hidden" };
const TITLE: CSSProperties = { fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "12.5px", color: "#F3EFE6" };
const LABEL: CSSProperties = { fontSize: "8px", fontWeight: "800", color: "#A8ADA3", letterSpacing: "0.06em" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "7px", padding: "6px", borderRadius: "10px", background: "#181c16" };

function Thumb({ wide = false }: { wide?: boolean }) {
  return (
    <span style={{ flexShrink: "0", width: wide ? "34px" : "16px", height: wide ? "20px" : "26px", borderRadius: "5px", background: "linear-gradient(160deg, rgba(240,197,117,0.35), rgba(145,214,208,0.25))", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="#F3EFE6"><path d="M8 5.5v13l10.5-6.5z" /></svg>
    </span>
  );
}

function ClipLine({ network, views, chip, viewsNext, swap }: { network: string; views: string; chip: ReactNode; viewsNext?: string; swap?: [ReactNode, string, string] }) {
  return (
    <div style={ROW}>
      <Thumb />
      <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
        <span style={{ fontSize: "9.5px", fontWeight: "800", color: "#F3EFE6", whiteSpace: "nowrap" }}>{network}</span>
        {viewsNext ? (
          <span style={{ position: "relative", height: "11px", fontSize: "8.5px", color: "#A8ADA3" }}>
            <span style={{ position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", animation: `ipch-views-a ${T} ease-in-out infinite` }}>{views}</span>
            <span style={{ position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", color: "#F0C575", fontWeight: "700", opacity: 0, animation: `ipch-views-b ${T} ease-in-out infinite` }}>{viewsNext}</span>
          </span>
        ) : <span style={{ fontSize: "8.5px", color: "#A8ADA3", whiteSpace: "nowrap" }}>{views}</span>}
      </span>
      {swap ? (
        <span style={{ position: "relative", width: "50px", height: "15px", flexShrink: "0" }}>
          <span style={{ position: "absolute", right: "0", top: "0", animation: `${swap[1]} ${T} ease-in-out infinite` }}>{chip}</span>
          <span style={{ position: "absolute", right: "0", top: "0", opacity: 0, animation: `${swap[2]} ${T} ease-in-out infinite` }}>{swap[0]}</span>
        </span>
      ) : chip}
    </div>
  );
}

function HomeScreen() {
  return (
    <div style={SCREEN}>
      <span style={TITLE}>Salut 👋</span>
      <div style={{ padding: "8px", borderRadius: "12px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "5px" }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px", fontSize: "8px", fontWeight: "700", color: "#C4C8BD" }}>Prochain versement<DashChip tone="gold">lun. 16 nov.</DashChip></span>
        <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "13px", color: "#F0C575" }}>3 clips validés</span>
        <span style={{ height: "3px", borderRadius: "999px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <span style={{ display: "block", width: "62%", height: "100%", background: "#F0C575" }} />
        </span>
      </div>
      <span style={LABEL}>MES CLIPS</span>
      <ClipLine network="TikTok" views="2,1 k vues" viewsNext="12,4 k vues" chip={<DashChip tone="teal">✓ Validé</DashChip>} />
      <ClipLine network="Instagram" views="18,2 k vues" chip={<DashChip tone="teal">✓ Validé</DashChip>} />
      <ClipLine network="YouTube" views="41,7 k vues" chip={<DashChip tone="gold">Payé</DashChip>} />
    </div>
  );
}

function CampaignsScreen() {
  return (
    <div style={SCREEN}>
      <span style={TITLE}>Campagnes</span>
      <div style={{ padding: "7px", borderRadius: "12px", background: "#121511", border: "1px solid rgba(240,197,117,0.35)", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={LABEL}>VIDÉOS À CLIPPER</span>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <Thumb wide />
          <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "9px", fontWeight: "800", color: "#F3EFE6", whiteSpace: "nowrap" }}>Vidéo longue · 1 h 12</span>
            <span style={{ alignSelf: "flex-start", padding: "1px 5px", borderRadius: "999px", background: "#F0C575", color: "#0b0d0b", fontSize: "7.5px", fontWeight: "800" }}>Nouveau</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ flexShrink: "0", width: "20px", height: "20px", borderRadius: "6px", background: "rgba(145,214,208,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 9.2v5.6l4.3-2.8z" /></svg>
          </span>
          <span style={{ fontSize: "8.5px", fontWeight: "700", color: "#C4C8BD" }}>Mes vidéos TikTok et YouTube</span>
        </div>
      </div>
      <div style={{ padding: "8px", borderRadius: "12px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "8px", fontWeight: "700", color: "#A8ADA3" }}>Tous les réseaux</span>
          <DashChip tone="teal">● En cours</DashChip>
        </span>
        <span style={{ fontSize: "10.5px", fontWeight: "800", color: "#F3EFE6" }}>Campagne de novembre</span>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#C4C8BD" }}><b style={{ color: "#F3EFE6" }}>Toi : 8 / 10 clips</b><span>encore 2</span></span>
        <span style={{ height: "4px", borderRadius: "999px", background: "rgba(255,255,255,0.1)" }}><span style={{ display: "block", width: "80%", height: "100%", borderRadius: "999px", background: "#F0C575" }} /></span>
        <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
          <span style={{ padding: "5px", borderRadius: "8px", background: "#181c16", fontSize: "8px", fontWeight: "800", color: "#F0C575" }}>Payé par clip</span>
          <span style={{ padding: "5px", borderRadius: "8px", background: "#181c16", fontSize: "8px", fontWeight: "800", color: "#F0C575" }}>+ bonus</span>
        </span>
      </div>
    </div>
  );
}

function SubmitScreen() {
  const checks = ["Sous-titres et bonne accroche", "Aucune promesse de gains", "Mon lien est dans ma bio"];
  return (
    <div style={SCREEN}>
      <span style={TITLE}>Soumettre un clip</span>
      <span style={LABEL}>LIEN DE TON CLIP</span>
      <span style={{ display: "flex", alignItems: "center", height: "26px", padding: "0 7px", borderRadius: "8px", border: "1px solid rgba(240,197,117,0.45)", background: "#181c16", overflow: "hidden" }}>
        <span style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", fontSize: "8.5px", color: "#F3EFE6", width: "0", animation: `ipch-type ${T} linear infinite` }}>tiktok.com/@toi/video/7431…</span>
        <span style={{ width: "1px", height: "11px", marginLeft: "1px", background: "#F0C575", animation: "ipch-caret 1s steps(1) infinite" }} />
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 7px", borderRadius: "8px", background: "rgba(145,214,208,0.1)", border: "1px solid rgba(145,214,208,0.3)", fontSize: "8.5px", fontWeight: "800", color: "#91D6D0", opacity: 0, animation: `ipch-detect ${T} ease-in-out infinite` }}>✓ TikTok · compte de ton profil</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {checks.map((label, index) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "8.5px", color: "#C4C8BD" }}>
            <span style={{ flexShrink: "0", width: "12px", height: "12px", borderRadius: "4px", background: "#91D6D0", color: "#0b0d0b", fontSize: "8px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.2, animation: `ipch-tick-${index + 1} ${T} ease-in-out infinite` }}>✓</span>
            {label}
          </span>
        ))}
      </div>
      <span style={{ position: "relative", height: "28px", marginTop: "2px" }}>
        <span style={{ position: "absolute", inset: "0", borderRadius: "9px", background: "#F0C575", color: "#0b0d0b", fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", animation: `ipch-send-a ${T} ease-in-out infinite` }}>Envoyer le clip</span>
        <span style={{ position: "absolute", inset: "0", borderRadius: "9px", background: "rgba(145,214,208,0.16)", border: "1px solid rgba(145,214,208,0.45)", color: "#91D6D0", fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, animation: `ipch-send-b ${T} ease-in-out infinite` }}>✓ Envoyé à Enrick</span>
      </span>
    </div>
  );
}

function ClipsScreen() {
  return (
    <div style={SCREEN}>
      <span style={TITLE}>Mes clips</span>
      <span style={{ display: "flex", gap: "4px" }}>
        <span style={{ padding: "3px 7px", borderRadius: "999px", background: "#F3EFE6", color: "#0b0d0b", fontSize: "8px", fontWeight: "800" }}>Tous · 5</span>
        <span style={{ padding: "3px 7px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", color: "#C4C8BD", fontSize: "8px", fontWeight: "700" }}>Validés</span>
        <span style={{ padding: "3px 7px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", color: "#C4C8BD", fontSize: "8px", fontWeight: "700" }}>Payés</span>
      </span>
      <ClipLine network="Instagram" views="aujourd'hui" chip={<DashChip tone="warn">En revue</DashChip>} swap={[<DashChip key="v" tone="teal">✓ Validé</DashChip>, "ipch-review-a", "ipch-review-b"]} />
      <ClipLine network="TikTok" views="12,4 k vues" chip={<DashChip tone="teal">✓ Validé</DashChip>} />
      <ClipLine network="Facebook" views="6,8 k vues" chip={<DashChip tone="teal">✓ Validé</DashChip>} />
      <ClipLine network="YouTube" views="41,7 k vues" chip={<DashChip tone="gold">Payé</DashChip>} />
      <ClipLine network="Snapchat" views="9,3 k vues" chip={<DashChip tone="gold">Payé</DashChip>} />
    </div>
  );
}

function PaymentsScreen() {
  const steps = [
    { title: "Clips validés", sub: "ils s'ajoutent au cycle", done: true },
    { title: "Clôture du cycle", sub: "le 15 nov.", done: true },
    { title: "Versement", sub: "lun. 16 nov.", done: false },
    { title: "Payé dans ton espace", sub: "avec la preuve", done: false },
  ];
  return (
    <div style={SCREEN}>
      <span style={TITLE}>Paiements</span>
      <div style={{ padding: "8px", borderRadius: "12px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "3px" }}>
        <span style={{ fontSize: "8px", fontWeight: "700", color: "#C4C8BD" }}>Prochain versement</span>
        <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "12.5px", color: "#F0C575" }}>lun. 16 nov.</span>
        <span style={{ fontSize: "8px", color: "#A8ADA3" }}>USDT · Wise · PayPal · virement</span>
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "2px" }}>
        <span style={{ position: "absolute", left: "7px", top: "8px", bottom: "8px", width: "2px", background: "rgba(255,255,255,0.1)" }} />
        <span style={{ position: "absolute", left: "7px", top: "8px", height: "62%", width: "2px", background: "#91D6D0", transformOrigin: "top", animation: `ipch-steps ${T} ease-in-out infinite` }} />
        {steps.map((step, index) => (
          <span key={step.title} style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ flexShrink: "0", width: "12px", height: "12px", borderRadius: "50%", background: step.done ? "#91D6D0" : index === 2 ? "#F0C575" : "#2a2f27", border: index === 3 ? "1px solid rgba(255,255,255,0.2)" : "0", animation: index === 2 ? "ipch-pulse-gold 2s ease-out infinite" : undefined }} />
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "9px", fontWeight: "800", color: index === 3 ? "#A8ADA3" : "#F3EFE6" }}>{step.title}</span>
              <span style={{ fontSize: "8px", color: "#A8ADA3" }}>{step.sub}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const TABS: ReactNode[] = [
  <path key="h" d="M4 11l8-6.5 8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  <><path key="f1" d="M5.5 21V4" /><path key="f2" d="M5.5 4.5h11.5l-2.2 4.25L17 13H5.5" /></>,
  null,
  <><rect key="c1" x="3" y="4.5" width="18" height="15" rx="3" /><path key="c2" d="M10 9.2v5.6l4.8-2.8z" /></>,
  <><path key="w1" d="M17.5 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5" /><rect key="w2" x="3" y="7.5" width="18" height="12.5" rx="2.5" /></>,
];

/** Téléphone qui fait le tour de l'espace clippeur : accueil, campagnes, envoi d'un clip, mes clips, paiements. */
function Phone() {
  return (
    <div style={{ position: "relative", width: "196px", height: "376px", borderRadius: "31px", padding: "8px", background: "linear-gradient(160deg, #23281f, #0e110d)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 30px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(240,197,117,0.08)", animation: "ipch-float 4s ease-in-out infinite alternate" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "24px", overflow: "hidden", background: "linear-gradient(180deg, #11150f 0%, #0b0d0b 100%)", display: "flex", flexDirection: "column", textAlign: "left" }}>
        <div style={{ flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 10px 8px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <svg width="14" height="14" viewBox="0 0 30 30"><rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="2.4" /><path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" /></svg>
            <span style={{ fontSize: "8px", fontWeight: "800", color: "#0b0d0b", background: "#F0C575", padding: "1px 4px", borderRadius: "999px" }}>CLIP</span>
          </span>
          <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(240,197,117,0.16)", color: "#F0C575", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5" /></svg>
          </span>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflow: "hidden" }}>
          <div style={{ display: "flex", width: "600%", height: "100%", animation: `ipch-tour ${T} cubic-bezier(0.65, 0, 0.35, 1) infinite` }}>
            <HomeScreen />
            <CampaignsScreen />
            <SubmitScreen />
            <ClipsScreen />
            <PaymentsScreen />
            <HomeScreen />
          </div>
        </div>
        <div style={{ position: "relative", flexShrink: "0", height: "38px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", alignItems: "center", justifyItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ position: "absolute", left: "0", bottom: "3px", width: "20%", display: "flex", justifyContent: "center", animation: `ipch-tab ${T} cubic-bezier(0.65, 0, 0.35, 1) infinite` }}>
            <span style={{ width: "14px", height: "3px", borderRadius: "999px", background: "#F0C575" }} />
          </span>
          {TABS.map((icon, index) => index === 2
            ? <span key={index} style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#F0C575", color: "#0b0d0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", lineHeight: "1", animation: "ipch-pulse-gold 2.4s ease-out infinite" }}>+</span>
            : <svg key={index} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A8ADA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>)}
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
      <div aria-hidden="true" style={{ position: "relative", height: "402px", display: "flex", justifyContent: "center", alignItems: "center", marginTop: "4px" }}>
        <Phone />
        <Toast tone="gold" slot={0} style={{ top: "228px", right: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0C575" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
          +12,4 k vues
        </Toast>
        <Toast tone="teal" slot={1} style={{ top: "262px", left: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></svg>
          Nouvelle vidéo
        </Toast>
        <Toast tone="gold" slot={2} delay={6.9} style={{ bottom: "86px", right: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0C575" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 3.5L10 14" /><path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z" /></svg>
          Clip envoyé
        </Toast>
        <Toast tone="teal" slot={3} style={{ top: "292px", left: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Clip validé
        </Toast>
        <Toast tone="gold" slot={4} style={{ top: "270px", right: "0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0C575" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="13.75" r="1" /></svg>
          Versement le 16 nov.
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
