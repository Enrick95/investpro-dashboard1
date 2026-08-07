"use client";

import Link from "next/link";
import Modal from "./Modal";
import { Button } from "./Button";

export default function MaintenanceModal({
  open,
  target,
}: {
  open: boolean;
  target: "terminal" | "copieur";
}) {
  const title =
    target === "terminal" ? "Terminal en maintenance" : "Copieur en maintenance";

  const desc =
    target === "terminal"
      ? "Le terminal est temporairement indisponible. Revenez dans quelques instants."
      : "Le copieur est temporairement indisponible. Revenez dans quelques instants.";

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {}}
      hideClose
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Link href="/dashboard">
            <Button>Retour Dashboard</Button>
          </Link>
          <Link href="/dashboard/journal">
            <Button variant="ghost">Aller au Journal</Button>
          </Link>
        </div>
      }
    >
      <div className="text-sm text-[color:var(--muted)]">{desc}</div>
    </Modal>
  );
}
