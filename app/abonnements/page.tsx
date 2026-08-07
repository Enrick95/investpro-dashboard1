"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { pushNotif } from "../../../lib/notifyStore";

type PlanId = "free" | "pro" | "elite";

function getLocalPlan(): PlanId {
  try {
    return (localStorage.getItem("ip_plan") as PlanId) || "free";
  } catch {
    return "free";
  }
}

export default function MonAbonnementPage() {
  const [plan, setPlan] = useState<PlanId>("free");

  const planLabel = useMemo(() => {
    if (plan === "pro") return "Pro";
    if (plan === "elite") return "Elite";
    return "Free";
  }, [plan]);

  useEffect(() => {
    setPlan(getLocalPlan());
  }, []);

  async function openBillingPortal() {
    // ✅ futur : /api/billing/portal
    pushNotif({
      kind: "info",
      title: "Bientôt",
      message: "Billing portal pas encore branché (Stripe).",
    });
  }

  function cancelPlanDemo() {
    localStorage.setItem("ip_plan", "free");
    setPlan("free");
    pushNotif({
      kind: "success",
      title: "Abonnement",
      message: "Plan repassé en Free (démo).",
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <Card>
        <CardBody className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">👑 Mon abonnement</div>
            <div className="text-sm text-muted mt-1">
              Plan actuel, gestion et upgrades.
            </div>
          </div>

          <Link href="/abonnements">
            <Button>Voir les plans</Button>
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted">Plan actuel</div>
              <div className="text-xl font-semibold">{planLabel}</div>
            </div>

            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] font-bold">
              DEMO
            </span>
          </div>

          <CardSubCard>
            <div className="text-sm text-[color:var(--text)]">
              • Gestion complète (Stripe) à brancher : renouvellement, factures,
              annulation, etc.
            </div>
            <div className="text-xs text-muted mt-2">
              Prochaine étape : connecter la page Abonnements à Stripe Checkout +
              Portal.
            </div>
          </CardSubCard>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={openBillingPortal}>
              Ouvrir portail de facturation
            </Button>
            {plan !== "free" ? (
              <Button variant="danger" onClick={cancelPlanDemo}>
                Annuler (démo)
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
