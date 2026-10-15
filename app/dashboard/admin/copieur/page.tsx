"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
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
import CopierDeliveryFailures from "@/components/admin/CopierDeliveryFailures";
import CopierMasterRemovalRequests from "@/components/admin/CopierMasterRemovalRequests";

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

type RequestTab = "pending" | "active" | "history";


const statusLabel: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  activated: "Activé",
  rejected: "Refusé",
};

export default function AdminCopierRequestsPage() {
  const { t: tr, locale } = useLocale();
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
  const [masterSuccess, setMasterSuccess] = useState("");
  const [requestTab, setRequestTab] = useState<RequestTab>("pending");

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

      if (!response.ok) throw new Error(data.error || tr("Chargement impossible."));

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
        throw new Error(configData.error || tr("Chargement des configurations impossible."));
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
      setError(cause instanceof Error ? cause.message : tr("Erreur."));
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
      if (!response.ok) throw new Error(data.error || tr("Lecture impossible."));
      setRevealed((current) => ({ ...current, [id]: data.password }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Erreur."));
    } finally {
      setBusyId(null);
    }
  }

  async function assignMaster(row: RequestRow) {
    setBusyId(row.id); setError(""); setMasterSuccess("");
    try {
      const response = await fetch("/api/admin/copier-requests", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_master", id: row.id, master_id: masterIds[row.id] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || tr("Association impossible."));
      await load(true);
      setMasterSuccess((tr("Master associé avec succès au client (") + (row.alias) + " · " + (row.login) + ")."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Erreur.")); }
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
      if (!response.ok) throw new Error(data.error || tr("Mise à jour impossible."));

      await load(true);
      if (status === "activated") setRequestTab("active");
      if (status === "rejected") setRequestTab("history");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Erreur."));
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
      if (!response.ok) throw new Error(data.error || tr("Mise à jour impossible."));
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Erreur."));
    } finally {
      setBusyId(null);
    }
  }

  const pending = rows.filter((row) => ["pending", "processing"].includes(row.status)).length;
  const activeRequests = rows.filter((row) => row.status === "activated");
  const pendingRequests = rows.filter((row) => ["pending", "processing"].includes(row.status));
  const historyRequests = rows.filter((row) => row.status === "rejected");
  const visibleRequests = requestTab === "pending"
    ? pendingRequests
    : requestTab === "active"
      ? activeRequests
      : historyRequests;
  const pendingConfigs = configRows.filter((row) => ["pending", "processing"].includes(row.status)).length;

  return (
    <main className="space-y-5">
      <CopierDeliveryFailures />
      <CopierMasterRemovalRequests />
      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">{tr("INVESTPRO COPIER · ADMIN")}</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">{tr("InvestPro Copier · activations & réglages")}</h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">{tr("Active les comptes puis traite manuellement les réglages qui le nécessitent.")}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">{tr("Activations")}</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">{pending}</div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">{tr("Réglages")}</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">{pendingConfigs}</div>
            </div>
            <button
              onClick={() => void load()}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
            >
              <RefreshCw size={14} />{tr("Actualiser")}</button>
          </div>
        </div>
      </section>

      {masterSuccess ? <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-3 text-sm font-semibold text-emerald-300"><CheckCircle2 className="mr-2 inline-block h-4 w-4" />{tr(masterSuccess)}</div> : null}

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">
          {tr(error)}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/[0.07] bg-[color:var(--panel)] p-2">
        <div role="tablist" aria-label={tr("Catégories des demandes Master")} className="flex flex-wrap gap-2">
          {([
            ["pending", tr("À traiter"), pendingRequests.length],
            ["active", tr("Comptes activés"), activeRequests.length],
            ["history", tr("Refusées"), historyRequests.length],
          ] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={requestTab === tab}
              onClick={() => setRequestTab(tab)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition ${requestTab === tab ? "bg-[color:var(--gold-soft)] text-[color:var(--gold)]" : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"}`}
            >
              {label}
              <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px]">{count}</span>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center">
          <Loader2 className="animate-spin text-[color:var(--gold)]" />
        </div>
      ) : visibleRequests.length === 0 ? (
        <section className="rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)] p-10 text-center">
          <ShieldCheck className="mx-auto text-white/20" />
          <div className="mt-3 text-sm font-semibold text-white">
            {requestTab === "pending" ? tr("Aucune demande à traiter") : requestTab === "active" ? tr("Aucun compte Master activé") : tr("Aucune demande refusée")}
          </div>
          <div className="mt-1 text-xs text-white/35">
            {requestTab === "pending" ? tr("Les nouvelles demandes apparaîtront ici.") : requestTab === "active" ? tr("Les Masters apparaîtront ici après confirmation de leur activation.") : tr("Les demandes refusées apparaîtront ici.")}
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {visibleRequests.map((row) => {
            const reviewable = ["pending", "processing"].includes(row.status);
            return (
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
                      label={tr("Membre")}
                      value={`${row.member.username} · ${row.member.email}`}
                    />
                    <Info
                      icon={<Clock3 size={14} />}
                      label={tr("Demande")}
                      value={new Date(row.created_at).toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}
                    />
                  </div>

                  {row.note ? (
                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="text-[8px] uppercase text-white/25">{tr("Message du membre")}</div>
                      <div className="mt-2 text-[10px] leading-5 text-white/55">
                        {row.note}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="w-full xl:w-[430px]">
                  <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
                    <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--gold)]">{tr("Identifiant du compte dans le moteur de copie")}</div>
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
                    <p className="mt-2 text-[8px] leading-4 text-white/30">{tr("Utilise exactement cet identifiant quand tu crées/associes le receveur dans le moteur de copie.")}</p>
                  </div>

                  {["pending", "processing"].includes(row.status) && (
                    <div className="mt-3 rounded-2xl border border-[color:var(--gold-border)] p-4">
                      <label className="block text-xs font-semibold text-white">{tr("Association du compte Master")}</label>
                      <p className="mt-1 text-[10px] text-white/50">{tr("Après avoir créé le compte Master et associé le compte client dans le moteur, saisis ici l’identifiant réel du Master. L’activation client reste bloquée jusqu’à cette association.")}</p>
                      <input value={masterIds[row.id] || ""} onChange={(e) => setMasterIds((cur) => ({ ...cur, [row.id]: e.target.value }))}
                        placeholder={tr("ID du Master")} className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white" />
                      <button disabled={busyId === row.id || !masterIds[row.id]?.trim()} onClick={() => void assignMaster(row)}
                        className="mt-2 rounded-lg bg-[color:var(--gold)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{tr("Associer ce Master au client")}</button>
                      {row.provider_master_id ? <div className="mt-2 text-[10px] font-semibold text-emerald-300">{tr("Master associé · ")}{row.provider_master_id}</div> : null}
                    </div>
                  )}
                  {reviewable ? <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[8px] uppercase text-white/25">{tr("Mot de passe MetaTrader")}</div>
                        <div className="mt-2 font-mono text-xs text-white/70">
                          {revealed[row.id] || "••••••••••••"}
                        </div>
                      </div>
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void reveal(row.id)}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-[10px] font-semibold text-white/60"
                      >
                        <Eye size={13} />{tr("Afficher")}</button>
                    </div>
                  </div> : null}
                </div>
              </div>

              {reviewable ? <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                <textarea
                  value={notes[row.id] || ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [row.id]: event.target.value,
                    }))
                  }
                  placeholder={tr("Motif compréhensible à transmettre au client en cas de refus…")}
                  className="min-h-20 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-white outline-none"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={busyId === row.id}
                    onClick={() => void update(row, "processing")}
                    className="h-10 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 text-xs font-semibold text-amber-300"
                  >{tr("En cours")}</button>
                  <button
                    disabled={busyId === row.id || !row.provider_master_id}
                    onClick={() => void update(row, "activated")}
                    title={!row.provider_master_id ? tr("Associe le Master avant de confirmer l’activation") : undefined}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 text-xs font-semibold text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} />{tr("Confirmer l’activation")}</button>
                  <button
                    disabled={busyId === row.id}
                    onClick={() => void update(row, "rejected")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300"
                  >
                    <XCircle size={14} />{tr("Refuser")}</button>
                </div>
              </div> : row.status === "rejected" ? (
                <button disabled={busyId === row.id} onClick={() => void update(row, "pending")} className="mt-5 h-10 rounded-xl border border-[color:var(--gold-border)] px-4 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-50">{tr("Remettre en attente")}</button>
              ) : row.admin_note ? (
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/50">{tr("Note admin : ")}{row.admin_note}</div>
              ) : null}
            </section>
            );
          })}
        </div>
      )}


      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">{tr("CONFIGURATIONS CLIENTS")}</div>
            <h2 className="mt-2 text-xl font-semibold text-white">{tr("Demandes de réglage à traiter")}</h2>
            <p className="mt-1 text-xs text-white/35">{tr("Confirme l’application uniquement après avoir vérifié le résultat réel dans le moteur.")}</p>
          </div>
          <div className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-bold text-[color:var(--gold)]">{pendingConfigs}{tr(" à traiter")}</div>
        </div>
      </section>

      {configRows.length === 0 ? (
        <section className="rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)] p-8 text-center text-xs text-white/35">{tr("Aucune configuration client en attente.")}</section>
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
                      <h3 className="text-lg font-semibold text-white">{row.receiver?.alias || tr("Compte receveur")}</h3>
                      <ConfigStatus status={row.status} />
                    </div>
                    <div className="mt-2 text-[10px] text-white/40">
                      {row.member.username} · {row.member.email} · {row.receiver?.platform} {row.receiver?.login} · {row.receiver?.server}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <ConfigInfo label={tr("Mode de risque")} value={tr(riskModeAdmin(String(risk.mode || "fixed")))} />
                      <ConfigInfo label={tr("Valeur")} value={tr(riskValueAdmin(risk))} />
                      <ConfigInfo label={tr("Lots maximum")} value={`${Number(risk.max_lots || 100)} lots`} />
                      <ConfigInfo label={tr("Stop Loss")} value={risk.copy_sl === false ? tr("Ne pas copier") : "Copier"} />
                      <ConfigInfo label={tr("Take Profit")} value={risk.copy_tp === false ? tr("Ne pas copier") : "Copier"} />
                      <ConfigInfo label={tr("Pending orders")} value={risk.copy_pending === false ? "Non" : "Oui"} />
                      <ConfigInfo label={tr("Modifications SL/TP")} value={risk.copy_modifications === false ? "Non" : "Oui"} />
                      <ConfigInfo label={tr("Slippage max")} value={`${Number(risk.slippage_pips || 0)} pips`} />
                      <ConfigInfo label={tr("Protection drawdown")} value={risk.drawdown_enabled ? `${Number(risk.max_drawdown_percent || 0)} %` : tr("Désactivée")} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/25">{tr("STRATÉGIES À ACTIVER")}</div>
                      <div className="mt-3 space-y-2">
                        {masters.map((master) => (
                          <div key={master.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2">
                            <div><div className="text-[10px] font-semibold text-white">{master.name}</div><div className="mt-0.5 text-[8px] text-white/25">{master.id}</div></div>
                            <div className="text-[10px] font-semibold text-[color:var(--gold)]">{risk.mode === "fixed" ? `${master.lots} lots` : tr(riskModeAdmin(String(risk.mode || "fixed")))}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {risk.symbol_mapping ? (
                      <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <div className="text-[8px] uppercase text-white/25">{tr("Mapping symboles")}</div>
                        <pre className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-white/55">{String(risk.symbol_mapping)}</pre>
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full xl:w-[360px]">
                    <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
                      <div className="text-[9px] font-semibold text-white">{tr("Checklist avant confirmation")}</div>
                      <div className="mt-3 space-y-2 text-[9px] leading-5 text-white/45">
                        <div>{tr("1. Ouvrir le compte receveur dans le moteur de copie.")}</div>
                        <div>{tr("2. Sélectionner exactement les masters ci-contre.")}</div>
                        <div>{tr("3. Reproduire le mode de risque et sa valeur.")}</div>
                        <div>{tr("4. Reproduire SL / TP / pending / protections.")}</div>
                        <div>{tr("5. Vérifier une dernière fois puis confirmer ici.")}</div>
                      </div>
                    </div>

                    <textarea
                      value={configNotes[row.id] || ""}
                      onChange={(event) => setConfigNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                      placeholder={tr("Note interne admin…")}
                      className="mt-3 min-h-20 w-full rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-white outline-none"
                    />

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <button disabled={busyId === row.id} onClick={() => void updateConfig(row, "processing")} className="h-10 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 text-xs font-semibold text-amber-300">{tr("Je commence l’application")}</button>
                      <button disabled={busyId === row.id} onClick={() => void updateConfig(row, "applied")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 text-xs font-semibold text-emerald-400"><CheckCircle2 size={14} />{tr(" Confirmer l’application réelle")}</button>
                      <button disabled={busyId === row.id} onClick={() => void updateConfig(row, "rejected")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300"><XCircle size={14} />{tr(" Demander une correction")}</button>
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
  const { t: tr } = useLocale();
  const labels = { pending: tr("À appliquer"), processing: tr("En cours"), applied: tr("Appliquée"), rejected: tr("À corriger") } as const;
  return <span className={["rounded-full border px-2 py-1 text-[8px] font-bold uppercase", status === "applied" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400" : status === "rejected" ? "border-red-500/20 bg-red-500/[0.05] text-red-300" : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"].join(" ")}>{labels[status]}</span>;
}

function ConfigInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="text-[8px] uppercase text-white/25">{label}</div><div className="mt-2 text-[10px] font-semibold text-white/65">{value}</div></div>;
}

function Status({ status }: { status: string }) {
 const { t: tr } = useLocale();
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
      {tr(statusLabel[status] || status)}
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
