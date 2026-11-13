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
  return "Identifiant ou code incorrect. Vérifie l’e-mail reçu. Si tu avais déjà un compte, entre ton mot de passe habituel, ou utilise « Continuer avec Google » si tu t’es inscrit avec Google.";
}

/**
 * Un compte InvestPro créé avec Google n'a ni mot de passe ni code : la validation ne lui en envoie pas. Le membre se
 * connecte avec Google et revient sur cette même page, qui rattache alors sa demande à son compte.
 */
async function continueWithGoogle(applicationId: string): Promise<string | null> {
  const next = new URL("/vip/nouveau-membre/compte", window.location.origin);
  if (applicationId) next.searchParams.set("application", applicationId);
  const callback = new URL("/auth/callback", window.location.origin);
  callback.searchParams.set("next", next.pathname + next.search);
  const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
  return error ? "La connexion Google n’a pas pu démarrer. Réessaie dans un instant ou écris à @EquipeInvestPro." : null;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M21.805 10.023h-9.63v3.955h5.54c-.238 1.273-.952 2.35-2.03 3.069v2.55h3.287c1.924-1.77 3.033-4.38 3.033-7.487 0-.73-.066-1.43-.2-2.087Z" />
      <path fill="#34A853" d="M12.175 22c2.75 0 5.06-.91 6.747-2.47l-3.287-2.55c-.91.61-2.078.97-3.46.97-2.656 0-4.905-1.794-5.71-4.205H3.07v2.64A10.197 10.197 0 0 0 12.175 22Z" />
      <path fill="#FBBC05" d="M6.465 13.745a6.157 6.157 0 0 1-.322-1.945c0-.675.116-1.33.322-1.945v-2.64H3.07A10.198 10.198 0 0 0 2 11.8c0 1.647.394 3.205 1.07 4.585l3.395-2.64Z" />
      <path fill="#EA4335" d="M12.175 5.65c1.493 0 2.83.513 3.885 1.52l2.91-2.91C17.23 2.64 14.92 1.6 12.175 1.6A10.197 10.197 0 0 0 3.07 7.215l3.395 2.64c.805-2.41 3.054-4.205 5.71-4.205Z" />
    </svg>
  );
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
          <span className={s.stepText}>Celui reçu par e-mail à la validation. Tu avais déjà un compte ? Ton mot de passe habituel, ou Google.</span>
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
  const [googleBusy, setGoogleBusy] = useState(false);

  async function google() {
    if (busy || googleBusy) return;
    setGoogleBusy(true);
    setError("");
    try {
      const failure = await continueWithGoogle(applicationId);
      if (failure) {
        setError(failure);
        setGoogleBusy(false);
      }
    } catch {
      setError("La connexion Google n’a pas pu démarrer. Réessaie dans un instant ou écris à @EquipeInvestPro.");
      setGoogleBusy(false);
    }
  }

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
                <button type="submit" className={s.primary} disabled={busy || googleBusy}>
                  {busy ? "Vérification…" : "Ouvrir mon accès VIP"}
                </button>
              </form>

              <div className={s.alt}>
                <p className={s.altText}>Ton compte InvestPro a été créé avec Google ? Tu n’as pas de code : connecte-toi avec Google.</p>
                <button type="button" className={s.google} onClick={google} disabled={busy || googleBusy}>
                  <GoogleMark />
                  {googleBusy ? "Ouverture de Google…" : "Continuer avec Google"}
                </button>
              </div>

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
