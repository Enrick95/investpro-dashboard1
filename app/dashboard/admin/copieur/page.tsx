"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type RequestRow = {
  id: string;
  provider_user_id: string;
  provider_master_id?: string;
  alias: string;
  broker: string;
  platform: string;
  login: string;
  server: string;
  note: string;
  status: string;
  admin_note: string;
  created_at: string;
  activated_at: string | null;
  member: {
    username: string;
    email: string;
    plan: string;
  };
};

type ConfigRow = {
  id: string;
  receiver_id: string;
  status: "pending" | "processing" | "applied" | "rejected";
  admin_note: string;
  created_at: string;
  applied_at: string | null;
  requested_config: {
    masters?: Array<{ id: string; name: string; lots: number }>;
    risk?: Record<string, unknown>;
  };
  receiver: {
    id: string;
    alias: string;
    platform: string;
    login: string;
    server: string;
    provider_user_id: string | null;
  } | null;
  member: {
    username: string;
    email: string;
    plan: string;
  };
};


const statusLabel: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  activated: "Activé",
  rejected: "Refusé",
};

export default function AdminCopierRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [configNotes, setConfigNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [masterIds, setMasterIds] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function headers(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/copier-requests", {
        headers: await headers(),
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Chargement impossible.");

      setRows(data.requests || []);
      setMasterIds((previous) => ({
        ...Object.fromEntries((data.requests || []).map((row: RequestRow) => [row.id, row.provider_master_id || ""])),
        ...previous,
      }));
      setNotes(
        Object.fromEntries(
          (data.requests || []).map((row: RequestRow) => [
            row.id,
            row.admin_note || "",
          ])
        )
      );


      const configResponse = await fetch("/api/admin/copier-config-requests", {
        headers: await headers(),
        cache: "no-store",
      });
      const configData = await configResponse.json();
      if (!configResponse.ok) {
        throw new Error(configData.error || "Chargement des configurations impossible.");
      }
      setConfigRows(configData.requests || []);
      setConfigNotes(
        Object.fromEntries(
          (configData.requests || []).map((row: ConfigRow) => [
            row.id,
            row.admin_note || "",
          ])
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 20_000);

    return () => window.clearInterval(interval);
  }, []);

  async function reveal(id: string) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch("/api/admin/copier-requests", {
        method: "POST",
        headers: {
          ...(await headers()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reveal", id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lecture impossible.");
      setRevealed((current) => ({ ...current, [id]: data.password }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
    } finally {
      setBusyId(null);
    }
  }

  async function assignMaster(row: RequestRow) {
    setBusyId(row.id); setError("");
    try {
      const response = await fetch("/api/admin/copier-requests", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_master", id: row.id, master_id: masterIds[row.id] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Association impossible.");
      await load(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur."); }
    finally { setBusyId(null); }
  }

  async function update(row: RequestRow, status: string) {
    setBusyId(row.id);
    setError("");

    try {
      const response = await fetch("/api/admin/copier-requests", {
        method: "PATCH",
        headers: {
          ...(await headers()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: row.id,
          status,
          admin_note: notes[row.id] || "",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mise à jour impossible.");

      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateConfig(row: ConfigRow, status: string) {
    setBusyId(row.id);
    setError("");
    try {
      const response = await fetch("/api/admin/copier-config-requests", {
        method: "PATCH",
        headers: {
          ...(await headers()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: row.id,
          status,
          admin_note: configNotes[row.id] || "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mise à jour impossible.");
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = rows.filter((row) => ["pending", "processing"].includes(row.status)).length;
  const pendingConfigs = configRows.filter((row) => ["pending", "processing"].includes(row.status)).length;

  return (
    <main className="space-y-5">
      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              COPIER ENGINE · ADMIN
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Copieur · activations & réglages
            </h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Active les comptes puis applique manuellement les réglages demandés dans Social Trade Hub.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">Activations</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">{pending}</div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">Réglages</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">{pendingConfigs}</div>
            </div>
            <button
              onClick={() => void load()}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
            >
              <RefreshCw size={14} />
              Actualiser
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-52 items-center justify-center">
          <Loader2 className="animate-spin text-[color:var(--gold)]" />
        </div>
      ) : rows.length === 0 ? (
        <section className="rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)] p-10 text-center">
          <ShieldCheck className="mx-auto text-white/20" />
          <div className="mt-3 text-sm font-semibold text-white">
            Aucune demande
          </div>
          <div className="mt-1 text-xs text-white/35">
            Les demandes envoyées depuis le Copier Engine apparaîtront ici.
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <section
              key={row.id}
              className="rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)] p-5 md:p-6"
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">
                      {row.alias}
                    </h2>
                    <Status status={row.status} />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-white/40">
                    <span>{row.platform} · {row.login}</span>
                    <span>{row.server}</span>
                    {row.broker ? <span>{row.broker}</span> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Info
                      icon={<UserRound size={14} />}
                      label="Membre"
                      value={`${row.member.username} · ${row.member.email}`}
                    />
                    <Info
                      icon={<Clock3 size={14} />}
                      label="Demande"
                      value={new Date(row.created_at).toLocaleString("fr-FR")}
                    />
                  </div>

                  {row.note ? (
                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="text-[8px] uppercase text-white/25">
                        Message du membre
                      </div>
                      <div className="mt-2 text-[10px] leading-5 text-white/55">
                        {row.note}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="w-full xl:w-[430px]">
                  <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
                    <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--gold)]">
                      Identifiant Social Trade Hub
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="min-w-0 flex-1 break-all text-[10px] text-white/65">
                        {row.provider_user_id}
                      </code>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(row.provider_user_id)
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08]"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                    <p className="mt-2 text-[8px] leading-4 text-white/30">
                      Utilise exactement cet identifiant quand tu crées/associes
                      le receveur dans Social Trade Hub.
                    </p>
                  </div>

                  {row.status === "activated" && (
                    <div className="mt-3 rounded-2xl border border-[color:var(--gold-border)] p-4">
                      <label className="block text-xs font-semibold text-white">Master du client — ID réel de l’envoyeur</label>
                      <p className="mt-1 text-[10px] text-white/50">Copie l’identifiant exact de l’envoyeur depuis la plateforme interne. Pas le numéro MT4, ni l’identifiant du receveur.</p>
                      <input value={masterIds[row.id] || ""} onChange={(e) => setMasterIds((cur) => ({ ...cur, [row.id]: e.target.value }))}
                        placeholder="ID du Master" className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white" />
                      <button disabled={busyId === row.id || !masterIds[row.id]?.trim()} onClick={() => void assignMaster(row)}
                        className="mt-2 rounded-lg bg-[color:var(--gold)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">Associer ce Master au client</button>
                    </div>
                  )}
                  <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[8px] uppercase text-white/25">
                          Mot de passe MetaTrader
                        </div>
                        <div className="mt-2 font-mono text-xs text-white/70">
                          {revealed[row.id] || "••••••••••••"}
                        </div>
                      </div>
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void reveal(row.id)}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-[10px] font-semibold text-white/60"
                      >
                        <Eye size={13} />
                        Afficher
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                <textarea
                  value={notes[row.id] || ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [row.id]: event.target.value,
                    }))
                  }
                  placeholder="Note interne admin…"
                  className="min-h-20 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-white outline-none"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={busyId === row.id}
                    onClick={() => void update(row, "processing")}
                    className="h-10 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 text-xs font-semibold text-amber-300"
                  >
                    En cours
                  </button>
                  <button
                    disabled={busyId === row.id}
                    onClick={() => void update(row, "activated")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 text-xs font-semibold text-emerald-400"
                  >
                    <CheckCircle2 size={14} />
                    Marquer activé
                  </button>
                  <button
                    disabled={busyId === row.id}
                    onClick={() => void update(row, "rejected")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300"
                  >
                    <XCircle size={14} />
                    Refuser
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}


      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">CONFIGURATIONS CLIENTS</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Réglages à appliquer dans Social Trade Hub</h2>
            <p className="mt-1 text-xs text-white/35">Recopie exactement ces paramètres dans STH, puis confirme uniquement quand c’est réellement appliqué.</p>
          </div>
          <div className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-bold text-[color:var(--gold)]">{pendingConfigs} à traiter</div>
        </div>
      </section>

      {configRows.length === 0 ? (
        <section className="rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)] p-8 text-center text-xs text-white/35">Aucune configuration client en attente.</section>
      ) : (
        <div className="space-y-4">
          {configRows.map((row) => {
            const risk = (row.requested_config?.risk || {}) as Record<string, any>;
            const masters = row.requested_config?.masters || [];
            return (
              <section key={row.id} className="rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)] p-5 md:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{row.receiver?.alias || "Compte receveur"}</h3>
                      <ConfigStatus status={row.status} />
                    </div>
                    <div className="mt-2 text-[10px] text-white/40">
                      {row.member.username} · {row.member.email} · {row.receiver?.platform} {row.receiver?.login} · {row.receiver?.server}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <ConfigInfo label="Mode de risque" value={riskModeAdmin(String(risk.mode || "fixed"))} />
                      <ConfigInfo label="Valeur" value={riskValueAdmin(risk)} />
                      <ConfigInfo label="Lots maximum" value={`${Number(risk.max_lots || 100)} lots`} />
                      <ConfigInfo label="Stop Loss" value={risk.copy_sl === false ? "Ne pas copier" : "Copier"} />
                      <ConfigInfo label="Take Profit" value={risk.copy_tp === false ? "Ne pas copier" : "Copier"} />
                      <ConfigInfo label="Pending orders" value={risk.copy_pending === false ? "Non" : "Oui"} />
                      <ConfigInfo label="Modifications SL/TP" value={risk.copy_modifications === false ? "Non" : "Oui"} />
                      <ConfigInfo label="Slippage max" value={`${Number(risk.slippage_pips || 0)} pips`} />
                      <ConfigInfo label="Protection drawdown" value={risk.drawdown_enabled ? `${Number(risk.max_drawdown_percent || 0)} %` : "Désactivée"} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/25">STRATÉGIES À ACTIVER</div>
                      <div className="mt-3 space-y-2">
                        {masters.map((master) => (
                          <div key={master.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2">
                            <div><div className="text-[10px] font-semibold text-white">{master.name}</div><div className="mt-0.5 text-[8px] text-white/25">{master.id}</div></div>
                            <div className="text-[10px] font-semibold text-[color:var(--gold)]">{risk.mode === "fixed" ? `${master.lots} lots` : riskModeAdmin(String(risk.mode || "fixed"))}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {risk.symbol_mapping ? (
                      <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <div className="text-[8px] uppercase text-white/25">Mapping symboles</div>
                        <pre className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-white/55">{String(risk.symbol_mapping)}</pre>
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full xl:w-[360px]">
                    <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
                      <div className="text-[9px] font-semibold text-white">Checklist avant confirmation</div>
                      <div className="mt-3 space-y-2 text-[9px] leading-5 text-white/45">
                        <div>1. Ouvrir le receveur dans Social Trade Hub.</div>
                        <div>2. Sélectionner exactement les masters ci-contre.</div>
                        <div>3. Reproduire le mode de risque et sa valeur.</div>
                        <div>4. Reproduire SL / TP / pending / protections.</div>
                        <div>5. Vérifier une dernière fois puis confirmer ici.</div>
                      </div>
                    </div>

                    <textarea
                      value={configNotes[row.id] || ""}
                      onChange={(event) => setConfigNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                      placeholder="Note interne admin…"
                      className="mt-3 min-h-20 w-full rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-white outline-none"
                    />

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <button disabled={busyId === row.id} onClick={() => void updateConfig(row, "processing")} className="h-10 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 text-xs font-semibold text-amber-300">Je commence l’application</button>
                      <button disabled={busyId === row.id} onClick={() => void updateConfig(row, "applied")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 text-xs font-semibold text-emerald-400"><CheckCircle2 size={14} /> Configuration appliquée dans STH</button>
                      <button disabled={busyId === row.id} onClick={() => void updateConfig(row, "rejected")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300"><XCircle size={14} /> Demander une correction</button>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function riskModeAdmin(mode: string) {
  if (mode === "mirror") return "Copier les lots envoyeur";
  if (mode === "balance") return "Risque par solde";
  if (mode === "equity") return "Risque par equity";
  if (mode === "percent") return "Risque en %";
  return "Lots fixes";
}

function riskValueAdmin(risk: Record<string, any>) {
  if (risk.mode === "mirror") return `${Number(risk.mirror_multiplier || 1)} ×`;
  if (risk.mode === "balance") return `${Number(risk.balance_multiplier || 1)} × balance`;
  if (risk.mode === "equity") return `${Number(risk.equity_multiplier || 1)} × equity`;
  if (risk.mode === "percent") return `${Number(risk.risk_percent || 1)} % / trade`;
  return "Lots définis par stratégie";
}

function ConfigStatus({ status }: { status: ConfigRow["status"] }) {
  const labels = { pending: "À appliquer", processing: "En cours", applied: "Appliquée", rejected: "À corriger" } as const;
  return <span className={["rounded-full border px-2 py-1 text-[8px] font-bold uppercase", status === "applied" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400" : status === "rejected" ? "border-red-500/20 bg-red-500/[0.05] text-red-300" : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"].join(" ")}>{labels[status]}</span>;
}

function ConfigInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="text-[8px] uppercase text-white/25">{label}</div><div className="mt-2 text-[10px] font-semibold text-white/65">{value}</div></div>;
}

function Status({ status }: { status: string }) {
  const active = status === "activated";
  const rejected = status === "rejected";
  return (
    <span
      className={[
        "rounded-full border px-2 py-1 text-[8px] font-bold uppercase",
        active
          ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
          : rejected
          ? "border-red-500/20 bg-red-500/[0.05] text-red-300"
          : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
      ].join(" ")}
    >
      {statusLabel[status] || status}
    </span>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center gap-2 text-[8px] uppercase text-white/25">
        {icon}
        {label}
      </div>
      <div className="mt-2 break-all text-[10px] text-white/60">{value}</div>
    </div>
  );
}
