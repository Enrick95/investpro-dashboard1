"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { readRecoveryLink } from "@/lib/supabase/recovery";
import AuthExperienceShell, {
  AuthCardHeader,
  AuthMessage,
  SecurityNote,
} from "@/components/auth/AuthExperienceShell";

type LinkState = "checking" | "ready" | "expired" | "elsewhere" | "missing";

// Ce que la page dit quand le lien ne donne pas de session : toujours avec la marche à suivre.
const LINK_MESSAGES: Record<Exclude<LinkState, "checking" | "ready">, string> = {
  expired: "Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis la page de connexion.",
  elsewhere: "Ce lien ne s’ouvre pas dans ce navigateur. Demande un nouveau lien depuis la page de connexion : il marchera sur n’importe quel appareil.",
  missing: "Ouvre le lien reçu par e-mail pour choisir ton nouveau mot de passe.",
};

export default function ResetPasswordPage() {
  const { t } = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  // Le lien de récupération ouvre une session : jetons dans l'adresse (lien valable sur tout appareil), ou ancien
  // code PKCE, valable seulement dans le navigateur qui a fait la demande. Les jetons sont retirés de l'adresse.
  useEffect(() => {
    let cancelled = false;
    const link = readRecoveryLink(window.location.search, window.location.hash);
    (async () => {
      let state: LinkState;
      if (link.kind === "error") {
        state = "expired";
      } else if (link.kind === "tokens") {
        const { error } = await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
        state = error ? "expired" : "ready";
      } else {
        const { data } = await supabase.auth.getSession();
        if (data.session) state = "ready";
        else if (link.kind === "code") state = (await supabase.auth.exchangeCodeForSession(link.code)).error ? "elsewhere" : "ready";
        else state = "missing";
      }
      if (link.kind !== "none") window.history.replaceState(null, "", window.location.pathname);
      if (!cancelled) setLinkState(state);
    })().catch(() => {
      if (!cancelled) setLinkState("expired");
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function update(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ kind: "error", text: "Utilise au moins 8 caractères." });
      return;
    }
    if (password !== confirm) {
      setMessage({ kind: "error", text: "Les deux mots de passe ne correspondent pas." });
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setMessage({ kind: "success", text: "Ton nouveau mot de passe est enregistré." });
    } catch (error: unknown) {
      const errorMessage = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "";
      if (/session/i.test(errorMessage)) {
        setLinkState("expired");
        return;
      }
      setMessage({
        kind: "error",
        text: errorMessage || "Le lien est peut-être expiré. Recommence depuis la page de connexion.",
      });
    } finally {
      setBusy(false);
    }
  }

  const blocked = linkState !== "checking" && linkState !== "ready";

  return (
    <AuthExperienceShell mode="reset">
      <div className="rounded-[26px] border border-white/[0.07] bg-[#0d0f0d]/90 p-5 shadow-[0_30px_80px_rgba(0,0,0,.28)] sm:p-7">
        <AuthCardHeader
          badge={t("Sécurité du compte")}
          title={t("Choisis un nouveau")}
          highlight={t("mot de passe")}
          description={t("Utilise un mot de passe unique pour InvestPro et différent de celui de tes brokers ou prop firms.")}
        />

        <div className="mt-6 space-y-4">
          {blocked ? <AuthMessage kind="error" text={LINK_MESSAGES[linkState]} /> : null}
          {linkState === "checking" && !done ? <AuthMessage kind="info" text="Vérification du lien…" /> : null}
          {message ? <AuthMessage {...message} /> : null}

          {done ? (
            <Link
              href="/login"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-black"
            >
              {t("Retour à la connexion")}<ArrowRight size={14} />
            </Link>
          ) : blocked ? (
            <Link
              href="/login?oubli=1"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-black"
            >
              {t("Demander un nouveau lien")}<ArrowRight size={14} />
            </Link>
          ) : (
            <form onSubmit={update} className="space-y-3.5">
              {[{ label: "Nouveau mot de passe", value: password, setter: setPassword }, { label: "Confirmer", value: confirm, setter: setConfirm }].map((field) => (
                <label key={field.label} className="block">
                  <span className="mb-2 block text-[9px] font-medium text-white/45">{t(field.label)}</span>
                  <div className="relative">
                    <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                    <input
                      type={show ? "text" : "password"}
                      value={field.value}
                      onChange={(event) => field.setter(event.target.value)}
                      autoComplete="new-password"
                      className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-11 text-[11px] text-white outline-none focus:border-[#d9ac43]/45"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((value) => !value)}
                      aria-label={t(show ? "Masquer le mot de passe" : "Afficher le mot de passe")}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/28"
                    >
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              ))}

              <button
                type="submit"
                disabled={busy || linkState !== "ready"}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-black disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {t("Enregistrer le nouveau mot de passe")}{!busy ? <ArrowRight size={14} /> : null}
              </button>
            </form>
          )}

          <SecurityNote />
        </div>
      </div>
    </AuthExperienceShell>
  );
}
