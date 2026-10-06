"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import AuthExperienceShell, {
  AuthCardHeader,
  AuthMessage,
  SecurityNote,
} from "@/components/auth/AuthExperienceShell";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

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
    } catch (error: any) {
      setMessage({
        kind: "error",
        text: error?.message || "Le lien est peut-être expiré. Recommence depuis la page de connexion.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthExperienceShell mode="reset">
      <div className="rounded-[26px] border border-white/[0.07] bg-[#0d0f0d]/90 p-5 shadow-[0_30px_80px_rgba(0,0,0,.28)] sm:p-7">
        <AuthCardHeader
          badge="Sécurité du compte"
          title="Choisis un nouveau"
          highlight="mot de passe"
          description="Utilise un mot de passe unique pour InvestPro et différent de celui de tes brokers ou prop firms."
        />

        <div className="mt-6 space-y-4">
          {message ? <AuthMessage {...message} /> : null}

          {!done ? (
            <form onSubmit={update} className="space-y-3.5">
              {[{ label: "Nouveau mot de passe", value: password, setter: setPassword }, { label: "Confirmer", value: confirm, setter: setConfirm }].map((field) => (
                <label key={field.label} className="block">
                  <span className="mb-2 block text-[9px] font-medium text-white/45">{field.label}</span>
                  <div className="relative">
                    <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                    <input
                      type={show ? "text" : "password"}
                      value={field.value}
                      onChange={(event) => field.setter(event.target.value)}
                      className="h-12 w-full rounded-[14px] border border-white/[0.075] bg-black/25 pl-10 pr-11 text-[11px] text-white outline-none focus:border-[#d9ac43]/45"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((value) => !value)}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/28"
                    >
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              ))}

              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-black disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                Enregistrer le nouveau mot de passe
                {!busy ? <ArrowRight size={14} /> : null}
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#e7ba4d] text-[11px] font-bold text-black"
            >
              Retour à la connexion
              <ArrowRight size={14} />
            </Link>
          )}

          <SecurityNote />
        </div>
      </div>
    </AuthExperienceShell>
  );
}
