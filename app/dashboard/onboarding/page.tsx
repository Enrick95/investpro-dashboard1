"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  LineChart,
  Loader2,
  ShieldCheck,
  Smartphone,
  Target,
  WalletCards,
  UsersRound,
  Clock3,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type State = {
  accountDone: boolean;
  planDone: boolean;
  tradeDone: boolean;
  accountName: string | null;
  accountBalance: number;
  accountCurrency: string;
  tradesCount: number;
  pnl: number;
};

const initialState: State = {
  accountDone: false,
  planDone: false,
  tradeDone: false,
  accountName: null,
  accountBalance: 0,
  accountCurrency: "USD",
  tradesCount: 0,
  pnl: 0,
};

export default function OnboardingPage() {
  const { t: translate } = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<State>(initialState);
  const [installStep, setInstallStep] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        const [accountsResult, planResult, tradesResult] = await Promise.all([
          supabase
            .from("trading_accounts")
            .select("id, name, current_balance, currency")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),

          supabase
            .from("trading_plans")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle(),

          supabase
            .from("trading_journal_effective")
            .select("id, result_amount")
            .eq("user_id", user.id),
        ]);

        const accounts = accountsResult.data || [];
        const trades = tradesResult.data || [];

        const pnl = trades.reduce(
          (sum, trade) => sum + Number(trade.result_amount || 0),
          0
        );

        setState({
          accountDone: accounts.length > 0,
          planDone: !!planResult.data,
          tradeDone: trades.length > 0,
          accountName: accounts[0]?.name || null,
          accountBalance: Number(accounts[0]?.current_balance || 0),
          accountCurrency: String(accounts[0]?.currency || "USD"),
          tradesCount: trades.length,
          pnl,
        });
      } catch (error) {
        console.error("Erreur onboarding :", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase]);

  const currentStep = installStep
    ? 5
    : !state.accountDone
    ? 1
    : !state.planDone
    ? 2
    : !state.tradeDone
    ? 3
    : 4;

  function skipOnboarding() {
    window.localStorage.setItem("investpro_onboarding_skipped", "1");
    router.push("/dashboard");
  }

  function finishOnboarding() {
    window.localStorage.setItem("investpro_onboarding_completed", "1");
    router.push("/dashboard/rapports");
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--gold-border)] bg-[#0b0b0d] p-5 md:p-7">
        <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-[color:var(--gold)] opacity-[0.08] blur-[70px]" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <ShieldCheck size={11} />
              {translate("Bienvenue")}</div>

            <h1 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
              {translate("Bienvenue sur")}{" "}<span className="text-[color:var(--gold)]">{translate("InvestPro Trading")}</span> 👋
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              {translate("Suis ces étapes pour configurer ton espace et commencer à analyser tes performances.")}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/[0.045] px-3 py-1.5 text-[9px] font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-45" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                {translate("+400 traders dans la communauté InvestPro")}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[9px] text-white/45">
                <Clock3 size={11} />
                {translate("Configuration guidée · quelques minutes")}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[9px] text-white/45">
                <Smartphone size={11} />
                {translate("Installation mobile incluse")}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={skipOnboarding}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
          >
            {translate("Passer l’onboarding")}<ArrowRight size={13} />
          </button>
        </div>

        <div className="relative z-10 mt-7 grid grid-cols-1 gap-2 md:grid-cols-5">
          <StepTop number={1} label={translate("Ajouter un compte")} done={state.accountDone} active={currentStep === 1} />
          <StepTop number={2} label={translate("Configurer votre plan")} done={state.planDone} active={currentStep === 2} />
          <StepTop number={3} label={translate("Importer un trade")} done={state.tradeDone} active={currentStep === 3} />
          <StepTop number={4} label={translate("Voir vos rapports")} done={currentStep === 5} active={currentStep === 4} />
          <StepTop number={5} label={translate("Installer l’app")} done={false} active={currentStep === 5} />
        </div>
      </section>

      <section className="rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-7">
        {currentStep === 1 ? (
          <StepAccount state={state} />
        ) : currentStep === 2 ? (
          <StepPlan />
        ) : currentStep === 3 ? (
          <StepTrade />
        ) : currentStep === 4 ? (
          <StepReports state={state} onFinish={() => setInstallStep(true)} />
        ) : (
          <StepInstall onFinish={finishOnboarding} />
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <StepCard
          number={1}
          title={translate("Ajouter un compte")}
          text={translate("Connecte ou ajoute ton compte trading.")}
          done={state.accountDone}
          active={currentStep === 1}
          href="/dashboard/comptes"
        />
        <StepCard
          number={2}
          title={translate("Configurer ton plan")}
          text={translate("Définis tes règles et ta gestion du risque.")}
          done={state.planDone}
          active={currentStep === 2}
          href="/dashboard/plan"
        />
        <StepCard
          number={3}
          title={translate("Importer un trade")}
          text={translate("Ajoute ou importe ton premier trade.")}
          done={state.tradeDone}
          active={currentStep === 3}
          href="/dashboard/journal"
        />
        <StepCard
          number={4}
          title={translate("Voir tes rapports")}
          text={translate("Analyse tes performances en détail.")}
          done={false}
          active={currentStep === 4}
          href="/dashboard/rapports"
        />
        <button
          type="button"
          onClick={() => {
            setInstallStep(true);
            window.setTimeout(() => {
              window.dispatchEvent(new Event("investpro:open-install-guide"));
            }, 80);
          }}
          className={[
            "rounded-[20px] border p-4 text-left transition",
            currentStep === 5
              ? "border-[color:var(--gold)] bg-[color:var(--gold-soft)] shadow-[0_0_28px_rgba(230,184,78,.08)]"
              : "border-[color:var(--border)] bg-[color:var(--panel)] hover:border-[color:var(--gold-border)]",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            <span className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
              currentStep === 5
                ? "border-[color:var(--gold)] bg-[color:var(--gold)] text-black"
                : "border-white/15 text-white/50",
            ].join(" ")}>
              5
            </span>
            <div>
              <div className="text-xs font-semibold text-white">{translate("Installer InvestPro")}</div>
              <div className="mt-1 text-[9px] leading-4 text-[color:var(--muted)]">
                {translate("Ajoute InvestPro à ton écran d’accueil.")}</div>
            </div>
          </div>
        </button>
      </section>
    </div>
  );
}

function StepAccount({ state }: { state: State }) {
  const { t: translate } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">{translate("Étape 1 sur 5")}</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          {translate("Ajouter votre premier compte")}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          {translate("Connecte ton compte MetaTrader ou ajoute-le manuellement pour suivre automatiquement tes trades.")}</p>

        <div className="mt-5 space-y-3">
          <Bullet>{translate("Synchronisation automatique MT4 / MT5")}</Bullet>
          <Bullet>{translate("Ajout manuel disponible")}</Bullet>
          <Bullet>{translate("Toutes tes statistiques au même endroit")}</Bullet>
          <Bullet>{translate("Plusieurs comptes comparables")}</Bullet>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/comptes" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
            {translate("Ajouter un compte")}{" "}<ArrowRight size={14} />
          </Link>
          <Link href="/dashboard" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-white">
            {translate("Voir plus tard")}</Link>
        </div>
      </div>

      <PreviewCard
        title={state.accountName || translate("Ton compte apparaîtra ici")}
        top="Compte synchronisé"
        value={
          state.accountDone
            ? `${state.accountBalance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${state.accountCurrency}`
            : "—"
        }
        sub={translate("Solde")}
      />
    </div>
  );
}

