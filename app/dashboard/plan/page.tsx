"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  Loader2,
  Save,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type TradingPlan = {
  max_risk_percent: number;
  max_trades_per_day: number;
  minimum_rr: number;
  allowed_sessions: string[];
  allowed_assets: string[];
  allowed_setups: string[];
  rule_after_one_loss: string;
  rule_after_two_losses: string;
  weekly_goal: string;
  general_rules: string;
};

type ChecklistState = {
  symbol: string;
  direction: "buy" | "sell";
  timeframe: string;
  session: string;
  trend_validated: boolean;
  zone_validated: boolean;
  setup_validated: boolean;
  rr_validated: boolean;
  risk_validated: boolean;
  news_checked: boolean;
  plan_respected: boolean;
  notes: string;
};

type Trade = {
  id: number;
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  risk_percent: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  result_amount: number | null;
  result_r: number | null;
  status: "open" | "win" | "loss" | "breakeven" | "cancelled";
  setup: string | null;
  session: string | null;
};

type ChecklistHistory = {
  id: number;
  symbol: string | null;
  direction: string | null;
  timeframe: string | null;
  session: string | null;
  trend_validated: boolean | null;
  zone_validated: boolean | null;
  setup_validated: boolean | null;
  rr_validated: boolean | null;
  risk_validated: boolean | null;
  news_checked: boolean | null;
  plan_respected: boolean | null;
  is_completed: boolean | null;
  notes: string | null;
  created_at: string | null;
};

const DEFAULT_PLAN: TradingPlan = {
  max_risk_percent: 1,
  max_trades_per_day: 2,
  minimum_rr: 1,
  allowed_sessions: ["London", "New York"],
  allowed_assets: ["XAUUSD"],
  allowed_setups: [],
  rule_after_one_loss: "Faire une pause et attendre un nouveau setup valide.",
  rule_after_two_losses: "Arrêter de trader pour la journée.",
  weekly_goal: "Respecter mon plan de trading toute la semaine.",
  general_rules: "",
};

const DEFAULT_CHECKLIST: ChecklistState = {
  symbol: "",
  direction: "buy",
  timeframe: "",
  session: "",
  trend_validated: false,
  zone_validated: false,
  setup_validated: false,
  rr_validated: false,
  risk_validated: false,
  news_checked: false,
  plan_respected: false,
  notes: "",
};

const SESSION_OPTIONS = ["Asian", "London", "New York"];

function normalizeAsset(value: string | null | undefined) {
  const clean = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return clean === "GOLD" ? "XAUUSD" : clean;
}

