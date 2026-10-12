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
  activated: "Activ√©",
  rejected: "Refus√©",
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
    setBusyId(row.id); setError(""); setMasterSuccess("");
    try {
      const response = await fetch("/api/admin/copier-requests", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_master", id: row.id, master_id: masterIds[row.id] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Association impossible.");
      await load(true);
      setMasterSuccess(`Master associ√© avec succ√®s au client (${row.alias} ¬∑ ${row.login}).`);
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
      if (!response.ok) throw new Error(data.error || "Mise √† jour impossible.");

      await load(true);
      if (status === "activated") setRequestTab("active");
      if (status === "rejected") setRequestTab("history");
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
      if (!response.ok) throw new Error(data.error || "Mise √† jour impossible.");
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
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
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              INVESTPRO COPIER ¬∑ ADMIN
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              InvestPro Copier ¬∑ activations & r√©glages
            </h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Active les comptes puis traite manuellement les r√©glages qui le n√©cessitent.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">Activations</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">{pending}</div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">R√©glages</div>
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

      {masterSuccess ? <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-3 text-sm font-semibold text-emerald-300"><CheckCircle2 className="mr-2 inline-block h-4 w-4" />{masterSuccess}</div> : null}

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/[0.07] bg-[color:var(--panel)] p-2">
        <div role="tablist" aria-label="Cat√©gories des demandes Master" className="flex flex-wrap gap-2">
          {([
            ["pending", "√Ä traiter", pendingRequests.length],
            ["active", "Comptes activ√©s", activeRequests.length],
            ["history", "Refus√©es", historyRequests.length],
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
            {requestTab === "pending" ? "Aucune demande √† traiter" : requestTab === "active" ? "Aucun compte Master activ√©" : "Aucune demande refus√©e"}
          </div>
          <div className="mt-1 text-xs text-white/35">
            {requestTab === "pending" ? "Les nouvelles demandes appara√Ætront ici." : requestTab === "active" ? "Les Masters appara√Ætront ici apr√®s confirmation de leur activation." : "Les demandes refus√©es appara√Ætront ici."}
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
                    <span>{row.platform} ¬∑ {row.login}</span>
                    <span>{row.server}</span>
                    {row.broker ? <span>{row.broker}</span> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Info
                      icon={<UserRound size={14} />}
                      label="Membre"
                      value={`${row.member.username} ¬∑ ${row.member.email}`}
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
                      Identifiant du compte dans le moteur de copie
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
                      Utilise exactement cet identifiant quand tu cr√©es/associes
                      le receveur dans le moteur de copie.
                    </p>
                  </div>

                  {["pending", "processing"].includes(row.status) && (
                    <div className="mt-3 rounded-2xl border border-[color:var(--gold-border)] p-4">
                      <label className="block text-xs font-semibold text-white">Association du compte Master</label>
                      <p className="mt-1 text-[10px] text-white/50">Apr√®s avoir cr√©√© le compte Master et associ√© le compte client dans le moteur, saisis ici l‚Äôidentifiant r√©el du Master. L‚Äôactivation client reste bloqu√©e jusqu‚Äô√† cette association.</p>
                      <input value={masterIds[row.id] || ""} onChange={(e) => setMasterIds((cur) => ({ ...cur, [row.id]: e.target.value }))}
                        placeholder="ID du Master" className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white" />
                      <button disabled={busyId === row.id || !masterIds[row.id]?.trim()} onClick={() => void assignMaster(row)}
                        className="mt-2 rounded-lg bg-[color:var(--gold)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">Associer ce Master au client</button>
                      {row.provider_master_id ? <div className="mt-2 text-[10px] font-semibold text-emerald-300">Master associ√© ¬∑ {row.provider_master_id}</div> : null}
                    </div>
                  )}
                  {reviewable ? <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[8px] uppercase text-white/25">
                          Mot de passe MetaTrader
                        </div>
                        <div className="mt-2 font-mono text-xs text-white/70">
                          {revealed[row.id] || "‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢‚Ä¢"}
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
                  placeholder="Motif compr√©hensible √† transmettre au client en cas de refus‚Ä¶"
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
                    disabled={busyId === row.id || !row.provider_master_id}
                    onClick={() => void update(row, "activated")}
                    title={!row.provider_master_id ? "Associe le Master avant de confirmer l‚Äôactivation" : undefined}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 text-xs font-semibold text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} />
                    Confirmer l‚Äôactivation
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
              </div> : row.status === "rejected" ? (
                <button disabled={busyId === row.id} onClick={() => void update(row, "pending")} className="mt-5 h-10 rounded-xl border border-[color:var(--gold-border)] px-4 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-50">Remettre en attente</button>
              ) : row.admin_note ? (
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/50">Note admin : {row.admin_note}</div>
              ) : null}
            </section>
            );
          })}
        </div>
      )}


      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">CONFIGURATIONS CLIENTS</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Demandes de r√©glage √† traiter</h2>
            <p className="mt-1 text-xs text-white/35">Confirme l‚Äôapplication uniquement apr√®s avoir v√©rifi√© le r√©sultat r√©el dans le moteur.</p>
          </div>
          <div className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-bold text-[color:var(--gold)]">{pendingConfigs} √† traiter</div>
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
                      {row.member.username} ¬∑ {row.member.email} ¬∑ {row.receiver?.platform} {row.receiver?.login} ¬∑ {row.receiver?.server}
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
                      <ConfigInfo label="Protection drawdown" value={risk.drawdown_enabled ? `${Number(risk.max_drawdown_percent || 0)} %` : "D√©sactiv√©e"} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/25">STRAT√âGIES √Ä ACTIVER</div>
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
                    <div className="rounded-2xl bordxÎ~u∂âûÀk∫wµÁN
