"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export default function ComptesMotionLayout({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="accounts-motion-scope relative isolate"
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 145, damping: 22, mass: 0.75 }}
    >
      {!reduceMotion ? (
        <>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed right-[8%] top-[12%] -z-10 h-[420px] w-[420px] rounded-full bg-[color:var(--gold)] blur-[150px]"
            animate={{ opacity: [0.025, 0.075, 0.025], scale: [0.95, 1.12, 0.95] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed bottom-[4%] left-[25%] -z-10 h-[300px] w-[300px] rounded-full bg-[color:var(--gold)] blur-[160px]"
            animate={{ opacity: [0.015, 0.045, 0.015], x: [0, 45, 0], y: [0, -20, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      ) : null}

      {children}

      <style jsx global>{`
        .accounts-motion-scope {
          --ip-motion-gold: var(--gold);
        }

        .accounts-motion-scope > div > section,
        .accounts-motion-scope main section {
          transition:
            transform 260ms cubic-bezier(.2,.8,.2,1),
            border-color 260ms ease,
            box-shadow 260ms ease,
            background-color 260ms ease;
        }

        .accounts-motion-scope > div > section:hover,
        .accounts-motion-scope main section:hover {
          transform: translateY(-3px);
          border-color: color-mix(in srgb, var(--ip-motion-gold) 38%, transparent);
          box-shadow: 0 22px 70px rgba(0,0,0,.24), 0 0 34px color-mix(in srgb, var(--ip-motion-gold) 8%, transparent);
        }

        .accounts-motion-scope button,
        .accounts-motion-scope a {
          transition:
            transform 180ms cubic-bezier(.2,.8,.2,1),
            box-shadow 180ms ease,
            filter 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease !important;
        }

        .accounts-motion-scope button:hover,
        .accounts-motion-scope a:hover {
          transform: translateY(-2px);
        }

        .accounts-motion-scope button:active,
        .accounts-motion-scope a:active {
          transform: translateY(0) scale(.98);
        }

        .accounts-motion-scope section .grid > div {
          transition:
            transform 240ms cubic-bezier(.2,.8,.2,1),
            border-color 240ms ease,
            box-shadow 240ms ease,
            background-color 240ms ease;
        }

        .accounts-motion-scope section .grid > div:hover {
          transform: translateY(-5px) scale(1.008);
          border-color: color-mix(in srgb, var(--ip-motion-gold) 34%, transparent);
          box-shadow: 0 16px 45px rgba(0,0,0,.22), 0 0 28px color-mix(in srgb, var(--ip-motion-gold) 7%, transparent);
        }

        .accounts-motion-scope [class*="gold-soft"] {
          position: relative;
        }

        .accounts-motion-scope [class*="gold-soft"]::after {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          pointer-events: none;
          opacity: 0;
          box-shadow: 0 0 26px color-mix(in srgb, var(--ip-motion-gold) 15%, transparent);
          transition: opacity 220ms ease;
        }

        .accounts-motion-scope [class*="gold-soft"]:hover::after {
          opacity: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .accounts-motion-scope *,
          .accounts-motion-scope *::before,
          .accounts-motion-scope *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </motion.div>
  );
}
