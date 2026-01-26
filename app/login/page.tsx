"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { signIn } from "../../lib/authStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function onLogin() {
    setErr(null);
    const r = signIn(username, pass);
    if (!r.ok) {
      setErr(r.error || "Erreur de connexion");
      return;
    }
    window.location.href = "/dashboard/comptes";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
        
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.webp"
            alt="InvestPro Trading"
            width={64}
            height={64}
            className="rounded-2xl"
          />
        </div>

        <h1 className="text-2xl font-semibold text-center">
          Connexion à votre compte <span className="text-[color:var(--gold)]">InvestPro</span>
        </h1>
        <p className="text-sm text-center text-[color:var(--muted)] mt-2">
          Trackez et optimisez vos performances.
        </p>

        {/* Google */}
        <button
          className="w-full mt-6 flex items-center justify-center gap-3 px-4 py-3
                     rounded-2xl bg-[#1f1f1f] hover:bg-[#2a2a2a]
                     border border-white/10 transition text-white"
        >
          <img src="/google.svg" alt="Google" className="w-5 h-5" />
          Se connecter avec Google
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/40">ou</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Erreur */}
        {err && (
          <div className="mb-4 text-sm rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-2">
            {err}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <input
            placeholder="Pseudo"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10
                       text-white outline-none focus:border-[color:var(--gold-border)]"
          />

          <input
            type="password"
            placeholder="Mot de passe"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10
                       text-white outline-none focus:border-[color:var(--gold-border)]"
          />
        </div>

        <div className="flex justify-end mt-2">
          <Link
            href="/forgot-password"
            className="text-xs text-[color:var(--gold)] hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <button
          onClick={onLogin}
          className="w-full mt-6 px-4 py-3 rounded-2xl bg-[color:var(--gold)]
                     text-black font-semibold hover:bg-[color:var(--gold-2)] transition"
        >
          Connexion
        </button>

        <p className="text-sm text-center text-[color:var(--muted)] mt-6">
          Pas encore de compte ?{" "}
          <Link href="/register" className="text-[color:var(--gold)] hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