NÿòX⁄Ÿ‹õ›[ôúôÿòJåé
N‹Y[ôŒåLúÿ€€‹éù⁄]NŸõ€ù\⁄^ôNåLú€›][ôNõõ€ô_Kö\YöY[ôõÿ›\ﬁÿõ‹ô\ãX€€‹éùò\äKY€€Xõ‹ô\ä_Kö\YöY[éúXŸZ€\ûÿ€€‹éúôÿòJçMKçMKçMKååä_Kö\YöY[‹[€ûÿòX⁄Ÿ‹õ›[ôàÃåéÿ€€‹éù⁄]_XO‹›[OÇàœÇà
N¬üBÇôù[ò›[€à[ô[
»⁄[ô[ã€\‹”ò[YHHààNà»⁄[ô[éàôXX›îôXX›õŸN»€\‹”ò[YOŒà›ö[ô»JH»ô]\õàŸX›[€à€\‹”ò[YO^ÿ€äúõ›[ôYVÃçHõ‹ô\àõ‹ô\ãVÿ€€‹éùò\äKXõ‹ô\äWHôÀVÿ€€‹éùò\äK\[ô[
WHMHYúMàã€\‹”ò[YJ_Oûÿ⁄[ô[üO‹ŸX›[€èé»Bôù[ò›[€àòYŸJ»X€€ãXô[Nà»X€€éàôXX›îôXX›õŸN»Xô[à›ö[ô»JH»ô]\õà‹[à€\‹”ò[YOHö[õ[ôKYõ^][\ÀXŸ[ù\àÿ\Làõ›[ôYYù[õ‹ô\àõ‹ô\ã]⁄]K÷Ãå◊HôÀXõX⁄ÀÃçHL»KLKçH^VŒ\H^]⁄]KÕHèè‹[à€\‹”ò[YOHù^Vÿ€€‹éùò\äKY€€
WHèû⁄X€€üO‹‹[èû€Xô[O‹‹[èé»Bôù[ò›[€àY]öX »Xô[ò[YK‹ôY[àNà»Xô[à›ö[ôŒ»ò[YNà›ö[ôŒ»‹ôY[èŒàõ€€X[àJH»ô]\õà]à€\‹”ò[YOHúõ›[ôYVÃåHõ‹ô\àõ‹ô\ã]⁄]K÷Ãå◊HôÀXõX⁄ÀÃçHMèè]à€\‹”ò[YOHù^VŒH\\òÿ\ŸHòX⁄⁄[ôÀVÃåY[WH^]⁄]KÃçHèû€Xô[OŸ]èè]à€\‹”ò[YO^ÿ€äõ]Là^[»õ€ù\Ÿ[ZXõ€ã‹ôY[à»ù^Y[Y\ò[Mààù^]⁄]Hä_Oû›ò[Y_OŸ]èèŸ]èé»Bôù[ò›[€à[ôõ‘õ› »Xô[ò[YHNà»Xô[à›ö[ôŒ»ò[YNà›ö[ô»JH»ô]\õà]à€\‹”ò[YOHôõ^][\ÀXŸ[ù\àù\›YûKXô]ŸY[àõ›[ôY^õ‹ô\àõ‹ô\ã]⁄]K÷ÃåóHôÀXõX⁄ÀÃåL»KL»èè‹[à€\‹”ò[YOHù^VŒ\H^]⁄]KÃÕHèû€Xô[O‹‹[èè‹[à€\‹”ò[YOHù^VŒ\Hõ€ù\Ÿ[ZXõ€^]⁄]KÕçHèû›ò[Y_O‹‹[èèŸ]èé»Bôù[ò›[€àXY[ô »^YXúõ›À]K^X€€àNà»^YXúõ›Œà›ö[ôŒ»]Nà›ö[ôŒ»^à›ö[ôŒ»X€€éàôXX›îôXX›õŸHJH»ô]\õà]à€\‹”ò[YOHôõ^][\À\›\ùÿ\L»èè]à€\‹”ò[YOHôõ^LLÀLL⁄ö[öÀL][\ÀXŸ[ù\àù\›YûKXŸ[ù\àõ›[ôY^õ‹ô\àõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWHôÀVÿ€€‹éùò\äKY€€\€Ÿù
WH^Vÿ€€‹éùò\äKY€€
WHèû⁄X€€üOŸ]èè]èè]à€\‹”ò[YOHù^VŒHõ€ùXõ€\\òÿ\ŸHòX⁄⁄[ôÀVÃåM[WH^Vÿ€€‹éùò\äKY€€
WHèûŸ^YXúõ›ﬂOŸ]èèà€\‹”ò[YOHõ]LH^Xò\ŸHõ€ù\Ÿ[ZXõ€^]⁄]Hèû›]_O⁄èè€\‹”ò[YOHõ]LH^VÃLHXY[ôÀMH^]⁄]KÃÕHèû›^O‹èŸ]èèŸ]èé»Bôù[ò›[€àöY[
»Xô[⁄[ô[àNà»Xô[à›ö[ôŒ»⁄[ô[éàôXX›îôXX›õŸHJH»ô]\õàXô[€\‹”ò[YOHòõÿ⁄»Z[ã]ÀLèè‹[à€\‹”ò[YOHõXãLKçHõÿ⁄»^VŒ\Hõ€ù[YY][H^]⁄]KÕèû€Xô[O‹‹[èûÿ⁄[ô[üO€Xô[é»Bôù[ò›[€àŸ[
»Xô[ò[YK‹⁄]]ôKôYÿ]]ôHNà»Xô[à›ö[ôŒ»ò[YNà›ö[ôŒ»‹⁄]]ôOŒàõ€€X[é»ôYÿ]]ôOŒàõ€€X[àJH»ô]\õà]èè]à€\‹”ò[YOHù^VÕ‹H\\òÿ\ŸH^]⁄]KÃåŒöY[àèû€Xô[OŸ]èè]à€\‹”ò[YO^ÿ€äõ]LH^VÃLHõ€ù[YY][HŒõ]Lã‹⁄]]ôH»ù^Y[Y\ò[MààôYÿ]]ôH»ù^\ôYMààù^]⁄]KÕåä_Oû›ò[Y_OŸ]èèŸ]èé»Bôù[ò›[€à›]J»X›]ôKXô[Nà»X›]ôNàõ€€X[é»Xô[à›ö[ô»JH»ô]\õà‹[à€\‹”ò[YO^ÿ€äúõ›[ôYYù[õ‹ô\àLàKLçH^VÕ‹Hõ€ùXõ€\\òÿ\ŸHãX›]ôH»òõ‹ô\ãY[Y\ò[MLÃåôÀY[Y\ò[ML÷ÃåóH^Y[Y\ò[Mààòõ‹ô\ã]⁄]K÷ÃåH^]⁄]KÃÕHä_Oû€Xô[O‹‹[èé»Bôù[ò›[€àö\⁄ ¬àX›]ôHHò[ŸKàXô[à\ÿÀà€ê€X⁄ÀüNà¬àX›]ôOŒàõ€€X[é¬àXô[à›ö[ôŒ¬à\ÿŒà›ö[ôŒ¬à€ê€X⁄Œà

HOàõ⁄Y¬üJH¬àô]\õà
àù]€Çà€ê€X⁄œ^€€ê€X⁄ﬂBà€\‹”ò[YO^ÿ€äàôõ^ÀYù[][\ÀXŸ[ù\àÿ\L»õ›[ôY^õ‹ô\àL»^[Yùò[ú⁄][€àãàX›]ôBà»òõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWHôÀVÿ€€‹éùò\äKY€€\€Ÿù
WHÇààòõ‹ô\ã]⁄]K÷ÃåóHôÀXõX⁄ÀÃå›ô\éòôÀ]⁄]K÷ÃåóHÇà
_BàÇà]Çà€\‹”ò[YO^ÿ€äàôõ^NÀN][\ÀXŸ[ù\àù\›YûKXŸ[ù\àõ›[ôY[»õ‹ô\àãàX›]ôBà»òõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWH^Vÿ€€‹éùò\äKY€€
WHÇààòõ‹ô\ã]⁄]K÷Ãå◊H^]⁄]KÃÃÇà
_BàÇà\ôŸ]⁄^ôO^ÃLﬂHœÇàŸ]èÇà]à€\‹”ò[YOHôõ^LHèÇà]à€\‹”ò[YOHù^VÃLHõ€ù\Ÿ[ZXõ€^]⁄]Hèû€Xô[OŸ]èÇà]à€\‹”ò[YOHõ]LçH^VŒH^]⁄]KÃÃèûŸ\ÿﬂOŸ]èÇàŸ]èÇàÿX›]ôH»
à⁄X⁄–⁄\ò€Là⁄^ôO^ÃMH€\‹”ò[YOHù^Y[Y\ò[MàœÇà
Hàù[Bàÿù]€èÇà
N¬üBÇôù[ò›[€àö\⁄”ù[Xô\ä¬àXô[àò[YKàZ[ãàX^à›\à›Yôö^à€ê⁄[ôŸKüNà¬àXô[à›ö[ôŒ¬àò[YNàù[Xô\é¬àZ[éàù[Xô\é¬àX^àù[Xô\é¬à›\àù[Xô\é¬à›Yôö^à›ö[ôŒ¬à€ê⁄[ôŸNà
ò[YNàù[Xô\äHOàõ⁄Y¬üJH¬àô]\õà
àöY[Xô[^€Xô[OÇà]à€\‹”ò[YOHúô[]]ôHèÇà[ú]à\OHõù[Xô\àÇàZ[è^€Z[üBàX^^€X^Bà›\^‹›\Bàò[YO^”ù[Xô\ãö\—ö[ö]Jò[YJH»ò[YHàBà€ê⁄[ôŸO^ ]ô[ù
HOà¬à€€ú›àHù[Xô\ä]ô[ùù\ôŸ]ùò[YJN¬à€ê⁄[ôŸJù[Xô\ãö\—ö[ö]JäH»ààZ[äN¬à_Bà€\‹”ò[YOHö\YöY[ãLMÇàœÇà‹[à€\‹”ò[YOHú⁄[ù\ãY]ô[ùÀ[õ€ôHXú€€]HöY⁄L»‹LKÃà]ò[ú€]K^KLKÃà^VŒ\H^]⁄]KÃÃèÇà‹›Yôö^Bà‹‹[èÇàŸ]èÇà—öY[Çà
N¬üBÇôù[ò›[€àŸŸ€TŸ][ô ¬àXô[à\ÿ‹ö\[€ãà⁄X⁄ŸYà€ê⁄[ôŸKüNà¬àXô[à›ö[ôŒ¬à\ÿ‹ö\[€éà›ö[ôŒ¬à⁄X⁄ŸYàõ€€X[é¬à€ê⁄[ôŸNà
⁄X⁄ŸYàõ€€X[äHOàõ⁄Y¬üJH¬àô]\õà
àù]€Çà\OHòù]€àÇà€ê€X⁄œ^ 
HOà€ê⁄[ôŸJX⁄X⁄ŸY
_Bà€\‹”ò[YOHôõ^ÀYù[][\ÀXŸ[ù\àù\›YûKXô]ŸY[àÿ\Mõ›[ôY^õ‹ô\àõ‹ô\ã]⁄]K÷ÃåóHôÀXõX⁄ÀÃåL»^[YùÇàÇà]èÇà]à€\‹”ò[YOHù^VŒ\Hõ€ù\Ÿ[ZXõ€^]⁄]KÕÃèû€Xô[OŸ]èÇà]à€\‹”ò[YOHõ]LH^VŒHXY[ôÀM^]⁄]KÃÃèÇàŸ\ÿ‹ö\[€üBàŸ]èÇàŸ]èÇà‹[Çà€\‹”ò[YO^ÿ€äàúô[]]ôHMàÀLLH⁄ö[öÀLõ›[ôYYù[õ‹ô\àò[ú⁄][€àãà⁄X⁄ŸYà»òõ‹ô\ãY[Y\ò[MLÃÃôÀY[Y\ò[MLÃåÇààòõ‹ô\ã]⁄]K÷ÃåHôÀ]⁄]K÷Ãå◊HÇà
_BàÇà‹[Çà€\‹”ò[YO^ÿ€äàòXú€€]H‹LKÃàMÀM]ò[ú€]K^KLKÃàõ›[ôYYù[ò[ú⁄][€àãà⁄X⁄ŸYà»õYùVÃåúHôÀY[Y\ò[MÇààõYùVÕHôÀ]⁄]KÃÕHÇà
_BàœÇà‹‹[èÇàÿù]€èÇà
N¬üBôù[ò›[€àô\]Y\››]\ »›]\»Nà»›]\ŒàX›]ò][€îô\]Y\›»ú›]\»óHJH¬à€€ú›Xô[»H¬à[ô[ôŒàë[à][ùHãàõÿŸ\‹⁄[ôŒàêX›]ò][€à[à€›\ú»ãàX›]ò]YàêX›]∞ÍHãàôZôX›YàîôYù\ÍHãàH\»€€ú›¬Çàô]\õà
à‹[Çà€\‹”ò[YO^ÿ€äàúõ›[ôYYù[õ‹ô\àLãçHKLH^VŒHõ€ùXõ€\\òÿ\ŸHãà›]\»OOHòX›]ò]YÇà»òõ‹ô\ãY[Y\ò[MLÃåôÀY[Y\ò[ML÷ÃåóH^Y[Y\ò[MÇàà›]\»OOHúôZôX›YÇà»òõ‹ô\ã\ôYMLÃåôÀ\ôYML÷ÃåWH^\ôYLÃÇààòõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWHôÀVÿ€€‹éùò\äKY€€\€Ÿù
WH^Vÿ€€‹éùò\äKY€€
WHÇà
_BàÇà€Xô[÷‹›]\◊_Bà‹‹[èÇà
N¬üBÇôù[ò›[€à›[[X\ûJ»Xô[ò[YK‹ôY[àNà»Xô[à›ö[ôŒ»ò[YNà›ö[ôŒ»‹ôY[èŒàõ€€X[àJH»ô]\õà]à€\‹”ò[YOHúõ›[ôYLûõ‹ô\àõ‹ô\ã]⁄]K÷ÃåóHôÀXõX⁄ÀÃåMèè]à€\‹”ò[YOHù^VŒH\\òÿ\ŸHòX⁄⁄[ôÀVÃåY[WH^]⁄]KÃçHèû€Xô[OŸ]èè]à€\‹”ò[YO^ÿ€äõ]Là^\€Hõ€ù\Ÿ[ZXõ€ã‹ôY[à»ù^Y[Y\ò[Mààù^]⁄]Hä_Oû›ò[Y_OŸ]èèŸ]èé»Bôù[ò›[€à\õ‘›]ÿ\ô
»X€€ãXô[ò[YK›XãXÿŸ[ùXÿŸ[ù‹⁄]]ôHNà»X€€éàôXX›îôXX›õŸN»Xô[à›ö[ôŒ»ò[YNà›ö[ôŒ»›Xéà›ö[ôŒ»XÿŸ[ùŒà›ö[ôŒ»XÿŸ[ù‹⁄]]ôOŒàõ€€X[àJH»ô]\õà]à€\‹”ò[YOHúõ›[ôYVÃMúHõ‹ô\àõ‹ô\ã]⁄]K÷Ãå◊HôÀXõX⁄ÀÃçHL»€Núõ›[ôYVÃåH€NúMèè]à€\‹”ò[YOHôõ^][\À\›\ùÿ\Là€Nôÿ\L»èè]à€\‹”ò[YOHôõ^NÀN⁄ö[öÀL][\ÀXŸ[ù\àù\›YûKXŸ[ù\àõ›[ôY^õ‹ô\àõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWHôÀVÿ€€‹éùò\äKY€€\€Ÿù
WH^Vÿ€€‹éùò\äKY€€
WH€NöLLà€NùÀLLà€Núõ›[ôYLûèû⁄X€€üOŸ]èè]à€\‹”ò[YOHõZ[ã]ÀLõ^LHèè]à€\‹”ò[YOHù^VŒ\HXY[ôÀ]Y⁄^]⁄]KÕ€Nù^VÃLHèû€Xô[OŸ]èè]à€\‹”ò[YOHõ]LH^^õ€ù\Ÿ[ZXõ€XY[ôÀ]Y⁄^]⁄]H€Nù^Lﬁèû›ò[Y_OŸ]èè]à€\‹”ò[YOHõ]LHõ^õ^]‹ò\][\ÀXŸ[ù\àÿ\LH€Nôÿ\Làèè‹[à€\‹”ò[YOHù^VŒ\HXY[ôÀ]Y⁄^]⁄]KÃÕH€Nù^VÃLHèû‹›XüO‹‹[èûÿXÿŸ[ù»‹[à€\‹”ò[YO^ÿ€äù^VŒ\Hõ€ù\Ÿ[ZXõ€€Nù^VÃLHãXÿŸ[ù‹⁄]]ôH»ù^Y[Y\ò[Mààù^Vÿ€€‹éùò\äKY€€
WHä_OûÿXÿŸ[ùO‹‹[èààù[OŸ]èèŸ]èèŸ]èèŸ]èé»Bôù[ò›[€àZ[öSY]öX »Xô[ò[YK‹⁄]]ôKôYÿ]]ôHNà»Xô[à›ö[ôŒ»ò[YNà›ö[ôŒ»‹⁄]]ôOŒàõ€€X[é»ôYÿ]]ôOŒàõ€€X[àJH»ô]\õà]à€\‹”ò[YOHúõ›[ôY^õ‹ô\àõ‹ô\ã]⁄]K÷ÃåóHôÀXõX⁄ÀÃåL»èè]à€\‹”ò[YOHù^VŒ\H\\òÿ\ŸHòX⁄⁄[ôÀVÃå[WH^]⁄]KÃÃèû€Xô[OŸ]èè]à€\‹”ò[YO^ÿ€äõ]Là^[»õ€ù\Ÿ[ZXõ€ã‹⁄]]ôH»ù^Y[Y\ò[MààôYÿ]]ôH»ù^\ôYMààù^]⁄]Hä_Oû›ò[Y_OŸ]èèŸ]èé»Bôù[ò›[€àôXŸZ]ô\î›]\–òYŸJ»›]\»Nà»›]\ŒàôXŸZ]ô\ñ…‹›]\…◊HJH»€€ú››[\»H›]\»OOH	ÿ€€õôX›Y	»»	ÿõ‹ô\ãY[Y\ò[MLÃåôÀY[Y\ò[ML÷ÃåóH^Y[Y\ò[M	»à›]\»OOH	‹]\ŸY	»»	ÿõ‹ô\ã]⁄]K÷ÃåHôÀ]⁄]K÷Ãå◊H^]⁄]KÕMI»à	ÿõ‹ô\ã\ôYMLÃåôÀ\ôYML÷ÃåWH^\ôYLÃ	Œ»€€ú›Xô[H›]\»OOH	ÿ€€õôX›Y	»»	–€€õôX›0ÍI»à›]\»OOH	‹]\ŸY	»»	‘]\ŸI»à	—\úô]\âŒ»ô]\õà‹[à€\‹”ò[YO^ÿ€ä	⁄[õ[ôKYõ^õ›[ôYYù[õ‹ô\àLãçHKLH^VŒHõ€ùXõ€\\òÿ\ŸIÀ›[\ _Oû€Xô[O‹‹[èé»Bôù[ò›[€à[õ[ôTö\⁄”‹[€ä»X›]ôKXô[\ÿÀ€ê€X⁄À⁄[ô[àNà»X›]ôNàõ€€X[é»Xô[à›ö[ôŒ»\ÿŒà›ö[ôŒ»€ê€X⁄Œà

HOàõ⁄Y»⁄[ô[éàôXX›îôXX›õŸHJH»ô]\õàù]€à\OHòù]€àà€ê€X⁄œ^€€ê€X⁄ﬂH€\‹”ò[YO^ÿ€äô‹öYÀYù[‹öYX€€ÀVÿ]]◊ÃYúóÃLÃúH][\ÀXŸ[ù\àÿ\L»õ›[ôY^õ‹ô\àL»^[Yùò[ú⁄][€àãX›]ôH»òõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWHôÀVÿ€€‹éùò\äKY€€\€Ÿù
WHààòõ‹ô\ã]⁄]K÷ÃåóHôÀXõX⁄ÀÃå›ô\éòôÀ]⁄]K÷ÃåóHä_Oè‹[à€\‹”ò[YO^ÿ€äôõ^MHÀMH][\ÀXŸ[ù\àù\›YûKXŸ[ù\àõ›[ôYYù[õ‹ô\àãX›]ôH»òõ‹ô\ãVÿ€€‹éùò\äKY€€Xõ‹ô\äWHôÀVÿ€€‹éùò\äKY€€
WH^XõX⁄»ààòõ‹ô\ã]⁄]KÃMH^]ò[ú‹\ô[ùä_OûÿX›]ôH»⁄X⁄»⁄^ôO^ÃLüHœàà	¯†(âﬂO‹‹[èè‹[à€\‹”ò[YOHõZ[ã]ÀLèè‹[à€\‹”ò[YOHòõÿ⁄»^VÃL\Hõ€ù\Ÿ[ZXõ€^]⁄]Hèû€Xô[O‹‹[èè‹[à€\‹”ò[YOHõ]LçHõÿ⁄»^VŒ\H^]⁄]KÃÕHèûŸ\ÿﬂO‹‹[èè‹‹[èè‹[à€ê€X⁄œ^ JHOàKú›‹õ‹Yÿ][€ä
_Oûÿ⁄[ô[üO‹‹[èèÿù]€èé»B