function normalizeSession(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace("newyork", "new york");
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function calculateRR(trade: Trade) {
  if (
    trade.entry_price == null ||
    trade.stop_loss == null ||
    trade.take_profit == null
  ) {
    return null;
  }

  const risk = Math.abs(trade.entry_price - trade.stop_loss);
  const reward = Math.abs(trade.take_profit - trade.entry_price);

  return risk > 0 ? reward / risk : null;
}

function frMoney(value: number) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function tradeDateLabel(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TradingPlanPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);

  const [plan, setPlan] = useState<TradingPlan>(DEFAULT_PLAN);
  const [checklist, setChecklist] =
    useState<ChecklistState>(DEFAULT_CHECKLIST);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [checklistHistory, setChecklistHistory] = useState<ChecklistHistory[]>([]);

  const [assetInput, setAssetInput] = useState("");
  const [setupInput, setSetupInput] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const [planResult, tradesResult, checklistResult] = await Promise.all([
        supabase
          .from("trading_plans")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("trading_journal")
          .select(
            `
              id,
              trade_date,
              symbol,
              direction,
              risk_percent,
              entry_price,
              stop_loss,
              take_profit,
              result_amount,
              result_r,
              status,
              setup,
              session
            `
          )
          .eq("user_id", user.id)
          .order("trade_date", { ascending: false }),

        supabase
          .from("trade_checklists")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      if (planResult.data) {
        const data = planResult.data;
        setPlan({
          max_risk_percent: Number(data.max_risk_percent) || 1,
          max_trades_per_day: Number(data.max_trades_per_day) || 2,
          minimum_rr: Number(data.minimum_rr) || 1,
          allowed_sessions: Array.isArray(data.allowed_sessions)
            ? data.allowed_sessions
            : [],
          allowed_assets: Array.isArray(data.allowed_assets)
            ? data.allowed_assets
            : [],
          allowed_setups: Array.isArray(data.allowed_setups)
            ? data.allowed_setups
            : [],
          rule_after_one_loss: data.rule_after_one_loss || "",
          rule_after_two_losses: data.rule_after_two_losses || "",
          weekly_goal: data.weekly_goal || "",
          general_rules: data.general_rules || "",
        });
      }

      if (!tradesResult.error) {
        setTrades((tradesResult.data as Trade[]) || []);
      }

      if (!checklistResult.error) {
        setChecklistHistory((checklistResult.data as ChecklistHistory[]) || []);
      }
    } catch (error) {
      console.error("Erreur plan V2 :", error);
    } finally {
      setLoading(false);
    }
  }

  async function savePlan() {
    if (!userId) return;

    try {
      setSavingPlan(true);
      setMessage(null);

      const { error } = await supabase.from("trading_plans").upsert(
        {
          user_id: userId,
          max_risk_percent: plan.max_risk_percent,
          max_trades_per_day: plan.max_trades_per_day,
          minimum_rr: plan.minimum_rr,
          allowed_sessions: plan.allowed_sessions,
          allowed_assets: plan.allowed_assets,
          allowed_setups: plan.allowed_setups,
          rule_after_one_loss: plan.rule_after_one_loss,
          rule_after_two_losses: plan.rule_after_two_losses,
          weekly_goal: plan.weekly_goal,
          general_rules: plan.general_rules,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      setMessage({
        type: "success",
        text: "Ton plan de trading a bien été enregistré.",
      });
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Impossible d’enregistrer ton plan.",
      });
    } finally {
      setSavingPlan(false);
    }
  }

  const checklistItems = [
    checklist.trend_validated,
    checklist.zone_validated,
    checklist.setup_validated,
    checklist.rr_validated,
    checklist.risk_validated,
    checklist.news_checked,
    checklist.plan_respected,
  ];

  const validatedCount = checklistItems.filter(Boolean).length;
  const checklistPercent = Math.round(
    (validatedCount / checklistItems.length) * 100
  );
  const allValidated = validatedCount === checklistItems.length;

  async function saveChecklist() {
    if (!userId) return;

    try {
      setSavingChecklist(true);
      setMessage(null);

      const { error } = await supabase.from("trade_checklists").insert({
        user_id: userId,
        symbol: checklist.symbol.trim() || null,
        direction: checklist.direction,
        timeframe: checklist.timeframe.trim() || null,
        session: checklist.session || null,
        trend_validated: checklist.trend_validated,
        zone_validated: checklist.zone_validated,
        setup_validated: checklist.setup_validated,
        rr_validated: checklist.rr_validated,
        risk_validated: checklist.risk_validated,
        news_checked: checklist.news_checked,
        plan_respected: checklist.plan_respected,
        notes: checklist.notes.trim() || null,
        is_completed: allValidated,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setMessage({
        type: "success",
        text: allValidated
          ? "Checklist validée. Ton trade respecte tous les critères."
          : "Checklist enregistrée, mais certains critères ne sont pas validés.",
      });

      setChecklist(DEFAULT_CHECKLIST);
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Impossible d’enregistrer la checklist.",
      });
    } finally {
      setSavingChecklist(false);
    }
  }

  function toggleSession(session: string) {
    setPlan((current) => ({
      ...current,
      allowed_sessions: current.allowed_sessions.includes(session)
        ? current.allowed_sessions.filter((item) => item !== session)
        : [...current.allowed_sessions, session],
    }));
  }

  function addAsset() {
    const value = assetInput.trim().toUpperCase();
    if (!value) return;

    if (!plan.allowed_assets.includes(value)) {
      setPlan((current) => ({
        ...current,
        allowed_assets: [...current.allowed_assets, value],
      }));
    }

    setAssetInput("");
  }

  function addSetup() {
    const value = setupInput.trim();
    if (!value) return;

    if (!plan.allowed_setups.includes(value)) {
      setPlan((current) => ({
        ...current,
        allowed_setups: [...current.allowed_setups, value],
      }));
    }

    setSetupInput("");
  }

  const discipline = useMemo(() => {
    const closed = trades.filter((trade) =>
      ["win", "loss", "breakeven"].includes(trade.status)
    );

    if (!closed.length) {
      return {
        score: null as number | null,
        riskPct: null as number | null,
        rrPct: null as number | null,
        assetPct: null as number | null,
        sessionPct: null as number | null,
        setupPct: null as number | null,
        compliantTrades: 0,
        nonCompliantTrades: 0,
        pnlCompliant: 0,
        pnlNonCompliant: 0,
        recent: [] as Array<{
          trade: Trade;
          compliant: boolean;
          reasons: string[];
        }>,
      };
    }

    let riskValid = 0;
    let riskKnown = 0;
    let rrValid = 0;
    let rrKnown = 0;
    let assetValid = 0;
    let assetKnown = 0;
    let sessionValid = 0;
    let sessionKnown = 0;
    let setupValid = 0;
    let setupKnown = 0;

    let compliantTrades = 0;
    let nonCompliantTrades = 0;
    let pnlCompliant = 0;
    let pnlNonCompliant = 0;

    const recent: Array<{
      trade: Trade;
      compliant: boolean;
      reasons: string[];
    }> = [];

    for (const trade of closed) {
      const reasons: string[] = [];
      const checks: boolean[] = [];

      const risk = Number(trade.risk_percent || 0);
      if (risk > 0) {
        riskKnown += 1;
        const ok = risk <= Number(plan.max_risk_percent);
        if (ok) riskValid += 1;
        checks.push(ok);
        if (!ok) reasons.push(`Risque ${risk}% > ${plan.max_risk_percent}%`);
      }

      const rr = calculateRR(trade);
      if (rr != null) {
        rrKnown += 1;
        const ok = rr >= Number(plan.minimum_rr);
        if (ok) rrValid += 1;
        checks.push(ok);
        if (!ok) reasons.push(`RR ${rr.toFixed(2)} < ${plan.minimum_rr}`);
      }

      if (plan.allowed_assets.length > 0) {
        assetKnown += 1;
        const allowed = plan.allowed_assets.map(normalizeAsset);
        const ok = allowed.includes(normalizeAsset(trade.symbol));
        if (ok) assetValid += 1;
        checks.push(ok);
        if (!ok) reasons.push(`${trade.symbol} hors plan`);
      }

      if (plan.allowed_sessions.length > 0 && trade.session) {
        sessionKnown += 1;
        const allowed = plan.allowed_sessions.map(normalizeSession);
        const ok = allowed.includes(normalizeSession(trade.session));
        if (ok) sessionValid += 1;
        checks.push(ok);
        if (!ok) reasons.push(`${trade.session} non autorisée`);
      }

      if (plan.allowed_setups.length > 0 && trade.setup) {
        setupKnown += 1;
        const allowed = plan.allowed_setups.map(normalizeText);
        const ok = allowed.includes(normalizeText(trade.setup));
        if (ok) setupValid += 1;
        checks.push(ok);
        if (!ok) reasons.push(`${trade.setup} hors plan`);
      }

      const compliant = checks.length > 0 && checks.every(Boolean);

      if (compliant) {
        compliantTrades += 1;
        pnlCompliant += Number(trade.result_amount || 0);
      } else if (checks.length > 0) {
        nonCompliantTrades += 1;
        pnlNonCompliant += Number(trade.result_amount || 0);
      }

      if (recent.length < 6) {
        recent.push({ trade, compliant, reasons });
      }
    }

    const ratios: number[] = [];
    if (riskKnown) ratios.push((riskValid / riskKnown) * 100);
    if (rrKnown) ratios.push((rrValid / rrKnown) * 100);
    if (assetKnown) ratios.push((assetValid / assetKnown) * 100);
    if (sessionKnown) ratios.push((sessionValid / sessionKnown) * 100);
    if (setupKnown) ratios.push((setupValid / setupKnown) * 100);

    return {
      score: ratios.length
        ? Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length)
        : null,
      riskPct: riskKnown ? (riskValid / riskKnown) * 100 : null,
      rrPct: rrKnown ? (rrValid / rrKnown) * 100 : null,
      assetPct: assetKnown ? (assetValid / assetKnown) * 100 : null,
      sessionPct: sessionKnown ? (sessionValid / sessionKnown) * 100 : null,
      setupPct: setupKnown ? (setupValid / setupKnown) * 100 : null,
      compliantTrades,
      nonCompliantTrades,
      pnlCompliant,
      pnlNonCompliant,
      recent,
    };
  }, [trades, plan]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <ShieldCheck size={12} />
            Discipline InvestPro
          </div>

          <h1 className="text-2xl font-semibold text-white">
            Plan de <span className="text-[color:var(--gold)]">trading</span>
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Définis tes règles, mesure ta discipline et vérifie ton setup avant chaque prise de position.
          </p>
        </div>

        <button
          type="button"
          onClick={savePlan}
          disabled={savingPlan}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black transition hover:bg-[color:var(--gold-2)] disabled:opacity-50"
        >
          {savingPlan ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          Enregistrer mon plan
        </button>
      </div>

      {message ? (
        <div
          className={[
            "flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs",
            message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
              : "border-red-500/20 bg-red-500/[0.06] text-red-300",
          ].join(" ")}
        >
          {message.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          {message.text}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard
          icon={<ShieldCheck size={18} />}
          label="Risque max"
          value={`${plan.max_risk_percent}%`}
          sub="Par trade"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Trades max"
          value={String(plan.max_trades_per_day)}
          sub="Par jour"
        />
        <StatCard
          icon={<Target size={18} />}
          label="RR minimum"
          value={`1:${plan.minimum_rr}`}
          sub="Risk / Reward"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 xl:col-span-5">
          <SectionTitle icon={<Gauge size={17} />} title="Score de discipline" />

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            <DisciplineRing score={discipline.score} />

            <div className="min-w-0 flex-1 space-y-3">
              <ProgressMetric
                label="Risque respecté"
                value={discipline.riskPct}
              />
              <ProgressMetric label="RR respecté" value={discipline.rrPct} />
              <ProgressMetric
                label="Instruments autorisés"
                value={discipline.assetPct}
              />
              <ProgressMetric
                label="Sessions respectées"
                value={discipline.sessionPct}
              />
              <ProgressMetric
                label="Setups respectés"
                value={discipline.setupPct}
              />
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle
              icon={<ClipboardCheck size={17} />}
              title="Conformité des derniers trades"
            />
            <Link
              href="/dashboard/journal"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--gold)]"
            >
              Journal <ChevronRight size={13} />
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {discipline.recent.length ? (
              discipline.recent.map(({ trade, compliant, reasons }) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        {trade.symbol}
                      </span>
                      <span className="text-[8px] uppercase text-white/35">
                        {trade.direction === "buy" ? "Achat" : "Vente"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[9px] text-white/30">
                      {reasons.length
                        ? reasons.join(" • ")
                        : "Toutes les règles disponibles sont respectées"}
                    </div>
                  </div>

                  <span
                    className={[
                      "shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold",
                      compliant
                        ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400"
                        : "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
                    ].join(" ")}
                  >
                    {compliant ? "Conforme" : "À vérifier"}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState text="Pas encore assez de données de trades pour mesurer la conformité." />
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ResultCompareCard
          title="Trades conformes"
          count={discipline.compliantTrades}
          pnl={discipline.pnlCompliant}
          positive
        />
        <ResultCompareCard
          title="Trades hors plan"
          count={discipline.nonCompliantTrades}
          pnl={discipline.pnlNonCompliant}
          positive={false}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-7">
          <SectionTitle icon={<ShieldCheck size={17} />} title="Mes règles de risque" />

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <NumberField
              label="Risque max / trade"
              value={plan.max_risk_percent}
              suffix="%"
              step="0.1"
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  max_risk_percent: value,
                }))
              }
            />
            <NumberField
              label="Trades max / jour"
              value={plan.max_trades_per_day}
              step="1"
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  max_trades_per_day: value,
                }))
              }
            />
            <NumberField
              label="RR minimum"
              value={plan.minimum_rr}
              suffix="R"
              step="0.1"
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  minimum_rr: value,
                }))
              }
            />
          </div>

          <div className="mt-6">
            <FieldLabel>Sessions autorisées</FieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {SESSION_OPTIONS.map((session) => {
                const active = plan.allowed_sessions.includes(session);
                return (
                  <button
                    key={session}
                    type="button"
                    onClick={() => toggleSession(session)}
                    className={[
                      "h-10 rounded-xl border px-4 text-xs font-semibold transition",
                      active
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                        : "border-[color:var(--border)] bg-black/20 text-white/45 hover:text-white",
                    ].join(" ")}
                  >
                    {session}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <FieldLabel>Actifs autorisés</FieldLabel>
            <div className="mt-2 flex gap-2">
              <input
                value={assetInput}
                onChange={(event) => setAssetInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addAsset();
                  }
                }}
                placeholder="Ex: GOLD, EURUSD, NAS100..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={addAsset}
                className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
              >
                Ajouter
              </button>
            </div>
            <TagList
              values={plan.allowed_assets}
              onRemove={(value) =>
                setPlan((current) => ({
                  ...current,
                  allowed_assets: current.allowed_assets.filter(
                    (item) => item !== value
                  ),
                }))
              }
            />
          </div>

          <div className="mt-6">
            <FieldLabel>Setups autorisés</FieldLabel>
            <div className="mt-2 flex gap-2">
              <input
                value={setupInput}
                onChange={(event) => setSetupInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSetup();
                  }
                }}
                placeholder="Ex: SMC, OTE + OB, CHoCH..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={addSetup}
                className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
              >
                Ajouter
              </button>
            </div>
            <TagList
              values={plan.allowed_setups}
              onRemove={(value) =>
                setPlan((current) => ({
                  ...current,
                  allowed_setups: current.allowed_setups.filter(
                    (item) => item !== value
                  ),
                }))
              }
            />
          </div>
        </div>

        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-5">
          <SectionTitle icon={<Target size={17} />} title="Discipline personnelle" />

          <div className="mt-5 space-y-4">
            <TextareaField
              label="Après 1 perte"
              value={plan.rule_after_one_loss}
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  rule_after_one_loss: value,
                }))
              }
            />
            <TextareaField
              label="Après 2 pertes"
              value={plan.rule_after_two_losses}
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  rule_after_two_losses: value,
                }))
              }
            />
            <TextareaField
              label="Objectif de la semaine"
              value={plan.weekly_goal}
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  weekly_goal: value,
                }))
              }
            />
            <TextareaField
              label="Règles supplémentaires"
              value={plan.general_rules}
              onChange={(value) =>
                setPlan((current) => ({
                  ...current,
                  general_rules: value,
                }))
              }
              placeholder="Ex: pas de revenge trading, ne pas déplacer le SL..."
            />
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <SectionTitle icon={<ClipboardCheck size={18} />} title="Checklist avant trade" />

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-semibold text-white">
                {validatedCount} / {checklistItems.length}
              </div>
              <div className="text-[9px] text-[color:var(--muted)]">
                critères validés
              </div>
            </div>

            <div
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold",
                allValidated
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
              ].join(" ")}
            >
              {checklistPercent}%
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-[color:var(--gold)] transition-all"
            style={{ width: `${checklistPercent}%` }}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <TextField
            label="Actif"
            value={checklist.symbol}
            onChange={(value) =>
              setChecklist((current) => ({
                ...current,
                symbol: value.toUpperCase(),
              }))
            }
            placeholder="XAUUSD"
          />

          <SelectField
            label="Sens"
            value={checklist.direction}
            onChange={(value) =>
              setChecklist((current) => ({
                ...current,
                direction: value as "buy" | "sell",
              }))
            }
          >
            <option value="buy">Achat</option>
            <option value="sell">Vente</option>
          </SelectField>

          <TextField
            label="Timeframe"
            value={checklist.timeframe}
            onChange={(value) =>
              setChecklist((current) => ({
                ...current,
                timeframe: value,
              }))
            }
            placeholder="H4 / M15..."
          />

          <SelectField
            label="Session"
            value={checklist.session}
            onChange={(value) =>
              setChecklist((current) => ({
                ...current,
                session: value,
              }))
            }
          >
            <option value="">Sélectionner</option>
            <option value="asian">Asian</option>
            <option value="london">London</option>
            <option value="new_york">New York</option>
          </SelectField>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ChecklistItem
            checked={checklist.trend_validated}
            label="Tendance validée"
            description="Le sens du trade est cohérent avec ton analyse."
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                trend_validated: !current.trend_validated,
              }))
            }
          />
          <ChecklistItem
            checked={checklist.zone_validated}
            label="Zone validée"
            description="Le prix se trouve dans ta zone de travail."
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                zone_validated: !current.zone_validated,
              }))
            }
          />
          <ChecklistItem
            checked={checklist.setup_validated}
            label="Setup présent"
            description="Ton setup d’entrée est clairement identifié."
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                setup_validated: !current.setup_validated,
              }))
            }
          />
          <ChecklistItem
            checked={checklist.rr_validated}
            label="RR respecté"
            description={`Le trade respecte au minimum ton RR 1:${plan.minimum_rr}.`}
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                rr_validated: !current.rr_validated,
              }))
            }
          />
          <ChecklistItem
            checked={checklist.risk_validated}
            label="Risque respecté"
            description={`Le risque ne dépasse pas ${plan.max_risk_percent}% du capital.`}
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                risk_validated: !current.risk_validated,
              }))
            }
          />
          <ChecklistItem
            checked={checklist.news_checked}
            label="News vérifiées"
            description="Aucune annonce importante imminente n’a été oubliée."
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                news_checked: !current.news_checked,
              }))
            }
          />
          <ChecklistItem
            checked={checklist.plan_respected}
            label="Conforme à mon plan"
            description="Le trade respecte l’ensemble de tes règles personnelles."
            onChange={() =>
              setChecklist((current) => ({
                ...current,
                plan_respected: !current.plan_respected,
              }))
            }
          />
        </div>

        <div className="mt-5">
          <TextareaField
            label="Notes avant trade"
            value={checklist.notes}
            onChange={(value) =>
              setChecklist((current) => ({
                ...current,
                notes: value,
              }))
            }
            placeholder="Pourquoi je souhaite prendre ce trade ?"
          />
        </div>

        <div
          className={[
            "mt-5 flex flex-col gap-4 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between",
            allValidated
              ? "border-emerald-500/20 bg-emerald-500/[0.06]"
              : "border-amber-500/20 bg-amber-500/[0.05]",
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            {allValidated ? (
              <CheckCircle2 size={20} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={20} className="text-amber-300" />
            )}

            <div>
              <div className="text-sm font-semibold text-white">
                {allValidated ? "Checklist complète" : "Checklist incomplète"}
              </div>
              <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                {allValidated
                  ? "Tous les critères de ton plan sont validés."
                  : "Vérifie les critères restants avant ton entrée."}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={savingChecklist}
            onClick={saveChecklist}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-semibold text-black disabled:opacity-50"
          >
            {savingChecklist ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ClipboardCheck size={14} />
            )}
            Enregistrer la checklist
          </button>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle icon={<BarChart3 size={17} />} title="Historique des checklists" />
          <span className="text-[9px] text-white/30">
            {checklistHistory.length} récente(s)
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {checklistHistory.length ? (
            checklistHistory.map((item) => {
              const checks = [
                item.trend_validated,
                item.zone_validated,
                item.setup_validated,
                item.rr_validated,
                item.risk_validated,
                item.news_checked,
                item.plan_respected,
              ];
              const score = Math.round(
                (checks.filter(Boolean).length / checks.length) * 100
              );

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {item.symbol || "Trade sans actif"}
                      </div>
                      <div className="mt-1 text-[9px] text-white/30">
                        {item.created_at
                          ? tradeDateLabel(item.created_at)
                          : "Date indisponible"}
                        {item.session ? ` • ${item.session}` : ""}
                      </div>
                    </div>

                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[9px] font-semibold",
                        item.is_completed
                          ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400"
                          : "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
                      ].join(" ")}
                    >
                      {score}%
                    </span>
                  </div>

                  {item.notes ? (
                    <p className="mt-3 line-clamp-2 text-[9px] leading-4 text-white/35">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              );
            })
          ) : (
            <EmptyState text="Tes prochaines checklists enregistrées apparaîtront ici." />
          )}
        </div>
      </section>
    </div>
  );
}

