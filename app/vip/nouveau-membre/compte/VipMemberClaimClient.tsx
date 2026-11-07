"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { normalizeAccessCode } from "@/lib/vip/access-code";
import s from "./claim.module.css";

// Le portail membre ne se charge qu’une fois l’accès ouvert : la page d’accès reste légère.
const VipPortal = dynamic(() => import("@/components/vip/VipPortal"), {
  ssr: false,
  loading: () => <p className={s.portalLoading}>Ouverture de ton espace VIP…</p>,
});

type ClaimedRequest = { first_name?: string; last_name?: string; member_number?: number; channel_invite_url?: string };

/** Erreur renvoyée par l’API, avec son code pour traiter à part le cas « aucune demande validée ». */
class ClaimError extends Error {
  code: string;

  constructor(message: string, code = "") {
    super(message);
    this.code = code;
  }
}

/** Rattache la demande validée au compte connecté. Le serveur la retrouve par l’adresse e-mail du compte. */
async function claimApplication(accessToken: string, applicationId: string): Promise<ClaimedRequest> {
  const response = await fetch("/api/vip/nouveau-membre/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ applicationId }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ClaimError(
      typeof payload?.error === "string" ? payload.error : "Impossible de rattacher ta demande à ton compte.",
      typeof payload?.code === "string" ? payload.code : "",
    );
  }
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

function Steps() {
  return (
    <ol className={s.steps}>
      <li>
        <span className={s.stepNumber} aria-hidden="true">1</span>
        <div>
          <span className={s.stepTitle}>Ton identifiant</span>
          <span className={s.stepText}>L’adresse e-mail de ta demande.</span>
        </div>
      </li>
      <li>
        <span className={s.stepNumber} aria-hidden="true">2</span>
        <div>
          <span className={s.stepTitle}>Ton code</span>
          <span className={s.stepText}>Celui reçu par e-mail à la validation.</span>
        </div>
      </li>
      <li>
        <span className={s.stepNumber} aria-hidden="true">3</span>
        <div>
          <span className={s.stepTitle}>Ton accès</span>
          <span className={s.stepText}>Le canal VIP et ton espace membre s’ouvrent sur cette page.</span>
        </div>
      </li>
    </ol>
  );
}

function Checking() {
  return (
    <p className={s.loadingRow} role="status">
      <span className={s.dot} aria-hidden="true" />
      On vérifie ton accès…
    </p>
  );
}

function Welcome({ request }: { request: ClaimedRequest }) {
  return (
    <header className={s.welcome}>
      <div className={s.welcomeText}>
        <h1 className={s.welcomeTitle}>Bienvenue dans le VIP{request.first_name ? `, ${request.first_name}` : ""}.</h1>
        <p className={s.welcomeMeta}>
          {request.member_number ? `Membre n° ${request.member_number}. ` : ""}Ton accès est ouvert.
        </p>
      </div>
      {request.channel_invite_url ? (
        <a className={s.welcomeAction} href={request.channel_invite_url} target="_blank" rel="noreferrer">
          Rejoindre le canal VIP
        </a>
      ) : null}
    </header>
  );
}

export default function VipMemberClaimClient({ applicationId }: { applicationId: string }) {
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<ClaimedRequest | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  // Une session déjà ouverte est rattachée tout de suite. Sans demande validée, le formulaire s’affiche sans message.
  useEffect(() => {
    let active = true;
    async function resume() {
      try {
        const { data, error: sessionError } = await createClient().auth.getSession();
        if (sessionError) throw sessionError;
        const token = data.session?.access_token;
        if (token) {
          const info = await claimApplication(token, applicationId);
          if (active) setRequest(info);
        }
      } catch (e) {
        const silent = e instanceof ClaimError && e.code === "no_application";
        if (active && !silent) setError(e instanceof Error ? e.message : "Impossible de terminer la demande.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void resume();
    return () => {
      active = false;
    };
  }, [applicationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const client = createClient();
      const email = identifier.trim().toLowerCase();
      // D’abord la saisie telle quelle (mot de passe déjà existant), puis la forme canonique du code généré.
      const attempts = [code, normalizeAccessCode(code) ?? ""].filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
      let token: string | null = null;
      let lastMessage = "";
      for (const password of attempts) {
        const { data, error: signError } = await client.auth.signInWithPassword({ email, password });
        if (!signError && data.session) {
          token = data.session.access_token;
          break;
        }
        lastMessage = signError?.message ?? "";
      }
      if (!token) throw new Error(signInMessage(lastMessage));
      setRequest(await claimApplication(token, applicationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de terminer la connexion.");
    } finally {
      setBusy(false);
    }
  }

  if (request) {
    return (
      <main className={`${s.page} ${s.embedded}`}>
        <Welcome request={request} />
        <div className={s.portalSlot}>
          <VipPortal />
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.layout}>
        <section className={s.intro} aria-labelledby="vip-acces-titre">
          <Brand />
          <h1 id="vip-acces-titre" className={s.title}>
            Ouvre ton accès VIP
          </h1>
          <p className={s.lead}>
            Entre l’identifiant et le code reçus par <span className={s.nowrap}>e-mail</span> : ton accès s’ouvre directement ici.
          </p>
          <Steps />
        </section>

        <section className={s.card} aria-labelledby="vip-connexion">
          <h2 id="vip-connexion" className={s.cardTitle}>
            Connexion
          </h2>
          {checking ? (
            <Checking />
          ) : (
            <>
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
                  <span className={s.hint}>Majuscules et minuscules comptent.</span>
                </div>
                <button type="submit" className={s.primary} disabled={busy}>
                  {busy ? "Vérification…" : "Ouvrir mon accès VIP"}
                </button>
              </form>

              <div className={s.links}>
                <p className={s.linkRow}>
                  <span>Code perdu ?</span>
                  <a href="https://t.me/EquipeInvestPro" target="_blank" rel="noreferrer">
                    Écris à @EquipeInvestPro
                  </a>
                </p>
                <p className={s.linkRow}>
                  <span>Pas encore membre ?</span>
                  <a href="/vip/rejoindre">Découvrir le VIP</a>
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
