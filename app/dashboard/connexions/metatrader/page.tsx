"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import HostedSyncPanel from "@/components/metasync/HostedSyncPanel";

export default function MetaTraderConnectionPage() {
  const params = useSearchParams();
  const requested = String(params.get("platform") || "mt5").toLowerCase();
  const platform: "MT4" | "MT5" = requested === "mt4" ? "MT4" : "MT5";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 pb-10">
      <Link
        href="/dashboard/comptes"
        className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] font-semibold text-white/55 no-underline md:hidden"
      >
        <ArrowLeft size={13} />
        Retour à Mes comptes
      </Link>

      <HostedSyncPanel initialPlatform={platform} />
    </div>
  );
}
