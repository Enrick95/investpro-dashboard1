"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import styles from "../clip.module.css";
import { ClipApiError, clipApi, clipToken } from "@/lib/clip/client";

type Me = { clipper: { id: string } | null; candidate?: { status: "new" | "accepted" | "refused" } | null };
type Phase = "loading" | "guest" | "form" | "member" | "pending" | "sent" | "error";

const AVAILABILITY = ["1 à 3 clips par semaine", "4 à 7 clips par semaine", "8 à 14 clips par semaine", "15 clips ou plus par semaine"];

export default function JoinClippers() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [accounts, setAccounts] = useState("");
  const [availability, setAvailability] = useState(AVAILABILITY[1]);
  const [sample, setSample] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!(await clipToken())) {
          if (active) setPhase("guest");
          return;
        }
        const me = await clipApi<Me>("/api/clip/me");
        if (!active) return;
        if (me.clipper) setPhase("member");
        else if (me.candidate?.status === "new") setPhase("pending");
        else setPhase("form");
      } catch (e) {
        if (!active) return;
        if (e instanceof ClipApiError && e.status === 401) setPhase("guest");
        else {
          setLoadError(e instanceof Error ? e.message : "Chargement impossible.");
          setPhase("error");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await clipApi("/api/clip/candidates", {
        method: "POST",
        body: { display_name: name, whatsapp, telegram, accounts, availability, sample_url: sample, message },
      });
      setPhase("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <Link href="/clip" className={styles.brand} aria-label="Espace clippeurs">
            <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="1.6" /><path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" /></svg>
            <span className={styles.brandName}>Enrick95</span>
            <span className={styles.brandPill}>CLIPS</span>
          </Link>
        </header>
        <main className={styles.main} style={{ paddingBottom: 48 }}>
          {phase === "loading" ? (
            <div className={styles.center}><Loader2 size={28} className={styles.spin} aria-hidden="true" /></div>
          ) : null}

          {phase === "guest" ? (
            <div className={styles.center}>
              <h1 className={styles.h1}>Deviens clippeur</h1>
              <p className={styles.soft}>Tu coupes le contenu d&apos;Enrick, tu le publies sur tes comptes et tu es payé selon tes vues. Crée ton compte (ou connecte-toi), puis envoie ta candidature en 2 minutes.</p>
              <Link href="/register?next=/clip/rejoindre" className={`${styles.btn} ${styles.btnBlock}`}>Créer mon compte</Link>
              <Link href="/login?next=/clip/rejoindre" className={`${styles.btnGhost} ${styles.btnBlock}`}>J&apos;ai déjà un compte</Link>
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
              <p className={styles.soft}>Enrick regarde ta candidature et te répond sous 48 h sur WhatsApp. Dès qu&apos;elle est acceptée, ton espace s&apos;ouvre sur investprotrading.fr/clip.</p>
              <Link href="/clip" className={`${styles.btnGhost} ${styles.btnBlock}`}>Aller à l&apos;espace clippeurs</Link>
            </div>
          ) : null}

          {phase === "error" ? <p className={styles.error}>{loadError}</p> : null}

          {phase === "form" ? (
            <form onSubmit={submit} className={styles.stackLg}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h1 className={styles.h1}>Deviens clippeur</h1>
                <span className={`${styles.small} ${styles.muted}`}>2 minutes. Réponse sous 48 h sur WhatsApp.</span>
              </div>
              <div className={styles.cardGold} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className={styles.h3}>Comment ça marche</span>
                <span className={`${styles.small} ${styles.soft}`}>Tu choisis une campagne, tu coupes les rushs d&apos;Enrick, tu publies sur tes comptes et tu colles le lien dans ton espace. Tu es payé selon tes vues, deux fois par mois.</span>
              </div>
              <div className={styles.field}>
                <label htmlFor="j-name" className={styles.label}>Prénom et initiale du nom</label>
                <input id="j-name" className={styles.input} maxLength={60} placeholder="Ex. Kevin L." value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className={styles.field}>
                <label htmlFor="j-wa" className={styles.label}>WhatsApp</label>
                <input id="j-wa" className={styles.input} inputMode="tel" placeholder="+33612345678" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} required />
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
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <button type="submit" className={`${styles.btn} ${styles.btnBlock}`} disabled={busy || !name.trim() || !whatsapp.trim() || !accounts.trim()}>
                {busy ? <Loader2 size={17} className={styles.spin} aria-hidden="true" /> : null}
                Envoyer ma candidature
              </button>
              <span className={`${styles.small} ${styles.muted}`} style={{ textAlign: "center" }}>En envoyant, tu acceptes d&apos;être contacté sur WhatsApp au sujet du programme clippeurs.</span>
            </form>
          ) : null}
        </main>
      </div>
    </div>
  );
}
