"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import s from "./abonne.module.css";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string } | { kind: "done"; already?: boolean; pending?: boolean };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function SubscriberForm() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showPwd, setShowPwd] = useState(false);
  const max = useMemo(today, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const get = (k: string) => String(f.get(k) || "").trim();
    if (mode === "signup" && get("password") !== get("password2")) { setStatus({ kind: "error", message: "Les deux mots de passe ne sont pas identiques." }); return; }
    setStatus({ kind: "sending" });
    try {
      const response = await fetch("/api/vip/abonne", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ mode, firstName: get("firstName"), lastName: get("lastName"), email: get("email"), phone: get("phone"), telegram: get("telegram"), paidOn: get("paidOn"), password: String(f.get("password") || ""), website: get("website") }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.session?.access_token) await createClient().auth.setSession(result.session).catch(() => null);
      if (!response.ok) {
        if (result.code === "EXISTING_ACCOUNT") setMode("login");
        setStatus({ kind: "error", message: result.error || "Envoi impossible. Réessaie dans un instant." });
        return;
      }
      setStatus({ kind: "done", already: !!result.already, pending: !!result.pending });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setStatus({ kind: "error", message: "Connexion impossible. Vérifie ta connexion internet et réessaie." }); }
  }

  if (status.kind === "done") return <main className={s.page}><section className={s.card}>
    <div className={s.big}>🎉</div>
    <h1>{status.already ? "Ton accès VIP est déjà actif" : "C’est envoyé !"}</h1>
    <p className={s.lead}>{status.already ? "Ton compte est connecté et ton abonnement VIP est déjà actif." : status.pending ? "Ta demande était déjà en cours de vérification : pas besoin de la renvoyer." : "Ton compte InvestPro est créé et tu es connecté. On vérifie ton paiement Stripe, puis tu reçois ton lien personnel pour rejoindre le canal VIP sur Telegram."}</p>
    <ul className={s.next}><li>✅ Compte InvestPro connecté</li><li>{status.already ? "✅" : "⏳"} Validation de ton abonnement par l’équipe</li><li>🔗 Lien du canal VIP Telegram dès la validation</li></ul>
    <a className={s.primary} href="/dashboard/vip">Ouvrir mon espace VIP</a>
    <p className={s.fine}>Une question ? Écris à <a href="https://t.me/EquipeInvestPro">@EquipeInvestPro</a> sur Telegram.</p>
  </section></main>;

  const sending = status.kind === "sending";
  return <main className={s.page}>
    <section className={s.card}>
      <span className={s.kicker}>InvestPro VIP · Abonnement</span>
      <h1>Active ton accès VIP</h1>
      <p className={s.lead}>Tu as payé ton abonnement sur Stripe ? Remplis ce formulaire : ton compte InvestPro est créé en même temps et ton accès est activé dès qu’on a vérifié ton paiement.</p>

      <div className={s.switch} role="tablist" aria-label="Compte InvestPro">
        <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>Je n’ai pas de compte</button>
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>J’ai déjà un compte</button>
      </div>

      <form className={s.form} onSubmit={submit} noValidate={false}>
        <div className={s.row}>
          <label>Prénom<input name="firstName" required maxLength={80} autoComplete="given-name" placeholder="Julien" /></label>
          <label>Nom<input name="lastName" required maxLength={80} autoComplete="family-name" placeholder="Martin" /></label>
        </div>
        <label>Adresse e-mail<small>Idéalement celle utilisée pour payer sur Stripe</small><input name="email" type="email" required autoComplete="email" placeholder="julien.martin@gmail.com" /></label>
        <label>Numéro WhatsApp<small>Avec l’indicatif du pays</small><input name="phone" type="tel" required autoComplete="tel" placeholder="+33 6 12 34 56 78" /></label>
        <label>Pseudo Telegram<small>Telegram › Paramètres › Nom d’utilisateur</small><input name="telegram" required autoCapitalize="none" spellCheck={false} placeholder="@julienmartin" /></label>
        <label>Date de ton paiement Stripe<input name="paidOn" type="date" required max={max} defaultValue={max} /></label>
        <label>{mode === "signup" ? "Choisis un mot de passe" : "Mot de passe de ton compte InvestPro"}<small>{mode === "signup" ? "8 caractères minimum" : <a href="/login">Mot de passe oublié ?</a>}</small>
          <span className={s.pwd}><input name="password" type={showPwd ? "text" : "password"} required minLength={8} maxLength={72} autoComplete={mode === "signup" ? "new-password" : "current-password"} /><button type="button" onClick={() => setShowPwd(v => !v)} aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPwd ? "Masquer" : "Afficher"}</button></span>
        </label>
        {mode === "signup" && <label>Confirme ton mot de passe<input name="password2" type={showPwd ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" /></label>}
        <div className={s.hp} aria-hidden="true"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        {status.kind === "error" && <p className={s.error} role="alert">{status.message}</p>}
        <button className={s.primary} type="submit" disabled={sending}>{sending ? "Envoi en cours…" : mode === "signup" ? "Créer mon compte et activer mon VIP" : "Me connecter et activer mon VIP"}</button>
        <p className={s.fine}>Tes infos restent privées : seuls toi et l’équipe InvestPro y avez accès.</p>
      </form>
    </section>
  </main>;
}
