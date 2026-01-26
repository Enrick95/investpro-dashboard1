"use client";

import { useMemo } from "react";
import { X, Bell, CheckCircle2, AlertTriangle, Info, Radio, Clock, Shield } from "lucide-react";
import { useNotifs, removeNotif, markRead } from "../lib/notifyStore";

function tone(kind: string) {
  // couleurs (pas vert/rouge “classiques” trop agressives)
  if (kind === "error") return { border: "rgba(255,90,90,.35)", bg: "rgba(255,90,90,.08)", bar: "rgba(255,90,90,.65)" };
  if (kind === "warning") return { border: "rgba(255,186,60,.35)", bg: "rgba(255,186,60,.08)", bar: "rgba(255,186,60,.65)" };
  if (kind === "live") return { border: "rgba(255,60,120,.35)", bg: "rgba(255,60,120,.08)", bar: "rgba(255,60,120,.65)" };
  if (kind === "video") return { border: "rgba(80,140,255,.35)", bg: "rgba(80,140,255,.08)", bar: "rgba(80,140,255,.65)" };
  if (kind === "admin") return { border: "rgba(214,179,95,.35)", bg: "rgba(214,179,95,.08)", bar: "rgba(214,179,95,.65)" };
  if (kind === "pending") return { border: "rgba(170,140,255,.35)", bg: "rgba(170,140,255,.08)", bar: "rgba(170,140,255,.65)" };
  if (kind === "tp") return { border: "rgba(70,240,160,.35)", bg: "rgba(70,240,160,.08)", bar: "rgba(70,240,160,.65)" };
  if (kind === "sl") return { border: "rgba(255,90,90,.35)", bg: "rgba(255,90,90,.08)", bar: "rgba(255,90,90,.65)" };
  if (kind === "be") return { border: "rgba(255,255,255,.22)", bg: "rgba(255,255,255,.06)", bar: "rgba(255,255,255,.45)" };
  if (kind === "success") return { border: "rgba(140,255,200,.25)", bg: "rgba(140,255,200,.06)", bar: "rgba(140,255,200,.55)" };
  return { border: "rgba(255,255,255,.18)", bg: "rgba(255,255,255,.05)", bar: "rgba(214,179,95,.60)" };
}

function iconFor(kind: string) {
  if (kind === "error") return <Shield size={18} />;
  if (kind === "warning") return <AlertTriangle size={18} />;
  if (kind === "success") return <CheckCircle2 size={18} />;
  if (kind === "live") return <Radio size={18} />;
  if (kind === "video") return <Clock size={18} />;
  if (kind === "pending") return <Clock size={18} />;
  if (kind === "tp") return <CheckCircle2 size={18} />;
  if (kind === "sl") return <AlertTriangle size={18} />;
  if (kind === "be") return <Info size={18} />;
  if (kind === "admin") return <Bell size={18} />;
  return <Info size={18} />;
}

export default function ToastHub() {
  const { toasts } = useNotifs();

  // top-right like you wanted
  const items = useMemo(() => toasts ?? [], [toasts]);

  return (
    <div className="fixed top-5 right-5 z-[9999] space-y-3 w-[360px] max-w-[92vw] pointer-events-none">
      {items.map((t) => {
        const c = tone(t.kind);
        const ttl = Math.max(2000, Math.min(60000, t.ttlMs || 15000));

        return (
          <div
            key={t.id}
            className="pointer-events-auto overflow-hidden rounded-2xl border backdrop-blur"
            style={{
              borderColor: c.border,
              background: `linear-gradient(180deg, ${c.bg}, rgba(0,0,0,.45))`,
              boxShadow: "0 18px 50px rgba(0,0,0,.45)",
              animation: "toastIn .22s ease-out",
            }}
          >
            <div className="px-4 pt-3 pb-2 flex gap-3">
              <div className="mt-0.5 text-white/90">{iconFor(t.kind)}</div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white/95 truncate">{t.title}</div>
                {t.message ? (
                  <div className="mt-1 text-xs text-white/70 leading-relaxed line-clamp-2">{t.message}</div>
                ) : null}

                {t.url ? (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-white/75 hover:text-white"
                    onClick={() => markRead(t.id)}
                  >
                    Ouvrir <span className="opacity-60">↗</span>
                  </a>
                ) : null}
              </div>

              <button
                onClick={() => {
                  markRead(t.id);
                  removeNotif(t.id);
                }}
                className="w-8 h-8 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 flex items-center justify-center"
                title="Fermer"
              >
                <X size={16} className="text-white/70" />
              </button>
            </div>

            {/* progress bar (RIGHT -> LEFT) */}
            <div className="h-[3px] w-full" style={{ background: "rgba(255,255,255,.06)" }}>
              <div
                className="h-full"
                style={{
                  background: c.bar,
                  transformOrigin: "right",
                  animation: `toastBar ${ttl}ms linear forwards`,
                }}
              />
            </div>
          </div>
        );
      })}

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes toastBar {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
