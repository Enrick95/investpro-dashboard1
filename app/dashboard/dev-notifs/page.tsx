"use client";

import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { pushNotif } from "../../../lib/notifyStore";

export default function DevNotifsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Dev <span className="text-[color:var(--gold)]">Notifications</span>
        </h1>
        <p className="text-[color:var(--muted)] mt-1">
          Page de test (pour vérifier couleurs, sons, animations, barre 15s).
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">Types “Info / Success / Warning / Error”</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "info",
                      title: "Info",
                      message: "Ceci est une notification info.",
                      ttlMs: 15000,
                    })
                  }
                >
                  Info
                </Button>

                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "success",
                      title: "Succès",
                      message: "Opération réussie ✅",
                      ttlMs: 15000,
                    })
                  }
                >
                  Success
                </Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "warning",
                      title: "Warning",
                      message: "Attention: vérifie tes paramètres.",
                      ttlMs: 15000,
                    })
                  }
                >
                  Warning
                </Button>

                <Button
                  variant="danger"
                  onClick={() =>
                    pushNotif({
                      kind: "error",
                      title: "Erreur",
                      message: "Une erreur est survenue.",
                      ttlMs: 15000,
                    })
                  }
                >
                  Error
                </Button>
              </div>
            </CardSubCard>

            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">Types “Trading”</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "pending",
                      title: "Ordre en attente",
                      message: "BUY LIMIT placé (BTCUSD.pi).",
                      ttlMs: 15000,
                    })
                  }
                >
                  Pending
                </Button>

                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "tp",
                      title: "TP touché ✅",
                      message: "BTCUSD.pi • +215$",
                      ttlMs: 15000,
                    })
                  }
                >
                  TP
                </Button>

                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "be",
                      title: "Break-even",
                      message: "SL déplacé à l’entrée.",
                      ttlMs: 15000,
                    })
                  }
                >
                  BE
                </Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "sl",
                      title: "Stop Loss touché ❌",
                      message: "XAUUSD • -120$",
                      ttlMs: 15000,
                    })
                  }
                >
                  SL
                </Button>
              </div>
            </CardSubCard>

            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">Types “Social”</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "live",
                      title: "Enrick est en LIVE",
                      message: "Clique pour rejoindre le live TikTok.",
                      url: "https://www.tiktok.com/@enrick95__?lang=fr",
                      ttlMs: 15000,
                    })
                  }
                >
                  Live
                </Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    pushNotif({
                      kind: "video",
                      title: "Nouvelle vidéo",
                      message: "Nouvelle vidéo YouTube publiée.",
                      url: "https://www.youtube.com/@Enrick95",
                      ttlMs: 15000,
                    })
                  }
                >
                  Video
                </Button>
              </div>
            </CardSubCard>

            <CardSubCard className="p-5 space-y-3">
              <div className="text-lg font-semibold">Admin</div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    pushNotif({
                      kind: "admin",
                      title: "Annonce admin",
                      message: "Maintenance à 23h00 (FR).",
                      ttlMs: 15000,
                    })
                  }
                >
                  Admin notif
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => {
                    // spam test
                    for (let i = 0; i < 6; i++) {
                      pushNotif({
                        kind: "info",
                        title: `Spam ${i + 1}`,
                        message: "Test queue (max 4 toasts visibles).",
                        ttlMs: 8000,
                      });
                    }
                  }}
                >
                  Spam test
                </Button>
              </div>
            </CardSubCard>
          </div>

          <div className="mt-6 text-xs text-[color:var(--muted)]">
            Astuce: ouvre aussi le menu 🔔 dans le Header pour voir l’inbox + badge.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
