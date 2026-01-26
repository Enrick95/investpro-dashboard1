"use client";

import { useEffect } from "react";

export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onClose?.()}
      />

      {/* Panel */}
      <div className="relative z-[1001] min-h-full w-full flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel)] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[color:var(--border)] flex items-center justify-between">
            <div className="text-lg font-semibold text-white">{title ?? ""}</div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="w-9 h-9 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition flex items-center justify-center text-white/70"
              title="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">{children}</div>

          {/* Footer */}
          {footer ? (
            <div className="px-6 py-5 border-t border-[color:var(--border)] bg-black/20">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
