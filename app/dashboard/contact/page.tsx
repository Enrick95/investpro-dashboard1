"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, MessageCircle, Send } from "lucide-react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  admin_reply?: string | null;
  created_at: string;
  updated_at: string;
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

function statusLabel(status: string) {
  if (status === "open") return "Reçu";
  if (status === "in_progress") return "En cours";
  if (status === "answered") return "Répondu";
  if (status === "resolved") return "Résolu";
  if (status === "closed") return "Fermé";
  return status;
}

export default function ContactPage() {
  const supabase = useMemo(() => createClient(), []);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function loadTickets() {
    try {
      setLoadingTickets(true);
      const accessToken = await token();
      if (!accessToken) return;

      const response = await fetch("/api/support/ticket", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      const json = await response.json();
      if (response.ok) setTickets(json.tickets || []);
    } finally {
      setLoadingTickets(false);
    }
  }

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    setOk(null);
    setError(null);

    if (subject.trim().length < 3) {
      setError("Ajoute un sujet un peu plus précis.");
      return;
    }

    if (message.trim().length < 10) {
      setError("Explique ta demande en quelques lignes.");
      return;
    }

    try {
      setSending(true);
      const accessToken = await token();

      if (!accessToken) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/support/ticket", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subject, message }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Impossible d’envoyer ta demande.");
      }

      setOk("✅ Message envoyé à l’équipe InvestPro.");
      setSubject("");
      setMessage("");
      await loadTickets();
    } catch (e: any) {
      setError(e?.message || "Impossible d’envoyer ta demande.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Nous <span className="text-[color:var(--gold)]">contacter</span>
        </h1>
        <p className="mt-1 text-[color:var(--muted)]">
          Support, questions et partenariats — tes demandes arrivent directement dans le back-office InvestPro.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardBody>
            {ok ? (
              <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm text-emerald-300">
                {ok}
              </div>
            ) : null}

            {error ? (
              <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4">
              <label className="block">
                <div className="mb-2 text-sm text-white/70">Sujet</div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--border)] bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)]"
                  placeholder="Ex : question sur mon compte"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm text-white/70">Message</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="w-full rounded-2xl border border-[color:var(--border)] bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)]"
                  placeholder="Explique ta demande..."
                />
              </label>

              <Button onClick={send} disabled={sending}>
                {sending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Envoi...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Send size={14} />
                    Envoyer
                  </span>
                )}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Infos</div>
            <div className="mt-4 space-y-3">
              <CardSubCard>
                <div className="text-xs text-[color:var(--muted)]">Email</div>
                <div className="mt-1 text-sm text-white/90">support@investpro-trading.com</div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs text-[color:var(--muted)]">Suivi</div>
                <div className="mt-1 text-sm text-white/90">Directement dans ton espace</div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs text-[color:var(--muted)]">Horaires</div>
                <div className="mt-1 text-sm text-white/90">Lun–Ven • 9h–18h</div>
              </CardSubCard>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-[color:var(--gold)]" />
            <div className="font-semibold text-white">Mes demandes</div>
          </div>

          <div className="mt-4 space-y-3">
            {loadingTickets ? (
              <div className="py-8 text-center text-sm text-white/30">
                Chargement…
              </div>
            ) : tickets.length ? (
              tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-2xl border border-white/[0.07] bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{ticket.subject}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[9px] text-white/30">
                        <Clock3 size={11} />
                        {dateLabel(ticket.created_at)}
                      </div>
                    </div>

                    <span className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2.5 py-1 text-[9px] font-semibold text-[color:var(--gold)]">
                      {statusLabel(ticket.status)}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-white/50">
                    {ticket.message}
                  </p>

                  {ticket.admin_reply ? (
                    <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-300">
                        <CheckCircle2 size={13} />
                        Réponse InvestPro
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-white/55">
                        {ticket.admin_reply}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-white/30">
                Aucune demande pour le moment.
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
