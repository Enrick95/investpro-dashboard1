"use client";

import { useMemo, useState } from "react";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";

type RiskMode = "percent" | "amount";

function safeNumber(value: string) {
  const number = Number(String(value).replace(",", "."));

  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export default function SimulateurRisquePage() {
  const [currency, setCurrency] = useState("EUR");

  const [balance, setBalance] = useState("10000");

  const [riskMode, setRiskMode] =
    useState<RiskMode>("percent");

  const [riskPercent, setRiskPercent] =
    useState("1");

  const [riskAmount, setRiskAmount] =
    useState("100");

  /*
   * L'utilisateur entre maintenant directement :
   * - son prix d'entrée
   * - son Stop Loss
   *
   * Le simulateur calcule automatiquement
   * la distance entre les deux.
   */
  const [entryPrice, setEntryPrice] =
    useState("2350");

  const [stopLossPrice, setStopLossPrice] =
    useState("2340");

  /*
   * Valeur monétaire d'un mouvement de prix de 1.00
   * pour 1 lot.
   *
   * Cette valeur dépend du symbole et du broker.
   * Elle pourra être automatisée plus tard avec MT5.
   */
  const [valuePerPoint, setValuePerPoint] =
    useState("10");

  const [rr, setRr] = useState("2");

  const calculated = useMemo(() => {
    const capital = Math.max(
      0,
      safeNumber(balance)
    );

    const riskPercentage = Math.max(
      0,
      safeNumber(riskPercent)
    );

    const fixedRisk = Math.max(
      0,
      safeNumber(riskAmount)
    );

    const entry = Math.max(
      0,
      safeNumber(entryPrice)
    );

    const stopLoss = Math.max(
      0,
      safeNumber(stopLossPrice)
    );

    /*
     * Exemple :
     *
     * Entrée : 2350
     * SL : 2340
     *
     * Distance = 10
     */
    const stopDistance = Math.abs(
      entry - stopLoss
    );

    const pointValue = Math.max(
      0,
      safeNumber(valuePerPoint)
    );

    const riskMoney =
      riskMode === "percent"
        ? capital *
          (riskPercentage / 100)
        : fixedRisk;

    const effectiveRiskPercent =
      capital > 0
        ? (riskMoney / capital) * 100
        : 0;

    /*
     * Perte avec 1 lot si le SL est touché
     *
     * Exemple :
     * Distance = 10
     * Valeur = 10€
     *
     * => 100€ pour 1 lot
     */
    const lossPerLot =
      stopDistance * pointValue;

    /*
     * Taille de position permettant
     * de respecter exactement le risque.
     */
    const lotSize =
      lossPerLot > 0
        ? riskMoney / lossPerLot
        : 0;

    const targetRR = Math.max(
      0,
      safeNumber(rr)
    );

    const gain1R = riskMoney;

    const gain2R =
      riskMoney * 2;

    const gain3R =
      riskMoney * 3;

    const potentialGain =
      riskMoney * targetRR;

    /*
     * Prix du TP calculé automatiquement.
     *
     * Si le SL est sous l'entrée :
     * on considère un BUY.
     *
     * Si le SL est au-dessus :
     * on considère un SELL.
     */
    const isBuy =
      stopLoss < entry;

    const takeProfit =
      entry > 0 &&
      stopDistance > 0 &&
      targetRR > 0
        ? isBuy
          ? entry +
            stopDistance *
              targetRR
          : entry -
            stopDistance *
              targetRR
        : 0;

    const capitalAfterLoss = Math.max(
      0,
      capital - riskMoney
    );

    const capitalAfterWin =
      capital + potentialGain;

    let riskLevel:
      | "safe"
      | "medium"
      | "high" = "safe";

    if (
      effectiveRiskPercent > 2
    ) {
      riskLevel = "high";
    } else if (
      effectiveRiskPercent > 1
    ) {
      riskLevel = "medium";
    }

    return {
      capital,

      entry,

      stopLoss,

      stopDistance,

      isBuy,

      takeProfit,

      riskMoney,

      effectiveRiskPercent,

      pointValue,

      lossPerLot,

      lotSize,

      targetRR,

      gain1R,

      gain2R,

      gain3R,

      potentialGain,

      capitalAfterLoss,

      capitalAfterWin,

      riskLevel,
    };
  }, [
    balance,
    riskMode,
    riskPercent,
    riskAmount,
    entryPrice,
    stopLossPrice,
    valuePerPoint,
    rr,
  ]);

  function resetSimulator() {
    setCurrency("EUR");

    setBalance("10000");

    setRiskMode("percent");

    setRiskPercent("1");

    setRiskAmount("100");

    setEntryPrice("2350");

    setStopLossPrice("2340");

    setValuePerPoint("10");

    setRr("2");
  }

  function selectRisk(value: string) {
    setRiskMode("percent");

    setRiskPercent(value);
  }

  return (
    <div className="space-y-5 pb-10">
      {/* HEADER */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Simulateur de{" "}
            <span className="text-[color:var(--gold)]">
              risque
            </span>
          </h1>

          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Entre ton prix d’entrée,
            ton Stop Loss et ton risque.
            InvestPro calcule automatiquement
            ta taille de position.
          </p>
        </div>

        <button
          type="button"
          onClick={resetSimulator}
          className="
            inline-flex
            h-10
            items-center
            gap-2
            rounded-xl
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            px-4
            text-xs
            text-white/70
            transition
            hover:bg-white/[0.04]
            hover:text-white
          "
        >
          <RotateCcw size={14} />

          Réinitialiser
        </button>
      </div>

      {/* KPI */}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={
            <ShieldCheck size={18} />
          }
          label="Risque maximum"
          value={`${formatNumber(
            calculated.riskMoney
          )} ${currency}`}
          sub={`${formatNumber(
            calculated.effectiveRiskPercent
          )}% du capital`}
        />

        <StatCard
          icon={
            <Calculator size={18} />
          }
          label="Taille de position"
          value={
            calculated.lotSize > 0
              ? `${formatNumber(
                  calculated.lotSize,
                  4
                )} lot`
              : "—"
          }
          sub="Calculée avec Entrée + SL"
        />

        <StatCard
          icon={
            <Target size={18} />
          }
          label="Take Profit estimé"
          value={
            calculated.takeProfit > 0
              ? formatNumber(
                  calculated.takeProfit,
                  5
                )
              : "—"
          }
          sub={`Objectif ${formatNumber(
            calculated.targetRR
          )}R`}
        />

        <StatCard
          icon={
            <TrendingUp size={18} />
          }
          label="Gain potentiel"
          value={`+${formatNumber(
            calculated.potentialGain
          )} ${currency}`}
          sub={`Risk / Reward 1:${formatNumber(
            calculated.targetRR
          )}`}
        />
      </section>

      {/* MAIN */}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* CALCULATOR */}

        <div
          className="
            xl:col-span-8
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
            p-5
          "
        >
          <div>
            <h2 className="text-base font-semibold text-white">
              Calcul de position
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Renseigne les paramètres
              du trade que tu veux prendre.
            </p>
          </div>

          {/* RISK PRESETS */}

          <div className="mt-6">
            <div className="mb-2 text-xs text-white/60">
              Risque rapide
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                "0.5",
                "1",
                "1.5",
                "2",
              ].map((value) => {
                const active =
                  riskMode ===
                    "percent" &&
                  riskPercent ===
                    value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      selectRisk(value)
                    }
                    className={[
                      "h-9 rounded-xl border px-4 text-xs font-semibold transition",

                      active
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                        : "border-[color:var(--border)] bg-black/20 text-white/60 hover:text-white",
                    ].join(" ")}
                  >
                    {value}%
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* CAPITAL */}

            <Field
              label="Capital"
              value={balance}
              onChange={setBalance}
              suffix={currency}
              placeholder="10000"
            />

            {/* CURRENCY */}

            <SelectField
              label="Devise du compte"
              value={currency}
              onChange={setCurrency}
            >
              <option value="EUR">
                EUR
              </option>

              <option value="USD">
                USD
              </option>

              <option value="GBP">
                GBP
              </option>
            </SelectField>

            {/* RISK MODE */}

            <SelectField
              label="Type de risque"
              value={riskMode}
              onChange={(value) =>
                setRiskMode(
                  value as RiskMode
                )
              }
            >
              <option value="percent">
                Pourcentage du capital
              </option>

              <option value="amount">
                Montant fixe
              </option>
            </SelectField>

            {riskMode ===
            "percent" ? (
              <Field
                label="Risque"
                value={riskPercent}
                onChange={
                  setRiskPercent
                }
                suffix="%"
                placeholder="1"
              />
            ) : (
              <Field
                label="Montant à risquer"
                value={riskAmount}
                onChange={
                  setRiskAmount
                }
                suffix={currency}
                placeholder="100"
              />
            )}

            {/* ENTRY */}

            <Field
              label="Prix d’entrée"
              value={entryPrice}
              onChange={
                setEntryPrice
              }
              placeholder="2350.50"
            />

            {/* STOP LOSS */}

            <Field
              label="Stop Loss"
              value={stopLossPrice}
              onChange={
                setStopLossPrice
              }
              placeholder="2340.00"
            />

            {/* DISTANCE */}

            <div
              className="
                md:col-span-2
                flex
                items-center
                justify-between
                rounded-xl
                border border-white/[0.05]
                bg-black/20
                px-4 py-3
              "
            >
              <div>
                <div className="text-xs text-[color:var(--muted)]">
                  Distance entrée → SL
                </div>

                <div className="mt-1 text-[10px] text-white/30">
                  Calcul automatique
                </div>
              </div>

              <div className="text-lg font-semibold text-[color:var(--gold)]">
                {formatNumber(
                  calculated.stopDistance,
                  5
                )}
              </div>
            </div>

            {/* AUTO SIDE */}

            <div
              className="
                md:col-span-2
                flex
                items-center
                justify-between
                rounded-xl
                border border-white/[0.05]
                bg-black/20
                px-4 py-3
              "
            >
              <span className="text-xs text-[color:var(--muted)]">
                Sens détecté
              </span>

              <span
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold",

                  calculated.stopLoss <
                  calculated.entry
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : calculated.stopLoss >
                      calculated.entry
                    ? "border-red-500/20 bg-red-500/10 text-red-400"
                    : "border-white/10 bg-white/5 text-white/40",
                ].join(" ")}
              >
                {calculated.stopLoss <
                calculated.entry
                  ? "ACHAT"
                  : calculated.stopLoss >
                    calculated.entry
                  ? "VENTE"
                  : "—"}
              </span>
            </div>

            {/* POINT VALUE */}

            <Field
              label="Valeur d’un mouvement de prix de 1.00 pour 1 lot"
              value={valuePerPoint}
              onChange={
                setValuePerPoint
              }
              suffix={currency}
              placeholder="10"
            />

            {/* AUTO TP */}

            <div>
              <div className="mb-2 text-xs text-white/60">
                Take Profit calculé
              </div>

              <div
                className="
                  flex
                  h-11
                  items-center
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  px-4
                  text-sm
                  font-semibold
                  text-[color:var(--gold)]
                "
              >
                {calculated.takeProfit >
                0
                  ? formatNumber(
                      calculated.takeProfit,
                      5
                    )
                  : "—"}
              </div>
            </div>

            {/* RR */}

            <div className="md:col-span-2">
              <div className="mb-2 text-xs text-white/60">
                Ratio visé
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  "1",
                  "1.5",
                  "2",
                  "3",
                ].map(
                  (value) => {
                    const active =
                      rr === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setRr(
                            value
                          )
                        }
                        className={[
                          "h-11 rounded-xl border text-sm font-semibold transition",

                          active
                            ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                            : "border-[color:var(--border)] bg-black/20 text-white/60 hover:text-white",
                        ].join(
                          " "
                        )}
                      >
                        {value}R
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* IMPORTANT */}

          <div
            className="
              mt-6
              flex gap-3
              rounded-2xl
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              p-4
            "
          >
            <AlertTriangle
              size={17}
              className="mt-0.5 shrink-0 text-[color:var(--gold)]"
            />

            <div>
              <div className="text-xs font-semibold text-white">
                Calcul de la taille de position
              </div>

              <p className="mt-1 text-[11px] leading-5 text-[color:var(--muted)]">
                Le risque en euros est calculé
                automatiquement avec ton capital.
                La taille de position dépend ensuite
                de la distance entre ton entrée et ton
                Stop Loss ainsi que de la valeur du
                mouvement de prix pour ton broker.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT */}

        <div className="xl:col-span-4 space-y-4">
          {/* RISK HEALTH */}

          <div
            className="
              rounded-[22px]
              border border-[color:var(--border)]
              bg-[color:var(--panel)]
              p-5
            "
          >
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={17}
                className="text-[color:var(--gold)]"
              />

              <h2 className="text-sm font-semibold text-white">
                Gestion du risque
              </h2>
            </div>

            <div
              className={[
                "mt-5 rounded-2xl border p-4",

                calculated.riskLevel ===
                "safe"
                  ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                  : calculated.riskLevel ===
                    "medium"
                  ? "border-amber-500/20 bg-amber-500/[0.06]"
                  : "border-red-500/20 bg-red-500/[0.06]",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                {calculated.riskLevel ===
                "safe" ? (
                  <CheckCircle2
                    size={19}
                    className="text-emerald-400"
                  />
                ) : (
                  <AlertTriangle
                    size={19}
                    className={
                      calculated.riskLevel ===
                      "medium"
                        ? "text-amber-400"
                        : "text-red-400"
                    }
                  />
                )}

                <div>
                  <div className="text-sm font-semibold text-white">
                    {calculated.riskLevel ===
                    "safe"
                      ? "Risque maîtrisé"
                      : calculated.riskLevel ===
                        "medium"
                      ? "Risque modéré"
                      : "Risque élevé"}
                  </div>

                  <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                    {formatNumber(
                      calculated.effectiveRiskPercent
                    )}
                    % de ton capital
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <ResultRow
                label="Perte au SL"
                value={`-${formatNumber(
                  calculated.riskMoney
                )} ${currency}`}
                type="loss"
              />

              <ResultRow
                label="Gain à 1R"
                value={`+${formatNumber(
                  calculated.gain1R
                )} ${currency}`}
                type="win"
              />

              <ResultRow
                label="Gain à 2R"
                value={`+${formatNumber(
                  calculated.gain2R
                )} ${currency}`}
                type="win"
              />

              <ResultRow
                label="Gain à 3R"
                value={`+${formatNumber(
                  calculated.gain3R
                )} ${currency}`}
                type="win"
              />
            </div>
          </div>

          {/* ACCOUNT IMPACT */}

          <div
            className="
              rounded-[22px]
              border border-[color:var(--border)]
              bg-[color:var(--panel)]
              p-5
            "
          >
            <div className="flex items-center gap-2">
              <WalletCards
                size={17}
                className="text-[color:var(--gold)]"
              />

              <h2 className="text-sm font-semibold text-white">
                Impact sur le compte
              </h2>
            </div>

            <div className="mt-5 space-y-3">
              <ResultRow
                label="Capital actuel"
                value={`${formatNumber(
                  calculated.capital
                )} ${currency}`}
              />

              <ResultRow
                label="Après un SL"
                value={`${formatNumber(
                  calculated.capitalAfterLoss
                )} ${currency}`}
                type="loss"
              />

              <ResultRow
                label={`Après TP ${formatNumber(
                  calculated.targetRR
                )}R`}
                value={`${formatNumber(
                  calculated.capitalAfterWin
                )} ${currency}`}
                type="win"
              />
            </div>
          </div>

          {/* POSITION */}

          <div
            className="
              rounded-[22px]
              border border-[color:var(--gold-border)]
              bg-gradient-to-br
              from-[color:var(--gold-soft)]
              to-transparent
              p-5
            "
          >
            <div className="text-xs text-[color:var(--muted)]">
              Taille recommandée
            </div>

            <div className="mt-2 text-3xl font-semibold text-[color:var(--gold)]">
              {calculated.lotSize >
              0
                ? formatNumber(
                    calculated.lotSize,
                    4
                  )
                : "—"}
            </div>

            <div className="mt-1 text-xs text-white/50">
              lot / contrat indicatif
            </div>

            <div className="mt-5 border-t border-white/[0.06] pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[color:var(--muted)]">
                  Entrée
                </span>

                <span className="text-xs font-semibold text-white">
                  {formatNumber(
                    calculated.entry,
                    5
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[color:var(--muted)]">
                  Stop Loss
                </span>

                <span className="text-xs font-semibold text-red-400">
                  {formatNumber(
                    calculated.stopLoss,
                    5
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[color:var(--muted)]">
                  Take Profit
                </span>

                <span className="text-xs font-semibold text-emerald-400">
                  {calculated.takeProfit >
                  0
                    ? formatNumber(
                        calculated.takeProfit,
                        5
                      )
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

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
    <div
      className="
        rounded-2xl
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
      "
    >
      <div className="flex items-center gap-3">
        <div
          className="
            flex h-10 w-10
            shrink-0
            items-center justify-center
            rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          {icon}
        </div>

        <div>
          <div className="text-[10px] text-[color:var(--muted)]">
            {label}
          </div>

          <div className="mt-1 text-lg font-semibold text-white">
            {value}
          </div>

          <div className="mt-1 text-[9px] text-white/35">
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
      </div>

      <div className="relative">
        <input
          value={value}
          inputMode="decimal"
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={placeholder}
          className="
            h-11
            w-full
            rounded-xl
            border border-[color:var(--border)]
            bg-black/20
            px-4
            pr-20
            text-sm
            text-white
            outline-none
            placeholder:text-white/20
            focus:border-[color:var(--gold-border)]
          "
        />

        {suffix ? (
          <span
            className="
              pointer-events-none
              absolute
              right-4
              top-1/2
              -translate-y-1/2
              text-[10px]
              text-white/35
            "
          >
            {suffix}
          </span>
        ) : null}
      </div>
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
  onChange: (
    value: string
  ) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
      </div>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="
          h-11
          w-full
          rounded-xl
          border border-[color:var(--border)]
          bg-black/20
          px-4
          text-sm
          text-white
          outline-none
          focus:border-[color:var(--gold-border)]
        "
      >
        {children}
      </select>
    </label>
  );
}

function ResultRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type?: "win" | "loss";
}) {
  return (
    <div
      className="
        flex items-center justify-between
        rounded-xl
        border border-white/[0.05]
        bg-black/20
        px-3 py-3
      "
    >
      <span className="text-[11px] text-[color:var(--muted)]">
        {label}
      </span>

      <span
        className={[
          "text-xs font-semibold",

          type === "win"
            ? "text-emerald-400"
            : type === "loss"
            ? "text-red-400"
            : "text-white",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}