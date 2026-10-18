"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, SlidersHorizontal, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";

type Outcome = "win" | "loss" | "breakeven";
type OutcomeTrade = {
  id: number;
  symbol: string;
  status: string;
  source_status?: string;
  outcome_override?: Outcome | null;
  outcome_source?: "manual" | "automatic" | "source";
  automatic_be?: boolean;
};

export default function TradeOutcomeControl({ trade, onSaved }: {
  trade: OutcomeTrade;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<Outcome | "auto">("auto");
  const [confirmedBE, setConfirmedBE] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controlId = useId();
  const manual = trade.outcome_source === "manual" || trade.outcome_override != null;
  const automatic = !manual && trade.outcome_source === "automatic" && trade.automatic_be === true;

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [open]);

  if (!["win", "loss", "breakeven"].includes(trade.status)) return null;

  function showDialog() {
    setSelection(trade.outcome_override ?? "auto");
    setConfirmedBE(false);
    setError(null);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (saving || (selection === "breakeven" && !confirmedBE)) return;
    setSaving(true);
    setError(null);
    try {
      const db = createClient();
      const { error: saveError } = await db.rpc("investpro_set_trade_outcome", {
        p_trade_id: trade.id,
        p_outcome: selection === "auto" ? null : selection,
      });
      if (saveError) throw saveError;
      setOpen(false);
      await onSaved();
    } catch {
      setError(t("Impossible d’enregistrer le classement. Réessaie."));
    } finally {
      setSaving(false);
    }
  }

  const options = [
    { value: "auto", label: "Auto", detail: "Rétablit le résultat automatique confirmé ou le résultat d’origine." },
    { value: "win", label: "WIN", detail: "Trade gagnant" },
    { value: "loss", label: "LOSS", detail: "Trade perdant" },
    { value: "breakeven", label: "BE", detail: "Sortie déclenchée par le SL placé au prix d’entrée" },
  ] as const;

  return (
    <div className="mt-2" onClick={event => event.stopPropagation()}>
      <div className="mb-1.5 flex items-center gap-1 text-[9px] text-white/45">
        {automatic ? <CheckCircle2 size={10} aria-hidden="true" /> : null}
        <span>{t(manual ? "Classement manuel" : automatic ? "BE automatique confirmé" : "Résultat source")}</span>
      </div>
      <button
        type="button"
        onClick={event => { event.stopPropagation(); showDialog(); }}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--gold)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
      >
        <SlidersHorizontal size={12} aria-hidden="true" />
        {t("Classer le trade")}
      </button>
      {open ? createPortal(
        <dialog
          ref={dialogRef}
          aria-labelledby={`${controlId}-title`}
          aria-describedby={`${controlId}-description`}
          onCancel={event => { if (saving) event.preventDefault(); else setOpen(false); }}
          onClose={() => setOpen(false)}
          onClick={event => event.stopPropagation()}
          className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[color:var(--gold-border)] bg-[#101013] p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
        >
          <form onSubmit={save}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <h2 id={`${controlId}-title`} className="text-lg font-semibold">{t("Classer le trade")}</h2>
                <p className="mt-1 text-sm text-white/55">{trade.symbol}</p>
              </div>
              <button type="button" disabled={saving} onClick={() => setOpen(false)} aria-label={t("Fermer")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/65 hover:text-white disabled:opacity-40">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p id={`${controlId}-description`} className="text-xs leading-5 text-white/65">
                {t("Le classement ajuste le résultat du journal et le winrate. Le montant financier net, les frais et les données importées restent inchangés.")}
              </p>
              <fieldset disabled={saving} className="space-y-2">
                <legend className="mb-2 text-xs font-semibold text-white/80">{t("Résultat du trade")}</legend>
                {options.map(option => (
                  <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selection === option.value ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/10 bg-white/[0.02]"}`}>
                    <input type="radio" name={`${controlId}-outcome`} value={option.value} checked={selection === option.value}
                      onChange={() => { setSelection(option.value); setConfirmedBE(false); setError(null); }}
                      className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--gold)]" />
                    <span className="min-w-0"><span className="block text-sm font-semibold">{t(option.label)}</span><span className="mt-1 block text-xs leading-5 text-white/55">{t(option.detail)}</span></span>
                  </label>
                ))}
              </fieldset>
              {selection === "breakeven" ? (
                <div className="space-y-3 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3">
                  <p className="text-xs leading-5 text-white/65">{t("Un BE technique exige une sortie déclenchée par le SL à l’entrée. Les frais ou le slippage peuvent laisser un léger résultat net négatif. Une clôture manuelle en petite perte reste une LOSS.")}</p>
                  <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-white/90">
                    <input type="checkbox" required checked={confirmedBE} disabled={saving} onChange={event => setConfirmedBE(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--gold)]" />
                    <span>{t("Je confirme que le SL placé au prix d’entrée a déclenché la sortie.")}</span>
                  </label>
                </div>
              ) : null}
              {error ? <p role="alert" className="text-xs leading-5 text-red-400">{error}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 p-5">
              <button type="button" disabled={saving} onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-white/65 disabled:opacity-40">{t("Annuler")}</button>
              <button type="submit" disabled={saving || (selection === "breakeven" && !confirmedBE)} className="min-h-11 rounded-xl bg-[color:var(--gold)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{t(saving ? "Enregistrement…" : "Enregistrer le classement")}</button>
            </div>
          </form>
        </dialog>, document.body
      ) : null}
    </div>
  );
}
