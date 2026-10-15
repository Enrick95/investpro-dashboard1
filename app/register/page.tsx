"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-next-path";
import AuthExperienceShell, {
  AuthCardHeader,
  AuthFeatureStrip,
  AuthMessage,
  Divider,
  GoogleButton,
  SecurityNote,
} from "@/components/auth/AuthExperienceShell";

type Message = { kind: "success" | "error" | "info"; text: string } | null;

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function requestedNextPath() {
  return new URLSearchParams(window.location.search).get("next");
}
function serverNextPath() { return null; }

export default function RegisterPage() {
  const { t } = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const requestedNext = useSyncExternalStore(subscribeToLocation, requestedNextPath, serverNextPath);
  const nextPath = requestedNext ? safeNextPath(requestedNext, "/dashboard/onboarding") : null;

  const strength = Math.min(
    4,
    Number(password.length >= 8) +
      Number(/[A-Z]/.test(password)) +
      Number(/[0-9]/.test(password)) +
      Number(/[^A-Za-z0-9]/.test(password))
  );

  async function register(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (username.trim().length < 2) {
      setMessage({ kind: "error", text: "Choisis un pseudo d’au moins 2 caractères." });
      return;
    }
    if (!email.trim()) {
      setMessage({ kind: "error", text: "Renseigne ton adresse e-mail." });
      return;
    }
    if (password.length < 8) {
      setMessage({ kind: "error", text: "Ton mot de passe doit contenir au moins 8 caractères." });
      return;
    }
    if (password !== confirm) {
      setMessage({ kind: "error", text: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    if (!accepted) {
      setMessage({ kind: "error", text: "Confirme que tu acceptes la création de ton espace InvestPro." });
      return;
    }

    try {
      setBusy(true);
      const destination = safeNextPath(new URLSearchParams(window.location.search).get("next"), "/dashboard/onboarding");
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", destination);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim() },
          emailRedirectTo: callback.toString(),
        },
      });

      if (error) throw error;

      if (data.session) {
        router.push(destination);
        router.refresh();
        return;
      }

      setMessage({
        kind: "success",
        text: destination === "/vip/deja-membre"
          ? "Vérifie ta boîte e-mail si une confirmation est nécessaire, puis retourne sur la page « Déjà membre VIP » pour renseigner ton accès. Si tu as déjà un compte avec cette adresse, connecte-toi directement."
          : destination.startsWith("/vip")
          ? "Vérifie ta boîte e-mail si une confirmation est nécessaire, puis retrouve ton espace VIP. Si tu as déjà un compte avec cette adresse, connecte-toi directement."
          : "Vérifie ta boîte e-mail si une confirmation est nécessaire. Si tu as déjà un compte avec cette adresse, connecte-toi pour retrouver ton espace InvestPro.",
      });
    } catch (error: unknown) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Impossible de créer le compte." });
    } finally {
      setBusy(false);
    }
  }

  async function googleRegister() {
    try {
      setGoogleBusy(true);
      setMessage(null);
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", safeNextPath(new URLSearchParams(window.location.search).get("next"), "/dashboard/onboarding"));
      const redirectTo = callback.toString();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "";
      setGoogleBusy(false);
      setMessage({
        kind: "error",
        text:
          errorMessage.includes("provider is not enabled")
            ? "L’inscription Google n’est pas encore activée côté InvestPro. Crée ton compte avec ton e-mail pour le moment."
            : errorMessage || "Inscription Google impossible.",
      });
    }
  }


  return (
    <AuthExperienceShell mode="register">
      <div className="rounded-[26px] border border-white/[0.07] bg-[#0d0f0d]/90 p-5 shadow-[0_30px_80px_rgba(0,0,0,.28)] sm:p-7">
        <AuthCardHeader
          badge={t("Créer mon espace")}
          title={t("Commence à structurer ton")}
          highlight={t("trading")}
          description={t("Crée ton compte InvestPro puis configure ton espace CFD & Futures en quelques minutes : comptes, plan, journal, copy multi-comptes et application mobile.")}
        />

        <div className="mt-6 space-y-4">
          {message ? <AuthMessage {...message} /> : null}
          {message?.kind === "success" ? <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} className="flex min-h-11 items-center justify-center rounded-xl border border-[#d9ac43]/35 px-4 py-3 text-sm font-semibold text-[#e7ba4d] hover:bg-[#d9ac43]/10">{t("Me connecter avec mon compte")}</Link> : null}

          <GoogleButton onClick={googleRegister} busy={googleBusy} label={t("Continuer avec Google")} />
          <Divider />

          <form onSubmit={register} className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-1">
                <span className="mb-2 block text-[9px] font-medium text-white/45">{t("Pseudo")}</span>
                <div className="relative">
                  <UserRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t("Trader95")}
                    className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-3 text-[11px] text-white outline-none placeholder:text-white/18 focus:border-[#d9ac43]/45"
                  />
                </div>
              </label>

              <label className="block sm:col-span-1">
                <span className="mb-2 block text-[9px] font-medium text-white/45">{t("Adresse e-mail")}</span>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("ton@email.com")}
                    className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-3 text-[11px] text-white outline-none placeholder:text-white/18 focus:border-[#d9ac43]/45"
                  />
                </div>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-[9px] font-medium text-white/45">{t("Mot de passe")}</span>
              <div className="relative">
                <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("8 caractères minimum")}
                  className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-11 text-[11px] text-white outline-none placeholder:text-white/18 focus:border-[#d9ac43]/45"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={t(showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe")}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/28 hover:text-white/65"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((level) => (
                  <span
                    key={level}
                    className={[
                      "h-1 rounded-full transition",
                      strength >= level ? "bg-[#d9ac43]" : "bg-white/[0.06]",
                    ].join(" ")}
                  />
                ))}
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-[9px] font-medium text-white/45">{t("Confirmer le mot de passe")}</span>
              <div className="relative">
                <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder={t("Répète ton mot de passe")}
                  className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-3 text-[11px] text-white outline-none placeholder:text-white/18 focus:border-[#d9ac43]/45"
                />
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-[#d9ac43]"
              />
              <span className="text-[8px] leading-4 text-white/35">
                {t("Je confirme vouloir créer mon espace InvestPro et j’ai compris que les outils proposés ne constituent pas un conseil financier.")}</span>
            </label>

            <button
              type="submit"
              disabled={busy || googleBusy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-[#090a09] shadow-[0_12px_35px_rgba(231,186,77,.12)] transition hover:bg-[#efc55d] disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {t("Créer mon espace InvestPro")}{!busy ? <ArrowRight size={14} /> : null}
            </button>
          </form>

          <div className="pt-1 text-center text-[9px] text-white/35">
            {t("Déjà membre ?")}{" "}
            <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} className="font-semibold text-[#d9ac43]">
              {t("Me connecter")}</Link>
          </div>

          <AuthFeatureStrip />
          <SecurityNote />
        </div>
      </div>
    </AuthExperienceShell>
  );
}
