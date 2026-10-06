"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Server,
  ShieldCheck,
  WalletCards,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Account = {
  id: number | string;
  name: string;
  balance: number | null;
  canTrade: boolean;
  isVisible: boolean;
};

export default function ProjectXConnectionPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userName, setUserName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [success, setSuccess] = useState(false);

  async function testConnection() {
    try {
      setLoading(true);
      setError("");
      setSuccess(false);
      setAccounts([]);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/futures/projectx/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userName,
          apiKey,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Connexion ProjectX impossible.");
      }

      setAccounts(json.accounts || []);
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || "Connexion ProjectX impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full pb-10">
      <div className="mb-5">
        <Link
          href="/dashboard/connexions"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--muted)] no-underline hover:text-white"
        >
          <ArrowLeft size={14} />
          Retour au centre des connexions
        </Link>
      </div>

      <section className="overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="border-b border-white/[0.06] p-5 md:p-7 lg:border-b-0 lg:border-r">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <Zap size={11} />
              Futures · ProjectX
            </div>

            <h1 className="mt-4 text-2xl font-semibold text-white">
              Connecter ton compte <span className="text-[color:var(--gold)]">TopstepX</span>
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
              Cette première étape teste uniquement la connexion et récupère la liste
              de tes comptes ProjectX. Aucun ordre n’est envoyé et ta clé n’est pas
              enregistrée.
            </p>

            <div className="mt-6 space-y-3">
              <Feature
                icon={<ShieldCheck size={15} />}
                title="Lecture seule pour le test"
                text="InvestPro récupère seulement tes comptes actifs."
              />
              <Feature
                icon={<KeyRound size={15} />}
                title="Clé non stockée"
                text="La clé API sert uniquement pendant cette requête de test."
              />
              <Feature
                icon={<Server size={15} />}
                title="Connexion serveur à serveur"
                text="Les identifiants ProjectX ne sont jamais placés dans l’URL."
              />
            </div>

            <div className="mt-6 rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
              <div className="text-xs font-semibold text-amber-300">
                Avant le test
              </div>
              <p className="mt-2 text-[10px] leading-5 text-white/40">
                TopstepX demande un accès API ProjectX actif et lié à ton profil.
                Le username demandé ici est ton nom d’utilisateur de plateforme,
                pas ton adresse e-mail.
              </p>
            </div>
          </div>

          <div className="p-5 md:p-7">
            <div className="text-sm font-semibold text-white">
              Identifiants ProjectX
            </div>

            <label className="mt-5 block">
              <span className="text-[10px] font-medium text-white/35">
                Username TopstepX
              </span>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Ex. trader95"
                autoComplete="username"
                className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-[color:var(--gold-border)]"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-[10px] font-medium text-white/35">
                Clé API ProjectX
              </span>

              <div className="relative mt-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Colle ta clé API"
                  autoComplete="off"
                  className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 pr-12 text-sm text-white outline-none placeholder:text-white/20 focus:border-[color:var(--gold-border)]"
                />

                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                  aria-label="Afficher ou masquer la clé"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button
              type="button"
              onClick={testConnection}
              disabled={loading || !userName.trim() || !apiKey.trim()}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Connexion en cours…
                </>
              ) : (
                <>
                  Tester ma connexion
                  <Zap size={14} />
                </>
              )}
            </button>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-[11px] leading-5 text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <CheckCircle2 size={16} />
                  Connexion ProjectX réussie
                </div>

                <div className="mt-4 space-y-3">
                  {accounts.length ? (
                    accounts.map((account) => (
                      <div
                        key={String(account.id)}
                        className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-white">
                              <WalletCards size={15} className="text-[color:var(--gold)]" />
                              {account.name}
                            </div>
                            <div className="mt-1 text-[9px] text-white/28">
                              ID ProjectX : {account.id}
                            </div>
                          </div>

                          <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-1 text-[8px] font-semibold text-emerald-400">
                            ACTIF
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <MiniStat
                            label="Balance"
                            value={
                              account.balance != null
                                ? `${account.balance.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })} $`
                                : "—"
                            }
                          />
                          <MiniStat
                            label="Trading"
                            value={account.canTrade ? "Autorisé" : "Non autorisé"}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4 text-[11px] text-white/40">
                      Connexion valide, mais aucun compte actif trouvé.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 text-[10px] leading-5 text-[color:var(--gold)]">
                  Test validé. L’étape suivante permettra d’enregistrer la connexion
                  de façon chiffrée et de synchroniser automatiquement le compte dans InvestPro.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="mt-1 text-[10px] leading-5 text-white/35">{text}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
      <div className="text-[8px] uppercase tracking-[0.1em] text-white/25">
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold text-white">{value}</div>
    </div>
  );
}
