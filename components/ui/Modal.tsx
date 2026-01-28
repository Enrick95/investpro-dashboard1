"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string; // ex: "max-w-2xl"
};

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-2xl",
}: ModalProps) {
  // Lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Wrapper */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className={[
            "w-full",
            maxWidthClassName,
            // ✅ theme-aware (light + dark)
            "rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)]",
            // shadow: utilise token si tu l’as ajouté, sinon fallback
            "shadow-[var(--shadow-float)] dark:shadow-2xl",
            // IMPORTANT: flex column + max height
            "flex flex-col max-h-[85vh] overflow-hidden",
          ].join(" ")}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-[color:var(--border)]">
            <div className="font-semibold text-[color:var(--text)]">
              {title ?? "Modal"}
            </div>

            <button
              type="button"
              onClick={onClose}
              className={[
                "h-9 w-9 rounded-xl transition flex items-center justify-center",
                "border border-[color:var(--border)]",
                "bg-black/5 dark:bg-black/20",
                "hover:bg-black/10 dark:hover:bg-white/5",
                "text-[color:var(--muted)] hover:text-[color:var(--text)]",
              ].join(" ")}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-5 py-5">{children}</div>

          {/* Footer (toujours visible) */}
          {footer ? (
            <div className="shrink-0 px-5 py-4 border-t border-[color:var(--border)] bg-[color:var(--panel)]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
