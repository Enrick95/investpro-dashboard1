"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  Crown,
  Gem,
  RefreshCw,
  Users,
  WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Payload = {
  billing_live: boolean;
  subscriptions_available: boolean;
  stats: {
    members: number;
    free: number;
    pro: number;
    elite: number;
    active_subscriptions: number;
    cancelled: number;
  };
  subscriptions: any[];
};

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminFinancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/admin/finance", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Finance indisponible.");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Finance indisponible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="py-16 text-center text-sm text-white/35">Chargement Finance…</div>;
  }

  return (
    <div className="w-full pb-10">
      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <CircleDollarSign size={11} />
            Finance
          </div>

          <h1 className="mt-3 text-2xl font-semibold text-white">
            Abonnements & <span className="text-[color:var(--gold)]">Accès</span>
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Vue réelle des plans et abonnements connus par InvestPro — sans faux chiffre d’affaires.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {data ? (
        <>
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
            <div className="text-xs font-semibold text-amber-300">
              Bêta gratuite
            </div>
            <p className="mt-1 text-[10px] leading-5 text-white/40">
              Les plans sont suivis administrativement, mais aucune facturation réelle n’est activée ici pour le moment.
              Le back-office n’invente donc aucun revenu, MRR ou paiement.
            </p>
          </div>

          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat icon={<Users size={16} />} label="Membres" value={data.stats.members} />
            <Stat icon={<WalletCards size={16} />} label="FREE" value={data.stats.free} />
            <Stat icon={<Crown size={16} />} label="PRO" value={data.stats.pro} />
            <Stat icon={<Gem size={16} />} label="ELITE / VIP" value={data.stats.elite} />
            <Stat icon={<CircleDollarSign size={16} />} label="Abonnements actifs" value={data.stats.active_subscriptions} />
            <Stat icon={<RefreshCw size={16} />} label="Annulés / fin prévue" value={data.stats.cancelled} />
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] p-4">
              <div className="font-semibold text-white">Abonnements enregistrés</div>
              <div className="mt-1 text-[9px] text-white/30">
                {data.subscriptions_available
                  ? "Données de la table subscriptions."
                  : "Table subscriptions non initialisée."}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.05] text-[8px] uppercase text-white/25">
                    <th className="px-4 py-3 font-semibold">Utilisateur</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">Provider</th>
                    <th className="px-4 py-3 font-semibold">Fin période</th>
                    <th className="px-4 py-3 font-semibold">Résiliation prévue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.length ? (
                    data.subscriptions.map((sub: any) => (
                      <tr key={sub.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-3 font-mono text-[9px] text-white/30">{sub.user_id}</td>
                        <td className="px-4 py-3 text-[10px] font-semibold uppercase text-[color:var(--gold)]">{sub.plan || "—"}</td>
                        <td className="px-4 py-3 text-[10px] text-white/55">{sub.status || "—"}</td>
                        <td className="px-4 py-3 text-[10px] text-white/45">{sub.provider || "InvestPro"}</td>
                        <td className="px-4 py-3 text-[10px] text-white/45">{dateLabel(sub.current_period_end)}</td>
                        <td className="px-4 py-3 text-[10px] text-white/45">{sub.cancel_at_period_end ? "Oui" : "Non"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-white/25">
                        Aucun abonnement réel enregistré pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="grid h-8 w-8 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[9px] text-white/28">{label}</div>
    </div>
  );
}
