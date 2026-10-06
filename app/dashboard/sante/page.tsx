"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CloudDownload,
  Database,
  Loader2,
  MailCheck,
  MonitorSmartphone,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  Wifi,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Check = {
  label: string;
  detail: string;
  ok: boolean;
  href?: string;
};

function dateLabel(value: string | null) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Jamais";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HealthPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Check[]>([]);
  const [score, setScore] = useState(0);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        const [
          accountsResult,
          planResult,
          profileResult,
          prefsResult,
          mtResult,
          futuresResult,
        ] = await Promise.all([
          supabase
            .from("trading_accounts")
            .select("id,connection_type")
            .eq("user_id", user.id),
          supabase
            .from("trading_plans")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("username")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("trader_preferences")
            .select("notify_imports,notify_discipline,notify_reports")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("investpro_mt_connections")
            .select("id,revoked,last_sync")
            .eq("user_id", user.id)
            .eq("revoked", false),
          supabase
            .from("futures_connections")
            .select("id,status,last_sync_at")
            .eq("user_id", user.id),
        ]);

        const installed =
          window.matchMedia?.("(display-mode: standalone)")?.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true;

        const backup =
          window.localStorage.getItem("investpro_last_backup_at") || null;
        setLastBackup(backup);

        const accounts = accountsResult.data || [];
        const mt = mtResult.data || [];
        const futures = futuresResult.data || [];
        const automatic = accounts.filter(
          (account) => account.connection_type === "automatic"
        ).length;

        const notificationPrefs = prefsResult.data;
        const notificationsReady =
          Boolean(notificationPrefs?.notify_imports) ||
          Boolean(notificationPrefs?.notify_discipline) ||
          Boolean(notificationPrefs?.notify_reports);

        const nextChecks: Check[] = [
          {
            label: "E-mail vérifié",
            detail: user.email_confirmed_at
              ? "Adresse confirmée"
              : "Confirme ton adresse e-mail",
            ok: Boolean(user.email_confirmed_at),
            href: "/dashboard/compte",
          },
          {
            label: "Profil trader",
            detail: profileResult.data?.username
              ? "Profil renseigné"
              : "Complète ton profil",
            ok: Boolean(profileResult.data?.username),
            href: "/dashboard/profil",
          },
          {
            label: "Plan de trading",
            detail: planResult.data
              ? "Règles configurées"
              : "Aucun plan configuré",
            ok: Boolean(planResult.data),
            href: "/dashboard/plan",
          },
          {
            label: "Compte de trading",
            detail: accounts.length
              ? `${accounts.length} compte(s), dont ${automatic} Auto-sync`
              : "Aucun compte connecté",
            ok: accounts.length > 0,
            href: "/dashboard/comptes",
          },
          {
            label: "Connexions automatiques",
            detail:
              mt.length + futures.length > 0
                ? `${mt.length + futures.length} connexion(s) détectée(s)`
                : "Aucune connexion automatique",
            ok: mt.length + futures.length > 0 || automatic > 0,
            href: "/dashboard/connexions",
          },
          {
            label: "Notifications",
            detail: notificationsReady
              ? "Préférences actives"
              : "Aucune alerte activée",
            ok: notificationsReady,
            href: "/dashboard/profil",
          },
          {
            label: "InvestPro installé",
            detail: installed
              ? "Mode application détecté"
              : "Installation recommandée sur mobile",
            ok: Boolean(installed),
            href: "/dashboard/profil",
          },
          {
            label: "Sauvegarde récente",
            detail: backup
              ? `Dernière : ${dateLabel(backup)}`
              : "Aucune sauvegarde locale effectuée",
            ok: Boolean(backup),
            href: "/dashboard/sauvegarde",
          },
        ];

        setChecks(nextChecks);
        setScore(
          Math.round(
            (nextChecks.filter((check) => check.ok).length /
              nextChecks.length) *
              100
          )
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[color:var(--gold)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1150px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[80px]" />

        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <ShieldCheck size={12} />
              Santé du compte
            </div>

            <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
              Ton espace est prêt à <span className="text-[color:var(--gold)]">combien ?</span>
            </h1>

            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Vérification rapide de ton profil, sécurité, connexions et sauvegarde.
            </p>
          </div>

          <div className="grid h-28 w-28 place-items-center rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]">
            <div className="text-center">
              <div className="text-2xl font-semibold text-[color:var(--gold)]">
                {score}%
              </div>
              <div className="mt-1 text-[8px] uppercase tracking-[0.1em] text-white/35">
                Santé
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {checks.map((check) => (
          <Link
            key={check.label}
            href={check.href || "#"}
            className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 no-underline transition hover:border-[color:var(--gold-border)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={[
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                  check.ok
                    ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400"
                    : "border-amber-500/20 bg-amber-500/[0.05] text-amber-300",
                ].join(" ")}
              >
                {check.ok ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <TriangleAlert size={15} />
                )}
              </div>

              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">
                  {check.label}
                </div>
                <div className="mt-1 truncate text-[9px] text-white/35">
                  {check.detail}
                </div>
              </div>
            </div>

            <ArrowRight size={13} className="shrink-0 text-white/25" />
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickCard
          icon={<Activity size={16} />}
          title="Activité"
          text="Voir la timeline InvestPro."
          href="/dashboard/activite"
        />
        <QuickCard
          icon={<CloudDownload size={16} />}
          title="Sauvegarde"
          text={lastBackup ? `Dernière : ${dateLabel(lastBackup)}` : "Créer ta première sauvegarde."}
          href="/dashboard/sauvegarde"
        />
        <QuickCard
          icon={<Wifi size={16} />}
          title="Connexions"
          text="Vérifier MT4, MT5 et Futures."
          href="/dashboard/connexions"
        />
      </section>
    </div>
  );
}

function QuickCard({
  icon,
  title,
  text,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 no-underline"
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div className="mt-3 text-xs font-semibold text-white">{title}</div>
      <div className="mt-1 text-[9px] text-white/35">{text}</div>
    </Link>
  );
}
