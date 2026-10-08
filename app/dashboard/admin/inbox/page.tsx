"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bug,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Item = {
  kind: "support" | "bug" | "deletion";
  id: string;
  user_id: string;
  member: { id: string; username: string; email: string; plan: string };
  title: string;
  message: string;
  status: string;
  admin_reply?: string;
  admin_note?: string;
  page_url?: string;
  images?: any[];
  created_at: string;
  updated_at: string;
};

type Payload = {
  stats: {
    open_support: number;
    open_bugs: number;
    pending_deletions: number;
    total: number;
  };
  available: Record<string, boolean>;
  items: Item[];
};

function dateLabel(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kindLabel(kind: Item["kind"]) {
  if (kind === "support") return "Support";
  if (kind === "bug") return "Bug";
  return "Suppression";
}

function statuses(kind: Item["kind"]) {
  if (kind === "support") return ["open", "in_progress", "answered", "resolved", "closed"];
  if (kind === "bug") return ["open", "investigating", "resolved", "closed"];
  return ["pending", "processing", "resolved", "rejected", "cancelled"];
}

export default function AdminInboxPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [filter, setFilter] = useState<"all" | "support" | "bug" | "deletion">("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function load(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError("");
      const token = await getToken();
      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/admin/inbox", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Inbox indisponible.");
      setData(json);

      if (selected) {
        const next = (json.items || []).find(
          (item: Item) => item.kind === selected.kind && item.id === selected.id
        );
        if (next) {
          setSelected(next);
          setStatus(next.status);
          setReply(next.admin_reply || "");
          setNote(next.admin_note || "");
        }
      }
    } catch (e: any) {
      setError(e?.message || "Inbox indisponible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    }, 20_000);

    const onFocus = () => {
      void load(true);
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(item: Item) {
    setSelected(item);
    setStatus(item.status);
    setReply(item.admin_reply || "");
    setNote(item.admin_note || "");
  }

  async function save() {
    if (!selected) return;

    try {
      setSaving(true);
      setError("");
      const token = await getToken();
      if (!token) return;

      const response = await fetch("/api/admin/inbox", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: selected.kind,
          id: selected.id,
          user_id: selected.user_id,
          status,
          admin_reply: selected.kind === "support" ? reply : "",
          admin_note: note,
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Action impossible.");

      await load(true);
    } catch (e: any) {
      setError(e?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return (data?.items || []).filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (!q) return true;

      return [
        item.title,
        item.message,
        item.member.username,
        item.member.email,
        item.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, filter, query]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-[color:var(--muted)]">
        Chargement de l’Inbox…
      </div>
    );
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
            <Mail size={11} />
            Support centralisé
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            Inbox & <span className="text-[color:var(--gold)]">Support</span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Support, bugs et demandes de suppression réunis dans le back-office.
          </p>
          <div className="mt-2 inline-flex items-center gap-2 text-[9px] text-emerald-400/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Actualisation automatique toutes les 20 secondes
          </div>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {data ? (
        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<MessageSquare size={15} />} label="Support ouvert" value={data.stats.open_support} />
          <Stat icon={<Bug size={15} />} label="Bugs ouverts" value={data.stats.open_bugs} />
          <Stat icon={<Trash2 size={15} />} label="Suppressions" value={data.stats.pending_deletions} />
          <Stat icon={<Mail size={15} />} label="Total" value={data.stats.total} />
        </section>
      ) : null}

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <div className="border-b border-white/[0.06] p-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un membre, sujet, e-mail..."
                className="h-10 w-full rounded-xl border border-white/[0.07] bg-black/20 pl-9 pr-3 text-xs text-white outline-none"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(["all", "support", "bug", "deletion"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={[
                    "rounded-xl border px-3 py-2 text-[10px] font-semibold",
                    filter === value
                      ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                      : "border-white/[0.07] bg-black/20 text-white/40",
                  ].join(" ")}
                >
                  {value === "all" ? "Tout" : value === "support" ? "Support" : value === "bug" ? "Bugs" : "Suppressions"}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto divide-y divide-white/[0.05]">
            {filtered.length ? (
              filtered.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => open(item)}
                  className={[
                    "w-full p-4 text-left transition hover:bg-white/[0.025]",
                    selected?.kind === item.kind && selected?.id === item.id
                      ? "bg-[color:var(--gold-soft)]"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--gold)]">
                        {kindLabel(item.kind)}
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold text-white">
                        {item.title}
                      </div>
                      <div className="mt-1 truncate text-[9px] text-white/30">
                        {item.member.username} · {item.member.email}
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full border border-white/[0.07] bg-black/20 px-2 py-1 text-[8px] text-white/40">
                      {item.status}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-white/35">
                    {item.message}
                  </p>

                  <div className="mt-2 inline-flex items-center gap-1 text-[8px] text-white/25">
                    <Clock3 size={10} />
                    {dateLabel(item.created_at)}
                  </div>
                </button>
              ))
            ) : (
              <div className="p-10 text-center text-sm text-white/25">
                Aucun élément.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          {selected ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[9px] font-semibold uppercase text-[color:var(--gold)]">
                    {kindLabel(selected.kind)}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {selected.title}
                  </h2>

                  <Link
                    href={`/dashboard/admin/utilisateurs/${selected.user_id}`}
                    className="mt-2 inline-flex items-center gap-2 text-[10px] text-white/45 no-underline hover:text-[color:var(--gold)]"
                  >
                    <UserRound size={12} />
                    {selected.member.username} · {selected.member.email}
                  </Link>
                </div>

                <div className="text-[9px] text-white/30">
                  {dateLabel(selected.created_at)}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <div className="whitespace-pre-wrap text-[11px] leading-6 text-white/55">
                  {selected.message || "—"}
                </div>
              </div>

              {selected.page_url ? (
                <div className="mt-3 break-all rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[9px] text-white/35">
                  Page : {selected.page_url}
                </div>
              ) : null}

              {selected.kind === "bug" && selected.images?.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {selected.images.slice(0, 6).map((image: any, index: number) => (
                    <div key={index} className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
                      {image?.dataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.dataUrl} alt={image?.name || "Bug"} className="h-32 w-full object-cover" />
                      ) : null}
                      <div className="truncate p-2 text-[8px] text-white/30">
                        {image?.name || `Image ${index + 1}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <div className="mb-2 text-[9px] text-white/35">Statut</div>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="h-11 w-full rounded-xl border border-white/[0.07] bg-black/30 px-3 text-xs text-white outline-none"
                  >
                    {statuses(selected.kind).map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <div className="text-[8px] uppercase text-white/25">Plan</div>
                  <div className="mt-1 text-xs font-semibold uppercase text-[color:var(--gold)]">
                    {selected.member.plan}
                  </div>
                </div>
              </div>

              {selected.kind === "support" ? (
                <label className="mt-4 block">
                  <div className="mb-2 text-[9px] text-white/35">
                    Réponse visible par le membre
                  </div>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-white outline-none"
                    placeholder="Écris ta réponse..."
                  />
                </label>
              ) : null}

              <label className="mt-4 block">
                <div className="mb-2 text-[9px] text-white/35">
                  Note interne admin
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-white outline-none"
                  placeholder="Note interne, non visible par le membre..."
                />
              </label>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] text-xs font-semibold text-black disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Enregistrer
              </button>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <Mail size={28} className="text-[color:var(--gold)]" />
              <div className="mt-4 text-sm font-semibold text-white">
                Sélectionne une demande
              </div>
              <p className="mt-2 max-w-sm text-[10px] leading-5 text-white/35">
                Tu pourras répondre au support, suivre les bugs et gérer les demandes de suppression.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
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
