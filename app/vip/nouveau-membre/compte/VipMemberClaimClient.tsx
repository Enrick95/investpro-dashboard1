"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { normalizeAccessCode } from "@/lib/vip/access-code";
import s from "./claim.module.css";

type ClaimedRequest = { first_name?: string; last_name?: string; member_number?: number; channel_invite_url?: string };

/** Rattache le dossier au compte connecté. Le serveur vérifie l’adresse e-mail et l’état de la demande. */
async function claimApplication(applicationId: string, accessToken: string): Promise<ClaimedRequest> {
  const response = await fetch("/api/vip/nouveau-membre/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ applicationId }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Impossible de rattacher le dossier au compte.");
  return (payload?.request as ClaimedRequest | undefined) || {};
}

function signInMessage(message: string): string {
  if (/confirm/i.test(message)) return "Ton adresse e-mail doit être confirmée avant l’accès. Écris à @EquipeInvestPro si tu n’as pas le lien de confirmation.";
  return "Identifiant ou code incorrect. Vérifie l’e-mail reçu. Si tu avais déjà un compte, entre ton mot de passe habituel.";
}

function Brand() {
  return (
    <div className={s.brand}>
      <span className={s.mark} aria-hidden="true">IP</span>
      <span>InvestPro</span>
    </div>
  );
}

function MissingLink() {
  return (
    <>
      <h1 className={s.title}>Ouvre le lien de ton e-mail</h1>
      <p className={s.lead}>Ce lien est incomplet. Clique sur le bouton de l’e-mail de validation : il ouvre directement ton accès VIP.</p>
      <p className={s.help}>Tu ne retrouves pas cet e-mail ? Écris à @EquipeInvestPro sur Telegram.</p>
    </>
  );
}

function Loading() {
  return (
    <>
      <h1 className={s.title}>Un instant</h1>
      <p className={s.loadingRow}>
        <span className={s.dot} aria-hidden="true" />
        On rattache ton dossier à ton compte…
      </p>
    </>
  );
}

function Welcome({ request }: { request: ClaimedRequest }) {
  return (
    <>
      <h1 className={s.title}>Bienvenue dans le VIP{request.first_name ? `, ${request.first_name}` : ""}.</h1>
      <p className={s.ok}>Ton accès est ouvert.</p>
      {request.member_number ? <p className={s.meta}>Membre n° {request.member_number}</p> : null}
      <div className={s.actions}>
        {request.channel_invite_url ? (
          <a className={s.primary} href={request.channel_invite_url} target="_blank" rel="noreferrer">
            Rejoindre le canal VIP
          </a>
        ) : null}
        <Link className={request.channel_invite_url ? s.secondary : s.primary} href="/dashboard/vip">
          Ouvrir mon espace VIP
        </Link>
      </div>
    </>
  );
}

export default function VipMemberClaimClient({ applicationId }: { applicationId: string }) {
  const validLink = /^[0-9a-f-]{36}$/i.test(applicationId);
  const [loading, setLoading] = useState(validLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<ClaimedRequest | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!validLink) return;
    let active = true;
    async function finish() {
      try {
        const { data, error: sessionError } = await createClient().auth.getSession();
        if (sessionError) throw sessionError;
        const token = data.session?.access_token;
        if (token) {
          const info = await claimApplication(applicationId, token);
          if (active) setRequest(info);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Impossible de terminer la demande.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void finish();
    return () => {
      active = false;
    };
  }, [applicationId, validLink]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const client = createClient();
      // D’abord la saisie telle quelle (mot de passe déjà existant), puis la forme canonique du code généré.
      const attempts = [code, normalizeAccessCode(code) ?? ""].filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
      let token: string | null = null;
      let lastMessage = "";
      for (const password of attempts) {
        const { data, error: signError } = await client.auth.signInWithPassword({ email: identifier.trim().toLowerCase(), password });
        if (!signError && data.session) {
          token = data.session.access_token;
          break;
        }
        lastMessage = signError?.message ?? "";
      }
      if (!token) throw new Error(signInMessage(lastMessage));
      setRequest(await claimApplication(applicationId, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de terminer la connexion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      <section className={s.card}>
        <Brand />
        {!validLink ? (
          <MissingLink />
        ) : loading ? (
          <Loading />
        ) : request ? (
          <Welcome request={request} />
        ) : (
          <>
            <h1 className={s.title}>Ta demande est validée</h1>
            <p className={s.lead}>Entre ton identifiant et le code reçus par e-mail pour ouvrir ton accès VIP.</p>
            {error ? (
              <p role="alert" className={s.error}>
                {error}
              </p>
            ) : null}
            <form className={s.form} onSubmit={submit}>
              <div className={s.field}>
                <label className={s.label} htmlFor="vip-identifiant">
                  Identifiant
                </label>
                <input
                  id="vip-identifiant"
                  className={s.input}
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <span className={s.hint}>L’adresse e-mail de ta demande.</span>
              </div>
              <div className={s.field}>
                <label className={s.label} htmlFor="vip-code">
                  Code
                </label>
                <div className={s.inputWrap}>
                  <input
                    id="vip-code"
                    className={`${s.input} ${s.codeInput}`}
                    type={showCode ? "text" : "password"}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button type="button" className={s.toggle} aria-controls="vip-code" onClick={() => setShowCode((shown) => !shown)}>
                    {showCode ? "Masquer" : "Afficher"}
                  </button>
                </div>
                <span className={s.hint}>Reçu par e-mail. Majuscules et minuscules comptent. Si tu avais déjà un compte, entre ton mot de passe habituel.</span>
              </div>
              <button type="submit" className={s.primary} disabled={busy}>
                {busy ? "Vérification…" : "Ouvrir mon accès VIP"}
              </button>
            </form>
            <p className={s.help}>Tu ne trouves pas le code ? Écris à @EquipeInvestPro sur Telegram.</p>
          </>
        )}
      </section>
    </main>
  );
}
