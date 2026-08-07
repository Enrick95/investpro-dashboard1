"use client";

import { useSearchParams } from "next/navigation";
import MaintenanceModal from "../../components/ui/MaintenanceModal";

export default function MaintenancePage() {
  const sp = useSearchParams();
  const target = (sp?.get("target") || "") as "terminal" | "copieur" | "";

  return (
    <div className="min-h-screen">
      {/* page vide, tout est géré par le modal */}
      <MaintenanceModal
        open={true}
        target={target === "terminal" || target === "copieur" ? target : undefined}
      />
    </div>
  );
}
