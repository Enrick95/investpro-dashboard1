"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, BellRing, Check } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest } from "@/lib/vip/client";
import s from "./VipEspace.module.css";
import c from "./VipCopie.module.css";

type CopieState = { status: "soon"; notify: boolean };

/**
 * Copie : bientôt, les membres VIP pourront copier le compte personnel d'Enrick (MT4 · Fusion Markets) sur leur compte,
 * en lots fixes, un autre réglage se demandant à l'équipe. En attendant, l'onglet présente la solution et propose
 * d'être prévenu de l'ouverture.
 */
export default function VipCopie({ banner }: { banner?: ReactNode }) {
  const { t } = useLocale();
  const [notify, setNotify] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    vipRequest<CopieState>("/api/vip/copie")
      .then(result => { if (!cancelled) setNotify(result.notify === true); })
      .catch(() => { if (!cancelled) setNotify(false); });
    return () => { cancelled = true; };
  }, []);

  async function choose(next: boolean) {
    setBusy(true); setError("");
    try {
      const result = await vipRequest<CopieState>("/api/vip/copie", { method: "PUT", body: JSON.stringify({ notify: next }) });
      setNotify(result.notify === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ta demande n’a pas pu être enregistrée. Réessaie dans un instant.");
    } finally { setBusy(false); }
  }

  return <div className={s.page}>
    {banner}
    <header className={s.head}>
      <h1 className={s.pageTitle}>{t("Copie")}</h1>
      <span className={s.pill}><span className={c.soonDot} aria-hidden="true" />{t("Bientôt")}</span>
    </header>

    <section className={c.hero} aria-labelledby="copie-titre">
      <h2 id="copie-titre" className={c.heroTitle}>{t("Mes trades, ouverts et fermés sur ton compte, en même temps que moi.")}</h2>
      <p className={c.lead}>{t("Bientôt, tu pourras relier ton compte MetaTrader à mon compte personnel. Chaque trade que je prends s’ouvrira aussi chez toi, avec le volume que tu choisis, et se fermera au même moment.")}</p>
      <div className={c.flow} role="img" aria-label={t("Le compte d’Enrick envoie chacun de ses trades vers ton compte")}>
        <div className={c.source}>
          <span className={c.flowLabel}>{t("Compte source")}</span>
          <b>{t("Enrick · compte perso")}</b>
          <span className={s.gold}>MT4 · Fusion Markets</span>
        </div>
        <div className={c.arrow} aria-hidden="true">
          <svg width="16" height="22" viewBox="0 0 16 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v17" /><path d="m2 13 6 6 6-6" /></svg>
          {t("chaque trade")}
        </div>
        <div className={c.target}>
          <span className={c.flowLabel}>{t("Ton compte")}</span>
          <b>{t("MT4 ou MT5, chez ton broker")}</b>
          <span className={c.flowNote}>{t("Avec le volume que tu choisis")}</span>
        </div>
      </div>
    </section>

    <section className={s.section} aria-labelledby="copie-etapes">
      <h2 id="copie-etapes" className={s.sectionTitle}>{t("Comment ça marchera")}</h2>
      <ol className={c.steps}>
        <li><span className={c.stepNumber} aria-hidden="true">1</span><span><b>{t("Tu relies ton compte")}</b> {t("MetaTrader, MT4 ou MT5, chez ton broker.")}</span></li>
        <li><span className={c.stepNumber} aria-hidden="true">2</span><span><b>{t("Tu choisis ton volume")}</b> {t("en lots fixes, par exemple 0,01 lot par trade. Un autre réglage se demande à l’équipe.")}</span></li>
        <li><span className={c.stepNumber} aria-hidden="true">3</span><span><b>{t("Tu actives la copie")}</b> {t("et mes trades arrivent sur ton compte. Pause ou arrêt quand tu veux.")}</span></li>
      </ol>
    </section>

    <section className={c.notify} aria-live="polite">
      {notify ? <>
        <p className={c.notifyDone}><Check size={18} aria-hidden="true" />{t("C’est noté : tu seras prévenu dès l’ouverture de la copie.")}</p>
        <button type="button" className={s.secondary} onClick={() => void choose(false)} disabled={busy}>{t("Ne plus me prévenir")}</button>
      </> : <>
        <button type="button" className={s.primary} onClick={() => void choose(true)} disabled={busy || notify === null}>
          {busy ? <BellRing size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
          {t("Me prévenir à l’ouverture")}
        </button>
        <p className={s.small}>{t("Tu recevras une notification dans l’espace VIP dès que la copie ouvre.")}</p>
      </>}
      {error ? <p className={c.error} role="alert">{t(error)}</p> : null}
    </section>

    <section className={s.section} aria-labelledby="copie-main">
      <h2 id="copie-main" className={s.sectionTitle}>{t("Ce que tu gardes en main")}</h2>
      <ul className={c.checks}>
        <li><Check size={17} aria-hidden="true" />{t("Ton volume par trade")}</li>
        <li><Check size={17} aria-hidden="true" />{t("Un volume maximum à ne jamais dépasser")}</li>
        <li><Check size={17} aria-hidden="true" />{t("La pause ou l’arrêt en un clic")}</li>
        <li><Check size={17} aria-hidden="true" />{t("Un réglage particulier, sur simple demande")}</li>
      </ul>
    </section>

    <section className={s.section} aria-labelledby="copie-faq">
      <h2 id="copie-faq" className={s.sectionTitle}>{t("Questions fréquentes")}</h2>
      <div className={c.faq}>
        <details><summary>{t("Mon ordinateur doit rester allumé ?")}</summary><p>{t("Non. La copie tourne sur les serveurs du moteur de copie, même téléphone éteint.")}</p></details>
        <details><summary>{t("Quel mot de passe faudra-t-il ?")}</summary><p>{t("Le mot de passe principal de ton compte MetaTrader : c’est lui qui permet d’ouvrir les trades. Il sera chiffré et personne ne le verra.")}</p></details>
        <details><summary>{t("Et si je veux un autre réglage ?")}</summary><p>{t("Multiplicateur, % de risque… tu feras une demande depuis cet onglet et l’équipe l’appliquera pour toi.")}</p></details>
      </div>
    </section>

    <p className={c.risk}>{t("La copie reproduit aussi les pertes. Les résultats passés ne garantissent pas les résultats futurs : ne copie qu’avec un capital que tu peux te permettre de perdre.")}</p>
  </div>;
}
