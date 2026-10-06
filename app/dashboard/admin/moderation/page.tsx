"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Ban,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Payload = {
  stats: { suspended: number; pending_deletions: number; admin_actions: number };
  suspended: any[];
  deletions: any[];
  audit: any[];
};

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminModerationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/admin/moderation", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Modération indisponible.");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Modération indisponible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="py-16 text-center text-sm text-white/35">Chargement de la modération…</div>;
  }

  return (
    <div className="w-full pb-10">
      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <ShieldCheck size={11} />
            Sécurité membres
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            Modération & <span className="text-[color:var(--gold)]">Contrôle</span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Comptes suspendus, suppressions en attente et journal des actions admin.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {data ? (
        <>
          <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat icon={<Ban size={16} />} label="Comptes suspendus" value={data.stats.suspended} />
            <Stat icon={<Trash2 size={16} />} label="Suppressions en attente" value={data.stats.pending_deletions} />
            <Stat icon={<Activity size={16} />} label="Actions admin récentes" value={data.stats.admin_actions} />
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Comptes suspendus" subtitle="Réactive ou consulte un membre depuis sa fiche détaillée.">
              {data.suspended.length ? (
                <div className="divide-y divide-white/[0.05]">
                  {data.suspended.map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <div className="text-xs font-semibold text-white">{user.username}</div>
                        <div className="mt-1 text-[9px] text-white/30">{user.email}</div>
                        <div className="mt-1 text-[9px] text-red-300">
                          Suspendu jusqu’au {dateLabel(user.banned_until)}
                        </div>
                      </div>

                      <Link
                        href={`/dashboard/admin/utilisateurs/${user.id}`}
                        className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-2 text-[10px] font-semibold text-[color:var(--gold)] no-underline"
                      >
                        Ouvrir
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="Aucun compte suspendu." />
              )}
            </Panel>

            <Panel title="Demandes de suppression" subtitle="Le statut peut être géré depuis l’Inbox. Aucune suppression automatique ici.">
              {data.deletions.length ? (
                <div className="divide-y divide-white/[0.05]">
                  {data.deletions.slice(0, 20).map((item: any) => (
                    <div key={item.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {item.email_snapshot || item.user_id}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 text-[9px] text-white/30">
                            <Clock3 size={10} />
                            {dateLabel(item.requested_at)}
                          </div>
                        </div>

                        <span className="rounded-full border border-white/[0.07] bg-black/20 px-2 py-1 text-[8px] text-white/40">
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="Aucune demande." />
              )}
            </Panel>
          </section>

          <Panel title="Journal des actions administrateur" subtitle="Traçabilité des dernières actions sensibles." className="mt-4">
            {data.audit.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.05] text-[8px] uppercase text-white/25">
                      <th className="px-2 py-3 font-semibold">Date</th>
                      <th className="px-2 py-3 font-semibold">Action</th>
                      <th className="px-2 py-3 font-semibold">Admin</th>
                      <th className="px-2 py-3 font-semibold">Membre cible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((log: any) => (
                      <tr key={log.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-2 py-3 text-[9px] text-white/35">{dateLabel(log.created_at)}</td>
                        <td className="px-2 py-3 text-[10px] font-semibold text-white/65">{log.action}</td>
                        <td className="px-2 py-3 font-mono text-[8px] text-white/25">{log.admin_user_id}</td>
                        <td className="px-2 py-3 font-mono text-[8px] text-white/25">{log.target_user_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="Aucune action admin enregistrée." />
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="grid h-8 w-8 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[9px] text-white/28">{label}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 ${className}`}>
      <div className="font-semibold text-white">{title}</div>
      <div className="mt-1 text-[9px] text-white/30">{subtitle}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-sm text-white/25">
      <UserRound size={22} className="mx-auto mb-3 text-white/20" />
      {text}
    </div>
  );
}
