import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDollarSign,
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
    "InvestPro Copier est-il disponible ?",
    "Le module multi-comptes et les outils de copie sont intégrés à l’écosystème InvestPro selon les connexions et accès disponibles.",
  ],
  [
    "Comment lire mes performances ?",
    "Le Journal et les Rapports regroupent win rate, P&L, profit factor, drawdown, séries et analyses par session ou setup.",
  ],
];

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.logo} aria-label="InvestPro Trading">
          <span className={styles.logoBars} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>investpro</b>
            <small>TRADING</small>
          </span>
        </Link>

        <nav className={styles.navLinks}>
          <a href="#pourquoi">Pourquoi InvestPro</a>
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#beta">Accès bêta</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.secondaryButton}>
            Se connecter
          </Link>
          <Link href="/dashboard" className={styles.primaryButton}>
            Explorer l’espace <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>L’ESPACE DES TRADERS DISCIPLINÉS</div>

          <h1>
            Tradez mieux.
            <br />
            <span>Progressez</span>
            <br />
            <span>chaque jour.</span>
          </h1>

          <p>
            Analysez, exécutez, comprenez et suivez vos performances dans un
            espace unique, pensé pour les traders qui veulent de vrais résultats.
          </p>

          <div className={styles.heroActions}>
            <Link href="/dashboard" className={styles.primaryButtonLarge}>
              Accéder à mon espace <ArrowRight size={18} />
            </Link>

            <Link href="/login" className={styles.demoButton}>
              Se connecter <ArrowRight size={16} />
            </Link>
          </div>

          <div className={styles.heroFacts}>
            <span>
              <CheckCircle2 size={15} /> Journal & analyse
            </span>
            <span>
              <CheckCircle2 size={15} /> Gestion du risque
            </span>
            <span>
              <CheckCircle2 size={15} /> Multi-comptes
            </span>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.previewLabel}><MonitorSmartphone size={14} /> L’ESPACE INVESTPRO, SUR ORDINATEUR ET MOBILE</div>
          <div className={styles.productPreview}>
            <div className={styles.productDesktop}>
              <div className={styles.productSidebar}>
                <div className={styles.productBrand}><span className={styles.miniBars}><i /><i /><i /></span><b>investpro<small>TRADING</small></b></div>
                <span className={styles.productActive}>▦ &nbsp; Dashboard</span>
                <span>▤ &nbsp; Mes comptes</span>
                <span>⌁ &nbsp; Connexions</span>
                <span>▧ &nbsp; Journal</span>
                <span>▣ &nbsp; Plan de trading</span>
                <span>▥ &nbsp; Rapports</span>
                <span>↗ &nbsp; Performances VIP</span>
              </div>
              <div className={styles.productMain}>
                <div className={styles.productTopline}><span>Espace trader&nbsp; › &nbsp;<b>Dashboard</b></span><span className={styles.productAvatar}>IP</span></div>
                <div className={styles.productHeading}><div><small>VOTRE TRADING, EN PERSPECTIVE</small><h2>Bonjour, Trader.</h2><p>Gardez une vue claire sur vos résultats et vos prochaines décisions.</p></div><span className={styles.productButton}>＋ Ajouter un trade</span></div>
                <div className={styles.productBanner}><div><small>INVESTPRO TRADING HUB</small><b>Votre discipline fait la différence.</b><span>Apprenez, analysez et suivez votre trading au même endroit.</span></div><div className={styles.productRules}><small>LES REPÈRES DU PLAN</small><b>— <i>Risque maximum / trade</i></b><b>— <i>Trades maximum / jour</i></b></div></div>
                <div className={styles.productMetrics}><div><small>Solde des comptes</small><b>18 640 €</b><span>Exemple fictif · 2 comptes</span></div><div><small>Résultat net</small><b className={styles.demoPositive}>+1 284 €</b><span>Exemple fictif · période</span></div><div><small>Taux de réussite</small><b>76 %</b><span>Exemple fictif · hors BE</span></div><div><small>Trades de la période</small><b>24</b><span>Exemple fictif</span></div></div>
                <div className={styles.productChart}><div><b>La régularité se construit.</b><small>APERÇU ILLUSTRATIF · DONNÉES FICTIVES</small></div><div className={styles.productDemoChart}><span>Résultat net cumulé</span><b>+1 284 €</b><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><small>Les chiffres présentés sont des exemples fictifs.</small></div></div>
              </div>
            </div>
            <div className={styles.productPhone} aria-label="Aperçu de l’interface mobile InvestPro">
              <div className={styles.phoneScreen}>
                <div className={styles.phoneStatus}><span>9:41</span><span>● ● ▰</span></div>
                <div className={styles.phoneBrand}><span className={styles.miniBars}><i /><i /><i /></span><b>investpro</b><span>IP</span></div>
                <div className={styles.phoneGreeting}><small>VOTRE TRADING, EN PERSPECTIVE</small><b>Bonjour, Trader.</b><span>Votre espace en un coup d’œil.</span></div>
                <div className={styles.phoneBalance}><small>SOLDE DES COMPTES · EXEMPLE FICTIF</small><b>18 640 €</b><span>Exemple illustratif</span><div className={styles.phoneMiniChart}><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
                <div className={styles.phoneSectionTitle}>Vos indicateurs</div>
                <div className={styles.phoneTiles}><div><small>Résultat net · fictif</small><b>+1 284 €</b></div><div><small>Taux réussite · fictif</small><b>76 %</b></div></div>
                <div className={styles.phoneSectionTitle}>Derniers trades <span>Tout voir&nbsp; →</span></div>
                <div className={styles.phoneEmpty}>Vos trades apparaîtront ici après leur ajout.</div>
                <div className={styles.phoneTabbar}><span>⌂<small>Accueil</small></span><span>▤<small>Journal</small></span><span>◉<small>Comptes</small></span><span>☻<small>Profil</small></span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trustStrip}>
        <div>
          <ShieldCheck />
          <span>
            <b>Une méthode claire</b>
            Du plan à l’exécution
          </span>
        </div>

        <div>
          <ShieldCheck />
          <span>
            <b>Vos données sécurisées</b>
            et toujours synchronisées
          </span>
        </div>

        <div>
          <Target />
          <span>
            <b>Pensé pour progresser</b>
            avec des décisions mesurables
          </span>
        </div>

        <div>
          <CircleDollarSign />
          <span>
            <b>Accès bêta gratuit</b>
            pendant la phase de test
          </span>
        </div>
      </section>

      <section className={styles.featuresSection} id="fonctionnalites">
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionEyebrow}>
              TOUT CE DONT VOUS AVEZ BESOIN
            </div>
            <h2>
              Un espace complet pour <span>votre progression.</span>
            </h2>
          </div>

          <p>
            Des outils puissants et simples, réunis dans une seule plateforme
            pour analyser, suivre et améliorer vos performances.
          </p>
        </div>

        <div className={styles.featureGrid}>
          {features.map(({ num, icon: Icon, title, text, href, kind }) => (
            <article key={num} className={styles.featureCard}>
              <div className={styles.featureTop}>
                <Icon size={31} strokeWidth={2.15} />
                <span>{num}</span>
              </div>

              <h3>{title}</h3>
              <p>{text}</p>

              <div className={styles.featureVisual}>
                {kind === "journal" ? (
                  <div className={styles.tradeListMock}>
                    <div>
                      <span className={styles.assetIcon}>🇪🇺</span>
                      <b>EURUSD</b>
                      <em className={styles.positive}>+320 €</em>
                    </div>
                    <div>
                      <span className={styles.assetIcon}>🟨</span>
                      <b>XAUUSD</b>
                      <em className={styles.negative}>-150 €</em>
                    </div>
                    <div>
                      <span className={styles.assetIcon}>🇺🇸</span>
                      <b>NAS100</b>
                      <em className={styles.positive}>+412 €</em>
                    </div>
                  </div>
                ) : null}

                {kind === "accounts" ? (
                  <div className={styles.accountsMock}>
                    <div>
                      <span>Compte principal</span>
                      <b>27 416 €</b>
                      <em>+18.2%</em>
                    </div>
                    <div>
                      <span>Compte FTMO</span>
                      <b>12 307 €</b>
                      <em>+6.4%</em>
                    </div>
                    <div>
                      <span>Compte démo</span>
                      <b>5 120 €</b>
                      <em>+2.4%</em>
                    </div>
                  </div>
                ) : null}

                {kind === "plan" ? (
                  <div className={styles.planMock}>
                    <div>
                      <span className={styles.planCheck}>✓</span>
                      <b>Ma routine quotidienne</b>
                      <i>✓</i>
                    </div>
                    <div>
                      <span className={styles.planCheck}>✓</span>
                      <b>Règles de risque</b>
                      <i>✓</i>
                    </div>
                    <div>
                      <span className={styles.planCheck}>◉</span>
                      <b>Objectifs de la semaine</b>
                      <i>✓</i>
                    </div>
                  </div>
                ) : null}

                {kind === "reports" ? (
                  <div className={styles.reportsMock}>
                    <div className={styles.winrateMock}>
                      <small>Win rate</small>
                      <strong>62%</strong>
                      <em>+6%</em>
                      <div className={styles.ringMock}>
                        <span />
                      </div>
                    </div>

                    <div className={styles.pnlMock}>
                      <small>P&L moyen</small>
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
                            <b>Aperçu d’un connecteur</b>
                            <small>Données d’exemple</small>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <Link
                href={href}
                aria-label={`Ouvrir ${title}`}
                className={styles.featureArrow}
              >
                <ArrowRight size={19} />
              </Link>
            </article>
          ))}
        </div>

        <div className={styles.copierSpotlight}>
          <div className={styles.copierSpotlightCopy}>
            <span className={styles.copierSpotlightEyebrow}>INVESTPRO COPIER</span>
            <h3>Vos comptes, vos réglages, une vue claire.</h3>
            <p>
              Retrouvez les comptes receveurs, les liaisons Master et les
              paramètres de risque dans un espace conçu pour suivre chaque étape.
            </p>
            <Link href="/dashboard/copieur" className={styles.copierSpotlightLink}>
              Découvrir InvestPro Copier <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.copierSteps} aria-label="Étapes de configuration">
            <div><span>01</span><b>Choisir les comptes</b><small>Master et receveurs</small></div>
            <div><span>02</span><b>Régler le risque</b><small>Volumes et exécution</small></div>
            <div><span>03</span><b>Suivre l’activité</b><small>État et historique</small></div>
          </div>
        </div>
      </section>

      <section className={styles.betaSection} id="beta">
        <div className={styles.betaCopy}>
          <div className={styles.sectionEyebrow}>ACCÈS BÊTA</div>
          <h2>
            Votre espace de trading.
            <br />
            <span>Gratuit pendant la bêta.</span>
          </h2>
          <p>
            Rejoignez les utilisateurs qui testent InvestPro et accédez à
            toutes les fonctionnalités actuellement ouvertes.
          </p>

          <div className={styles.betaActions}>
            <Link href="/signup" className={styles.primaryButtonLarge}>
              Créer mon compte gratuitement <ArrowRight size={17} />
            </Link>

            <Link href="/login" className={styles.demoButton}>
              Se connecter <ArrowRight size={15} />
            </Link>
          </div>

          <div className={styles.betaFacts}>
            <span>
              <Check size={14} /> Accès complet
            </span>
            <span>
              <Check size={14} /> Mises à jour prioritaires
            </span>
            <span>
              <Check size={14} /> Votre avis compte
            </span>
          </div>
        </div>

        <div className={styles.betaVisual}>
          <div className={styles.betaTag}>PHASE BÊTA</div>
          <h3>
            Construisons ensemble
            <br />
            le meilleur outil pour traders.
          </h3>
          <p>
            Vos retours nous aident à façonner InvestPro Trading, à prioriser
            les améliorations et à rendre l’expérience plus simple.
          </p>

          <div className={styles.betaLandscape}>
            <div className={styles.eclipseMini} />
          </div>

          <div className={styles.betaMiniStats}>
            <div>
              <WalletCards size={16} />
              <span>
                <b>Multi-comptes</b>
                centralisés
              </span>
            </div>

            <div>
              <ShieldCheck size={16} />
              <span>
                <b>Lecture seule</b>
                côté suivi
              </span>
            </div>

            <div>
              <RefreshCw size={16} />
              <span>
                <b>Synchronisation</b>
                selon connexion
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div>
          <div className={styles.sectionEyebrow}>FOIRE AUX QUESTIONS</div>
          <h2>
            Vos questions.
            <br />
            Des réponses claires.
          </h2>

          <Link href="/dashboard/contact" className={styles.faqButton}>
            Voir toutes les FAQ <ArrowRight size={15} />
          </Link>
        </div>

        <div className={styles.faqList}>
          {faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} id="pourquoi">
        <div className={styles.finalBackdrop} />
        <div className={styles.sectionEyebrow}>INVESTPRO TRADING</div>
        <h2>
          Le prochain trade commence
          <br />
          par une meilleure préparation.
        </h2>

        <Link href="/signup" className={styles.primaryButtonLarge}>
          Créer mon compte <ArrowRight size={17} />
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
            <b>investpro</b>
            <small>TRADING</small>
          </span>
        </Link>

        <nav>
          <a href="#pourquoi">Pourquoi InvestPro</a>
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#beta">Accès bêta</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div>
          <Link href="/cgu">Conditions d’utilisation</Link>
          <span>|</span>
          <Link href="/privacy">Confidentialité</Link>
        </div>
      </footer>
    </main>
  );
}
