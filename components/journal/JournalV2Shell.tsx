"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export default function JournalV2Shell({ children }: { children: ReactNode }) {
  return (
    <div data-journal-v2 className="journal-v2-root">
      <div className="journal-v2-glow journal-v2-glow-a" />
      <div className="journal-v2-glow journal-v2-glow-b" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="journal-v2-content"
      >
        {children}
      </motion.div>

      <style jsx global>{`
        .journal-v2-root {
          position: relative;
          isolation: isolate;
        }

        .journal-v2-content {
          position: relative;
          z-index: 2;
        }

        .journal-v2-glow {
          position: fixed;
          z-index: 0;
          pointer-events: none;
          border-radius: 999px;
          filter: blur(90px);
          opacity: .11;
        }

        .journal-v2-glow-a {
          width: 360px;
          height: 360px;
          top: 90px;
          right: 7vw;
          background: var(--gold, #d8af47);
        }

        .journal-v2-glow-b {
          width: 260px;
          height: 260px;
          bottom: 12vh;
          left: 18vw;
          background: var(--gold, #d8af47);
          opacity: .06;
        }

        /* En-tête : plus premium, sans modifier la logique actuelle */
        [data-journal-v2] .journal-v2-content > div > div:first-child h1 {
          letter-spacing: -.035em;
          font-size: clamp(1.55rem, 2.4vw, 2.15rem);
        }

        [data-journal-v2] .journal-v2-content > div > div:first-child p {
          max-width: 620px;
        }

        /* Toutes les cartes principales */
        [data-journal-v2] section {
          box-shadow: 0 16px 46px rgba(0,0,0,.18);
          transition: border-color .22s ease, transform .22s ease, box-shadow .22s ease;
        }

        [data-journal-v2] section:hover {
          border-color: rgba(216,175,71,.20);
        }

        /* KPI : look plus proche de la maquette noir/or */
        [data-journal-v2] .journal-v2-content > div > section:nth-of-type(3) > div,
        [data-journal-v2] .journal-v2-content > div > section:nth-of-type(4) > div {
          background:
            radial-gradient(120px 90px at 100% 0%, rgba(216,175,71,.08), transparent 70%),
            var(--panel, #0d0d10);
        }

        /* Filtres */
        [data-journal-v2] input,
        [data-journal-v2] select,
        [data-journal-v2] textarea {
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }

        [data-journal-v2] input:focus,
        [data-journal-v2] select:focus,
        [data-journal-v2] textarea:focus {
          box-shadow: 0 0 0 3px rgba(216,175,71,.07);
        }

        /* Historique : lignes façon terminal premium */
        [data-journal-v2] .divide-y > div {
          position: relative;
        }

        [data-journal-v2] .divide-y > div::before {
          content: "";
          position: absolute;
          left: 0;
          top: 11px;
          bottom: 11px;
          width: 2px;
          border-radius: 99px;
          background: transparent;
          transition: background .18s ease;
        }

        [data-journal-v2] .divide-y > div:hover::before {
          background: var(--gold, #d8af47);
        }

        [data-journal-v2] .divide-y > div:hover {
          background: linear-gradient(90deg, rgba(216,175,71,.045), rgba(255,255,255,.012));
        }

        /* Boutons */
        [data-journal-v2] button {
          transition: transform .16s ease, filter .16s ease, border-color .16s ease, background .16s ease;
        }

        [data-journal-v2] button:active {
          transform: scale(.975);
        }

        /* Modal ajout / édition */
        [data-journal-v2] .fixed.inset-0 > div.max-w-4xl {
          box-shadow: 0 30px 100px rgba(0,0,0,.62), 0 0 0 1px rgba(216,175,71,.035);
        }

        /* Mobile : cartes compactes et actions faciles à toucher */
        @media (max-width: 767px) {
          .journal-v2-glow-a {
            width: 230px;
            height: 230px;
            right: -90px;
            top: 120px;
          }

          [data-journal-v2] .journal-v2-content > div {
            padding-bottom: 92px;
          }

          [data-journal-v2] .journal-v2-content > div > div:first-child {
            gap: 14px;
          }

          [data-journal-v2] .journal-v2-content > div > div:first-child > div:last-child {
            width: 100%;
          }

          [data-journal-v2] .journal-v2-content > div > div:first-child button {
            flex: 1;
            justify-content: center;
          }

          [data-journal-v2] section {
            border-radius: 18px !important;
          }

          [data-journal-v2] .divide-y > div {
            margin: 10px;
            border: 1px solid rgba(255,255,255,.065);
            border-radius: 16px;
            background: rgba(0,0,0,.18);
            padding: 14px !important;
          }

          [data-journal-v2] .divide-y > div + div {
            border-top-width: 1px !important;
          }

          [data-journal-v2] .divide-y > div::before {
            top: 14px;
            bottom: 14px;
          }

          [data-journal-v2] .fixed.inset-0 {
            align-items: flex-end !important;
            padding: 0 !important;
          }

          [data-journal-v2] .fixed.inset-0 > div.max-w-4xl {
            max-height: 94dvh !important;
            border-bottom-left-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          [data-journal-v2] *,
          [data-journal-v2] *::before,
          [data-journal-v2] *::after {
            scroll-behavior: auto !important;
            transition-duration: .01ms !important;
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
