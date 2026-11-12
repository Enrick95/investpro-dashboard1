"use client";

import styles from "../../clip.module.css";

/** Bandeau qui défile en haut de l'espace : « Enrick a posté une nouvelle vidéo… ». Un tap ouvre les vidéos. */
export function ClipTicker({ items, onOpen }: { items: string[]; onOpen: () => void }) {
  if (!items.length) return null;
  const text = items.join("   •   ");
  // Vitesse de lecture constante, quelle que soit la longueur du texte.
  const duration = Math.max(12, Math.round(text.length * 0.26));
  return (
    <button type="button" onClick={onOpen} className={styles.ticker} aria-label={`${text}. Voir les vidéos.`}>
      <span className={styles.tickerPill} aria-hidden="true">
        <span className={styles.tickerDot} />
        Nouveau
      </span>
      <span className={styles.tickerWindow} aria-hidden="true">
        <span className={styles.tickerTrack} style={{ animationDuration: `${duration}s` }}>
          <span className={styles.tickerItem}>{text}</span>
          <span className={styles.tickerItem}>{text}</span>
        </span>
      </span>
      <svg className={styles.tickerGo} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
