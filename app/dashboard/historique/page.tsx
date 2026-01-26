"use client";

import { useMemo } from "react";
import { History, Shield, Activity, LogIn } from "lucide-react";
import { getCurrentAccount } from "@/lib/authStore";

function Card(props: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] backdrop-blur p-5">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-2xl border border-white/10 bg-black/10 dark:bg-black/20 flex items-center justify-center">
          {props.icon}
        </span>
        <div className="text-base font-semibold text-[color:var(--text,white)]">{props.title}</div>
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

export default function HistoriquePage() {
  const acc: any = useMemo(() => getCurrentAccount(), []);

  // 🔧 Exemple: plus tard tu remplaceras par DB (logs)
  const loginHistory = [
    { at: "—", ip: "—", device: "Chrome / Windows", status: "OK" },
    { at: "—", ip: "—", device: "Opera / Windows", status: "OK" },
  ];

  const activity = [
    { at: "—", label: "Ouverture du dashboard", kind: "activity" },
    { at: "—", label: "Consultation du terminal", kind: "activity" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--text,white)]">Historique</h1>
        <p className="text-sm mt-1 text-[color:var(--muted)]">
          Connexions, sessions et activité de compte ({acc?.username || "Utilisateur"}).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Connexions" icon={<LogIn size={18} className="text-white/80" />}>
          <div className="overflow-hidden rounded-2xl border border-[color:var(--border)]">
            <div className="grid grid-cols-12 text-[11px] uppercase tracking-wide text-[color:var(--muted)] bg-black/5 dark:bg-black/20 px-4 py-3">
              <div className="col-span-4">Date</div>
              <div className="col-span-3">IP</div>
              <div className="col-span-4">Appareil</div>
              <div className="col-span-1">OK</div>
            </div>

            {loginHistory.map((x, i) => (
              <div key={i} className="grid grid-cols-12 px-4 py-3 border-t border-[color:var(--border)]">
                <div className="col-span-4 text-sm text-[color:var(--text,white)]/80">{x.at}</div>
                <div className="col-span-3 text-sm text-[color:var(--text,white)]/80">{x.ip}</div>
                <div className="col-span-4 text-sm text-[color:var(--text,white)]/80">{x.device}</div>
                <div className="col-span-1 text-sm font-semibold text-emerald-300">{x.status}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-xs text-[color:var(--muted)]">
            Conseil: plus tard on peut logguer les sessions et permettre “Déconnecter toutes les sessions”.
          </div>
        </Card>

        <Card title="Sécurité" icon={<Shield size={18} className="text-white/80" />}>
          <div className="rounded-2xl border border-[color:var(--border)] p-4">
            <div className="text-sm font-semibold text-[color:var(--text,white)]">État</div>
            <ul className="mt-2 text-sm text-[color:var(--muted)] space-y-1">
              <li>• 2FA : à ajouter</li>
              <li>• Alertes connexion : à ajouter</li>
              <li>• Sessions actives : à ajouter</li>
            </ul>
          </div>
        </Card>
      </div>

      <Card title="Activité récente" icon={<Activity size={18} className="text-white/80" />}>
        <div className="space-y-2">
          {activity.map((a, i) => (
            <div
              key={i}
              className="px-4 py-3 rounded-2xl border border-[color:var(--border)] bg-black/5 dark:bg-black/20"
            >
              <div className="text-sm font-semibold text-[color:var(--text,white)]/85">{a.label}</div>
              <div className="text-xs text-[color:var(--muted)] mt-1">{a.at}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