function StepPlan() {
  const { t: translate } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">{translate("Étape 2 sur 5")}</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          {translate("Configurer votre plan de trading")}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          {translate("Définis tes limites de risque, ton RR minimum, tes sessions et tes setups autorisés.")}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniRule label={translate("Risque max")} value="1%" />
          <MiniRule label={translate("Trades / jour")} value="2" />
          <MiniRule label={translate("RR minimum")} value="1:1" />
        </div>

        <Link href="/dashboard/plan" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
          {translate("Configurer mon plan")}{" "}<ArrowRight size={14} />
        </Link>
      </div>

      <PreviewCard
        title={translate("Discipline InvestPro")}
        top="Ton plan"
        value="Score / 100"
        sub={translate("Il sera calculé avec tes trades.")}
      />
    </div>
  );
}

function StepTrade() {
  const { t: translate } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">{translate("Étape 3 sur 5")}</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          {translate("Importer votre premier trade")}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          {translate("Ajoute un trade manuellement ou laisse MetaTrader l’importer automatiquement.")}</p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniRule label={translate("Actif")} value="XAUUSD" />
          <MiniRule label={translate("Résultat")} value="+57 $" />
          <MiniRule label={translate("RR")} value="2.3R" />
        </div>

        <Link href="/dashboard/journal" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
          {translate("Aller au journal")}{" "}<ArrowRight size={14} />
        </Link>
      </div>

      <PreviewCard
        title={translate("Trade ajouté !")}
        top="Journal"
        value="WIN / LOSS / BE"
        sub={translate("Tes statistiques se calculent automatiquement.")}
      />
    </div>
  );
}

function StepReports({
  state,
  onFinish,
}: {
  state: State;
  onFinish: () => void;
}) {
  const { t: translate } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">{translate("Étape 4 sur 5")}</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          {translate("Découvrez vos rapports")}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          {translate("Tout est prêt. Analyse maintenant ta performance, ton Profit Factor, ton drawdown et ta discipline.")}</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniRule label={translate("Trades")} value={String(state.tradesCount)} />
          <MiniRule label={translate("P&L")} value={`${state.pnl > 0 ? "+" : ""}${state.pnl.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}$`} />
          <MiniRule label={translate("Journal")} value={translate("Activé")} />
          <MiniRule label={translate("Rapports")} value={translate("Prêts")} />
        </div>

        <button
          type="button"
          onClick={onFinish}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black"
        >
          {translate("Dernière étape")}{" "}<ArrowRight size={14} />
        </button>
      </div>

      <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/[0.05] p-5 xl:col-span-5">
        <div className="flex h-full flex-col justify-between">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 size={20} />
            </div>
            <div className="mt-4 text-lg font-semibold text-white">
              {translate("Ton espace est configuré")}</div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
              {translate("Il ne reste plus qu’à découvrir comment l’ajouter à ton téléphone.")}</p>
          </div>

          <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--gold)]">
            {translate("Retour au dashboard")}{" "}<ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}


