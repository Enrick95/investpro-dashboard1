"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RefreshCw, WalletCards } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { convertCurrency, formatDisplayCurrency, normalizeCurrency, rateDateLabel, useCurrencyRates, useDisplayCurrency } from "@/lib/currency";
import { buildJournalWithdrawals, type JournalWithdrawalAccount, type JournalWithdrawals } from "@/lib/journal-withdrawals";

type Props = { accounts: readonly JournalWithdrawalAccount[] };

function originalAmount(amount: number, currency: string | null, locale: "fr" | "en") {
  const language = locale === "en" ? "en-GB" : "fr-FR";
  if (currency) {
    try {
      return new Intl.NumberFormat(language, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    } catch { /* Keep the amount readable when a broker supplies an unknown currency code. */ }
  }
  return new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + (currency ? ` ${currency}` : "");
}

function snapshotLabel(value: string | null, locale: "fr" | "en") {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
}

export default function WithdrawalsSection({ accounts }: Props) {
  // Reset private snapshots and cancel in-flight requests when the account owner/list changes.
  const accountKey = accounts.map(account => String(account.id)).sort().join(",");
  return <WithdrawalsPanel key={accountKey} accounts={accounts} />;
}

function WithdrawalsPanel({ accounts }: Props) {
  const { t, locale } = useLocale();
  const { displayCurrency } = useDisplayCurrency();
  const { rates, rateDate } = useCurrencyRates();
  const [connections, setConnections] = useState<readonly unknown[] | null>(null);
  const [accountFilter, setAccountFilter] = useState("all");
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const mounted = useRef(false);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/metasync/hosted", { cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        if (mounted.current && current === sequence.current) setConnections(null);
        throw new Error("session_unavailable");
      }
      if (!response.ok) throw new Error("withdrawals_unavailable");
      const payload: unknown = await response.json();
      if (payload === null || typeof payload !== "object") throw new Error("invalid_response");
      const value = payload as Record<string, unknown>;
      if (value.enabled === false) {
        if (mounted.current && current === sequence.current) setConnections(null);
        throw new Error("session_unavailable");
      }
      if (value.enabled !== true || !Array.isArray(value.connections)) throw new Error("invalid_response");
      if (mounted.current && current === sequence.current && !controller.signal.aborted) {
        setConnections(value.connections);
        setLoadError(false);
      }
    } catch {
      if (mounted.current && current === sequence.current) setLoadError(true);
    } finally {
      window.clearTimeout(timeout);
      if (mounted.current && current === sequence.current) {
        request.current = null;
        setBusy(false);
        setCheckedAt(Date.now());
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Only asynchronous fetch completion updates state; the initial loading state is already set.
    void load();
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !request.current) {
        setBusy(true);
        void load();
      }
    };
    const interval = window.setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      mounted.current = false;
      request.current?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [load]);

  const summary: JournalWithdrawals = useMemo(() => buildJournalWithdrawals(
    accountFilter === "all" ? accounts : accounts.filter(account => String(account.id) === accountFilter),
    connections ?? [],
    checkedAt,
  ), [accounts, accountFilter, connections, checkedAt]);
  const hasData = connections !== null;
  const partial = summary.accounts.some(account => account.amount === null || account.currency === null);
  const nativeTotalLabel = (total: JournalWithdrawals["totals"][number]) => {
    const incomplete = summary.accounts.some(account => account.amount === null && (!account.currency || account.currency === total.currency));
    return originalAmount(total.amount, total.currency, locale) + (incomplete ? ` ${t("(partiel)")}` : "");
  };
  const converted = summary.totals.map(total => convertCurrency(total.amount, total.currency, displayCurrency, rates));
  const convertedTotal = converted.length > 0 && converted.every(amount => amount !== null)
    ? converted.reduce<number>((sum, amount) => sum + Number(amount), 0)
    : null;
  const isConversion = summary.totals.some(total => normalizeCurrency(total.currency) !== displayCurrency);
  const stateLabels = {
    available: "Synchronisé",
    stale: "Dernier montant connu",
    paused: "Synchronisation arrêtée",
    error: "Erreur de synchronisation",
    pending: "En attente de synchronisation",
    unavailable: "Données indisponibles",
  } as const;

  return (
    <section aria-labelledby="journal-withdrawals-title" data-journal-withdrawals className="overflow-hidden rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><WalletCards size={18} aria-hidden="true" /></div>
          <div className="min-w-0">
            <h2 id="journal-withdrawals-title" className="text-sm font-semibold text-white">{t("Retraits")}</h2>
            <p className="mt-1 text-[10px] text-[color:var(--muted)]">{t("Total issu de l’historique disponible")}</p>
            <div aria-live="polite" aria-atomic="true" className="mt-2">
              {!hasData ? <p className="text-sm text-white/55">{busy ? t("Chargement des retraits…") : "—"}</p>
                : convertedTotal !== null ? <p className="text-2xl font-semibold tracking-tight text-[color:var(--gold)]">{isConversion ? "≈ " : ""}{formatDisplayCurrency(convertedTotal, displayCurrency, locale)}{partial ? <span className="ml-2 text-xs font-normal">{t("(partiel)")}</span> : null}</p>
                : summary.totals.length > 0 ? <div className="flex flex-wrap gap-x-5 gap-y-1">{summary.totals.map(total => <p key={total.currency} className="text-xl font-semibold text-[color:var(--gold)]">{nativeTotalLabel(total)}</p>)}</div>
                : <p className="text-lg font-semibold text-white/55">—</p>}
            </div>
            {hasData && convertedTotal !== null && isConversion ? <p className="mt-1 text-[10px] text-white/55">{summary.totals.map(nativeTotalLabel).join(" · ")}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 ? <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">{t("Compte pour les retraits")}</span><select value={accountFilter} onChange={event => setAccountFilter(event.target.value)} className="h-10 w-full max-w-full rounded-xl border border-[color:var(--border)] bg-black/20 px-3 text-xs text-white outline-none focus-visible:border-[color:var(--gold)] sm:max-w-64"><option value="all">{t("Tous les comptes")}</option>{accounts.map(account => <option key={account.id} value={String(account.id)}>{account.name || t("Compte MetaTrader")}</option>)}</select></label> : null}
          <button type="button" onClick={() => { setBusy(true); void load(); }} disabled={busy} aria-label={t("Actualiser les retraits")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"><RefreshCw size={13} className={busy ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />{t(busy ? "Actualisation…" : "Actualiser")}</button>
        </div>
      </div>
      <div className="space-y-2 px-4 pb-4 lg:px-5">
        <p className="max-w-3xl text-[11px] leading-5 text-white/55">{t("Les sorties de fonds peuvent inclure des retraits, transferts ou ajustements du broker. Elles ne modifient pas le P&L des trades.")}</p>
        {loadError ? <p role="status" className="text-xs leading-5 text-[color:var(--gold)]">{t(hasData ? "Impossible d’actualiser les retraits. Les dernières données chargées restent affichées." : "Impossible de charger les retraits. Réessaie dans quelques instants.")}</p> : null}
        {hasData && summary.staleCount > 0 ? <p className="text-[11px] leading-5 text-[color:var(--gold)]">{t("Certains montants correspondent à la dernière synchronisation disponible. Consulte le détail par compte.")}</p> : null}
        {hasData && partial && summary.totals.length > 0 ? <p className="text-[11px] leading-5 text-[color:var(--gold)]">{t("Total partiel : certains comptes n’ont pas de données de retrait.")}</p> : null}
        {hasData && summary.totals.length === 0 ? <p className="text-xs leading-5 text-white/55">{t("Aucune donnée de retrait disponible pour cette sélection.")} {t("Les montants apparaissent après la synchronisation de l’historique du compte MetaTrader.")}</p> : null}
        {hasData && summary.totals.length > 0 && summary.totals.every(total => total.amount === 0) ? <p className="text-[11px] leading-5 text-white/55">{t("Aucune sortie de fonds détectée dans l’historique disponible.")}</p> : null}
        {hasData && summary.totals.length > 0 && convertedTotal === null ? <p className="text-[10px] leading-5 text-white/45">{t("Conversion indisponible : montants conservés dans leur devise d’origine.")}</p> : null}
        {hasData && convertedTotal !== null && isConversion ? <p className="text-[10px] leading-5 text-white/40">{t("Conversion indicative des retraits.")} {rateDateLabel(rateDate, displayCurrency, locale)}</p> : null}
      </div>
      {hasData && summary.accounts.length > 0 ? <details className="group border-t border-white/[0.06]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-white/65 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--gold)] lg:px-5 [&::-webkit-details-marker]:hidden">{t("Détail par compte")}<ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" /></summary>
        <ul className="space-y-2 px-4 pb-4 lg:px-5">
          {summary.accounts.map(account => {
            const snapshot = snapshotLabel(account.lastSync ?? account.observedAt, locale);
            return <li key={account.accountId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-3">
              <div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold text-white">{account.accountName || t("Compte MetaTrader")}</p><p className="mt-1 text-[10px] text-white/45">{t(stateLabels[account.state])}{account.amount !== null && ["error", "paused", "pending"].includes(account.state) ? ` · ${t("Dernier montant connu")}` : ""}</p><p className="mt-1 text-[9px] text-white/35">{snapshot ? `${t("Dernière synchronisation :")} ${snapshot}` : t("Synchronisation non datée")}</p></div>
              <div className="text-right"><p className="text-sm font-semibold text-[color:var(--gold)]">{account.amount === null ? "—" : originalAmount(account.amount, account.currency, locale)}</p>{account.amount !== null && account.currency === null ? <p className="mt-1 text-[9px] text-white/45">{t("Devise indisponible")}</p> : null}</div>
            </li>;
          })}
        </ul>
      </details> : null}
    </section>
  );
}
