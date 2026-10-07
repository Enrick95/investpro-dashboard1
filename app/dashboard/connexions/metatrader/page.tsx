"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LockKeyhole, Server, ShieldCheck, Sparkles } from "lucide-react";
import HostedSyncPanel from "@/components/metasync/HostedSyncPanel";

export default function MetaTraderConnectionPage() {
  const params = useSearchParams();
  const requested = String(params.get("platform") || "mt5").toLowerCase();
  const platform: "MT4" | "MT5" = requested === "mt4" ? "MT4" : "MT5";

  return (
    <div className="mx-auto max-w-[1180px] space-y-4 pb-10">
      <Link
        href="/dashboard/comptes"
        className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] font-semibold text-white/55 no-underline hover:text-white"
      >
        <ArrowLeft size={13} />
        Retour à Mes comptes
      </Link>

      <section className="relative overflow-hidden rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[90px]" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <Sparkles size={11} />
            Connexion InvestPro
          </div>

          <h1 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
            Connecter un compte{" "}
            <span className="text-[color:var(--gold)]">{platform}</span>
          </h1>

          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-white/40">
            Renseigne directement ton compte MetaTrader. Une fois la connexion
            validée, il apparaîtra dans Mes comptes et alimentera automatiquement
            ton Journal selon ta configuration MetaSync.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[9px] text-white/45">
              <ShieldCheck size={11} className="text-[color:var(--gold)]" />
              Lecture seule côté InvestPro
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[9px] text-white/45">
              <LockKeyhole size={11} className="text-[color:var(--gold)]" />
              Identifiants chiffrés côté serveur
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[9px] text-white/45">
              <Server size={11} className="text-[color:var(--gold)]" />
              {platform}
            </span>
          </div>
        </div>
      </section>

      <HostedSyncPanel initialPlatform={platform} />
    </div>
  );
}
