"use client";

import { useMemo } from "react";
import { CreditCard, Receipt, Crown, ArrowUpRight } from "lucide-react";
import { getCurrentAccount } from "@/lib/authStore";

function SectionCard(props: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] backdrop-blur p-5">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-2xl border border-white/10 bg-black/10 dark:bg-black/20 flex items-center justify-center">
          {props.icon}
        </span>
        <div className="text-base font-semibold text-[color:var(--text,white)]">{props.title}</div>
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

export default function FacturationPage() {
  const acc: any = useMemo(() => getCurrentAccount(), []);
  const plan = acc?.plan || acc?.subscription || "Free";

  // 🔧 Plus tard tu remplaceras ça par tes vrais achats (DB/Stripe/etc.)
  const purchases = [
    { id: "INV-0001", label: "Abonnement PRO", amount: "29,90€", date: "—" },
    { id: "INV-0002", label: "Add-on Notifications", amount: "9,90€", date: "—" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--text,white)]">Facturation</h1>
          <p className="text-sm mt-1 text-[color:var(--muted)]">
            Historique d’achats, factures et plan actuel.
          </p>
        </div>

        <a
          href="/dashboard/abonnement"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]
                     text-sm font-semibold text-[color:var(--gold)] hover:opacity-90 transition"
        >
          <Crown size={16} />
          Gérer mon abonnement
          <ArrowUpRight size={16} />
        </a>
      </div>

      <SectionCard title="Plan actuel" icon={<CreditCard size={18} className="text-[color:var(--gold)]" />}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[color:var(--text,white)]">{plan}</div>
            <div className="text-xs text-[color:var(--muted)] mt-1">Renouvellement: à connecter plus tard</div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]
                           text-[color:var(--gold)] font-bold uppercase tracking-wide">
            Actif
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Historique d’achats" icon={<Receipt size={18} className="text-white/80" />}>
        <div className="overflow-hidden rounded-2xl border border-[color:var(--border)]">
          <div className="grid grid-cols-12 text-[11px] uppercase tracking-wide text-[color:var(--muted)] bg-black/5 dark:bg-black/20 px-4 py-3">
            <div className="col-span-4">Référence</div>
            <div className="col-span-4">Produit</div>
            <div className="col-span-2">Montant</div>
            <div className="col-span-2">Date</div>
          </div>

          {purchases.map((p) => (
            <div key={p.id} className="grid grid-cols-12 px-4 py-3 border-t border-[color:var(--border)]">
              <div className="col-span-4 text-sm font-semibold text-[color:var(--text,white)]">{p.id}</div>
              <div className="col-span-4 text-sm text-[color:var(--text,white)]/80">{p.label}</div>
              <div className="col-span-2 text-sm text-[color:var(--text,white)]/80">{p.amount}</div>
              <div className="col-span-2 text-sm text-[color:var(--muted)]">{p.date}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs text-[color:var(--muted)]">
          Quand tu brancheras Stripe / LemonSqueezy, on remplacera la liste par les vraies factures téléchargeables (PDF).
        </div>
      </SectionCard>
    </div>
  );
}
