import Link from "next/link";
import { ArrowRight, CreditCard, ReceiptText, Sparkles } from "lucide-react";

export default function FacturationPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
            <CreditCard size={19} />
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              Compte InvestPro
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Facturation</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
            InvestPro est actuellement en bêta gratuite. Aucun achat ni abonnement payant n’est demandé.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex items-center gap-2 text-white">
          <ReceiptText size={17} className="text-[color:var(--gold)]" />
          <h2 className="text-sm font-semibold">Factures et paiements</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.10] bg-black/15 px-4 py-8 text-center">
          <Sparkles size={20} className="mx-auto text-[color:var(--gold)]" />
          <p className="mt-3 text-sm font-semibold text-white">Aucune facture pour le moment</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-white/45">
            Aucun paiement n’étant demandé pendant la bêta, il n’y a pas encore de facture à afficher.
          </p>
        </div>
        <Link
          href="/dashboard/abonnement"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] no-underline transition hover:bg-[color:var(--gold)]/15 sm:w-auto"
        >
          Voir mon accès et mon abonnement
          <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
