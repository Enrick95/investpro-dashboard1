"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const supabase = createClient();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function onRegister() {
    setErr(null);
    setSuccess(null);

    if (!username.trim()) {
      return setErr("Le pseudo est requis");
    }

    if (!email.trim()) {
      return setErr("L’adresse e-mail est requise");
    }

    if (pass.length < 6) {
      return setErr("Mot de passe trop court (min 6 caractères)");
    }

    if (pass !== pass2) {
      return setErr("Les mots de passe ne correspondent pas");
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: {
        data: {
          username: username.trim(),
          plan: "free",
        },
      },
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    if (!data.user) {
      setErr("Erreur lors de la création du compte");
      return;
    }

    // Si Supabase demande une confirmation par e-mail
    if (!data.session) {
      setSuccess(
        "Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse e-mail."
      );
      return;
    }

    // Si la confirmation email est désactivée, l'utilisateur est connecté immédiatement
    window.location.href = "/dashboard/profil";
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-10">
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0c0f]
                   p-8 shadow-2xl"
      >
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
          Créer votre compte{" "}
          <span className="text-[color:var(--gold)]">InvestPro</span>
        </h1>

        <p className="text-sm text-center text-[color:var(--muted)] mt-2">
          Rejoignez la plateforme et suivez vos performances.
        </p>

        {/* Google */}
        <button
          type="button"
          className="w-full mt-6 flex items-center justify-center gap-3 px-4 py-3
                     rounded-2xl bg-[#1f1f1f] hover:bg-[#2a2a2a]
                     border border-white/10 transition text-white"
        >
          <img src="/google.svg" alt="Google" className="w-5 h-5" />
          S’inscrire avec Google
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/40">ou</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Erreur */}
        {err && (
          <div className="mb-4 text-sm rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-3">
            {err}
          </div>
        )}

        {/* Succès */}
        {success && (
          <div className="mb-4 text-sm rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 px-4 py-3">
            {success}
          </div>
        )}

        {/* Formulaire */}
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Pseudo"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10
                       text-white outline-none focus:border-[color:var(--gold-border)]"
          />

          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                onRegister();
              }
            }}
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10
                       text-white outline-none focus:border-[color:var(--gold-border)]"
          />
        </div>

        <button
          type="button"
          onClick={onRegister}
          disabled={loading}
          className="w-full mt-6 px-4 py-3 rounded-2xl bg-[color:var(--gold)]
                     text-black font-semibold hover:bg-[color:var(--gold-2)]
                     transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Création du compte..." : "Créer le compte"}
        </button>

        <p className="text-sm text-center text-[color:var(--muted)] mt-6">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-[color:var(--gold)] hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}