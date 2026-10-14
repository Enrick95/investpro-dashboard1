import DisplayCurrencySelect from "@/components/currency/DisplayCurrencySelect";

export default function CurrencyLayoutPreview() {
  return (
    <div className="investpro-mobile-page space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Journal de trading</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Analyse tes trades, tes résultats et ta discipline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <DisplayCurrencySelect />
          <span className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-xs text-[color:var(--muted)]">Mode manuel</span>
          <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-sm font-semibold text-black">＋ Ajouter un trade</span>
        </div>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <h2 className="text-lg font-semibold text-white">Vue d’ensemble</h2>
        <DisplayCurrencySelect compact />
      </section>
      <p className="text-sm text-[color:var(--muted)]">Aperçu de mise en page uniquement.</p>
    </div>
  );
}
