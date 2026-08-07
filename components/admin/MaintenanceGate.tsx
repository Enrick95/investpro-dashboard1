"use client";

import { useMemo } from "react";
import { useMaintenance } from "../../lib/adminStore";
import { Button } from "../ui/Button";

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export default function MaintenanceGate({
  kind,
  children,
}: {
  kind: "terminal" | "copieur";
  children: React.ReactNode;
}) {
  const { state, isActive, remainingMs } = useMaintenance(kind);

  const label = useMemo(() => {
    if (!isActive) return "";
    return fmt(remainingMs);
  }, [isActive, remainingMs]);

  if (!isActive) return <>{children}</>;

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="max-w-xl w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center shadow-soft">
        <div className="text-2xl font-semibold" style={{ color: "var(--gold)" }}>
          {kind.toUpperCase()} • Maintenance
        </div>

        <div className="mt-2 opacity-85">
          {state.message || "Cette fonctionnalité est temporairement indisponible."}
        </div>

        <div className="mt-4 text-sm opacity-80">
          Temps restant estimé : <span className="font-semibold">{label}</span>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          <Button variant="ghost" onClick={() => history.back()}>
            Retour
          </Button>
          <Button onClick={() => location.reload()}>
            Rafraîchir
          </Button>
        </div>
      </div>
    </div>
  );
}
