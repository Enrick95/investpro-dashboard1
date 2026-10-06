"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Clock3,
  Crown,
  Gem,
  Loader2,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Star,
  WalletCards,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  normalizePlan,
  PLAN_FEATURES,
  type InvestProPlan,
} from "@/lib/access";

type Subscription = {
  id: string;
  plan: string;
  status: string;
  provider: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type Profile = {
  username?: string | null;
  plan?: string | null;
};

const featureLabels: Record<string, string> = {
  dashboard: "Dashboard trading",
  journal: "Journal de trading",
  plan: "Plan de trading",
  simulator: "Simulateur de risque",
  reports: "Rapports avancés",
  monthly_report: "Bilan mensuel",
  connections: "Connexions automatiques",
  leaderboard: "Classement InvestPro",
  challenges: "Défis & XP",
  priority_support: "Support prioritaire",
  vip_channel: "Accès VIP InvestPro",
};

const planData: Record<
  InvestProPlan,
  {
    name: string;
    tagline: string;
    icon: React.ReactNode;
    price: string;
    note: string;
  }
> = {
  FREE: {
    name: "Free",
    tagline: "Les bases pour commencer à structurer ton trading.",
    icon: <Star size={19} />,
    price: "0 €",
    note: "Accès essentiel",
  },
  PRO: {
    name: "Pro",
    tagline: "Le cœur complet d’InvestPro pour suivre et analyser tes performances.",
    icon: <Gem size={19} />,
    price: "—",
    note: "Ton plan actuel",
  },
  VIP: {
    name: "VIP",
    tagline: "InvestPro + accompagnement premium et accès communautaire.",
    icon: <Crown size={19} />,
    price: "—",
    note: "À connecter plus tard",
  },
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function subscriptionStatusLabel(status?: string | null) {
  const value = String(status || "").toLowerCase();

  if (value === "active") return "Actif";
  if (value === "trialing") return "Période d’essai";
  if (value === "past_due") return "Paiement à régulariser";
  if (value === "cancelled") return "Annulé";
  if (value === "expired") return "Expiré";
  return "Actif";
}

export default function SubscriptionAccessPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingTableAvailable, setBillingTableAvailable] = useState(true);

  async function load() {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const profileResult = await supabase
        .from("profiles")
        .select("username,plan")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileResult.error) {
        setProfile(profileResult.data || null);
      }

      const subResult = await supabase
        .from("subscriptions")
        .select(
          "id,plan,status,provider,current_period_end,cancel_at_period_end"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subResult.error) {
        setBillingTableAvailable(false);
        setSubscription(null);
      } else {
        setBillingTableAvailable(true);
        setSubscription(subResult.data || null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currentPlan = normalizePlan(subscription?.plan || profile?.plan || "PRO");
  const currentStatus = subscriptionStatusLabel(subscription?.status || "active");
  const features = PLAN_FEATURES[currentPlan];

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[color:var(--gold)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[80px]" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <Crown size={12} />
              Abonnement & accès
            </div>

            <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
              Ton accès <span className="text-[color:var(--gold)]">InvestPro</span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Pendant la bêta, toutes les fonctionnalités InvestPro sont accessibles gratuitement à tous les membres inscrits.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[10px] font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {currentStatus}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Gem size={17} />}
          label="Plan actuel"
          value={currentPlan}
          sub={planData[currentPlan].tagline}
          accent
        />
        <Stat
          icon={<BadgeCheck size={17} />}
          label="Statut"
          value={currentStatus}
          sub={subscription?.provider ? `Via ${subscription.provider}` : "Gestion InvestPro"}
        />
        <Stat
          icon={<Clock3 size={17} />}
          label="Fin de période"
          value={formatDate(subscription?.current_period_end)}
          sub={
            subscription?.cancel_at_period_end
              ? "Résiliation prévue"
              : "Renouvellement non configuré"
          }
        />
        <Stat
          icon={<WalletCards size={17} />}
          label="Facturation"
          value={subscription?.provider ? "Connectée" : "À connecter"}
          sub="Stripe / autre provider plus tard"
        />
      </section>

      {!billingTableAvailable ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-xs text-amber-300">
          Le module d’abonnement n’est pas encore initialisé dans Supabase. Exécute le SQL fourni avec cette mise à jour.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                  {planData[currentPlan].icon}
                </div>

                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--gold)]">
                    Plan actuel
                  </div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    InvestPro {planData[currentPlan].name}
                  </div>
                  <p className="mt-2 max-w-xl text-[10px] leading-5 text-white/45">
                    {planData[currentPlan].tagline}
                  </p>
                </div>
              </div>

              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-[9px] font-bold uppercase text-emerald-400">
                {currentStatus}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2">
              {features.map((feature) => (
                <Feature key={feature} text={featureLabels[feature] || feature} active />
              ))}
            </div>
          </section>

          <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-[color:var(--gold)]" />
              <h2 className="text-sm font-semibold text-white">
                Comparer les accès
              </h2>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {(["FREE", "PRO", "VIP"] as InvestProPlan[]).map((plan) => {
                const active = plan === currentPlan;

                return (
                  <div
                    key={plan}
                    className={[
                      "rounded-2xl border p-4",
                      active
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                        : "border-white/[0.06] bg-black/20",
                    ].join(" ")}
                  >
                    <div className={active ? "text-[color:var(--gold)]" : "text-white/40"}>
                      {planData[plan].icon}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">
                        {planData[plan].name}
                      </div>

                      {active ? (
                        <span className="rounded-full border border-[color:var(--gold-border)] bg-black/10 px-2 py-0.5 text-[8px] font-bold uppercase text-[color:var(--gold)]">
                          Actuel
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-lg font-semibold text-white">
                      {planData[plan].price}
                    </div>

                    <p className="mt-2 min-h-[48px] text-[9px] leading-4 text-white/35">
                      {planData[plan].tagline}
                    </p>

                    <div className="mt-4 space-y-2">
                      {PLAN_FEATURES[plan].slice(0, 5).map((feature) => (
                        <MiniFeature
                          key={feature}
                          text={featureLabels[feature] || feature}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <SideCard
            icon={<ReceiptText size={17} />}
            title="Facturation"
            subtitle="Aucun paiement n’est demandé pendant la bêta. La facturation sera activée plus tard."
          >
            <div className="space-y-3">
              <Info
                label="Provider"
                value={subscription?.provider || "Non connecté"}
              />
              <Info
                label="Période actuelle"
                value={formatDate(subscription?.current_period_end)}
              />
              <Info
                label="Résiliation"
                value={
                  subscription?.cancel_at_period_end
                    ? "Prévue en fin de période"
                    : "Aucune"
                }
              />
            </div>

            <button
              type="button"
              disabled
              className="mt-4 inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-white/30"
            >
              <CircleDollarSign size={14} />
              Bêta gratuite actuellement
            </button>
          </SideCard>

          <SideCard
            icon={<ShieldCheck size={17} />}
            title="Accès sécurisé"
            subtitle="Mode bêta ouvert : aucune fonctionnalité n’est bloquée actuellement."
          >
            <div className="space-y-3">
              <SecurityRow text="Les règles d’accès sont centralisées dans lib/access.ts." />
              <SecurityRow text="Aucune page existante n’est verrouillée automatiquement dans cette V1." />
              <SecurityRow text="On pourra activer les blocages plan par plan une fois les paiements branchés." />
            </div>
          </SideCard>

          <SideCard
            icon={<LockKeyhole size={17} />}
            title="Compte & sécurité"
            subtitle="Mot de passe, sessions et actions sensibles."
          >
            <Link
              href="/dashboard/compte"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-xs font-semibold text-[color:var(--gold)]"
            >
              Ouvrir la sécurité
              <ArrowRight size={13} />
            </Link>
          </SideCard>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className={accent ? "text-[color:var(--gold)]" : "text-white/35"}>
        {icon}
      </div>
      <div className="mt-3 text-[9px] text-white/35">{label}</div>
      <div className={accent ? "mt-1 truncate text-base font-semibold text-[color:var(--gold)]" : "mt-1 truncate text-base font-semibold text-white"}>
        {value}
      </div>
      <div className="mt-1 line-clamp-2 text-[8px] leading-4 text-white/25">{sub}</div>
    </div>
  );
}

function Feature({ text, active }: { text: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <span
        className={[
          "flex h-5 w-5 items-center justify-center rounded-full border",
          active
            ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
            : "border-white/[0.08] text-white/25",
        ].join(" ")}
      >
        {active ? <Check size={12} /> : <X size={12} />}
      </span>
      <span className="text-[10px] text-white/60">{text}</span>
    </div>
  );
}

function MiniFeature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-[9px] text-white/45">
      <Check size={11} className="shrink-0 text-emerald-400" />
      {text}
    </div>
  );
}

function SideCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          {icon}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 text-[9px] leading-4 text-white/35">{subtitle}</p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <span className="text-[9px] text-white/35">{label}</span>
      <span className="text-right text-[9px] font-semibold text-white/65">
        {value}
      </span>
    </div>
  );
}

function SecurityRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px] leading-5 text-white/55">
      <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
      {text}
    </div>
  );
}
