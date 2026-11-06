"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Download, RefreshCw, Search } from "lucide-react";
import { vipRequest } from "@/lib/vip/client";
import s from "./StripePayments.module.css";

type Payment = {
  id: string; full_name: string | null; email: string | null; phone: string | null; telegram_username: string | null;
  amount_total: number | null; currency: string | null; status: "active" | "past_due" | "canceled";
  invite_url: string | null; invite_created_at: string | null; channel_joined_at: string | null; channel_username: string | null;
  removed_at: string | null; last_payment_at: string | null; created_at: string;
};

const STATUS: Record<Payment["status"], { label: string; tone: string }> = {
  active: { label: "Actif", tone: "good" }, past_due: { label: "Paiement en échec", tone: "warn" }, canceled: { label: "Annulé", tone: "bad" },
};
const date = (v: string | null) => v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const money = (c: number | null, cur: string | null) => c == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: (cur || "eur").toUpperCase(), maximumFractionDigits: 0 }).format(c / 100);
const tgHref = (u: string | null) => u && /^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(u) ? `https://t.me/${u.slice(1)}` : null;
const waHref = (p: string | null) => { const d = (p || "").replace(/\D/g, ""); return d.length >= 8 ? `https://wa.me/${d}` : null; };

function csv(rows: Payment[]) {
  const head = ["Nom", "E-mail", "Téléphone", "Telegram", "Montant", "Statut", "Payé le", "Dans le canal", "Compte Telegram"];
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map(p => [p.full_name || "", p.email || "", p.phone || "", p.telegram_username || "", money(p.amount_total, p.currency), STATUS[p.status]?.label || p.status, date(p.created_at), p.channel_joined_at ? date(p.channel_joined_at) : "non", p.channel_username ? "@" + p.channel_username : ""].map(cell).join(";"));
  const blob = new Blob(["﻿" + [head.map(cell).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `clients-vip-stripe-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

export default function StripePayments() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    setError(null);
    try { const r = await vipRequest<{ payments: Payment[] }>("/api/admin/stripe-payments"); setPayments(r.payments); }
    catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible."); setPayments([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payments || []).filter(p => !q || [p.full_name, p.email, p.phone, p.telegram_username, p.channel_username].some(v => (v || "").toLowerCase().includes(q)));
  }, [payments, query]);
  const active = (payments || []).filter(p => p.status === "active").length;

  return <section className={s.card}>
    <header className={s.head}>
      <div><h3><CreditCard size={17} aria-hidden="true" /> Clients VIP payés par Stripe</h3><p>Chaque paiement arrive ici tout seul, avec le lien d’accès envoyé au client. <b>{active}</b> actif{active > 1 ? "s" : ""}.</p></div>
      <div className={s.actions}>
        <button type="button" onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" /> Actualiser</button>
        <button type="button" onClick={() => csv(list)} disabled={!list.length}><Download size={14} aria-hidden="true" /> Exporter (Excel)</button>
      </div>
    </header>
    <label className={s.search}><Search size={15} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nom, e-mail, téléphone, Telegram…" /></label>
    {error && <p className={s.error}>{error}</p>}
    {payments === null ? <p className={s.empty}>Chargement…</p> : list.length ? <div className={s.table} role="table">
      <div className={s.rowHead} role="row"><span>Client</span><span>Contact</span><span>Paiement</span><span>Canal VIP</span></div>
      {list.map(p => { const st = STATUS[p.status] || STATUS.active; const tg = tgHref(p.telegram_username), wa = waHref(p.phone); return <div className={s.row} role="row" key={p.id}>
        <div><b>{p.full_name || "Nom non renseigné"}</b><small>{p.email || "—"}</small></div>
        <div className={s.contact}>
          {p.phone ? (wa ? <a href={wa} target="_blank" rel="noopener">{p.phone}</a> : <span>{p.phone}</span>) : <span className={s.dim}>Pas de téléphone</span>}
          {p.telegram_username ? (tg ? <a href={tg} target="_blank" rel="noopener">{p.telegram_username}</a> : <span>{p.telegram_username}</span>) : <span className={s.dim}>Pas de Telegram</span>}
        </div>
        <div><b>{money(p.amount_total, p.currency)}</b><small>le {date(p.created_at)}</small><em data-tone={st.tone}>{st.label}</em></div>
        <div>{p.channel_joined_at ? <><b className={s.ok}>✓ Rejoint</b><small>{p.channel_username ? "@" + p.channel_username : ""} · {date(p.channel_joined_at)}</small></> : p.invite_url ? <><b className={s.wait}>Lien envoyé</b><small>pas encore rejoint</small></> : <b className={s.bad}>Lien à créer</b>}{p.removed_at && <small>Retiré le {date(p.removed_at)}</small>}</div>
      </div>; })}
    </div> : <p className={s.empty}>{query ? "Aucun client ne correspond." : "Aucun paiement Stripe reçu pour l’instant. Ils apparaîtront ici dès le prochain paiement."}</p>}
  </section>;
}
