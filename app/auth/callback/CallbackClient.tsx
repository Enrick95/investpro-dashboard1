"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

export default function CallbackClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [message, setMessage] = useState("Connexion Google en cours…");

  useEffect(() => {
    let cancelled = false;

    async function finishGoogleLogin() {
      try {
        const code = searchParams.get("code");
        const requestedNext = searchParams.get("next") || "/dashboard";

        const next =
          requestedNext.startsWith("/") && !requestedNext.startsWith("//")
            ? requestedNext
            : "/dashboard";

        if (!code) {
          throw new Error("Code de connexion Google manquant.");
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) throw error;
        if (cancelled) return;

        setStatus("success");
        setMessage("Connexion réussie. Ouverture de ton espace InvestPro…");

        window.setTimeout(() => {
          router.replace(next);
          router.refresh();
        }, 350);
      } catch (error: any) {
        console.error("Google OAuth callback:", error);

        if (cancelled) return;

        setStatus("error");
        setMessage(
          error?.message ||
            "Impossible de finaliser la connexion Google. Retourne sur la page de connexion et réessaie."
        );
      }
    }

    finishGoogleLogin();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050605] p-5 text-white">
      <section className="w-full max-w-md rounded-[24px] border border-white/[0.07] bg-[#0d0f0d] p-7 text-center shadow-[0_35px_100px_rgba(0,0,0,.45)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d9ac43]/25 bg-[#d9ac43]/[0.07]">
          {status === "loading" ? (
            <Loader2 size={22} className="animate-spin text-[#e4b94e]" />
          ) : status === "success" ? (
            <CheckCircle2 size={22} className="text-emerald-400" />
          ) : (
            <TriangleAlert size={22} className="text-red-300" />
          )}
        </div>

        <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d9ac43]">
          InvestPro Trading
        </div>

        <h1 className="mt-2 text-xl font-semibold">
          {status === "error" ? "Connexion impossible" : "Connexion sécurisée"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-white/45">{message}</p>

        {status === "error" ? (
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-6 h-11 w-full rounded-xl bg-[#e4b94e] text-sm font-semibold text-black"
          >
            Retour à la connexion
          </button>
        ) : null}
      </section>
    </main>
  );
}
