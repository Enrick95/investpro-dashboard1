"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function onSend() {
    if (!value.trim()) {
      setMsg("❌ Entre ton email ou ton pseudo.");
      return;
    }
    // Démo : en prod ce serait un email de reset
    setMsg("✅ Démo : un lien de réinitialisation serait envoyé.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.webp" // ou /logo.webp
            alt="InvestPro Trading"
            width={64}
            height={64}
            className="rounded-2xl"
          />
        </div>

        <h1 className="text-2xl font-semibold text-center">
          Mot de passe <span className="text-[color:var(--gold)]">oublié</span>
        </h1>
        <p className="text-sm text-center text-[color:var(--muted)] mt-2">
          Entre ton email ou ton pseudo. (Démo)
        </p>

        {msg ? (
          <div className="mt-6 text-sm rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] px-4 py-3">
            {msg}
          </div>
        ) : null}

        <div className="mt-6">
          <div className="text-sm text-white/70 mb-2">Email / Pseudo</div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="johndoe@gmail.com"
            className="w-full h-12 px-4 rounded-2xl bg-black/30 border border-white/10
                       text-white outline-none focus:border-[color:var(--gold-border)]"
          />
        </div>

        <button
          onClick={onSend}
          className="w-full mt-6 px-4 py-3 rounded-2xl bg-[color:var(--gold)]
                     text-black font-semibold hover:bg-[color:var(--gold-2)] transition"
        >
          Envoyer le lien
        </button>

        <p className="text-sm text-center text-[color:var(--muted)] mt-6">
          <Link href="/login" className="text-[color:var(--gold)] hover:underline">
            Retour connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
