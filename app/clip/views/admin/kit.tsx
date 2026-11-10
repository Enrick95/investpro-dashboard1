"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";

/** Briques visuelles reprises telles quelles de la maquette V2 (admin). */

export function go(action: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    action();
  };
}

export const S = {
  h1: { margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "30px", letterSpacing: "-0.02em", lineHeight: "1.15" },
  h2: { margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "17px", letterSpacing: "-0.01em" },
  h3: { margin: "0", fontSize: "14px", fontWeight: "800" },
  eyebrow: { fontSize: "13px", color: "#A8ADA3" },
  sub: { fontSize: "12.5px", color: "#A8ADA3" },
  muted: { color: "#A8ADA3" },
  header: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" },
  card: { padding: "22px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" },
  row: { display: "flex", alignItems: "center", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" },
  mini: { padding: "10px", borderRadius: "12px", background: "#181c16", display: "flex", flexDirection: "column", gap: "1px" },
  miniValue: { fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px" },
  miniLabel: { fontSize: "12px", color: "#A8ADA3" },
  primary: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "44px", padding: "0 18px", borderRadius: "12px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "14px", fontWeight: "800", textDecoration: "none" },
  ghost: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "44px", padding: "0 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#F3EFE6", fontSize: "13px", fontWeight: "700", textDecoration: "none" },
  danger: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,111,145,0.35)", background: "transparent", color: "#FF6F91", fontSize: "13px", fontWeight: "700" },
  input: { minHeight: "44px", padding: "0 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.16)", background: "#181c16", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "13.5px" },
  label: { fontSize: "12.5px", fontWeight: "700", color: "#A8ADA3" },
  table: { display: "grid", gap: "12px", alignItems: "center" },
  th: { fontSize: "12px", fontWeight: "600", color: "#A8ADA3" },
  srOnly: { position: "absolute", left: "0", width: "1px", height: "1px", margin: "-1px", padding: "0", border: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" },
} satisfies Record<string, CSSProperties>;

const PATHS: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  alert: <><path d="M12 4l9 15.5H3z" /><path d="M12 10v4M12 16.8v.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  chat: <path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.3a8.4 8.4 0 1 1 15.5-4.6z" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15" />,
  send: <><path d="M20.5 3.5L10 14" /><path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z" /></>,
  wallet: <><path d="M17.5 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="13.75" r="1" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" /><path d="M12 9v3.5M12 15.3v.2" /></>,
  film: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></>,
  trend: <><path d="M3.5 16.5l5.5-5.5 4 4 7.5-7.5" /><path d="M15 7.5h5.5V13" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  dots: <><circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5" /></>,
  gift: <><rect x="3.5" y="8" width="17" height="4.5" rx="1.2" /><path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5" /><path d="M12 8v12.5" /><path d="M12 8H8.6a2.3 2.3 0 1 1 0-4.6C11 3.4 12 8 12 8zM12 8h3.4a2.3 2.3 0 1 0 0-4.6C13 3.4 12 8 12 8z" /></>,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" /><path d="M6.5 7l.8 11.6A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-1.9L17.5 7" /></>,
};

export function Icon({ name, size = 16, stroke = "2", color = "currentColor", style }: { name: keyof typeof PATHS | string; size?: number; stroke?: string; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {PATHS[name]}
    </svg>
  );
}

export type Tone = "ok" | "bad" | "warn" | "neutral" | "gold";
const TONES: Record<Tone, { bg: string; color: string }> = {
  ok: { bg: "rgba(145,214,208,0.12)", color: "#91D6D0" },
  bad: { bg: "rgba(255,111,145,0.12)", color: "#FF6F91" },
  warn: { bg: "rgba(242,180,90,0.12)", color: "#F2B45A" },
  neutral: { bg: "rgba(255,255,255,0.07)", color: "#C4C8BD" },
  gold: { bg: "rgba(240,197,117,0.14)", color: "#F0C575" },
};

export function toneColor(tone: Tone): string {
  return TONES[tone].color;
}

