"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { pushNotif } from "../../../lib/notifyStore";

export default function DevNotifsPage() {
  const { t: translate } = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          {translate("Dev")}{" "}<span className="text-[color:var(--gold)]">{translate("Notifications")}</span>
        </h1>
        <p className="text-[color:var(--muted)] mt-1">
          {translate("Page de test (pour vérifier couleurs, sons, animations, barre 15s).")}</p>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">{translate("Types “Info / Success / Warning / Error”")}</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "info",
                      title: translate("Info"),
                      message: translate("Ceci est une notification info."),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Info")}</Button>

                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "success",
                      title: translate("Succès"),
                      message: translate("Opération réussie ✅"),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Success")}</Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "warning",
                      title: translate("Warning"),
                      message: translate("Attention: vérifie tes paramètres."),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Warning")}</Button>

                <Button
                  variant="danger"
                  onClick={() =>
                    pushNotif({
                      kind: "error",
                      title: translate("Erreur"),
                      message: translate("Une erreur est survenue."),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Error")}</Button>
              </div>
            </CardSubCard>

            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">{translate("Types “Trading”")}</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "pending",
                      title: translate("Ordre en attente"),
                      message: translate("BUY LIMIT placé (BTCUSD.pi)."),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Pending")}</Button>

                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "tp",
                      title: translate("TP touché ✅"),
                      message: translate("BTCUSD.pi • +215$"),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("TP")}</Button>

                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "be",
                      title: translate("Break-even"),
                      message: translate("SL déplacé à l’entrée."),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("BE")}</Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "sl",
                      title: translate("Stop Loss touché ❌"),
                      message: translate("XAUUSD • -120$"),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("SL")}</Button>
              </div>
            </CardSubCard>

            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">{translate("Types “Social”")}</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "live",
                      title: translate("Enrick est en LIVE"),
                      message: translate("Clique pour rejoindre le live TikTok."),
                      url: "https://www.tiktok.com/@enrick95__?lang=fr",
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Live")}</Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "video",
                      title: translate("Nouvelle vidéo"),
                      message: translate("Nouvelle vidéo YouTube publiée."),
                      url: "https://www.youtube.com/@Enrick95",
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Video")}</Button>
              </div>
            </CardSubCard>

            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">{translate("Admin")}</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "admin",
                      title: translate("Annonce admin"),
                      message: translate("Maintenance à 23h00 (FR)."),
                      ttlMs: 15000,
                    })
                  }
                >
                  {translate("Admin notif")}</Button>

                <Button
                  variant="secondary"
                  onClick={() => {
                    // spam test
                    for (let i = 0; i < 6; i++) {
                      pushNotif({
                        kind: "info",
                        title: `Spam ${i + 1}`,
                        message: translate("Test queue (max 4 toasts visibles)."),
                        ttlMs: 8000,
                      });
                    }
                  }}
                >
                  {translate("Spam test")}</Button>
              </div>
            </CardSubCard>
          </div>

          <div className="mt-6 text-xs text-[color:var(--muted)]">
            {translate("Astuce: ouvre aussi le menu 🔔 dans le Header pour voir l’inbox + badge.")}</div>
        </CardBody>
      </Card>
    </div>
  );
}
