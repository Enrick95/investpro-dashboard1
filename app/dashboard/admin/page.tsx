"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { pushNotif } from "../../../lib/notifyStore";

const MAINT_KEY = "investpro_maintenance_v1";

type Kind =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "admin"
  | "live"
  | "video"
  | "pending"
  | "tp"
  | "sl"
  | "be";

export default function AdminPage() {
  const [title, setTitle] = useState("Annonce Admin");
  const [message, setMessage] = useState("Message global…");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<Kind>("admin");
  const [ttl, setTtl] = useState("15000");

  const [maintenance, setMaintenance] = useState(() => {
    try {
      return localStorage.getItem(MAINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  const ttlMs = useMemo(() => {
    const n = Number(ttl);
    return Number.isFinite(n) ? Math.max(3000, Math.min(60000, n)) : 15000;
  }, [ttl]);

  function toggleMaintenance() {
    const next = !maintenance;
    setMaintenance(next);
    try {
      localStorage.setItem(MAINT_KEY, next ? "1" : "0");
    } catch {}
    pushNotif({
      kind: next ? "warning" : "success",
      title: "Maintenance",
      message: next ? "Mode maintenance activé." : "Mode maintenance désactivé.",
      ttlMs: 12000,
    });
  }

  function send() {
    pushNotif({
      kind,
      title,
      message,
      url: url.trim() ? url.trim() : undefined,
      ttlMs,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Admin <span className="text-[color:var(--gold)]">Panel</span>
        </h1>
        <p className="text-[color:var(--muted)] mt-1">
          MVP local (pas de DB). Sert à tester les notifications.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Maintenance</div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm text-white/80">
              {maintenance ? "ACTIVÉE" : "DÉSACTIVÉE"}
            </div>
            <Button variant={maintenance ? "danger" : "secondary"} onClick={toggleMaintenance}>
              {maintenance ? "Désactiver" : "Activer"}
            </Button>
          </div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Couleurs / types</div>
          <div className="mt-2 text-sm text-white/70">
            Admin, Live, Video, Warning, Error, TP/SL/BE…
          </div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Durée</div>
          <div className="mt-2 text-sm text-white/70">
            TTL entre 3s et 60s
          </div>
        </CardSubCard>
      </div>

      <Card>
        <CardBody>
          <div className="text-lg font-semibold">Envoyer une notification (test)</div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-sm text-white/70 mb-2">Titre</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">Type</div>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white outline-none"
              >
                <option value="admin">admin</option>
                <option value="live">live</option>
                <option value="video">video</option>
                <option value="info">info</option>
                <option value="success">success</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
                <option value="pending">pending</option>
                <option value="tp">tp</option>
                <option value="sl">sl</option>
                <option value="be">be</option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm text-white/70 mb-2">Message</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">URL (optionnel)</div>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white outline-none"
              />
            </label>

            <label className="block">
              <div className="text-sm text-white/70 mb-2">TTL (ms)</div>
              <input
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/10 text-white outline-none"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={send}>Envoyer</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