export function Chip({ tone, icon, dot, big, children }: { tone: Tone; icon?: string; dot?: boolean; big?: boolean; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: big ? "6px" : "5px", padding: big ? "5px 10px" : "4px 9px", borderRadius: "999px", background: t.bg, color: t.color, fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" }}>
      {dot ? <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.color }} /> : null}
      {icon ? <Icon name={icon} size={big ? 13 : 12} stroke="2.4" /> : null}
      {children}
    </span>
  );
}

export function Bar({ pct, height = 8, track = "rgba(255,255,255,0.06)" }: { pct: number; height?: number; track?: string }) {
  return (
    <div style={{ height: `${height}px`, borderRadius: "999px", background: track }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: `${height}px`, borderRadius: "999px", background: "#F0C575" }} />
    </div>
  );
}

export function Avatar({ ini, size = 34, selected, teal }: { ini: string; size?: number; selected?: boolean; teal?: boolean }) {
  return (
    <span aria-hidden="true" style={{ flexShrink: "0", width: `${size}px`, height: `${size}px`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: teal ? "rgba(145,214,208,0.14)" : selected ? "rgba(240,197,117,0.18)" : "rgba(240,197,117,0.14)", color: teal ? "#91D6D0" : "#F0C575", fontSize: size > 48 ? "18px" : "12px", fontWeight: size > 48 ? "500" : "800", fontFamily: size > 48 ? "Unbounded, sans-serif" : "inherit", border: size > 48 ? "1px solid rgba(240,197,117,0.4)" : "0" }}>{ini}</span>
  );
}

export function Pills<T extends string>({ items, value, onPick, label }: { items: { key: T; label: string }[]; value: T; onPick: (key: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {items.map((item) => {
        const on = item.key === value;
        return (
          <button key={item.key} type="button" aria-pressed={on} onClick={() => onPick(item.key)} style={on
            ? { minHeight: "44px", padding: "0 14px", borderRadius: "999px", border: "0", background: "#F3EFE6", color: "#0b0d0b", fontSize: "13px", fontWeight: "800" }
            : { minHeight: "44px", padding: "0 14px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#C4C8BD", fontSize: "13px", fontWeight: "700" }}>{item.label}</button>
        );
      })}
    </div>
  );
}

export function Kpi({ label, value, suffix, sub, trend, gold }: { label: string; value: string; suffix?: string; sub?: string; trend?: { text: string; up: boolean } | null; gold?: boolean }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: "0", padding: "18px 18px 16px", borderRadius: "18px", background: gold ? "#15170f" : "#121511", border: gold ? "1px solid rgba(240,197,117,0.45)" : "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#A8ADA3" }}>{label}</span>
      <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em", lineHeight: "1.2", color: gold ? "#F0C575" : "#F3EFE6" }}>{value}{suffix ? <span style={{ fontSize: "16px", color: "#A8ADA3" }}>{suffix}</span> : null}</span>
      {trend ? (
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "700", color: trend.up ? "#91D6D0" : "#F2B45A" }}><Icon name="trend" size={14} stroke="2.2" style={trend.up ? undefined : { transform: "scaleY(-1)" }} />{trend.text}</span>
      ) : sub ? <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{sub}</span> : null}
    </div>
  );
}

export function Flash({ flash }: { flash: { kind: "ok" | "error"; text: string } | null }) {
  if (!flash) return null;
  return <p role="status" style={{ margin: "0", padding: "12px 14px", borderRadius: "14px", background: flash.kind === "ok" ? "rgba(145,214,208,0.08)" : "rgba(255,111,145,0.08)", border: flash.kind === "ok" ? "1px solid rgba(145,214,208,0.35)" : "1px solid rgba(255,111,145,0.3)", color: flash.kind === "ok" ? "#91D6D0" : "#FF6F91", fontSize: "13px", fontWeight: "700" }}>{flash.text}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: "18px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>{children}</div>;
}

export function Soon() {
  return <span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", color: "#C4C8BD", fontSize: "11px", fontWeight: "700" }}>bientôt</span>;
}
