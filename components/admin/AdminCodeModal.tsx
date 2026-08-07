"use client";

import React, { useEffect, useRef, useState } from "react";
import { grantAdminSession, verifyAdminCode } from "../../lib/adminClient";
import { pushNotif } from "../../lib/notifyStore";

export default function AdminCodeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  function submit() {
    if (!verifyAdminCode(code)) {
      pushNotif({
        kind: "error",
        title: "Code incorrect",
        message: "Le code admin est invalide.",
        ttlMs: 6000,
      });
      return;
    }
    grantAdminSession("Admin");
    pushNotif({
      kind: "success",
      title: "Accès admin activé",
      message: "Session admin locale active.",
      ttlMs: 6000,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.65)" }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5"
        style={{
          borderColor: "rgba(255,255,255,.10)",
          background: "rgba(20,20,25,.92)",
          backdropFilter: "blur(10px)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Code Admin
        </div>
        <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Entre ton code pour activer la session admin (local).
        </div>

        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••••"
          className="mt-4 w-full rounded-xl border px-3 py-2 outline-none"
          style={{
            borderColor: "rgba(255,255,255,.10)",
            background: "rgba(0,0,0,.25)",
            color: "var(--text)",
          }}
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-4 py-2 rounded-xl border text-sm"
            style={{ borderColor: "rgba(255,255,255,.10)", color: "var(--text)" }}
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            className="px-4 py-2 rounded-xl border text-sm"
            style={{
              borderColor: "rgba(212,175,55,.25)",
              background: "rgba(212,175,55,.12)",
              color: "var(--gold)",
            }}
            onClick={submit}
          >
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