function StepInstall({ onFinish }: { onFinish: () => void }) {
  const { t: translate } = useLocale();
  function openGuide() {
    window.dispatchEvent(new Event("investpro:open-install-guide"));
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">{translate("Étape 5 sur 5")}</div>

        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
          <Smartphone size={12} />
          {translate("InvestPro Mobile")}</div>

        <h2 className="mt-4 text-xl font-semibold text-white md:text-2xl">
          {translate("Mets InvestPro sur ton écran d’accueil")}</h2>

        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          {translate("Utilise ton espace comme une application : Journal, comptes, rapports et plan accessibles en un seul clic.")}</p>

        <div className="mt-5 space-y-3">
          <Bullet>{translate("Compatible iPhone et Android")}</Bullet>
          <Bullet>{translate("Pas besoin de passer par l’App Store")}</Bullet>
          <Bullet>{translate("Accès direct depuis ton écran d’accueil")}</Bullet>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openGuide}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black"
          >
            <Smartphone size={15} />
            {translate("Installer InvestPro")}</button>

          <button
            type="button"
            onClick={onFinish}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-white"
          >
            {translate("Continuer vers le dashboard")}<ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-5 xl:col-span-5">
        <div className="flex h-full flex-col justify-between">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/20 text-[color:var(--gold)]">
              <Smartphone size={21} />
            </div>

            <div className="mt-4 text-lg font-semibold text-white">
              {translate("InvestPro partout avec toi")}</div>

            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
              {translate("Une fois ajouté, InvestPro s’ouvre depuis ton téléphone comme une application dédiée.")}</p>
          </div>

          <button
            type="button"
            onClick={openGuide}
            className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--gold)]"
          >
            {translate("Voir le guide iPhone / Android")}<ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}


function StepTop({
  number,
  label,
  done,
  active,
}: {
  number: number;
  label: string;
  done: boolean;
  active: boolean;
}) {
  const { t: translate } = useLocale();
  return (
    <div
      className={[
        "flex items-center gap-3 rounded-xl border px-3 py-3",
        active
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.05] bg-black/10",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
          done
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : active
            ? "border-[color:var(--gold)] bg-[color:var(--gold)] text-black"
            : "border-white/15 text-white/45",
        ].join(" ")}
      >
        {done ? <Check size={13} /> : number}
      </span>
      <span className={active ? "text-xs font-semibold text-white" : "text-xs text-white/45"}>
        {translate(label)}
      </span>
    </div>
  );
}

function StepCard({
  number,
  title,
  text,
  done,
  active,
  href,
}: {
  number: number;
  title: string;
  text: string;
  done: boolean;
  active: boolean;
  href: string;
}) {
  const { t: translate } = useLocale();
  return (
    <Link
      href={href}
      className={[
        "rounded-[20px] border p-4 transition",
        active
          ? "border-[color:var(--gold)] bg-[color:var(--gold-soft)] shadow-[0_0_28px_rgba(230,184,78,.08)]"
          : "border-[color:var(--border)] bg-[color:var(--panel)] hover:border-[color:var(--gold-border)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            done
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : active
              ? "border-[color:var(--gold)] bg-[color:var(--gold)] text-black"
              : "border-white/15 text-white/50",
          ].join(" ")}
        >
          {done ? <Check size={14} /> : number}
        </span>
        <div>
          <div className="text-xs font-semibold text-white">{translate(title)}</div>
          <div className="mt-1 text-[9px] leading-4 text-[color:var(--muted)]">{translate(text)}</div>
        </div>
      </div>
    </Link>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-white/70">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
        <Check size={10} />
      </span>
      {children}
    </div>
  );
}

function MiniRule({ label, value }: { label: string; value: string }) {
  const { t: translate } = useLocale();
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[9px] text-white/30">{translate(label)}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function PreviewCard({
  title,
  top,
  value,
  sub,
}: {
  title: string;
  top: string;
  value: string;
  sub: string;
}) {
  const { t: translate } = useLocale();
  return (
    <div className="rounded-[22px] border border-[color:var(--border)] bg-black/20 p-5 xl:col-span-5">
      <div className="flex items-center gap-2 text-[9px] font-semibold text-emerald-400">
        <CheckCircle2 size={13} />
        {top}
      </div>

      <div className="mt-5 text-base font-semibold text-white">{translate(title)}</div>

      <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
        <div className="text-[9px] text-white/30">{translate(sub)}</div>
        <div className="mt-2 text-xl font-semibold text-[color:var(--gold)]">{value}</div>

        <div className="mt-4 h-12 overflow-hidden">
          <svg viewBox="0 0 320 70" className="h-full w-full" preserveAspectRatio="none">
            <polyline
              points="0,58 35,54 60,57 85,40 120,45 148,30 176,34 206,22 238,27 270,13 320,18"
              fill="none"
              stroke="rgba(52,211,153,.9)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
