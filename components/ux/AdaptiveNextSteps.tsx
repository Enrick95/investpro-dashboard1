"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CloudDownload,
  Compass,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Step = {
  title: string;
  text: string;
  href: string;
  cta: string;
  priority: number;
};

export default function AdaptiveNextSteps() {
  const supabase = useMemo(() => createClient(), []);
  const [steps, setSteps] = useState<Step[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const [accounts, plan, trades, prefs] = await Promise.all([
          supabase
            .from("trading_accounts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("trading_plans")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("trading_journal")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("trader_preferences")
            .select("user_id,notify_imports,notify_discipline,notify_reports")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const next: Step[] = [];
        const accountCount = Number(accounts.count || 0);
        const tradeCount = Number(trades.count || 0);
        const lastBackup =
          window.localStorage.getItem("investpro_last_backup_at");

        if (!accountCount) {
          next.push({
            title: "Connecter ton premier compte",
            text: "Centralise ton capital et active la synchronisation automatique.",
            href: "/dashboard/comptes",
            cta: "Ajouter un compte",
            priority: 100,
          });
        }

        if (!plan.data) {
          next.push({
            title: "Définir ton plan",
            text: "Risque, fréquence et discipline servent aux alertes intelligentes.",
            href: "/dashboard/plan",
            cta: "Configurer le plan",
            priority: 90,
          });
        }

        if (!tradeCount) {
          next.push({
            title: "Alimenter le Journal",
            text: "Ajoute ou synchronise un trade pour débloquer les analyses.",
            href: "/dashboard/journal",
            cta: "Ouvrir le Journal",
            priority: 80,
          });
        }

        if (tradeCount >= 5) {
          next.push({
            title: "Lire tes tendances",
            text: "Tes données sont suffisantes pour exploiter les Rapports avancés.",
            href: "/dashboard/rapports",
            cta: "Voir les Rapports",
            priority: 60,
          });
        }

        if (
          prefs.data &&
          !prefs.data.notify_imports &&
          !prefs.data.notify_discipline &&
          !prefs.data.notify_reports
        ) {
          next.push({
            title: "Activer les alertes utiles",
            text: "Import, discipline et rapports peuvent te prévenir automatiquement.",
            href: "/dashboard/profil",
            cta: "Configurer",
            priority: 50,
          });
        }

        if (!lastBackup) {
          next.push({
            title: "Créer une sauvegarde",
            text: "Télécharge une copie de ton Journal et de tes réglages InvestPro.",
            href: "/dashboard/sauvegarde",
            cta: "Sauvegarder",
            priority: 40,
          });
        }

        if (!next.length) {
          next.push(
            {
              title: "Consulter l’activité",
              text: "Trades, connexions et support sont réunis dans une timeline.",
              href: "/dashboard/activite",
              cta: "Voir l’activité",
              priority: 20,
            },
            {
              title: "Contrôler la santé",
              text: "Vérifie en une fois tes connexions, sécurité et sauvegarde.",
              href: "/dashboard/sante",
              cta: "Faire le check",
              priority: 10,
            }
          );
        }

        setSteps(next.sort((a, b) => b.priority - a.priority).slice(0, 3));
      } finally {
        setReady(true);
      }
    }

    void load();
  }, [supabase]);

  if (!ready || !steps.length) return null;

  return (
    <section className="mb-5 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          <Compass size={16} />
        </div>

        <div>
          <div className="text-sm font-semibold text-white">
            Prochaines étapes recommandées
          </div>
          <div className="mt-1 text-[9px] text-white/30">
            InvestPro adapte les suggestions à ton espace actuel.
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <div
            key={`${step.title}-${index}`}
            className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"
          >
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--gold)]">
              Étape {index + 1}
            </div>
            <div className="mt-2 text-xs font-semibold text-white">
              {step.title}
            </div>
            <p className="mt-1 min-h-[40px] text-[9px] leading-4 text-white/35">
              {step.text}
            </p>
            <Link
              href={step.href}
              className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[color:var(--gold)] no-underline"
            >
              {step.cta}
              <ArrowRight size={11} />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
