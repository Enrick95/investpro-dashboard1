"use client";

import { useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

export default function ContactPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<string | null>(null);

  function send() {
    setOk("✅ Message envoyé (démo).");
    setSubject("");
    setMessage("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Nous <span className="text-[color:var(--gold)]">contacter</span>
        </h1>
        <p className="text-[color:var(--muted)] mt-1">
          Support / questions / partenariats.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardBody>
            {ok ? (
              <div className="mb-4 text-sm rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] p-3">
                {ok}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4">
              <label className="block">
                <div className="text-sm text-white/70 mb-2">Sujet</div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                             text-white outline-none focus:border-[color:var(--gold-border)]
                             focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                  placeholder="Ex: question abonnement"
                />
              </label>

              <label className="block">
                <div className="text-sm text-white/70 mb-2">Message</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                             text-white outline-none focus:border-[color:var(--gold-border)]
                             focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
                  placeholder="Explique ta demande..."
                />
              </label>

              <Button onClick={send}>Envoyer</Button>
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
                <div className="text-xs text-[color:var(--muted)]">Discord</div>
                <div className="mt-1 text-sm text-white/90">/invite (plus tard)</div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs text-[color:var(--muted)]">Horaires</div>
                <div className="mt-1 text-sm text-white/90">Lun–Ven • 9h–18h</div>
              </CardSubCard>
            </div>

            <div className="mt-4 text-xs text-[color:var(--muted)]">
              * En prod : tickets + email automatique.
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
