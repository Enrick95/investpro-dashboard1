import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackLoading />}>
      <CallbackClient />
    </Suspense>
  );
}

function CallbackLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050605] p-5 text-white">
      <section className="w-full max-w-md rounded-[24px] border border-white/[0.07] bg-[#0d0f0d] p-7 text-center shadow-[0_35px_100px_rgba(0,0,0,.45)]">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl border border-[#d9ac43]/25 bg-[#d9ac43]/[0.07]" />
        <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d9ac43]">
          InvestPro Trading
        </div>
        <h1 className="mt-2 text-xl font-semibold">Connexion sécurisée</h1>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Connexion Google en cours…
        </p>
      </section>
    </main>
  );
}
