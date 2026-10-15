"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Cloud,
  Layers3,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Target,
  WalletCards,
} from "lucide-react";
import styles from "./page.module.css";

const features = [
  {
    num: "01",
    icon: BookOpen,
    title: "Journal de trading",
    text: "Documentez vos trades, notes et émotions pour mieux comprendre vos décisions.",
    href: "/dashboard/journal",
    kind: "journal",
  },
  {
    num: "02",
    icon: Layers3,
    title: "Mes comptes",
    text: "Suivez plusieurs comptes, saisis manuellement ou synchronisés, dans une vue d’ensemble.",
    href: "/dashboard/comptes",
    kind: "accounts",
  },
  {
    num: "03",
    icon: Target,
    title: "Plan de trading",
    text: "Préparez vos sessions, définissez vos règles de risque et suivez votre exécution.",
    href: "/dashboard/plan",
    kind: "plan",
  },
  {
    num: "04",
    icon: BarChart3,
    title: "Rapports & analyses",
    text: "Des statistiques claires pour identifier vos forces et axes d’amélioration.",
    href: "/dashboard/rapports",
    kind: "reports",
  },
  {
    num: "05",
    icon: RefreshCw,
    title: "Synchronisation",
    text: "Reliez une plateforme compatible pour importer les données prises en charge et suivre son état.",
    href: "/dashboard/connexions",
    kind: "sync",
  },
];

const faq = [
  [
    "À quoi sert le journal de trading ?",
    "À centraliser vos opérations, résultats, notes et contexte afin d’identifier ce qui fonctionne réellement dans votre méthode.",
  ],
  [
    "Puis-je suivre plusieurs comptes ?",
    "Oui. InvestPro permet de centraliser plusieurs comptes et de distinguer les comptes manuels des comptes synchronisés.",
  ],
  [
    "Quelle différence entre Copy CFD et Copy Futures ?",
    "InvestPro Copy CFD regroupe les outils de copie actuels, selon les connexions et accès disponibles. InvestPro Copy Futures est en préparation : ses plateformes compatibles et son ouverture seront annoncées sur sa page dédiée.",
  ],
  [
    "Comment lire mes performances ?",
    "Le Journal et les Rapports regroupent win rate, P&L, profit factor, drawdown, séries et analyses par session ou setup.",
  ],
];

