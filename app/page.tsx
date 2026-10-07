import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Copy,
  Layers3,
  MonitorSmartphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Target,
  TrendingUp,
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
    text: "Suivez plusieurs comptes en temps réel. Une vision globale de vos performances.",
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
    text: "Accédez à vos données sur tous vos appareils, automatiquement.",
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
    "Le copy trading est-il disponible ?",
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
              Découvrir mon espace <ArrowRight size={18} />
            </Link>

            <Link href="/login" className={styles.demoButton}>
              <Play size={16} fill="currentColor" />
              Voir la démo <span>2 min</span>
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
          <div className={styles.stackOne} />
          <div className={styles.stackTwo} />

          <div className={styles.dashboardMock}>
            <div className={styles.mockSidebar}>
              <div className={styles.mockLogo}>
                <span className={styles.miniBars}>
                  <i />
                  <i />
                  <i />
                </span>
                <b>investpro</b>
              </div>

              <div className={styles.mockNavItemActive}>Tableau de bord</div>
              <div>Journal de trading</div>
              <div>Mes comptes</div>
              <div>Plan de trading</div>
              <div>Analyses</div>
              <div>Calendrier</div>
              <div className={styles.mockSync}>Synchronisation</div>
            </div>

            <div className={styles.mockMain}>
              <div className={styles.mockHeader}>
                <div>
                  <strong>Bonjour, Trader 👋</strong>
                  <small>Voici un aperçu de vos performances.</small>
                </div>
                <span>Cette semaine</span>
              </div>

              <div className={styles.mockMetrics}>
                <div>
                  <small>P&L Total</small>
                  <strong className={styles.positive}>+2 458 €</strong>
                  <span>+12,4%</span>
                </div>
                <div>
                  <small>Trades</small>
                  <strong>24</strong>
                  <span>cette semaine</span>
                </div>
                <div>
                  <small>Win rate</small>
                  <strong>62%</strong>
                  <span>performance</span>
                </div>
              </div>

              <div className={styles.mockChart}>
                <div className={styles.mockChartTop}>
                  <div>
                    <small>Évolution du capital</small>
                    <strong>27 416 €</strong>
                  </div>
                  <span>APERÇU DÉMO</span>
                </div>

                <svg viewBox="0 0 520 170" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#e7b653" stopOpacity=".25" />
                      <stop offset="100%" stopColor="#e7b653" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 138 L28 128 L52 132 L78 114 L105 120 L132 96 L160 103 L188 78 L215 88 L246 64 L273 70 L302 52 L333 60 L361 42 L392 48 L420 29 L447 34 L475 19 L520 8 L520 170 L0 170 Z"
                    fill="url(#area)"
                  />
                  <path
                    d="M0 138 L28 128 L52 132 L78 114 L105 120 L132 96 L160 103 L188 78 L215 88 L246 64 L273 70 L302 52 L333 60 L361 42 L392 48 L420 29 L447 34 L475 19 L520 8"
                    fill="none"
                    stroke="#efbf5c"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <div className={styles.mockDays}>
                  <span>Lun</span>
                  <span>Mar</span>
                  <span>Mer</span>
                  <span>Jeu</span>
                  <span>Ven</span>
                  <span>Sam</span>
                  <span>Dim</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.riskCard}>
            <ShieldCheck size={18} />
            <div>
              <small>Risque du jour</small>
              <strong>-0.8%</strong>
              <span>Dans la limite</span>
            </div>
          </div>

          <div className={styles.tradeCard}>
            <div className={styles.tradeCoin}>EU</div>
            <div>
              <small>EURUSD</small>
              <strong>Achat · 1.2 lots</strong>
            </div>
            <div className={styles.tradeProfit}>
              +320 €
              <span>+1.6%</span>
            </div>
          </div>

          <div className={styles.phoneMock}>
            <div className={styles.phoneNotch} />
            <div className={styles.phoneTitle}>Mon compte</div>
            <strong>27 416 €</strong>
            <span>+18.2%</span>
            <svg viewBox="0 0 180 70" preserveAspectRatio="none">
              <path
                d="M0 58 L18 54 L35 48 L53 51 L70 40 L88 43 L105 31 L121 35 L139 20 L154 23 L180 8"
                fill="none"
                stroke="#e7b653"
                strokeWidth="3"
              />
            </svg>
            <div className={styles.phoneTrades}>
              <div>
                <span>EURUSD</span>
                <b className={styles.positive}>+200 €</b>
              </div>
              <div>
                <span>BTCUSD</span>
                <b className={styles.negative}>-150 €</b>
              </div>
              <div>
                <span>XAUUSD</span>
                <b className={styles.positive}>+280 €</b>
              </div>
              <div>
                <span>NAS100</span>
                <b className={styles.positive}>+412 €</b>
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
                        <b>Synchronisé</b>
                        <small>il y a 2 minutes</small>
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
            <Link href="/dashboard" className={styles.primaryButtonLarge}>
              Demander mon accès <ArrowRight size={17} />
            </Link>

            <Link href="/login" className={styles.demoButton}>
              <Play size={15} fill="currentColor" />
              Voir la démo
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

        <Link href="/dashboard" className={styles.primaryButtonLarge}>
          Ouvrir mon espace <ArrowRight size={17} />
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
