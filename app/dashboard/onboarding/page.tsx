"use client";

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
            .from("trading_journal")
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
              Bienvenue
            </div>

            <h1 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
              Bienvenue sur <span className="text-[color:var(--gold)]">InvestPro Trading</span> 👋
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Suis ces étapes pour configurer ton espace et commencer à analyser tes performances.
            </p>
          </div>

          <button
            type="button"
            onClick={skipOnboarding}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
          >
            Passer l’onboarding
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="relative z-10 mt-7 grid grid-cols-1 gap-2 md:grid-cols-5">
          <StepTop number={1} label="Ajouter un compte" done={state.accountDone} active={currentStep === 1} />
          <StepTop number={2} label="Configurer votre plan" done={state.planDone} active={currentStep === 2} />
          <StepTop number={3} label="Importer un trade" done={state.tradeDone} active={currentStep === 3} />
          <StepTop number={4} label="Voir vos rapports" done={currentStep === 5} active={currentStep === 4} />
          <StepTop number={5} label="Installer l’app" done={false} active={currentStep === 5} />
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
          title="Ajouter un compte"
          text="Connecte ou ajoute ton compte trading."
          done={state.accountDone}
          active={currentStep === 1}
          href="/dashboard/comptes"
        />
        <StepCard
          number={2}
          title="Configurer ton plan"
          text="Définis tes règles et ta gestion du risque."
          done={state.planDone}
          active={currentStep === 2}
          href="/dashboard/plan"
        />
        <StepCard
          number={3}
          title="Importer un trade"
          text="Ajoute ou importe ton premier trade."
          done={state.tradeDone}
          active={currentStep === 3}
          href="/dashboard/journal"
        />
        <StepCard
          number={4}
          title="Voir tes rapports"
          text="Analyse tes performances en détail."
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
              <div className="text-xs font-semibold text-white">Installer InvestPro</div>
              <div className="mt-1 text-[9px] leading-4 text-[color:var(--muted)]">
                Ajoute InvestPro à ton écran d’accueil.
              </div>
            </div>
          </div>
        </button>
      </section>
    </div>
  );
}

function StepAccount({ state }: { state: State }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">Étape 1 sur 5</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          Ajouter votre premier compte
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          Connecte ton compte MetaTrader ou ajoute-le manuellement pour suivre automatiquement tes trades.
        </p>

        <div className="mt-5 space-y-3">
          <Bullet>Synchronisation automatique MT4 / MT5</Bullet>
          <Bullet>Ajout manuel disponible</Bullet>
          <Bullet>Toutes tes statistiques au même endroit</Bullet>
          <Bullet>Plusieurs comptes comparables</Bullet>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/comptes" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
            Ajouter un compte <ArrowRight size={14} />
          </Link>
          <Link href="/dashboard" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-white">
            Voir plus tard
          </Link>
        </div>
      </div>

      <PreviewCard
        title={state.accountName || "Ton compte apparaîtra ici"}
        top="Compte synchronisé"
        value={
          state.accountDone
            ? `${state.accountBalance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${state.accountCurrency}`
            : "—"
        }
        sub="Solde"
      />
    </div>
  );
}

function StepPlan() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">Étape 2 sur 5</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          Configurer votre plan de trading
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          Définis tes limites de risque, ton RR minimum, tes sessions et tes setups autorisés.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniRule label="Risque max" value="1%" />
          <MiniRule label="Trades / jour" value="2" />
          <MiniRule label="RR minimum" value="1:1" />
        </div>

        <Link href="/dashboard/plan" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
          Configurer mon plan <ArrowRight size={14} />
        </Link>
      </div>

      <PreviewCard
        title="Discipline InvestPro"
        top="Ton plan"
        value="Score / 100"
        sub="Il sera calculé avec tes trades."
      />
    </div>
  );
}

function StepTrade() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">Étape 3 sur 5</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          Importer votre premier trade
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          Ajoute un trade manuellement ou laisse MetaTrader l’importer automatiquement.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniRule label="Actif" value="XAUUSD" />
          <MiniRule label="Résultat" value="+57 $" />
          <MiniRule label="RR" value="2.3R" />
        </div>

        <Link href="/dashboard/journal" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black">
          Aller au journal <ArrowRight size={14} />
        </Link>
      </div>

      <PreviewCard
        title="Trade ajouté !"
        top="Journal"
        value="WIN / LOSS / BE"
        sub="Tes statistiques se calculent automatiquement."
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
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">Étape 4 sur 5</div>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
          Découvrez vos rapports
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          Tout est prêt. Analyse maintenant ta performance, ton Profit Factor, ton drawdown et ta discipline.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniRule label="Trades" value={String(state.tradesCount)} />
          <MiniRule label="P&L" value={`${state.pnl > 0 ? "+" : ""}${state.pnl.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}$`} />
          <MiniRule label="Journal" value="Actif" />
          <MiniRule label="Rapports" value="Prêts" />
        </div>

        <button
          type="button"
          onClick={onFinish}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black"
        >
          Dernière étape <ArrowRight size={14} />
        </button>
      </div>

      <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/[0.05] p-5 xl:col-span-5">
        <div className="flex h-full flex-col justify-between">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 size={20} />
            </div>
            <div className="mt-4 text-lg font-semibold text-white">
              Ton espace est configuré
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
              Il ne reste plus qu’à découvrir comment l’ajouter à ton téléphone.
            </p>
          </div>

          <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--gold)]">
            Retour au dashboard <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}


function StepInstall({ onFinish }: { onFinish: () => void }) {
  function openGuide() {
    window.dispatchEvent(new Event("investpro:open-install-guide"));
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="text-[10px] text-[color:var(--muted)]">Étape 5 sur 5</div>

        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
          <Smartphone size={12} />
          InvestPro Mobile
        </div>

        <h2 className="mt-4 text-xl font-semibold text-white md:text-2xl">
          Mets InvestPro sur ton écran d’accueil
        </h2>

        <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          Utilise ton espace comme une application : Journal, comptes, rapports et plan accessibles en un seul clic.
        </p>

        <div className="mt-5 space-y-3">
          <Bullet>Compatible iPhone et Android</Bullet>
          <Bullet>Pas besoin de passer par l’App Store</Bullet>
          <Bullet>Accès direct depuis ton écran d’accueil</Bullet>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openGuide}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black"
          >
            <Smartphone size={15} />
            Installer InvestPro
          </button>

          <button
            type="button"
            onClick={onFinish}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-white"
          >
            Continuer vers le dashboard
            <ArrowRight size={14} />
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
              InvestPro partout avec toi
            </div>

            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
              Une fois ajouté, InvestPro s’ouvre depuis ton téléphone comme une application dédiée.
            </p>
          </div>

          <button
            type="button"
            onClick={openGuide}
            className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--gold)]"
          >
            Voir le guide iPhone / Android
            <ArrowRight size={13} />
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
        {label}
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
          <div className="text-xs font-semibold text-white">{title}</div>
          <div className="mt-1 text-[9px] leading-4 text-[color:var(--muted)]">{text}</div>
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
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[9px] text-white/30">{label}</div>
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
  return (
    <div className="rounded-[22px] border border-[color:var(--border)] bg-black/20 p-5 xl:col-span-5">
      <div className="flex items-center gap-2 text-[9px] font-semibold text-emerald-400">
        <CheckCircle2 size={13} />
        {top}
      </div>

      <div className="mt-5 text-base font-semibold text-white">{title}</div>

      <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
        <div className="text-[9px] text-white/30">{sub}</div>
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
