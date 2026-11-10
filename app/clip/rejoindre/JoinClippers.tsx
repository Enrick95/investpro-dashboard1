"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import styles from "../clip.module.css";
import ClipLogin from "../ClipLogin";
import { ClipApiError, clipApi, clipSignIn, clipSignOut, clipToken } from "@/lib/clip/client";
import { candidateWhatsAppText, enrickWhatsApp } from "@/lib/clip/rules";
import { StartSlides, startSlides } from "../views/clipper/StartSlides";

type Me = { email: string | null; clipper: { id: string } | null; candidate?: { status: "new" | "accepted" | "refused"; display_name?: string } | null };
type Phase = "loading" | "signup" | "login" | "form" | "member" | "pending" | "sent" | "error";

const AVAILABILITY = ["1 à 3 clips par semaine", "4 à 7 clips par semaine", "8 à 14 clips par semaine", "15 clips ou plus par semaine"];
const hidden = { position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" } as const;

export default function JoinClippers() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [referral, setReferral] = useState("");
  const [accounts, setAccounts] = useState("");
  const [availability, setAvailability] = useState(AVAILABILITY[1]);
  const [sample, setSample] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const detect = useCallback(async () => {
    try {
      if (!(await clipToken())) {
        setPhase("signup");
        return;
      }
      const me = await clipApi<Me>("/api/clip/me");
      setAccount(me.email);
      if (me.clipper) setPhase("member");
      else if (me.candidate?.status === "new") {
        const applied = me.candidate.display_name ?? "";
        setName((current) => current || applied);
        setPhase("pending");
      } else setPhase("form");
    } catch (e) {
      if (e instanceof ClipApiError && e.status === 401) setPhase("signup");
      else {
        setLoadError(e instanceof Error ? e.message : "Chargement impossible.");
        setPhase("error");
      }
    }
  }, []);

  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("parrain") ?? "";
      if (/^[a-z0-9-]{3,40}$/.test(code)) setReferral(code);
    } catch {
      setReferral("");
    }
    void detect();
  }, [detect]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const candidature = { display_name: name, whatsapp, telegram, accounts, availability, sample_url: sample, message, referral };
    try {
      if (phase === "signup") {
        await clipApi("/api/clip/signup", { method: "POST", auth: false, body: { ...candidature, email, password, hp_field: trap } });
        try {
          await clipSignIn(email, password);
        } catch {
          // Le compte est créé : la connexion pourra se refaire depuis l'espace clippeurs.
        }
      } else {
        await clipApi("/api/clip/candidates", { method: "POST", body: candidature });
      }
      setPhase("sent");
    } catch (e) {
      if (phase === "signup" && e instanceof ClipApiError && e.status === 409) {
        setLoginEmail(email.trim().toLowerCase());
        setLoginNotice(e.message);
        setPhase("login");
      } else {
        setError(e instanceof Error ? e.message : "Envoi impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  const signup = phase === "signup";
  const ready = name.trim() && whatsapp.trim() && accounts.trim() && (!signup || (email.trim() && password.length >= 8));

  return (
    <div className={styles.page}>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <Link href="/clip" className={styles.brand} aria-label="Espace clippeurs">
            <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="1.6" /><path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" /></svg>
            <span className={styles.brandName}>InvestPro</span>
            <span className={styles.brandPill}>CLIP</span>
          </Link>
        </header>
        <main className={styles.main} style={{ paddingBottom: 48 }}>
          {phase === "loading" ? (
            <div className={styles.center}><Loader2 size={28} className={styles.spin} aria-hidden="true" /></div>
          ) : null}

          {phase === "login" ? (
            <div className={styles.stackLg}>
              <h1 className={styles.h1}>Connexion</h1>
              {loginNotice ? <p className={styles.notice}>{loginNotice}</p> : null}
              <ClipLogin title="Connecte-toi" intro="Avec ton e-mail et ton mot de passe, puis tu envoies ta candidature." joinLink={false} defaultEmail={loginEmail} onDone={() => { setPhase("loading"); void detect(); }} />
              <button type="button" className={styles.linkBtn} style={{ alignSelf: "center" }} onClick={() => { setLoginNotice(""); setPhase("signup"); }}>Créer un compte à la place</button>
            </div>
          ) : null}

          {phase === "member" ? (
            <div className={styles.center}>
              <h1 className={styles.h1}>Tu es déjà clippeur</h1>
              <Link href="/clip" className={`${styles.btn} ${styles.btnBlock}`}>Ouvrir mon espace</Link>
            </div>
          ) : null}

          {phase === "pending" || phase === "sent" ? (
            <div className={styles.center}>
              <span className={`${styles.chip} ${styles.chipOk}`}><Check size={13} aria-hidden="true" />Candidature reçue</span>
              <h1 className={styles.h1}>Merci !</h1>
              <p className={styles.soft}>Dernière étape : préviens Enrick sur WhatsApp avec le message tout prêt. Il voit ta demande, il l&apos;accepte, et ton espace s&apos;ouvre ici avec ton e-mail et ton mot de passe.</p>
              <a href={enrickWhatsApp(candidateWhatsAppText(name))} target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnBlock}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.3a8.4 8.4 0 1 1 15.5-4.6z" /></svg>
                Prévenir Enrick sur WhatsApp
              </a>
              <Link href="/clip" className={`${styles.btnGhost} ${styles.btnBlock}`}>Aller à l&apos;espace clippeurs</Link>
              <h2 className={styles.h3} style={{ alignSelf: "stretch", textAlign: "left", marginTop: 10 }}>En attendant ma réponse, tu peux déjà commencer</h2>
              <StartSlides slides={startSlides("join")} label="En attendant, tu peux déjà commencer" />
            </div>
          ) : null}

          {phase === "error" ? (
            <div className={styles.center}>
              <p className={styles.error}>{loadError}</p>
              <button type="button" className={styles.btnGhost} onClick={() => { setPhase("loading"); void detect(); }}>Réessayer</button>
            </div>
          ) : null}

          {phase === "signup" || phase === "form" ? (
            <form onSubmit={submit} className={styles.stackLg}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h1 className={styles.h1}>Deviens clippeur</h1>
                <span className={`${styles.small} ${styles.muted}`}>2 minutes. Réponse sous 48 h sur WhatsApp.</span>
              </div>
              {signup ? (
                <div className={styles.rowStart} style={{ gap: 8 }}>
                  <span className={`${styles.small} ${styles.soft}`}>Déjà un compte ?</span>
                  <button type="button" className={styles.linkBtn} onClick={() => { setLoginEmail(email.trim().toLowerCase()); setLoginNotice(""); setPhase("login"); }}>Connecte-toi</button>
                </div>
              ) : (
                <div className={styles.rowStart} style={{ gap: 8 }}>
                  <span className={`${styles.small} ${styles.soft} ${styles.ellipsis}`}>Connecté avec {account ?? "ton compte"}</span>
                  <button type="button" className={styles.linkBtn} onClick={async () => { await clipSignOut(); setAccount(null); setPhase("signup"); }}>Changer de compte</button>
                </div>
              )}
              <StartSlides slides={startSlides("join")} label="Comment ça marche" />

              <div className={styles.field}>
                <label htmlFor="j-name" className={styles.label}>Prénom et initiale du nom</label>
                <input id="j-name" className={styles.input} maxLength={60} autoComplete="name" placeholder="Ex. Kevin L." value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              {signup ? (
                <>
                  <div className={styles.field}>
                    <label htmlFor="j-email" className={styles.label}>E-mail</label>
                    <input id="j-email" className={styles.input} type="email" inputMode="email" autoComplete="email" maxLength={120} value={email} onChange={(event) => setEmail(event.target.value)} required />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="j-password" className={styles.label}>Mot de passe</label>
                    <input id="j-password" className={styles.input} type="password" autoComplete="new-password" maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
                    <span className={`${styles.small} ${styles.muted}`}>8 caractères minimum, avec des lettres et au moins un chiffre. Tu t&apos;en serviras pour ouvrir ton espace.</span>
                  </div>
                </>
              ) : null}
              <div className={styles.field}>
                <label htmlFor="j-wa" className={styles.label}>WhatsApp</label>
                <input id="j-wa" className={styles.input} inputMode="tel" autoComplete="tel" placeholder="+33612345678" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} required />
              </div>
              <div className={styles.field}>
                <label htmlFor="j-tg" className={styles.label}>Telegram (facultatif)</label>
                <input id="j-tg" className={styles.input} placeholder="@pseudo" value={telegram} onChange={(event) => setTelegram(event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="j-acc" className={styles.label}>Tes comptes</label>
                <textarea id="j-acc" className={styles.textarea} maxLength={400} placeholder={"TikTok @ton.compte · 8 200 abonnés\nInstagram @ton.compte · 1 100 abonnés"} value={accounts} onChange={(event) => setAccounts(event.target.value)} required />
                <span className={`${styles.small} ${styles.muted}`}>Pas encore de compte ? Écris « à créer », on t&apos;aide à démarrer.</span>
              </div>
              <div className={styles.field}>
                <label htmlFor="j-av" className={styles.label}>Combien de clips peux-tu faire ?</label>
                <select id="j-av" className={styles.select} value={availability} onChange={(event) => setAvailability(event.target.value)}>
                  {AVAILABILITY.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="j-sample" className={styles.label}>Un exemple de montage (facultatif)</label>
                <input id="j-sample" className={styles.input} type="url" inputMode="url" placeholder="https://…" value={sample} onChange={(event) => setSample(event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="j-msg" className={styles.label}>Un mot pour Enrick (facultatif)</label>
                <textarea id="j-msg" className={styles.textarea} maxLength={600} value={message} onChange={(event) => setMessage(event.target.value)} />
              </div>
              {signup ? (
                <div aria-hidden="true" style={hidden}>
                  <label htmlFor="j-trap">Ne pas remplir</label>
                  <input id="j-trap" tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} />
                </div>
              ) : null}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <button type="submit" className={`${styles.btn} ${styles.btnBlock}`} disabled={busy || !ready}>
                {busy ? <Loader2 size={17} className={styles.spin} aria-hidden="true" /> : null}
                {signup ? "Créer mon compte et envoyer" : "Envoyer ma candidature"}
              </button>
              <span className={`${styles.small} ${styles.muted}`} style={{ textAlign: "center" }}>En envoyant, tu acceptes d&apos;être contacté sur WhatsApp au sujet du programme clippeurs.</span>
              <a href={enrickWhatsApp("Salut Enrick, j'ai une question sur le programme clippeurs : ")} target="_blank" rel="noopener noreferrer" className={styles.linkBtn} style={{ alignSelf: "center", textDecoration: "none" }}>Une question avant de postuler ? Écris-moi sur WhatsApp</a>
            </form>
          ) : null}
        </main>
      </div>
    </div>
  );
}