const inputClass = `
  h-11 w-full rounded-xl border border-[color:var(--border)]
  bg-black/20 px-4 text-sm text-white outline-none
  placeholder:text-white/20 focus:border-[color:var(--gold-border)]
`;

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          {icon}
        </div>
        <div>
          <div className="text-[10px] text-[color:var(--muted)]">{label}</div>
          <div className="mt-1 text-lg font-semibold text-white">{value}</div>
          <div className="mt-1 text-[9px] text-white/35">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function DisciplineRing({ score }: { score: number | null }) {
  const safe = score ?? 0;
  const label =
    score == null
      ? "À mesurer"
      : score >= 85
      ? "Excellent"
      : score >= 70
      ? "Bon"
      : score >= 50
      ? "À renforcer"
      : "Hors plan";

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full border border-[color:var(--gold-border)] bg-black/25">
      <div
        className="absolute inset-2 rounded-full"
        style={{
          background: `conic-gradient(var(--gold) ${safe * 3.6}deg, rgba(255,255,255,.05) 0deg)`,
        }}
      />
      <div className="absolute inset-[14px] rounded-full bg-[#10100e]" />
      <div className="relative text-center">
        <div className="text-2xl font-semibold text-white">
          {score == null ? "—" : score}
          {score != null ? <span className="text-sm text-white/35">/100</span> : null}
        </div>
        <div className="mt-1 text-[9px] font-semibold text-[color:var(--gold)]">
          {label}
        </div>
      </div>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] text-white/40">{label}</span>
        <span className="text-[9px] font-semibold text-white/65">
          {value == null ? "N/D" : pct(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-[color:var(--gold)]"
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

function ResultCompareCard({
  title,
  count,
  pnl,
  positive,
}: {
  title: string;
  count: number;
  pnl: number;
  positive: boolean;
}) {
  const tone =
    pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-white";

  return (
    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-[color:var(--muted)]">{title}</div>
          <div className={`mt-2 text-2xl font-semibold ${tone}`}>
            {pnl > 0 ? "+" : ""}
            {frMoney(pnl)} $US
          </div>
          <div className="mt-1 text-[9px] text-white/30">
            {count} trade{count !== 1 ? "s" : ""}
          </div>
        </div>

        <div
          className={[
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            positive
              ? "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-400"
              : "border-red-500/15 bg-red-500/[0.06] text-red-400",
          ].join(" ")}
        >
          {positive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[color:var(--gold)]">{icon}</span>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-white/60">{children}</div>;
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <label>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative mt-2">
        <input
          type="number"
          step={step}
          min="0"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          className={`${inputClass} pr-12`}
        />
        {suffix ? (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-white/30">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${inputClass} mt-2`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} mt-2`}
      >
        {children}
      </select>
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-2 w-full resize-none rounded-xl border border-[color:var(--border)] bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[color:var(--gold-border)]"
      />
    </label>
  );
}

function TagList({
  values,
  onRemove,
}: {
  values: string[];
  onRemove: (value: string) => void;
}) {
  if (values.length === 0) {
    return <div className="mt-3 text-[10px] text-white/25">Aucun élément ajouté.</div>;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[10px] font-semibold text-[color:var(--gold)]"
        >
          {value}
          <button
            type="button"
            onClick={() => onRemove(value)}
            className="text-white/40 hover:text-white"
          >
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

function ChecklistItem({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={[
        "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
        checked
          ? "border-emerald-500/20 bg-emerald-500/[0.05]"
          : "border-white/[0.06] bg-black/20 hover:border-[color:var(--gold-border)]",
      ].join(" ")}
    >
      <div
        className={[
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
          checked
            ? "border-emerald-500 bg-emerald-500 text-black"
            : "border-white/15 bg-black/20 text-transparent",
        ].join(" ")}
      >
        <Check size={13} />
      </div>

      <div>
        <div className="text-xs font-semibold text-white">{label}</div>
        <p className="mt-1 text-[10px] leading-4 text-[color:var(--muted)]">
          {description}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.07] bg-black/20 p-5 text-center text-[10px] text-[color:var(--muted)]">
      {text}
    </div>
  );
}
