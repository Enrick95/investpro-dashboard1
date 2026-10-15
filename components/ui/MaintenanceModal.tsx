"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";
import Modal from "./Modal";
import { Button } from "./Button";

export default function MaintenanceModal({
  open,
  target,
}: {
  open: boolean;
  target: "terminal" | "copieur";
}) {
  const { t } = useLocale();
  const title =
    target === "terminal" ? "Terminal en maintenance" : "InvestPro Copier en maintenance";

  const desc =
    target === "terminal"
      ? "Le terminal est temporairement indisponible. Revenez dans quelques instants."
      : "InvestPro Copier est temporairement indisponible. Revenez dans quelques instants.";

  return (
    <Modal
      open={open}
      title={t(title)}
      onClose={() => {}}
      hideClose
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Link href="/dashboard">
            <Button>{t("Retour Dashboard")}</Button>
          </Link>
          <Link href="/dashboard/journal">
            <Button variant="ghost">{t("Aller au Journal")}</Button>
          </Link>
        </div>
      }
    >
      <div className="text-sm text-[color:var(--muted)]">{t(desc)}</div>
    </Modal>
  );
}
