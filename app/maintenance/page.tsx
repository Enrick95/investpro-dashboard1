"use client";

import { Suspense } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
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
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-[color:var(--muted)]">{t("Chargement…")}</div>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <main className="min-h-screen">
      <div className="flex justify-end px-4 py-4"><LanguageSwitcher /></div>
      <Suspense fallback={<MaintenanceLoading />}>
        <MaintenanceContent />
      </Suspense>
    </main>
  );
}