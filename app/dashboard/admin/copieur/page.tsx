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

const statusLabel: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  activated: "Activé",
  rejected: "Refusé",
};

export default function AdminCopierRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
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
      setNotes(
        Object.fromEntries(
          (data.requests || []).map((row: RequestRow) => [
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

  const pending = rows.filter((row) =>
    ["pending", "processing"].includes(row.status)
  ).length;

  return (
    <main className="space-y-5">
      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              COPIER ENGINE · ADMIN
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Demandes d’activation
            </h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Reçois les comptes MT4/MT5, active-les dans Social Trade Hub,
              puis rends-les disponibles au membre.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <div className="text-[8px] uppercase text-white/25">En attente</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--gold)]">
                {pending}
              </div>
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
    </main>
  );
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
