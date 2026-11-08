"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { cardFont } from "./cardFont";
import c from "./VipMemberCard.module.css";

type Props = {
  firstName: string | null;
  lastName: string | null;
  /** The member number (N° 0010); hidden while the access is suspended. */
  number?: number | null;
  /** When the membership started, for « Membre depuis oct. 2026 ». */
  since?: string | null;
  active: boolean;
};

/** Candles and a rising line behind the name, as on the card members unlock when they join. */
function Chart() {
  const candles = Array.from({ length: 9 }, (_, i) => ({ x: 10 + i * 22, mid: 92 - i * 8.5 + (i % 3 === 1 ? 7 : 0), height: 14 + (i % 2) * 7, up: i % 3 !== 1 }));
  return <svg className={c.chart} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
    {candles.map(({ x, mid, height, up }) => <g key={x}>
      <line x1={x + 4} x2={x + 4} y1={mid - height / 2 - 8} y2={mid + height / 2 + 8} stroke="#F0C575" strokeWidth="1.6" />
      <rect x={x} y={mid - height / 2} width="8" height={height} rx="1.5" fill={up ? "#F0C575" : "none"} stroke="#F0C575" strokeWidth="1.6" />
    </g>)}
    <polyline points="4,104 40,88 66,96 104,66 130,74 170,38 194,22" fill="none" stroke="#F6D48C" strokeWidth="2.4" strokeLinejoin="round" />
  </svg>;
}

/** The name stays on one line while it can be large; otherwise it goes on two lines, always whole. */
function fitName(card: HTMLElement, name: HTMLElement) {
  const width = card.clientWidth;
  if (!width) return;
  name.classList.remove(c.two);
  let size = width * 0.07;
  name.style.fontSize = `${size}px`;
  while (name.scrollWidth > name.clientWidth + 1 && size > width * 0.05) { size -= 0.5; name.style.fontSize = `${size}px`; }
  if (name.scrollWidth <= name.clientWidth + 1) return;
  name.classList.add(c.two);
  size = width * 0.056;
  name.style.fontSize = `${size}px`;
  while ((name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1) && size > width * 0.034) { size -= 0.5; name.style.fontSize = `${size}px`; }
}

/** The InvestPro Trading member card with the member’s name, number and start date, as unlocked when they joined. */
export default function VipMemberCard({ firstName, lastName, number, since, active }: Props) {
  const { t, locale } = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const name = [firstName, lastName].map(part => (part || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");

  useEffect(() => {
    const card = cardRef.current, element = nameRef.current;
    if (!card || !element) return;
    const fit = () => fitName(card, element);
    fit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(card);
    // The name is measured again once Unbounded has loaded.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer?.disconnect();
  }, [name]);

  const start = since ? new Date(since) : null;
  const sinceText = start && Number.isFinite(start.getTime())
    ? `${t("Membre depuis")} ${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(start)}`
    : t("Membre VIP");
  const numberText = active && number ? `N° ${String(number).padStart(4, "0")}` : "N° ••••";
  const spoken = [t("Carte membre InvestPro Trading"), name, t(active ? "active" : "suspendue"), active && number ? numberText : ""].filter(Boolean).join(", ");

  return <div ref={cardRef} className={`${c.card} ${cardFont}`} data-state={active ? "active" : "locked"} role="img" aria-label={spoken}>
    <div className={c.face}>
      <Chart />
      <div className={c.top}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the brand files are already sized webp; next/image adds nothing here */}
        <img className={c.mark} src="/brand/investpro-mark.webp" alt="" width={282} height={284} decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element -- same brand file as on the joining pages */}
        <img className={c.word} src="/brand/investpro-wordmark.webp" alt="" width={846} height={201} decoding="async" />
        <span className={c.status}>
          {active
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}
          <span>{t(active ? "Active" : "Suspendue")}</span>
        </span>
      </div>
      <span className={c.chip} aria-hidden="true" />
      <div className={c.mid}>
        <span className={c.label}>{t("Membre VIP")}</span>
        <span ref={nameRef} className={c.name}>{name || t("Membre VIP")}</span>
      </div>
      <div className={c.bot}>
        <span>{active ? sinceText : t("Accès suspendu")}</span>
        <span className={c.no}>{numberText}</span>
      </div>
    </div>
  </div>;
}
