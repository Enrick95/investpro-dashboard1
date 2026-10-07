"use client";

import { useSearchParams } from "next/navigation";
import HostedSyncPanel from "@/components/metasync/HostedSyncPanel";

export default function MetaTraderConnectionPage() {
  const params = useSearchParams();
  const requested = String(params.get("platform") || "mt5").toLowerCase();
  const platform: "MT4" | "MT5" = requested === "mt4" ? "MT4" : "MT5";

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-10">
      <HostedSyncPanel initialPlatform={platform} />
    </div>
  );
}
