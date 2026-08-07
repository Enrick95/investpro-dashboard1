"use client";

import React, { useMemo } from "react";

type Props = {
  maintTerminal?: boolean;
  maintCopier?: boolean;
};

function buildMessages(maintTerminal: boolean, maintCopier: boolean) {
  if (maintTerminal && maintCopier) {
    return [
      "🚧 MAINTENANCE ACTIVE",
      "TERMINAL INDISPONIBLE",
      "COPIEUR INDISPONIBLE",
      "SURVOLEZ POUR PAUSE",
      "MERCI DE VOTRE PATIENCE",
      "• INVESTPRO •",
    ];
  }

  if (maintTerminal) {
    return [
      "🚧 MAINTENANCE ACTIVE",
      "TERMINAL DE TRADING INDISPONIBLE",
      "SURVOLEZ POUR PAUSE",
      "MERCI DE VOTRE PATIENCE",
      "• INVESTPRO •",
    ];
  }

  if (maintCopier) {
    return [
      "🚧 MAINTENANCE ACTIVE",
      "COPIEUR INDISPONIBLE",
      "SURVOLEZ POUR PAUSE",
      "MERCI DE VOTRE PATIENCE",
      "• INVESTPRO •",
    ];
  }

  return [];
}

export default function MaintenanceTicker({
  maintTerminal = false,
  maintCopier = false,
}: Props) {
  const msgs = useMemo(
    () => buildMessages(!!maintTerminal, !!maintCopier),
    [maintTerminal, maintCopier]
  );

  if (msgs.length === 0) return null;

  return (
    <div
      className="w-full h-8 overflow-hidden
                 bg-black/95 border-b border-[color:var(--gold-border)] backdrop-blur"
      aria-label="Maintenance ticker"
    >
      <div className="h-full flex items-center whitespace-nowrap ip-led-track">
        {[0, 1].map((k) => (
          <div key={k} className="flex items-center">
            {msgs.map((t, i) => (
              <span
                key={`${k}-${i}`}
                className="mx-5 text-[11px] font-bold tracking-[0.18em] uppercase
                           text-[color:var(--gold)]"
                style={{ textShadow: "0 0 10px rgba(255,200,90,.25)" }}
              >
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        .ip-led-track{
          animation: ipLedScroll 28s linear infinite;
          will-change: transform;
        }
        .ip-led-track:hover{
          animation-play-state: paused;
          cursor: default;
        }
        @keyframes ipLedScroll{
          0%{ transform: translateX(0); }
          100%{ transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