export default function Home() {
  const { t } = useLocale();
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.logo} aria-label={t("InvestPro Trading")}>
          <span className={styles.logoBars} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>{t("investpro")}</b>
            <small>{t("TRADING")}</small>
          </span>
        </Link>

        <nav className={styles.navLinks}>
          <a href="#pourquoi">{t("Pourquoi InvestPro")}</a>
          <a href="#fonctionnalites">{t("Fonctionnalités")}</a>
          <a href="#beta">{t("Accès bêta")}</a>
          <a href="#faq">{t("FAQ")}</a>
        </nav>

        <div className={styles.navActions}>
          <div className={styles.languageControl}><LanguageSwitcher /></div>
          <Link href="/login" className={styles.secondaryButton}>{t("Se connecter")}</Link>
          <Link href="/dashboard" className={styles.primaryButton}>{t("Explorer l’espace ")}<ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>{t("L’ESPACE DES TRADERS DISCIPLINÉS")}</div>

          <h1>{t("Tradez mieux.")}<br />
            <span>{t("Progressez")}</span>
            <br />
            <span>{t("chaque jour.")}</span>
          </h1>

          <p>{t("Analysez, exécutez, comprenez et suivez vos performances dans un espace unique, pensé pour les traders qui veulent de vrais résultats.")}</p>

          <div className={styles.heroActions}>
            <Link href="/dashboard" className={styles.primaryButtonLarge}>{t("Accéder à mon espace ")}<ArrowRight size={18} />
            </Link>

            <Link href="/login" className={styles.demoButton}>{t("Se connecter ")}<ArrowRight size={16} />
            </Link>
          </div>

          <div className={styles.heroFacts}>
            <span>
              <CheckCircle2 size={15} />{t(" Journal & analyse")}</span>
            <span>
              <CheckCircle2 size={15} />{t(" Gestion du risque")}</span>
            <span>
              <CheckCircle2 size={15} />{t(" Multi-comptes")}</span>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.previewLabel}><MonitorSmartphone size={14} />{t(" L’ESPACE INVESTPRO, SUR ORDINATEUR ET MOBILE")}</div>
          <div className={styles.productPreview}>
            <div className={styles.productDesktop}>
              <div className={styles.productSidebar}>
                <div className={styles.productBrand}><span className={styles.miniBars}><i /><i /><i /></span><b>{t("investpro")}<small>{t("TRADING")}</small></b></div>
                <span className={styles.productActive}>{t("▦   Dashboard")}</span>
                <span>{t("▤   Mes comptes")}</span>
                <span>{t("⌁   Connexions")}</span>
                <span>{t("▧   Journal")}</span>
                <span>{t("▣   Plan de trading")}</span>
                <span>{t("▥   Rapports")}</span>
                <span>{t("↗   Performances VIP")}</span>
              </div>
              <div className={styles.productMain}>
                <div className={styles.productTopline}><span>{t("Espace trader  ›  ")}<b>{t("Dashboard")}</b></span><span className={styles.productAvatar}>{t("IP")}</span></div>
                <div className={styles.productHeading}><div><small>{t("VOTRE TRADING, EN PERSPECTIVE")}</small><h2>{t("Bonjour, Trader.")}</h2><p>{t("Gardez une vue claire sur vos résultats et vos prochaines décisions.")}</p></div><span className={styles.productButton}>{t("＋ Ajouter un trade")}</span></div>
                <div className={styles.productBanner}><div><small>{t("INVESTPRO TRADING HUB")}</small><b>{t("Votre discipline fait la différence.")}</b><span>{t("Apprenez, analysez et suivez votre trading au même endroit.")}</span></div><div className={styles.productRules}><small>{t("LES REPÈRES DU PLAN")}</small><b>— <i>{t("Risque maximum / trade")}</i></b><b>— <i>{t("Trades maximum / jour")}</i></b></div></div>
                <div className={styles.productMetrics}><div><small>{t("Solde des comptes")}</small><b>18 640 €</b><span>{t("Exemple fictif · 2 comptes")}</span></div><div><small>{t("Résultat net")}</small><b className={styles.demoPositive}>+1 284 €</b><span>{t("Exemple fictif · période")}</span></div><div><small>{t("Taux de réussite")}</small><b>76 %</b><span>{t("Exemple fictif · hors BE")}</span></div><div><small>{t("Trades de la période")}</small><b>24</b><span>{t("Exemple fictif")}</span></div></div>
                <div className={styles.productChart}><div><b>{t("La régularité se construit.")}</b><small>{t("APERÇU ILLUSTRATIF · DONNÉES FICTIVES")}</small></div><div className={styles.productDemoChart}><span>{t("Résultat net cumulé")}</span><b>+1 284 €</b><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><small>{t("Les chiffres présentés sont des exemples fictifs.")}</small></div></div>
              </div>
            </div>
            <div className={styles.productPhone} aria-label={t("Aperçu de l’interface mobile InvestPro")}>
              <div className={styles.phoneScreen}>
                <div className={styles.phoneStatus}><span>9:41</span><span>● ● ▰</span></div>
                <div className={styles.phoneBrand}><span className={styles.miniBars}><i /><i /><i /></span><b>{t("investpro")}</b><span>{t("IP")}</span></div>
                <div className={styles.phoneGreeting}><small>{t("VOTRE TRADING, EN PERSPECTIVE")}</small><b>{t("Bonjour, Trader.")}</b><span>{t("Votre espace en un coup d’œil.")}</span></div>
                <div className={styles.phoneBalance}><small>{t("SOLDE DES COMPTES · EXEMPLE FICTIF")}</small><b>18 640 €</b><span>{t("Exemple illustratif")}</span><div className={styles.phoneMiniChart}><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
                <div className={styles.phoneSectionTitle}>{t("Vos indicateurs")}</div>
                <div className={styles.phoneTiles}><div><small>{t("Résultat net · fictif")}</small><b>+1 284 €</b></div><div><small>{t("Taux réussite · fictif")}</small><b>76 %</b></div></div>
                <div className={styles.phoneSectionTitle}>{t("Derniers trades ")}<span>{t("Tout voir  →")}</span></div>
                <div className={styles.phoneEmpty}>{t("Vos trades apparaîtront ici après leur ajout.")}</div>
                <div className={styles.phoneTabbar}><span>⌂<small>{t("Accueil")}</small></span><span>▤<small>{t("Journal")}</small></span><span>◉<small>{t("Comptes")}</small></span><span>☻<small>{t("Profil")}</small></span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trustStrip}>
        <div>
          <ShieldCheck />
          <span>
            <b>{t("Une méthode claire")}</b>{t("Du plan à l’exécution")}</span>
        </div>

        <div>
          <ShieldCheck />
          <span>
            <b>{t("Vos données sécurisées")}</b>{t("et toujours synchronisées")}</span>
        </div>

        <div>
          <Target />
          <span>
            <b>{t("Pensé pour progresser")}</b>{t("avec des décisions mesurables")}</span>
        </div>

        <div>
          <CircleDollarSign />
          <span>
            <b>{t("Accès bêta gratuit")}</b>{t("pendant la phase de test")}</span>
        </div>
      </section>

      <section className={styles.featuresSection} id="fonctionnalites">
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionEyebrow}>{t("TOUT CE DONT VOUS AVEZ BESOIN")}</div>
            <h2>{t("Un espace complet pour ")}<span>{t("votre progression.")}</span>
            </h2>
          </div>

          <p>{t("Des outils puissants et simples, réunis dans une seule plateforme pour analyser, suivre et améliorer vos performances.")}</p>
        </div>

        <div className={styles.featureGrid}>
          {features.map(({ num, icon: Icon, title, text, href, kind }) => (
            <article key={num} className={styles.featureCard}>
              <div className={styles.featureTop}>
                <Icon size={31} strokeWidth={2.15} />
                <span>{num}</span>
              </div>

              <h3>{t(title)}</h3>
              <p>{t(text)}</p>

              <div className={styles.featureVisual}>
                {kind === "journal" ? (
                  <div className={styles.tradeListMock}>
                    <div>
                      <span className={styles.assetIcon}>🇪🇺</span>
                      <b>{t("EURUSD")}</b>
                      <em className={styles.positive}>+320 €</em>
                    </div>
                    <div>
                      <span className={styles.assetIcon}>🟨</span>
                      <b>{t("XAUUSD")}</b>
                      <em className={styles.negative}>-150 €</em>
                    </div>
                    <div>
                      <span className={styles.assetIcon}>🇺🇸</span>
                      <b>{t("NAS100")}</b>
                      <em className={styles.positive}>+412 €</em>
                    </div>
                  </div>
                ) : null}

                {kind === "accounts" ? (
                  <div className={styles.accountsMock}>
                    <div>
                      <span>{t("Compte principal")}</span>
                      <b>27 416 €</b>
                      <em>+18.2%</em>
                    </div>
                    <div>
                      <span>{t("Compte FTMO")}</span>
                      <b>12 307 €</b>
                      <em>+6.4%</em>
                    </div>
                    <div>
                      <span>{t("Compte démo")}</span>
                      <b>5 120 €</b>
                      <em>+2.4%</em>
                    </div>
                  </div>
                ) : null}

                {kind === "plan" ? (
                  <div className={styles.planMock}>
                    <div>
                      <span className={styles.planCheck}>✓</span>
                      <b>{t("Ma routine quotidienne")}</b>
                      <i>✓</i>
                    </div>
                    <div>
                      <span className={styles.planCheck}>✓</span>
                      <b>{t("Règles de risque")}</b>
                      <i>✓</i>
                    </div>
                    <div>
                      <span className={styles.planCheck}>◉</span>
                      <b>{t("Objectifs de la semaine")}</b>
                      <i>✓</i>
                    </div>
                  </div>
                ) : null}

                {kind === "reports" ? (
                  <div className={styles.reportsMock}>
                    <div className={styles.winrateMock}>
                      <small>{t("Win rate")}</small>
                      <strong>62%</strong>
                      <em>+6%</em>
                      <div className={styles.ringMock}>
                        <span />
                      </div>
                    </div>

                    <div className={styles.pnlMock}>
                      <small>{t("P&L moyen")}</small>
                      <strong>+124 €</strong>
                      <div className={styles.barMock}>
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                  </div>
                ) : null}

                {kind === "sync" ? (
                  <div className={styles.syncMock}>
                    <div className={styles.deviceRow}>
                      <span>⚑</span>
                      <Cloud size={24} />
                      <MonitorSmartphone size={26} />
                      <Smartphone size={22} />
                    </div>
                    <div className={styles.syncedBadge}>
                      <span><Check size={18} /></span>
                      <div>
                            <b>{t("Aperçu d’un connecteur")}</b>
                            <small>{t("Données d’exemple")}</small>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <Link
                href={href}
                aria-label={`${t("Ouvrir")} ${t(title)}`}
                className={styles.featureArrow}
              >
                <ArrowRight size={19} />
              </Link>
            </article>
          ))}
        </div>

        <div className={styles.copierSpotlight}>
          <div className={styles.copierSpotlightCopy}>
            <span className={styles.copierSpotlightEyebrow}>{t("INVESTPRO COPY · CFD")}</span>
            <h3>{t("Vos comptes, vos réglages, une vue claire.")}</h3>
            <p>{t("Retrouvez les comptes receveurs, les liaisons Master et les paramètres de risque dans un espace conçu pour suivre chaque étape.")}</p>
            <Link href="/dashboard/copieur" className={styles.copierSpotlightLink}>{t("Découvrir InvestPro Copy CFD ")}<ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.copierSteps} aria-label={t("Étapes de configuration")}>
            <div><span>01</span><b>{t("Choisir les comptes")}</b><small>{t("Master et receveurs")}</small></div>
            <div><span>02</span><b>{t("Régler le risque")}</b><small>{t("Volumes et exécution")}</small></div>
            <div><span>03</span><b>{t("Suivre l’activité")}</b><small>{t("État et historique")}</small></div>
          </div>
        </div>
        <div className={styles.copierSpotlight}>
          <div className={styles.copierSpotlightCopy}>
            <span className={styles.copierSpotlightEyebrow}>{t("LE PROCHAIN CHAPITRE")}</span>
            <h3>{t("InvestPro Copy Futures")}</h3>
            <p>{t("La copie multi-comptes sur futures se prépare. Un nouvel espace pour retrouver vos comptes et copier vos opérations, directement dans InvestPro.")}</p>
            <Link href="/copy-futures" className={styles.copierSpotlightLink}>{t("Découvrir le projet ")}<ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.futuresStatus}>
            <span className={styles.futuresBadge}>
              <Clock3 size={15} aria-hidden="true" />{t(" Bientôt")}</span>
            <b>{t("En préparation")}</b>
            <p>{t("Les plateformes compatibles et la date d’ouverture seront annoncées sur la page du projet.")}</p>
          </div>
        </div>
      </section>

      <section className={styles.betaSection} id="beta">
        <div className={styles.betaCopy}>
          <div className={styles.sectionEyebrow}>{t("ACCÈS BÊTA")}</div>
          <h2>{t("Votre espace de trading.")}<br />
            <span>{t("Gratuit pendant la bêta.")}</span>
          </h2>
          <p>{t("Rejoignez les utilisateurs qui testent InvestPro et accédez à toutes les fonctionnalités actuellement ouvertes.")}</p>

          <div className={styles.betaActions}>
            <Link href="/signup" className={styles.primaryButtonLarge}>{t("Créer mon compte gratuitement ")}<ArrowRight size={17} />
            </Link>

            <Link href="/login" className={styles.demoButton}>{t("Se connecter ")}<ArrowRight size={15} />
            </Link>
          </div>

          <div className={styles.betaFacts}>
            <span>
              <Check size={14} />{t(" Accès complet")}</span>
            <span>
              <Check size={14} />{t(" Mises à jour prioritaires")}</span>
            <span>
              <Check size={14} />{t(" Votre avis compte")}</span>
          </div>
        </div>

        <div className={styles.betaVisual}>
          <div className={styles.betaTag}>{t("PHASE BÊTA")}</div>
          <h3>{t("Construisons ensemble")}<br />{t("le meilleur outil pour traders.")}</h3>
          <p>{t("Vos retours nous aident à façonner InvestPro Trading, à prioriser les améliorations et à rendre l’expérience plus simple.")}</p>

          <div className={styles.betaLandscape}>
            <div className={styles.eclipseMini} />
          </div>

          <div className={styles.betaMiniStats}>
            <div>
              <WalletCards size={16} />
              <span>
                <b>{t("Multi-comptes")}</b>{t("centralisés")}</span>
            </div>

            <div>
              <ShieldCheck size={16} />
              <span>
                <b>{t("Lecture seule")}</b>{t("côté suivi")}</span>
            </div>

            <div>
              <RefreshCw size={16} />
              <span>
                <b>{t("Synchronisation")}</b>{t("selon connexion")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div>
          <div className={styles.sectionEyebrow}>{t("FOIRE AUX QUESTIONS")}</div>
          <h2>{t("Vos questions.")}<br />{t("Des réponses claires.")}</h2>

          <Link href="/dashboard/contact" className={styles.faqButton}>{t("Voir toutes les FAQ ")}<ArrowRight size={15} />
          </Link>
        </div>

        <div className={styles.faqList}>
          {faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{t(question)}</summary>
              <p>{t(answer)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} id="pourquoi">
        <div className={styles.finalBackdrop} />
        <div className={styles.sectionEyebrow}>{t("INVESTPRO TRADING")}</div>
        <h2>{t("Le prochain trade commence")}<br />{t("par une meilleure préparation.")}</h2>

        <Link href="/signup" className={styles.primaryButtonLarge}>{t("Créer mon compte ")}<ArrowRight size={17} />
        </Link>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoBars} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>{t("investpro")}</b>
            <small>{t("TRADING")}</small>
          </span>
        </Link>

        <nav>
          <a href="#pourquoi">{t("Pourquoi InvestPro")}</a>
          <a href="#fonctionnalites">{t("Fonctionnalités")}</a>
          <a href="#beta">{t("Accès bêta")}</a>
          <a href="#faq">{t("FAQ")}</a>
        </nav>

        <div>
          <Link href="/cgu">{t("Conditions d’utilisation")}</Link>
          <span>|</span>
          <Link href="/privacy">{t("Confidentialité")}</Link>
        </div>
      </footer>
    </main>
  );
}
