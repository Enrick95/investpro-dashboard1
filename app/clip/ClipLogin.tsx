"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import styles from "./clip.module.css";
import { clipSignIn } from "@/lib/clip/client";
import { useClipPath } from "./views/clipPath";

/** Connexion directement dans l'espace clippeurs (aucune redirection vers une autre page du site). */
export default function ClipLogin({ onDone, title = "Connexion", intro, joinLink = true, defaultEmail = "" }: { onDone: () => void; title?: string; intro?: string; joinLink?: boolean; defaultEmail?: string }) {
  const to = useClipPath();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await clipSignIn(email, password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 className={styles.h2}>{title}</h2>
      {intro ? <p className={`${styles.small} ${styles.soft}`} style={{ margin: 0 }}>{intro}</p> : null}
      <div className={styles.field}>
        <label htmlFor="login-email" className={styles.label}>E-mail</label>
        <input id="login-email" className={styles.input} type="email" inputMode="email" autoComplete="email" maxLength={120} value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className={styles.field}>
        <label htmlFor="login-password" className={styles.label}>Mot de passe</label>
        <input id="login-password" className={styles.input} type="password" autoComplete="current-password" maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="submit" className={`${styles.btn} ${styles.btnBlock}`} disabled={busy || !email.trim() || !password}>
        {busy ? <Loader2 size={17} className={styles.spin} aria-hidden="true" /> : null}
        Se connecter
      </button>
      <button type="button" className={styles.linkBtn} style={{ alignSelf: "center" }} aria-expanded={forgot} onClick={() => setForgot((open) => !open)}>Mot de passe oublié ?</button>
      {forgot ? <p className={`${styles.small} ${styles.soft}`} style={{ margin: 0 }}>Écris-nous sur WhatsApp : on t&apos;envoie un mot de passe provisoire, que tu pourras changer dans ton profil.</p> : null}
      {joinLink ? (
        <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0, textAlign: "center" }}>
          Pas encore de compte ? <Link href={to("/clip")} className={styles.gold} style={{ fontWeight: 700 }}>Devenir clippeur</Link>
        </p>
      ) : null}
    </form>
  );
}
