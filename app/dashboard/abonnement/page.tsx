"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { getPlan, setPlan, type Plan } from "../../../lib/subscriptionStore";

function Pill({ children }: { children: string }) {
  return (
    <span className="text-[10px] px-2 py-1 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
      {children}
    </span>
  );
}

function Feature({ ok, children }: { ok: boolean; children: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={ok ? "text-[color:var(--success)]" : "text-white/25"}>
        {ok ? "✔" : "—"}
      </span>
      <span className={ok ? "text-white/85" : "text-white/35"}>{children}</span>
    </div>
  );
}

function PlanCard({
  name,
  price,
  highlight,
  current,
  onChoose,
  features,
  subtitle,
}: {
  name: string;
  price: string;
  subtitle: string;
  highlight?: boolean;
  current?: boolean;
  onChoose: () => void;
  features: Array<{ ok: boolean; label: string }>;
}) {
  return (
    <Card className={highlight ? "border-[color:var(--gold-border)]" : ""}>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold flex items-center gap-2">
              {name} {highlight ? <Pill>Recommandé</Pill> : null}
              {current ? <Pill>Plan actuel</Pill> : null}
            </div>
            <div className="text-xs text-[color:var(--muted)] mt-1">{subtitle}</div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-bold">{price}</div>
            <div className="text-xs text-[color:var(--muted)]">par mois</div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {features.map((f) => (
            <Feature key={f.label} ok={f.ok}>
              {f.label}
            </Feature>
          ))}
        </div>

        <div className="mt-6">
          <Button
            variant={highlight ? "primary" : "secondary"}
            className="w-full"
            onClick={onChoose}
            disabled={current}
          >
            {current ? "Déjà actif" : `Choisir ${name}`}
          </Button>
        </div>

        <div className="mt-3 text-xs text-[color:var(--muted)]">
          * Démo : activation instantanée (localStorage). Stripe plus tard.
        </div>
      </CardBody>
    </Card>
  );
}

export default function AbonnementPage() {
  const [plan, setLocalPlan] = useState<Plan>("free");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLocalPlan(getPlan());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const pricing = useMemo(() => {
    return [
      {
        key: "free" as const,
        name: "Free",
        price: "0€",
        subtitle: "Découverte & outils de base",
        highlight: false,
        features: [
          { ok: true, label: "Journal de trading + Tags + Discipline" },
          { ok: true, label: "Simulateur de risque (auto)" },
          { ok: true, label: "Calendrier éco + alertes + son" },
          { ok: false, label: "Terminal de trading (prise de position)" },
          { ok: false, label: "Copieur multi-comptes (BETA)" },
          { ok: false, label: "Accès au classement public" },
        ],
      },
      {
        key: "pro" as const,
        name: "Pro",
        price: "19€",
        subtitle: "Pour trader sérieusement (recommandé)",
        highlight: true,
        features: [
          { ok: true, label: "Tout le plan Free" },
          { ok: true, label: "Terminal de trading (UI + pré-check)" },
          { ok: true, label: "Accès au classement public + profil public" },
          { ok: true, label: "Commentaires + médias (mp4/mp3/images)" },
          { ok: true, label: "Copieur (BETA) – paramètres de base" },
          { ok: false, label: "MT5 VPS (exécution réelle) – plus tard" },
        ],
      },
      {
        key: "premium" as const,
        name: "Premium",
        price: "49€",
        subtitle: "Pour exécution VPS / MT5 (avancé)",
        highlight: false,
        features: [
          { ok: true, label: "Tout le plan Pro" },
          { ok: true, label: "MT5 + VPS (agent) – connexion comptes" },
          { ok: true, label: "Copy trading multi-followers (avancé)" },
          { ok: true, label: "Money management par compte / par trade" },
          { ok: true, label: "Rapports avancés (calendrier PnL + equity)" },
          { ok: true, label: "Support prioritaire" },
        ],
      },
    ];
  }, []);

  function choose(next: Plan) {
    setPlan(next);
    setLocalPlan(next);
    setToast(`✅ Plan activé : ${next.toUpperCase()}`);
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="px-4 py-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--panel)] shadow-2xl text-sm text-white">
            {toast}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Abonnement <span className="text-[color:var(--gold)]">InvestPro</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Choisis ton plan. (Démo : activation instantanée)
          </p>
        </div>

        <CardSubCard className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-[color:var(--muted)]">Plan actuel</div>
            <div className="mt-1 text-lg font-semibold text-white">{plan.toUpperCase()}</div>
          </div>
          <Button
            variant="secondary"
            onClick={() => choose("free")}
            disabled={plan === "free"}
          >
            Revenir Free
          </Button>
        </CardSubCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {pricing.map((p) => (
          <PlanCard
            key={p.key}
            name={p.name}
            price={p.price}
            subtitle={p.subtitle}
            highlight={p.highlight}
            current={plan === p.key}
            onChoose={() => choose(p.key)}
            features={p.features}
          />
        ))}
      </div>

      <Card>
        <CardBody>
          <div className="text-lg font-semibold">FAQ</div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <CardSubCard>
              <div className="font-semibold">Pourquoi le terminal est bloqué en Free ?</div>
              <div className="mt-2 text-[color:var(--muted)]">
                Pour limiter l’accès aux fonctions avancées et financer l’infrastructure.
              </div>
            </CardSubCard>

            <CardSubCard>
              <div className="font-semibold">Quand MT5/VPS sera disponible ?</div>
              <div className="mt-2 text-[color:var(--muted)]">
                Après validation du prototype. Premium aura l’agent MT5.
              </div>
            </CardSubCard>

            <CardSubCard>
              <div className="font-semibold">Paiement Stripe ?</div>
              <div className="mt-2 text-[color:var(--muted)]">
                Oui, plus tard. Là on est en mode démo (localStorage).
              </div>
            </CardSubCard>

            <CardSubCard>
              <div className="font-semibold">Puis-je annuler ?</div>
              <div className="mt-2 text-[color:var(--muted)]">
                En démo, tu changes de plan quand tu veux.
              </div>
            </CardSubCard>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
