"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AppWindow,
  ArrowRight,
  Cable,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type UserInfo = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type ProfileInfo = {
  username?: string | null;
  plan?: string | null;
  xp?: number | null;
};

type DeletionRequest = {
  id: string;
  status: string;
  requested_at: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function detectDevice() {
  if (typeof navigator === "undefined") {
    return { browser: "Navigateur", device: "Cet appareil" };
  }

  const ua = navigator.userAgent;

  let browser = "Navigateur";
  if (/Edg/i.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Google Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";

  let device = "Ordinateur";
  if (/iPhone|iPad|iPod/i.test(ua)) device = "iPhone / iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";

  return { browser, device };
}

export default function AccountSecurityPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [message, setMessage] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [globalLogoutBusy, setGlobalLogoutBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");

  const device = useMemo(() => detectDevice(), []);

  async function load() {
    try {
      setLoading(true);
      setMessage(null);

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authUser) {
        window.location.href = "/login";
        return;
      }

      setUser({
        id: authUser.id,
        email: authUser.email || "—",
        createdAt: authUser.created_at || null,
        lastSignInAt: authUser.last_sign_in_at || null,
      });

      const profileResult = await supabase
        .from("profiles")
        .select("username,plan,xp")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!profileResult.error) {
        setProfile(profileResult.data || null);
      }

      const deletion = await supabase
        .from("account_deletion_requests")
        .select("id,status,requested_at")
        .eq("user_id", authUser.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!deletion.error) {
        setDeletionRequest(deletion.data || null);
      } else {
        // Si le SQL n'est pas encore exécuté, le reste de la page doit continuer à fonctionner.
        setDeletionRequest(null);
      }
    } catch (e: any) {
      setMessage({
        kind: "error",
        text: e?.message || "Impossible de charger les informations du compte.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({
        kind: "error",
        text: "Utilise au minimum 8 caractères pour ton nouveau mot de passe.",
      });
      return;
    }

    if (password !== passwordConfirm) {
      setMessage({
        kind: "error",
        text: "Les deux mots de passe ne correspondent pas.",
      });
      return;
    }

    try {
      setPasswordBusy(true);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setPassword("");
      setPasswordConfirm("");
      setMessage({
        kind: "success",
        text: "Ton mot de passe a bien été mis à jour.",
      });
    } catch (e: any) {
      setMessage({
        kind: "error",
        text: e?.message || "Impossible de modifier le mot de passe.",
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function logoutCurrent() {
    try {
      setLogoutBusy(true);
      await supabase.auth.signOut({ scope: "local" });
      window.location.href = "/login";
    } catch (e: any) {
      setMessage({
        kind: "error",
        text: e?.message || "Impossible de déconnecter cette session.",
      });
      setLogoutBusy(false);
    }
  }

  async function logoutEverywhere() {
    try {
      setGlobalLogoutBusy(true);
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      window.location.href = "/login";
    } catch (e: any) {
      setMessage({
        kind: "error",
        text: e?.message || "Impossible de déconnecter les autres sessions.",
      });
      setGlobalLogoutBusy(false);
    }
  }

  function openInstallGuide() {
    window.dispatchEvent(new Event("investpro:open-install-guide"));
  }

  async function requestDeletion() {
    if (!user) return;

    if (deletePhrase.trim().toUpperCase() !== "SUPPRIMER") {
      setMessage({
        kind: "error",
        text: 'Écris exactement « SUPPRIMER » pour confirmer la demande.',
      });
      return;
    }

    try {
      setDeletionBusy(true);
      setMessage(null);

      const { data, error } = await supabase
        .from("account_deletion_requests")
        .insert({
          user_id: user.id,
          email_snapshot: user.email,
          status: "pending",
        })
        .select("id,status,requested_at")
        .single();

      if (error) throw error;

      setDeletionRequest(data);
      setConfirmDelete(false);
      setDeletePhrase("");
      setMessage({
        kind: "success",
        text: "Ta demande de suppression a été enregistrée. Le compte n’est pas supprimé automatiquement.",
      });
    } catch (e: any) {
      setMessage({
        kind: "error",
        text:
          e?.message ||
          "Impossible d’enregistrer la demande de suppression. Vérifie que le SQL fourni a bien été exécuté.",
      });
    } finally {
      setDeletionBusy(false);
    }
  }

  async function cancelDeletionRequest() {
    if (!deletionRequest) return;

    try {
      setDeletionBusy(true);
      const { error } = await supabase
        .from("account_deletion_requests")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", deletionRequest.id);

      if (error) throw error;

      setDeletionRequest(null);
      setMessage({
        kind: "success",
        text: "La demande de suppression a été annulée.",
      });
    } catch (e: any) {
      setMessage({
        kind: "error",
        text: e?.message || "Impossible d’annuler la demande.",
      });
    } finally {
      setDeletionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[80px]" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <ShieldCheck size={12} />
            Compte & sécurité
          </div>

          <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
            Protège ton <span className="text-[color:var(--gold)]">espace InvestPro</span>
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
            Gère tes identifiants, tes sessions et les actions sensibles de ton compte.
          </p>
        </div>
      </section>

      {message ? (
        <div
          className={[
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-xs",
            message.kind === "success"
              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
              : message.kind === "error"
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
          ].join(" ")}
        >
          {message.kind === "success" ? (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          ) : message.kind === "error" ? (
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          ) : (
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          )}
          {message.text}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <Card
            icon={<UserRound size={17} />}
            title="Informations du compte"
            subtitle="Identité de connexion et statut InvestPro."
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <InfoRow
                icon={<Mail size={15} />}
                label="Adresse e-mail"
                value={user?.email || "—"}
              />
              <InfoRow
                icon={<ShieldCheck size={15} />}
                label="Plan"
                value={(profile?.plan || "PRO").toUpperCase()}
                accent
              />
              <InfoRow
                icon={<UserRound size={15} />}
                label="Pseudo"
                value={profile?.username || "Non renseigné"}
              />
              <InfoRow
                icon={<RefreshCw size={15} />}
                label="Dernière connexion"
                value={formatDate(user?.lastSignInAt)}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard/profil"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)]"
              >
                Modifier mon profil
                <ArrowRight size={13} />
              </Link>

              <Link
                href="/dashboard/connexions"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-xs font-semibold text-white/70"
              >
                <Cable size={14} />
                Mes connexions
              </Link>
            </div>
          </Card>

          <Card
            icon={<KeyRound size={17} />}
            title="Changer le mot de passe"
            subtitle="Choisis un mot de passe unique pour InvestPro."
          >
            <form onSubmit={updatePassword} className="space-y-3">
              <PasswordField
                label="Nouveau mot de passe"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />

              <PasswordField
                label="Confirmer le nouveau mot de passe"
                value={passwordConfirm}
                onChange={setPasswordConfirm}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-[9px] leading-4 text-white/35">
                  Minimum 8 caractères. Évite de réutiliser le mot de passe d’un broker ou d’une prop firm.
                </div>

                <button
                  type="submit"
                  disabled={passwordBusy}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-semibold text-black disabled:opacity-50"
                >
                  {passwordBusy ? <Loader2 size={14} className="animate-spin" /> : <LockKeyhole size={14} />}
                  Mettre à jour
                </button>
              </div>
            </form>
          </Card>

          <Card
            icon={<Laptop size={17} />}
            title="Appareils & sessions"
            subtitle="Contrôle rapidement les sessions liées à ton compte."
          >
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400">
                    {/iPhone|iPad|Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? (
                      <Smartphone size={17} />
                    ) : (
                      <Laptop size={17} />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold text-white">
                        {device.device} · {device.browser}
                      </div>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2 py-0.5 text-[8px] font-bold uppercase text-emerald-400">
                        Session actuelle
                      </span>
                    </div>

                    <div className="mt-1 text-[9px] text-white/35">
                      Dernière authentification : {formatDate(user?.lastSignInAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-[9px] leading-4 text-white/35">
              InvestPro ne peut pas afficher une liste détaillée de tous les appareils depuis le navigateur, mais tu peux fermer toutes les autres sessions en un clic.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={logoutCurrent}
                disabled={logoutBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-white/70 disabled:opacity-50"
              >
                {logoutBusy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                Déconnecter cet appareil
              </button>

              <button
                type="button"
                onClick={logoutEverywhere}
                disabled={globalLogoutBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] text-xs font-semibold text-amber-300 disabled:opacity-50"
              >
                {globalLogoutBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Déconnecter partout
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Card
            icon={<MonitorSmartphone size={17} />}
            title="InvestPro Mobile"
            subtitle="Installe la plateforme comme une application."
          >
            <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/20 text-[color:var(--gold)]">
                <AppWindow size={20} />
              </div>

              <div className="mt-4 text-sm font-semibold text-white">
                InvestPro directement sur ton écran d’accueil
              </div>

              <p className="mt-2 text-[10px] leading-5 text-white/45">
                Accède au Dashboard, Journal, Comptes et Rapports sans rechercher le site dans ton navigateur.
              </p>

              <button
                type="button"
                onClick={openInstallGuide}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] text-xs font-semibold text-black"
              >
                <MonitorSmartphone size={14} />
                Installer / voir le guide
              </button>
            </div>
          </Card>

          <Card
            icon={<ShieldCheck size={17} />}
            title="Bonnes pratiques"
            subtitle="Quelques règles simples pour protéger tes accès."
          >
            <div className="space-y-3">
              <SecurityTip text="Utilise un mot de passe différent de tes brokers, prop firms et e-mails." />
              <SecurityTip text="Ne partage jamais une clé API, une clé de synchronisation ou ton mot de passe dans Telegram/Discord." />
              <SecurityTip text="Utilise « Déconnecter partout » si tu penses qu’un autre appareil est encore connecté." />
              <SecurityTip text="Les intégrations trading InvestPro restent en lecture seule : aucun ordre n’est envoyé." />
            </div>
          </Card>

          <Card
            icon={<Trash2 size={17} />}
            title="Suppression du compte"
            subtitle="Action sensible — la demande est enregistrée avant suppression définitive."
            danger
          >
            {deletionRequest ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Demande de suppression en attente
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-white/40">
                      Envoyée le {formatDate(deletionRequest.requested_at)}. Rien n’est supprimé automatiquement.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={cancelDeletionRequest}
                  disabled={deletionBusy}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[10px] font-semibold text-white/60 disabled:opacity-50"
                >
                  {deletionBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Annuler la demande
                </button>
              </div>
            ) : !confirmDelete ? (
              <>
                <p className="text-[10px] leading-5 text-white/40">
                  Cette action crée uniquement une demande. Ton compte, ton journal et tes données restent intacts tant que la suppression n’a pas été traitée.
                </p>

                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 text-xs font-semibold text-red-300"
                >
                  <Trash2 size={14} />
                  Demander la suppression
                </button>
              </>
            ) : (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4">
                <div className="text-xs font-semibold text-red-200">
                  Confirme ta demande
                </div>

                <p className="mt-2 text-[9px] leading-4 text-white/40">
                  Écris <strong className="text-white">SUPPRIMER</strong> ci-dessous. La demande sera enregistrée mais aucune donnée ne sera effacée automatiquement.
                </p>

                <input
                  value={deletePhrase}
                  onChange={(event) => setDeletePhrase(event.target.value)}
                  placeholder="SUPPRIMER"
                  className="mt-3 h-10 w-full rounded-xl border border-red-500/20 bg-black/25 px-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-red-400/40"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(false);
                      setDeletePhrase("");
                    }}
                    className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-white/55"
                  >
                    Annuler
                  </button>

                  <button
                    type="button"
                    onClick={requestDeletion}
                    disabled={deletionBusy}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500/15 text-[10px] font-semibold text-red-300 disabled:opacity-50"
                  >
                    {deletionBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Confirmer
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

function Card({
  icon,
  title,
  subtitle,
  children,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={[
        "rounded-[22px] border bg-[color:var(--panel)] p-5",
        danger ? "border-red-500/15" : "border-[color:var(--border)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            danger
              ? "border-red-500/20 bg-red-500/[0.05] text-red-300"
              : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
          ].join(" ")}
        >
          {icon}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 text-[9px] leading-4 text-white/35">{subtitle}</p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className={accent ? "text-[color:var(--gold)]" : "text-white/35"}>
        {icon}
      </div>
      <div className="mt-3 text-[9px] text-white/30">{label}</div>
      <div className={accent ? "mt-1 text-xs font-semibold text-[color:var(--gold)]" : "mt-1 break-all text-xs font-semibold text-white"}>
        {value}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-medium text-white/55">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 pr-11 text-xs text-white outline-none placeholder:text-white/20 focus:border-[color:var(--gold-border)]"
        />

        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/35 hover:text-white/70"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </label>
  );
}

function SecurityTip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px] leading-5 text-white/55">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
      {text}
    </div>
  );
}
