"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import MaintenanceModal from "@/components/ui/MaintenanceModal";

function MaintenanceContent() {
  const sp = useSearchParams();

  const target = sp.get("target");

  const validTarget =
    target === "terminal" || target === "copieur"
      ? target
      : null;

  return (
    <div className="min-h-screen">
      {validTarget ? (
        <MaintenanceModal
          open={true}
          target={validTarget}
        />
      ) : null}
    </div>
  );
}

function MaintenanceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-[color:var(--muted)]">
        Chargement…
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense fallback={<MaintenanceLoading />}>
      <MaintenanceContent />
    </Suspense>
  );
}