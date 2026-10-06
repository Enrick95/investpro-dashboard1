"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function BackupPage() {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<"json" | "csv" | null>(null);
  const [message, setMessage] = useState("");

  async function collect() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Session introuvable.");

    const [
      profile,
      preferences,
      plans,
      accounts,
      trades,
      futureConnections,
      supportTickets,
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("trader_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("trading_plans")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("trading_journal")
        .select("*")
        .eq("user_id", user.id)
        .order("trade_date", { ascending: true }),
      supabase
        .from("futures_connections")
        .select(
          "id,user_id,trading_account_id,provider,external_account_id,external_account_name,username,status,last_sync_at,updated_at,created_at"
        )
        .eq("user_id", user.id),
      supabase
        .from("support_tickets")
        .select(
          "id,user_id,subject,message,status,admin_reply,created_at,updated_at,answered_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    return {
      export_version: 1,
      exported_at: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email || null,
        created_at: user.created_at,
      },
      profile: profile.data || null,
      preferences: preferences.data || null,
      trading_plans: plans.data || [],
      trading_accounts: accounts.data || [],
      trading_journal: trades.data || [],
      futures_connections: futureConnections.data || [],
      support_tickets: supportTickets.data || [],
    };
  }

  async function exportJson() {
    try {
      setBusy("json");
      setMessage("");

      const data = await collect();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(
        `investpro-backup-${date}.json`,
        JSON.stringify(data, null, 2),
        "application/json;charset=utf-8"
      );

      window.localStorage.setItem(
        "investpro_last_backup_at",
        new Date().toISOString()
      );
      setMessage("Sauvegarde JSON téléchargée.");
    } catch (e: any) {
      setMessage(e?.message || "Export impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function exportTradesCsv() {
    try {
      setBusy("csv");
      setMessage("");

      const data = await collect();
      const trades = data.trading_journal as Record<string, unknown>[];

      if (!trades.length) {
        throw new Error("Aucun trade à exporter.");
      }

      const headers = Array.from(
        new Set(trades.flatMap((trade) => Object.keys(trade)))
      );

      const csv = [
        headers.map(csvEscape).join(","),
        ...trades.map((trade) =>
          headers.map((header) => csvEscape(trade[header])).join(",")
        ),
      ].join("\n");

      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(
        `investpro-journal-${safeFilePart(date)}.csv`,
        "\ufeff" + csv,
        "text/csv;charset=utf-8"
      );

      window.localStorage.setItem(
        "investpro_last_backup_at",
        new Date().toISOString()
      );
      setMessage("Journal CSV téléchargé.");
    } catch (e: any) {
      setMessage(e?.message || "Export impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[80px]" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <DatabaseBackup size={12} />
            Sauvegarde & export
          </div>

          <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
            Garde une copie de <span className="text-[color:var(--gold)]">tes données</span>
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
            Exporte ton espace InvestPro ou simplement ton Journal. Aucun mot de passe,
            token ou secret de connexion n’est inclus.
          </p>
        </div>
      </section>

      {message ? (
        <div className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 text-xs text-[color:var(--gold)]">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ExportCard
          icon={<FileJson size={20} />}
          title="Sauvegarde complète JSON"
          text="Profil, préférences, plan, comptes, Journal, connexions Futures sans credentials et historique support."
          button="Télécharger la sauvegarde"
          busy={busy === "json"}
          onClick={exportJson}
        />

        <ExportCard
          icon={<FileSpreadsheet size={20} />}
          title="Journal CSV"
          text="Export de tous les trades dans un fichier lisible dans Excel, Numbers ou Google Sheets."
          button="Télécharger le CSV"
          busy={busy === "csv"}
          onClick={exportTradesCsv}
        />
      </section>

      <section className="rounded-[22px] border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400">
            <ShieldCheck size={16} />
          </div>

          <div>
            <div className="text-sm font-semibold text-white">
              Export sécurisé
            </div>
            <p className="mt-1 text-[10px] leading-5 text-white/40">
              Les mots de passe MetaTrader, clés API, tokens ProjectX et secrets serveur
              ne sont jamais inclus dans ces fichiers.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  text,
  button,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  button: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>

      <div className="mt-4 text-base font-semibold text-white">{title}</div>
      <p className="mt-2 min-h-[60px] text-[10px] leading-5 text-white/40">
        {text}
      </p>

      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] text-xs font-semibold text-black disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {button}
      </button>
    </section>
  );
}
