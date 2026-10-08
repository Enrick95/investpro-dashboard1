"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Gauge,
  Layers3,
  Link2,
  Loader2,
  LockKeyhole,
  Pause,
  RefreshCw,
  Repeat2,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Unplug,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

import type { SthStatus } from "@/lib/sth/client";

type SelectedMaster = Record<
  string,
  {
    on: boolean;
    lots: string;
  }
>;

type RiskMode = "fixed" | "mirror" | "balance" | "equity" | "percent";

function cn(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function formatLots(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

export default function CopieurPage() {
  const [status, setStatus] = useState<SthStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Vérification de la connexion…");
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState("");

  const [platform, setPlatform] = useState("MT5");
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [password, setPassword] = useState("");
  const [lots, setLots] = useState("0.01");
  const [maxLots, setMaxLots] = useState(0.1);
  const [consent, setConsent] = useState(false);
  const [masterConsent, setMasterConsent] = useState(false);
  const [disconnectConsent, setDisconnectConsent] = useState(false);

  const [selected, setSelected] = useState<SelectedMaster>({});

  const [riskMode, setRiskMode] = useState<RiskMode>("fixed");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  function accept(next: SthStatus) {
    setStatus(next);

    setSelected(
      Object.fromEntries(
        next.masterAccountsList.map((master) => [
          master.id,
          {
            on: master.userIsSubscribed,
            lots: String(master.lots),
          },
        ])
      )
    );

    setChecked(new Date().toLocaleString("fr-FR"));
    setMasterConsent(false);
    setDisconnectConsent(false);
  }

  async function refresh() {
    setBusy(true);
    setError(false);

    try {
      const response = await fetch("/api/sth", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Connexion indisponible.");
      }

      setEnabled(Boolean(data.enabled));

      if (data.status) {
        accept(data.status);
      }

      if (data.maxLots) {
        setMaxLots(Number(data.maxLots));
      }

      setMessage(data.message || "Statut actualisé.");
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Connexion indisponible."
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function action(payload: Record<string, unknown>) {
    setBusy(true);
    setError(false);

    try {
      const pending = fetch("/api/sth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setPassword("");
      setConsent(false);

      const response = await pending;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Action refusée.");
      }

      accept(data.status);
      setMessage(data.message || "État confirmé.");
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Résultat non confirmé. Actualise le statut avant de réessayer."
      );
    } finally {
      setBusy(false);
    }
  }

  const activeMasters = useMemo(
    () =>
      status?.masterAccountsList.filter(
        (master) => selected[master.id]?.on
      ) ?? [],
    [status, selected]
  );

  const connected = Boolean(status?.isTradingAccountConnected);
  const mastersCount = status?.masterAccountsList.length ?? 0;
  const totalLots = useMemo(
    () =>
      activeMasters.reduce(
        (sum, master) =>
          sum + Number(selected[master.id]?.lots || 0),
        0
      ),
    [activeMasters, selected]
  );

  function toggleMaster(id: string) {
    setSelected((current) => ({
      ...current,
      [id]: {
        ...(current[id] || { lots: "0.01" }),
        on: !current[id]?.on,
      },
    }));
    setMasterConsent(false);
  }

  function updateLots(id: string, value: string) {
    setSelected((current) => ({
      ...current,
      [id]: {
        ...(current[id] || { on: false }),
        lots: value,
      },
    }));
    setMasterConsent(false);
  }

  async function saveMasters() {
    await action({
      action: "masters",
      consent: masterConsent,
      masters: Object.entries(selected)
        .filter(([, value]) => value.on)
        .map(([id, value]) => ({
          id,
          lots: Number(value.lots),
        })),
    });
  }

  return (
    <main className="mx-auto max-w-[1480px] space-y-5 pb-10">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
        <div className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[color:var(--gold)] opacity-[0.08] blur-[110px]" />
        <div className="pointer-events-none absolute bottom-[-180px] left-[18%] h-[300px] w-[520px] rounded-full bg-[color:var(--gold)] opacity-[0.04] blur-[110px]" />

        <div className="relative grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1.3fr_.7fr] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[color:var(--gold)]">
              <Repeat2 size={12} />
              Copier Engine · InvestPro
            </div>

            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-[40px]">
              Un trade.{" "}
              <span className="text-[color:var(--gold)]">
                Plusieurs comptes.
              </span>
              <br />
              Ton risque sous contrôle.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/45">
              Centralise la connexion du copieur, choisis les stratégies
              maîtres et règle chaque réception depuis un seul espace.
              InvestPro reste l’interface de contrôle.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <FeatureBadge
                icon={<ShieldCheck size={12} />}
                label="Connexion sécurisée"
              />
              <FeatureBadge
                icon={<Zap size={12} />}
                label="Copie multi-comptes"
              />
              <FeatureBadge
                icon={<SlidersHorizontal size={12} />}
                label="Risque par stratégie"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 self-stretch">
            <HeroMetric
              label="État du moteur"
              value={connected ? "Connecté" : "Non connecté"}
              tone={connected ? "green" : "muted"}
              icon={<Activity size={17} />}
            />
            <HeroMetric
              label="Stratégies actives"
              value={String(activeMasters.length)}
              tone="gold"
              icon={<Layers3 size={17} />}
            />
            <HeroMetric
              label="Maîtres disponibles"
              value={String(mastersCount)}
              tone="neutral"
              icon={<Copy size={17} />}
            />
            <HeroMetric
              label="Lots configurés"
              value={formatLots(totalLots)}
              tone="neutral"
              icon={<Gauge size={17} />}
            />
          </div>
        </div>
      </section>

      {/* STATUS */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                    connected
                      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
                      : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                  )}
                >
                  {connected ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <Link2 size={19} />
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-white">
                      Connexion du copieur
                    </h2>
                    <StatusPill
                      active={connected}
                      label={connected ? "En ligne" : "À connecter"}
                    />
                  </div>

                  <p className="mt-1 text-[11px] leading-5 text-white/40">
                    {connected
                      ? "Social Trade Hub confirme que ton compte de réception est connecté."
                      : "Relie un compte MetaTrader pour activer le moteur de copie."}
                  </p>

                  <div className="mt-2 text-[9px] text-white/30">
                    Dernière vérification : {checked || "—"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] transition hover:bg-white/[0.05] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Actualiser
              </button>
            </div>

            <div
              className={cn(
                "mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[10px] leading-5",
                error
                  ? "border-red-500/20 bg-red-500/[0.05] text-red-300"
                  : "border-white/[0.06] bg-black/20 text-white/40"
              )}
            >
              {error ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              ) : (
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[color:var(--gold)]" />
              )}
              {message}
            </div>
          </Panel>
        </div>

        <div className="xl:col-span-4">
          <Panel className="h-full">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <ShieldCheck size={15} className="text-[color:var(--gold)]" />
              Sécurité & exécution
            </div>

            <div className="mt-4 space-y-3">
              <SecurityRow
                label="Connexion"
                value={connected ? "Active" : "Inactive"}
                good={connected}
              />
              <SecurityRow
                label="Limite pilote"
                value={`${formatLots(maxLots)} lot max`}
              />
              <SecurityRow
                label="Ordres déjà ouverts"
                value="À vérifier sur MetaTrader"
              />
            </div>
          </Panel>
        </div>
      </section>

      {/* CONNECT */}
      {enabled && !connected ? (
        <Panel>
          <SectionHeading
            eyebrow="ÉTAPE 1"
            title="Relier le compte receveur"
            text="Le compte connecté ici recevra les trades des stratégies sélectionnées."
            icon={<Link2 size={17} />}
          />

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action({
                action: "connect",
                platform,
                login,
                server,
                password,
                lots,
                consent,
              });
            }}
            className="mt-5"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Plateforme">
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className="ip-field"
                >
                  <option>MT5</option>
                  <option>MT4</option>
                </select>
              </Field>

              <Field label="Numéro de compte">
                <input
                  className="ip-field"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{1,15}"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="Ex. 3002159"
                />
              </Field>

              <Field label="Serveur broker">
                <input
                  className="ip-field"
                  required
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  placeholder="Ex. Broker-Live 3"
                  maxLength={200}
                />
              </Field>

              <Field label="Mot de passe MetaTrader">
                <input
                  className="ip-field"
                  required
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={256}
                />
              </Field>

              <Field label="Lot de départ">
                <input
                  className="ip-field"
                  required
                  type="number"
                  min="0.001"
                  max={maxLots}
                  step="any"
                  value={lots}
                  onChange={(event) => setLots(event.target.value)}
                />
              </Field>
            </div>

            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <label className="flex cursor-pointer items-start gap-3 text-[10px] leading-5 text-white/50">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#d4a934]"
                />
                <span>
                  J’autorise la transmission des identifiants à Social Trade
                  Hub et la connexion du copieur, susceptible d’exécuter des
                  ordres sur ce compte.
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[9px] leading-4 text-white/30">
                Les identifiants sont transmis au partenaire pour établir la
                connexion. InvestPro ne les enregistre pas dans sa base.
              </div>

              <button
                disabled={busy || !consent || error}
                type="submit"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}
                Connecter le receveur
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {/* CONNECTED ENGINE */}
      {enabled && connected ? (
        <>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <Panel>
                <SectionHeading
                  eyebrow="COPIER ENGINE"
                  title="Stratégies maîtres"
                  text="Active uniquement les stratégies que tu veux répliquer sur ton compte."
                  icon={<Layers3 size={17} />}
                />

                {mastersCount === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="mt-5 space-y-3">
                    {status?.masterAccountsList.map((master, index) => {
                      const current = selected[master.id] || {
                        on: false,
                        lots: "0.01",
                      };

                      return (
                        <div
                          key={master.id}
                          className={cn(
                            "group rounded-[20px] border p-4 transition",
                            current.on
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                              : "border-white/[0.07] bg-black/20 hover:border-white/[0.12]"
                          )}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                            <button
                              type="button"
                              onClick={() => toggleMaster(master.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <div
                                className={cn(
                                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                                  current.on
                                    ? "border-[color:var(--gold-border)] bg-black/20 text-[color:var(--gold)]"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/35"
                                )}
                              >
                                {current.on ? (
                                  <Check size={18} />
                                ) : (
                                  <Copy size={18} />
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="truncate text-sm font-semibold text-white">
                                    {master.name}
                                  </div>
                                  <span className="rounded-full border border-white/[0.07] bg-black/20 px-2 py-0.5 text-[8px] font-bold uppercase text-white/35">
                                    MASTER {String(index + 1).padStart(2, "0")}
                                  </span>
                                </div>

                                <div className="mt-1 text-[9px] text-white/35">
                                  {current.on
                                    ? "Copie activée"
                                    : "Copie désactivée"}
                                </div>
                              </div>
                            </button>

                            <div className="flex flex-wrap items-end gap-3">
                              <Field label="Mode actif">
                                <div className="flex h-10 min-w-[135px] items-center rounded-xl border border-white/[0.07] bg-black/25 px-3 text-[10px] font-semibold text-[color:var(--gold)]">
                                  Lots fixes
                                </div>
                              </Field>

                              <Field label="Lots">
                                <input
                                  aria-label={`Lots pour ${master.name}`}
                                  type="number"
                                  min="0.001"
                                  step="any"
                                  max={maxLots}
                                  value={current.lots}
                                  onChange={(event) =>
                                    updateLots(master.id, event.target.value)
                                  }
                                  disabled={!current.on}
                                  className="ip-field w-[110px] disabled:opacity-35"
                                />
                              </Field>

                              <button
                                type="button"
                                onClick={() => toggleMaster(master.id)}
                                className={cn(
                                  "mb-[1px] inline-flex h-10 min-w-[92px] items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-semibold transition",
                                  current.on
                                    ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/45"
                                )}
                              >
                                {current.on ? (
                                  <>
                                    <CheckCircle2 size={13} />
                                    Actif
                                  </>
                                ) : (
                                  <>
                                    <Pause size={13} />
                                    Pause
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <label className="flex cursor-pointer items-start gap-3 text-[10px] leading-5 text-white/50">
                    <input
                      type="checkbox"
                      checked={masterConsent}
                      onChange={(event) =>
                        setMasterConsent(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 accent-[#d4a934]"
                    />
                    <span>
                      Je confirme les stratégies et volumes sélectionnés, y
                      compris les désabonnements.
                    </span>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[9px] text-white/30">
                    {activeMasters.length} stratégie(s) active(s) ·{" "}
                    {formatLots(totalLots)} lots configurés
                  </div>

                  <button
                    type="button"
                    disabled={busy || !masterConsent || error}
                    onClick={() => void saveMasters()}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-xs font-semibold text-black disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    Enregistrer la configuration
                  </button>
                </div>
              </Panel>
            </div>

            <div className="space-y-4 xl:col-span-4">
              <Panel>
                <SectionHeading
                  eyebrow="RISK ENGINE"
                  title="Gestion du risque"
                  text="Le moteur partenaire actuel applique les volumes fixes. Les autres modes sont préparés pour le futur moteur InvestPro."
                  icon={<Gauge size={17} />}
                />

                <div className="mt-4 space-y-2">
                  <RiskChoice
                    active={riskMode === "fixed"}
                    label="Lots fixes"
                    description="Opérationnel maintenant"
                    onClick={() => setRiskMode("fixed")}
                  />
                  <RiskChoice
                    active={false}
                    label="Copier les lots de l’envoyeur"
                    description="Nécessite le moteur InvestPro"
                    locked
                    onClick={() => setRiskMode("mirror")}
                  />
                  <RiskChoice
                    active={false}
                    label="Risque par solde"
                    description="Nécessite le calcul de taille en temps réel"
                    locked
                    onClick={() => setRiskMode("balance")}
                  />
                  <RiskChoice
                    active={false}
                    label="Risque par equity"
                    description="Nécessite l’equity live du receveur"
                    locked
                    onClick={() => setRiskMode("equity")}
                  />
                  <RiskChoice
                    active={false}
                    label="Risque en %"
                    description="Nécessite SL + moteur de sizing"
                    locked
                    onClick={() => setRiskMode("percent")}
                  />
                </div>
              </Panel>

              <Panel>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Settings2
                      size={16}
                      className="text-[color:var(--gold)]"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">
                        Réglages avancés
                      </div>
                      <div className="mt-1 text-[9px] text-white/35">
                        Préparation du moteur InvestPro
                      </div>
                    </div>
                  </div>

                  <ChevronDown
                    size={16}
                    className={cn(
                      "text-white/35 transition",
                      advancedOpen && "rotate-180"
                    )}
                  />
                </button>

                {advancedOpen ? (
                  <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                    <PreparedSetting
                      label="Copier Stop Loss"
                      description="Le moteur actuel ne fournit pas ce réglage par abonnement."
                    />
                    <PreparedSetting
                      label="Copier Take Profit"
                      description="Prévu avec le moteur de copie InvestPro."
                    />
                    <PreparedSetting
                      label="Ordres en attente"
                      description="Prévu avec règles de compatibilité broker."
                    />
                    <PreparedSetting
                      label="Slippage maximum"
                      description="Prévu pour protéger l’exécution."
                    />
                    <PreparedSetting
                      label="Protection drawdown"
                      description="Prévu pour suspendre la copie automatiquement."
                    />
                    <PreparedSetting
                      label="Mapping des symboles"
                      description="Prévu pour XAUUSD / GOLD / suffixes brokers."
                    />
                  </div>
                ) : null}
              </Panel>
            </div>
          </section>

          <Panel>
            <SectionHeading
              eyebrow="VUE D’ENSEMBLE"
              title="Configuration actuelle"
              text="Un résumé rapide avant de laisser le copieur tourner."
              icon={<Sparkles size={17} />}
            />

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard
                label="Compte receveur"
                value="Connecté"
                tone="green"
              />
              <SummaryCard
                label="Masters actifs"
                value={String(activeMasters.length)}
              />
              <SummaryCard
                label="Mode risque"
                value="Lots fixes"
              />
              <SummaryCard
                label="Lot total"
                value={formatLots(totalLots)}
              />
            </div>

            <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-300"
                />
                <div>
                  <div className="text-[10px] font-semibold text-white">
                    Contrôle avant utilisation
                  </div>
                  <p className="mt-1 text-[9px] leading-5 text-white/35">
                    Vérifie toujours sur MetaTrader les positions déjà ouvertes,
                    les lots et les paramètres de chaque compte avant d’activer
                    ou modifier une copie.
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <button
              type="button"
              onClick={() => setDisconnectOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/[0.04] text-red-300">
                  <Unplug size={17} />
                </div>

                <div>
                  <div className="text-sm font-semibold text-white">
                    Déconnecter le copieur
                  </div>
                  <div className="mt-1 text-[9px] text-white/35">
                    Action sensible · les positions ouvertes ne sont pas
                    automatiquement clôturées
                  </div>
                </div>
              </div>

              <ChevronDown
                size={16}
                className={cn(
                  "text-white/35 transition",
                  disconnectOpen && "rotate-180"
                )}
              />
            </button>

            {disconnectOpen ? (
              <div className="mt-5 border-t border-white/[0.06] pt-5">
                <p className="max-w-3xl text-[10px] leading-5 text-white/40">
                  Cette action retire les abonnements et déconnecte le compte
                  du service de copie. Vérifie MetaTrader avant et après
                  l’opération.
                </p>

                <label className="mt-4 flex cursor-pointer items-start gap-3 text-[10px] leading-5 text-white/50">
                  <input
                    type="checkbox"
                    checked={disconnectConsent}
                    onChange={(event) =>
                      setDisconnectConsent(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-[#d4a934]"
                  />
                  Je confirme la déconnexion de ce compte.
                </label>

                <button
                  type="button"
                  disabled={busy || !disconnectConsent || error}
                  onClick={() =>
                    void action({
                      action: "disconnect",
                      consent: disconnectConsent,
                    })
                  }
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300 disabled:opacity-40"
                >
                  <Unplug size={14} />
                  Déconnecter
                </button>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      <style jsx global>{`
        .ip-field {
          height: 42px;
          width: 100%;
          min-width: 0;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.28);
          padding: 0 12px;
          color: white;
          font-size: 12px;
          outline: none;
          transition: 160ms ease;
        }

        .ip-field:hover,
        .ip-field:focus {
          border-color: var(--gold-border);
          background: rgba(255, 255, 255, 0.025);
        }

        .ip-field::placeholder {
          color: rgba(255, 255, 255, 0.22);
        }

        .ip-field option {
          background: #0b0d0b;
          color: white;
        }
      `}</style>
    </main>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

function FeatureBadge({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/25 px-3 py-1.5 text-[9px] text-white/45">
      <span className="text-[color:var(--gold)]">{icon}</span>
      {label}
    </span>
  );
}

function HeroMetric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "green" | "gold" | "muted" | "neutral";
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-black/25 p-4">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl border",
          tone === "green" &&
            "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400",
          tone === "gold" &&
            "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
          (tone === "neutral" || tone === "muted") &&
            "border-white/[0.07] bg-white/[0.02] text-white/40"
        )}
      >
        {icon}
      </div>
      <div className="mt-3 text-[9px] uppercase tracking-[0.1em] text-white/25">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "green"
            ? "text-emerald-400"
            : tone === "gold"
            ? "text-[color:var(--gold)]"
            : tone === "muted"
            ? "text-white/45"
            : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase",
        active
          ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
          : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
      )}
    >
      {label}
    </span>
  );
}

function SecurityRow({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
      <span className="text-[9px] text-white/35">{label}</span>
      <span
        className={cn(
          "text-[9px] font-semibold",
          good ? "text-emerald-400" : "text-white/65"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
  icon,
}: {
  eyebrow: string;
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div>
        <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-[10px] leading-5 text-white/35">{text}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[9px] font-medium text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

function RiskChoice({
  active,
  label,
  description,
  locked = false,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
        active
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.06] bg-black/20",
        locked && "cursor-not-allowed opacity-45"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
          active
            ? "border-[color:var(--gold-border)] bg-black/20 text-[color:var(--gold)]"
            : "border-white/[0.07] text-white/30"
        )}
      >
        {locked ? <LockKeyhole size={13} /> : <Target size={13} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold text-white">{label}</div>
        <div className="mt-0.5 text-[8px] leading-4 text-white/30">
          {description}
        </div>
      </div>

      {active ? (
        <CheckCircle2 size={14} className="text-emerald-400" />
      ) : null}
    </button>
  );
}

function PreparedSetting({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div>
        <div className="text-[9px] font-semibold text-white/55">{label}</div>
        <div className="mt-1 text-[8px] leading-4 text-white/25">
          {description}
        </div>
      </div>

      <span className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-[7px] font-bold uppercase text-white/25">
        Prévu
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green";
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[8px] uppercase tracking-[0.1em] text-white/25">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-sm font-semibold",
          tone === "green" ? "text-emerald-400" : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-white/[0.08] bg-black/20 p-8 text-center">
      <Copy size={24} className="mx-auto text-white/15" />
      <div className="mt-3 text-xs font-semibold text-white">
        Aucun compte maître disponible
      </div>
      <div className="mt-1 text-[9px] text-white/30">
        Social Trade Hub ne renvoie aucune stratégie maître pour le moment.
      </div>
    </div>
  );
}
