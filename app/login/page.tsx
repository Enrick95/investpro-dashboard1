"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import AuthExperienceShell, {
  AppleButton,
  AuthCardHeader,
  AuthFeatureStrip,
  AuthMessage,
  Divider,
  GoogleButton,
  SecurityNote,
} from "@/components/auth/AuthExperienceShell";

type Message = { kind: "success" | "error" | "info"; text: string } | null;

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!email.trim() || !password) {
      setMessage({ kind: "error", text: "Renseigne ton e-mail et ton mot de passe." });
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      router.push("/dashboard");
      router.refresh();
    } catch (error: any) {
      setMessage({
        kind: "error",
        text:
          error?.message === "Invalid login credentials"
            ? "E-mail ou mot de passe incorrect."
            : error?.message || "Connexion impossible pour le moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    try {
      setGoogleBusy(true);
      setMessage(null);

      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (error: any) {
      setGoogleBusy(false);
      setMessage({
        kind: "error",
        text:
          String(error?.message || "").includes("provider is not enabled")
            ? "La connexion Google n’est pas encore activée côté InvestPro. Utilise e-mail / mot de passe pour le moment."
            : error?.message || "Connexion Google impossible.",
      });
    }
  }

  async function appleLogin() {
    try {
      setAppleBusy(true);
      setMessage(null);

      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (error: any) {
      setAppleBusy(false);
      setMessage({
        kind: "error",
        text:
          String(error?.message || "").includes("provider is not enabled")
            ? "La connexion Apple n’est pas encore activée côté InvestPro. Utilise e-mail / mot de passe pour le moment."
            : error?.message || "Connexion Apple impossible.",
      });
    }
  }

  async function sendReset() {
    setMessage(null);

    if (!email.trim()) {
      setMessage({ kind: "error", text: "Entre d’abord ton adresse e-mail." });
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      setMessage({
        kind: "success",
        text: "Si cette adresse correspond à un compte, un lien de réinitialisation vient d’être envoyé.",
      });
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.message || "Impossible d’envoyer le lien." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthExperienceShell mode="login">
      <div className="rounded-[26px] border border-white/[0.07] bg-[#0d0f0d]/90 p-5 shadow-[0_30px_80px_rgba(0,0,0,.28)] sm:p-7">
        <AuthCardHeader
          badge={forgotMode ? "Récupération du compte" : "Espace membre"}
          title={forgotMode ? "Retrouve ton" : "Connexion à ton espace"}
          highlight={forgotMode ? "accès" : "InvestPro"}
          description={
            forgotMode
              ? "Entre ton e-mail et nous t’enverrons un lien sécurisé pour choisir un nouveau mot de passe."
              : "Retrouve ton journal, tes comptes, tes rapports et ta progression au même endroit."
          }
        />

        <div className="mt-6 space-y-4">
          {message ? <AuthMessage {...message} /> : null}

          {!forgotMode ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <GoogleButton onClick={googleLogin} busy={googleBusy} label="Google" />
                <AppleButton onClick={appleLogin} busy={appleBusy} label="Apple" />
              </div>
              <Divider />
            </>
          ) : null}

          <form onSubmit={forgotMode ? (event) => { event.preventDefault(); sendReset(); } : login} className="space-y-3.5">
            <label className="block">
              <span className="mb-2 block text-[9px] font-medium text-white/45">Adresse e-mail</span>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ton@email.com"
                  className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-3 text-[11px] text-white outline-none transition placeholder:text-white/18 focus:border-[#d9ac43]/45"
                />
              </div>
            </label>

            {!forgotMode ? (
              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[9px] font-medium text-white/45">Mot de passe</span>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setMessage(null);
                    }}
                    className="text-[8px] font-semibold text-[#d9ac43]"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                <div className="relative">
                  <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-11 text-[11px] text-white outline-none transition placeholder:text-white/18 focus:border-[#d9ac43]/45"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/28 hover:text-white/65"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>
            ) : null}

            <button
              type="submit"
              disabled={busy || googleBusy || appleBusy}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-[#090a09] shadow-[0_12px_35px_rgba(231,186,77,.12)] transition hover:bg-[#efc55d] disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {forgotMode ? "Envoyer le lien sécurisé" : "Connexion"}
              {!busy ? <ArrowRight size={14} /> : null}
            </button>
          </form>

          {forgotMode ? (
            <button
              type="button"
              onClick={() => {
                setForgotMode(false);
                setMessage(null);
              }}
              className="w-full text-center text-[9px] font-semibold text-white/38 hover:text-white/65"
            >
              ← Retour à la connexion
            </button>
          ) : (
            <div className="pt-1 text-center text-[9px] text-white/35">
              Pas encore de compte ?{" "}
              <Link href="/register" className="font-semibold text-[#d9ac43]">
                Créer mon espace
              </Link>
            </div>
          )}

          <AuthFeatureStrip />
          <SecurityNote />
        </div>
      </div>
    </AuthExperienceShell>
  );
}
