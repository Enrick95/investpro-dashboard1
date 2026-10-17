"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Bell, BookOpen, Calculator, ChartNoAxesCombined, Check, CheckCheck, ChevronRight, CircleHelp, CreditCard, Crown, GraduationCap, Handshake, Link2, LockKeyhole, MessageCircle, Radio, ShieldCheck, Smartphone, Sparkles, UserRound } from "lucide-react";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { VipApiError, vipDate, vipRequest, type VipAccess } from "@/lib/vip/client";
import type { VipAccessRequest, VipMembership } from "@/lib/vip/types";
import { vipParisPaymentDate } from "@/lib/vip/access-requests";
import { vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { createClient } from "@/lib/supabase/client";
import s from "./join.module.css";

type Access = "subscription" | "affiliation";
type Stage = "account" | "checkout" | "broker" | "broker-account" | "instructions" | "deposit" | "finish";
type BrokerAccount = "new" | "existing";
const brokers = ["Raise FX", "Vantage", "PU Prime", "Axi"] as const;
type Broker = (typeof brokers)[number];
type LinkingInstructions =
  | { kind: "email"; recipients: readonly string[]; subject: string; body: string }
  | { kind: "chat"; body: string }
  | { kind: "pending" };
const BROKER_CONFIG: Record<Broker, { signupUrl: string; linking: LinkingInstructions }> = {
  "Vantage": { signupUrl: "https://www.vantagemarkets.com/fr/open-live-account?cpaAffid=NDY3MzA&afp=Support", linking: { kind: "pending" } },
  "Raise FX": { signupUrl: "https://partners.raisefx.com/visit/?bta=153152&brand=raisefx&afp=support", linking: { kind: "chat", body: "Bonjour, je souhaiterais être rattaché au compte de Enrick, ID : 153152." } },
  "PU Prime": { signupUrl: "https://fr.puprime.partners/forex-trading-account/?affid=90088", linking: { kind: "email", recipients: ["louis.coudray@puprime.com", "info@puprime.com"], subject: "Demande de transfert de compte", body: "Bonjour,\n\nJe m’appelle [Votre nom et prénom],\nMon numéro de compte est [Votre numéro de compte].\n\nJe souhaite être transféré sous le code 90088.\n\nCordialement," } },
  "Axi": { signupUrl: "https://www.axi.com/int/live-account?promocode=4740681", linking: { kind: "email", recipients: ["milan.cutkovic@axi.com"], subject: "Account linking request", body: "I am requesting an account under 4740681" } },
};
const USD_TO_EUR = 1 / 1.1208;
const RATE_DATE = "2026-10-15";
const RATE_SOURCE = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html";
const WELCOME_CODE = "ENRICK100";
const SUBSCRIPTION_MONTHLY_EUR = 80;
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/9B614mdzS0WhfibeCr9R600";
const BROKER_KEYS: Record<Broker, string> = { "Raise FX": "raise_fx", Vantage: "vantage", "PU Prime": "puprime", Axi: "axi" };
type Choices = { access?: string; broker?: string; account?: string };
type Intake = { user: { email: string }; request: VipAccessRequest | null; membership: VipMembership | null; active: boolean };

export default function JoinVip({ initialChoices = {} }: { initialChoices?: Choices }) {
  const { locale, t } = useLocale();
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const numberLocale = locale === "en" ? "en-US" : "fr-FR";
  const formatUsd = (amount: number) => new Intl.NumberFormat(numberLocale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  const formatEur = (amount: number) => new Intl.NumberFormat(numberLocale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount * USD_TO_EUR);
  const subscriptionPrice = new Intl.NumberFormat(numberLocale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(SUBSCRIPTION_MONTHLY_EUR);
  const rateDate = new Intl.DateTimeFormat(numberLocale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${RATE_DATE}T12:00:00Z`));
  const [access, setAccess] = useState<Access | null>(initialChoices.access === "affiliation" || initialChoices.access === "subscription" ? initialChoices.access : null);
  const [stage, setStage] = useState<Stage>("account");
  const [broker, setBroker] = useState<Broker | null>(brokers.find(name => BROKER_KEYS[name] === initialChoices.broker) || null);
  const [brokerAccount, setBrokerAccount] = useState<BrokerAccount | null>(initialChoices.account === "existing" || initialChoices.account === "new" ? initialChoices.account : null);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [wantsCopy, setWantsCopy] = useState(false);
  const [codeCopyState, setCodeCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [messageCopyState, setMessageCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [navigation, setNavigation] = useState(0);
  const journeyHeading = useRef<HTMLHeadingElement>(null);
  const accessHeading = useRef<HTMLHeadingElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", telegramUsername: "", brokerAccountId: "", brokerEmail: "", paidOn: "" });
  const [confirmed, setConfirmed] = useState(false);
  const loadVersion = useRef(0);
  const authUser = useRef<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    try {
      const [result, vip] = await Promise.all([
        vipRequest<Intake>("/api/vip/requests", { signal }),
        vipRequest<VipAccess>("/api/vip/access", { signal }),
      ]);
      if (!signal?.aborted && version === loadVersion.current) { setIntake(result); setUserId(vip.user.id); setError(""); }
    } catch (cause) {
      if (!signal?.aborted && version === loadVersion.current) {
        setIntake(null); setUserId(null);
        setError(cause instanceof VipApiError && cause.status === 401 ? "" : cause instanceof Error ? cause.message : "Votre demande est indisponible.");
      }
    } finally { if (!signal?.aborted && version === loadVersion.current) setLoading(false); }
  }, []);
  // Session identity is checked by the protected APIs; cleanup prevents stale results after navigation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    // Auth events clear personal details immediately; the server remains the access authority.
    const versionCounter = loadVersion;
    let listening = true;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user.id || null;
      if (nextUser === authUser.current) return;
      authUser.current = nextUser;
      ++loadVersion.current;
      setIntake(null); setUserId(null); setConfirmed(false); setError("");
      setForm({ firstName: "", lastName: "", telegramUsername: "", brokerAccountId: "", brokerEmail: "", paidOn: "" });
      if (nextUser) { setLoading(true); queueMicrotask(() => { if (listening) void load(); }); }
      else setLoading(false);
    });
    return () => { listening = false; ++versionCounter.current; data.subscription.unsubscribe(); };
  }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  const nextChoices = new URLSearchParams();
  if (access) nextChoices.set("access", access);
  if (broker) nextChoices.set("broker", BROKER_KEYS[broker]);
  if (brokerAccount) nextChoices.set("account", brokerAccount);
  const nextPath = `/vip/rejoindre${nextChoices.size ? `?${nextChoices}` : ""}`;
  const authQuery = `next=${encodeURIComponent(nextPath)}`;
  const checkoutUrl = new URL(STRIPE_PAYMENT_LINK);
  if (intake?.user.email) checkoutUrl.searchParams.set("prefilled_email", intake.user.email);
  if (userId) checkoutUrl.searchParams.set("client_reference_id", userId);
  const brokerConfig = broker ? BROKER_CONFIG[broker] : null;
  const linking = brokerConfig?.linking;
  const linkingMessage = linking && linking.kind !== "pending" ? linking.body : "";
  const linkingMailto = linking?.kind === "email" ? `mailto:${linking.recipients.join(",")}?subject=${encodeURIComponent(linking.subject)}&body=${encodeURIComponent(linking.body)}` : "";

  useEffect(() => {
    if (!navigation) return;
    const heading = access ? journeyHeading.current : accessHeading.current;
    heading?.scrollIntoView({ behavior: "auto", block: "start" });
    heading?.focus({ preventScroll: true });
  }, [navigation, access]);
  useEffect(() => {
    if (!error) return;
    errorNotice.current?.scrollIntoView({ behavior: "auto", block: "center" });
    errorNotice.current?.focus({ preventScroll: true });
  }, [error]);

  function go(next: Stage) {
    setStage(next);
    setConfirmed(false);
    setNavigation(value => value + 1);
  }

  function choose(next: Access) {
    setAccess(next);
    setBroker(null);
    setBrokerAccount(null);
    setDeposit(null);
    setWantsCopy(false);
    setCodeCopyState("idle");
    setMessageCopyState("idle");
    setConfirmed(false); setError("");
    go(next === "subscription" ? "account" : "broker");
  }

  function closeJourney() {
    setAccess(null);
    setNavigation(value => value + 1);
  }

  function selectBroker(next: Broker) {
    if (broker !== next) {
      setBrokerAccount(null);
      setDeposit(null);
      setWantsCopy(false);
      setCodeCopyState("idle");
      setMessageCopyState("idle");
    }
    setBroker(next);
  }

  function selectSituation(next: BrokerAccount) {
    if (brokerAccount !== next) {
      setDeposit(null);
      setWantsCopy(false);
      setMessageCopyState("idle");
    }
    setBrokerAccount(next);
  }

  function selectDeposit(next: number) {
    setDeposit(next);
    if (next < 500) setWantsCopy(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intake || busy || !confirmed) return;
    if (access === "affiliation" && (!broker || !brokerAccount || !deposit || deposit < 300 || (wantsCopy && deposit < 500))) {
      setError(tr("Vérifiez votre broker, votre situation et votre dépôt réel.", "Check your broker, account status and actual deposit.")); return;
    }
    setBusy(true); setError("");
    try {
      await vipRequest("/api/vip/requests", { method: "POST", body: JSON.stringify({
        requestKind: "new", firstName: form.firstName, lastName: form.lastName, telegramUsername: form.telegramUsername,
        type: access === "subscription" ? "abonnement" : "affiliation",
        ...(access === "affiliation" && broker ? {
          affiliationBroker: BROKER_KEYS[broker], brokerAccountKind: brokerAccount,
          brokerAccountId: form.brokerAccountId, brokerEmail: form.brokerEmail,
          declaredDepositUsd: deposit, copyRequested: wantsCopy,
        } : { paidOn: form.paidOn }),
      }) });
      await load(); go("finish");
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("La demande n’a pas pu être envoyée.", "Your request could not be sent.")); }
    finally { setBusy(false); }
  }

  async function copyWelcomeCode() {
    try {
      await navigator.clipboard.writeText(WELCOME_CODE);
      setCodeCopyState("copied");
    } catch {
      setCodeCopyState("failed");
    }
  }

  async function copyLinkingMessage() {
    if (!linkingMessage) return;
    try {
      await navigator.clipboard.writeText(linkingMessage);
      setMessageCopyState("copied");
    } catch {
      setMessageCopyState("failed");
    }
  }

  function back() {
    if (access === "subscription") {
      if (stage === "finish") go("checkout");
      else if (stage === "checkout") go("account");
      else closeJourney();
    } else {
      if (stage === "finish") go("deposit");
      else if (stage === "deposit") go("instructions");
      else if (stage === "instructions") go("account");
      else if (stage === "account") go("broker-account");
      else if (stage === "broker-account") go("broker");
      else closeJourney();
    }
  }

  const features = [
    { icon: ChartNoAxesCombined, title: tr("Analyses", "Analysis"), body: tr("Les graphiques, les zones et le contexte.", "Charts, key areas and market context.") },
    { icon: Radio, title: tr("Signaux & suivi", "Signals & follow-up"), body: tr("Les publications et leurs mises à jour réunies.", "Posts and their updates, together.") },
    { icon: BookOpen, title: tr("Bilans & journal", "Reviews & journal"), body: tr("Du recul sur les sessions et votre progression.", "Review sessions and track your progress.") },
    { icon: Calculator, title: tr("Simulateur de risque", "Risk calculator"), body: tr("Calculez votre lot avant la prise de position.", "Calculate position size before entering a trade.") },
  ];
  const totalSteps = access === "subscription" ? 3 : 6;
  const currentStep = access === "subscription"
    ? ({ account: 1, checkout: 2, finish: 3 } as Partial<Record<Stage, number>>)[stage] || 1
    : ({ broker: 1, "broker-account": 2, account: 3, instructions: 4, deposit: 5, finish: 6 } as Partial<Record<Stage, number>>)[stage] || 1;
  const existing = brokerAccount === "existing";
  const stageTitle = stage === "broker" ? tr("Avec quel broker souhaitez-vous rejoindre ?", "Which broker would you like to join through?")
    : stage === "broker-account" ? tr("Où en êtes-vous avec ce broker ?", "Do you already have an account with this broker?")
      : stage === "account" ? tr("D’abord, votre compte InvestPro.", "First, your InvestPro account.")
        : stage === "checkout" ? tr("Votre abonnement, en toute simplicité.", "Your subscription, made simple.")
          : stage === "instructions" ? existing ? tr("Rattacher votre compte à InvestPro.", "Link your account to InvestPro.") : tr("Les démarches pour votre nouveau compte.", "The steps for your new account.")
            : stage === "deposit" ? tr("Votre dépôt, avant vérification.", "Your deposit, before review.")
              : tr("Vérifiez et transmettez votre demande.", "Review and send your application.");

  return <main className={s.page}>
    <div className={s.previewNotice}><ShieldCheck size={13} aria-hidden="true" /><span>{tr("Votre adhésion InvestPro · un parcours, toutes vos étapes", "Your InvestPro membership · one journey, every step")}</span></div>
    <div className={s.shell}>
      <header className={s.header}>
        <Link href="/" className={s.brand}><span className={s.brandIcon}><Crown size={23} aria-hidden="true" /></span><span>InvestPro <b>VIP</b><small>TRADING</small></span></Link>
        <div className={s.headerRight}><a href="#votre-acces" className={s.headerJoin}>{tr("Rejoindre", "Join")}<ArrowRight size={14} aria-hidden="true" /></a><LanguageSwitcher /></div>
      </header>

      <section className={s.hero} aria-labelledby="join-hero-title">
        <div className={s.heroScene} aria-hidden="true"><span className={s.halo} /><span className={s.orbitOne} /><span className={s.orbitTwo} /><span className={s.orbitThree} /><span className={s.starOne} /><span className={s.starTwo} /></div>
        <div className={s.heroCopy}>
          <span className={s.eyebrow}><span className={s.smallLine} />{tr("VOTRE ESPACE INVESTPRO VIP", "YOUR INVESTPRO VIP SPACE")}</span>
          <h1 id="join-hero-title">{tr("Un espace privé.", "A private space.")}<br /><em>{tr("Un cadre pour avancer.", "A framework to move forward.")}</em></h1>
          <p>{tr("Analyses, signaux, suivi et outils de risque. Retrouvez votre communauté dans un espace pensé pour vous accompagner, du contexte au bilan.", "Analysis, signals, follow-up and risk tools. Join your community in one space, from market context to session review.")}</p>
          <a href="#votre-acces" className={s.primary}>{tr("Découvrir les accès VIP", "Explore VIP access")}<ArrowDown size={17} aria-hidden="true" /></a>
          <div className={s.heroFoot}><Smartphone size={15} aria-hidden="true" />{tr("Sur iPhone, Android et ordinateur", "On iPhone, Android and desktop")}</div>
        </div>
        <div className={s.heroVisual} aria-label={tr("Aperçu de l’organisation de l’espace VIP", "Preview of the VIP space layout")}>
          <div className={s.visualTop}><span><Crown size={18} aria-hidden="true" />InvestPro VIP</span><span><LockKeyhole size={11} aria-hidden="true" />{tr("Privé", "Private")}</span></div>
          <div className={s.visualBody}><span className={s.visualKicker}>{tr("VOTRE ESPACE, AU MÊME ENDROIT", "YOUR SPACE, ALL TOGETHER")}</span><h2>{tr("Le contexte avant le trade.", "Context before the trade.")}</h2><p>{tr("Le suivi après.", "Follow-up after.")}</p>
            <div className={s.mockAnalysis}><span className={s.mockIcon}><ChartNoAxesCombined size={20} aria-hidden="true" /></span><div><b>{tr("Analyses de session", "Session analysis")}</b><span>{tr("Graphiques · zones · scénarios", "Charts · key areas · scenarios")}</span></div><ChevronRight size={15} aria-hidden="true" /></div>
            <div className={s.visualModules}><span><Radio size={15} aria-hidden="true" />{tr("Signaux", "Signals")}</span><span><CheckCheck size={15} aria-hidden="true" />{tr("Suivi", "Follow-up")}</span><span><BookOpen size={15} aria-hidden="true" />{tr("Bilans", "Reviews")}</span></div>
            <div className={s.mockNotification}><Bell size={18} aria-hidden="true" /><div><b>{tr("Gardez le lien avec InvestPro", "Stay connected to InvestPro")}</b><span>{tr("Des alertes, si vous les activez.", "Alerts, when you choose to enable them.")}</span></div><span className={s.notificationDot} /></div>
          </div>
          <div className={s.visualBottom}><ShieldCheck size={13} aria-hidden="true" />{tr("Espace personnel · accès réservé aux membres", "Personal space · members-only access")}</div>
        </div>
      </section>

      <section id="votre-acces" className={s.accessSection} aria-labelledby="access-title">
        <div className={s.sectionHeading}><div><span className={s.eyebrow}>{tr("DEUX FAÇONS DE NOUS REJOINDRE", "TWO WAYS TO JOIN")}</span><h2 id="access-title" tabIndex={-1} ref={accessHeading}>{tr("Choisissez votre accès.", "Choose your access.")}</h2></div><p>{tr("Un parcours clair. Votre compte, vos étapes, puis votre espace VIP.", "A clear journey. Your account, your steps, then your VIP space.")}</p></div>
        <div className={s.accessGrid}>
          <article className={`${s.accessCard} ${access === "subscription" ? s.selectedCard : ""}`}><div className={s.cardTop}><span className={s.choiceIcon}><CreditCard size={23} aria-hidden="true" /></span><span className={s.cardTag}>{tr("MENSUEL", "MONTHLY")}</span></div><h3>{tr("Par abonnement", "By subscription")}</h3><p>{tr("Rejoignez InvestPro VIP avec un abonnement mensuel, depuis le site.", "Join InvestPro VIP with a monthly subscription through the website.")}</p><div className={s.price}><strong>{subscriptionPrice}<small className={s.perMonth}>{tr("/ mois", "/ month")}</small></strong><span>{tr("Renouvellement mensuel · paiement sécurisé Stripe", "Monthly renewal · secure Stripe payment")}</span></div><ol className={s.miniSteps}><li>{tr("Votre compte InvestPro", "Your InvestPro account")}</li><li>{tr("Votre paiement sécurisé", "Your secure payment")}</li><li>{tr("Votre accès personnel", "Your personal access")}</li></ol><button className={s.primary} type="button" onClick={() => choose("subscription")}>{tr("Choisir l’abonnement", "Choose subscription")}<ArrowRight size={17} aria-hidden="true" /></button></article>
          <article className={`${s.accessCard} ${access === "affiliation" ? s.selectedCard : ""}`}><div className={s.cardTop}><span className={`${s.choiceIcon} ${s.cyanIcon}`}><Handshake size={23} aria-hidden="true" /></span><span className={s.cardTag}>{tr("VIA UN BROKER", "THROUGH A BROKER")}</span></div><h3>{tr("Par affiliation", "By affiliation")}</h3><p>{tr("Choisissez votre broker et suivez les démarches adaptées à votre situation.", "Choose your broker and follow the steps for your situation.")}</p><div className={s.brokerNames}>{brokers.map(name => <span key={name}>{name}</span>)}</div><div className={s.affiliationNote}><Link2 size={15} aria-hidden="true" /><span>{tr("Déjà un compte ? Un parcours de rattachement est prévu.", "Already have an account? There is a dedicated linking journey.")}</span></div><ol className={s.miniSteps}><li>{tr("Votre broker et votre situation", "Your broker and account status")}</li><li>{tr("Vos démarches d’affiliation", "Your affiliation steps")}</li><li>{tr("Une validation par l’équipe", "A review by the team")}</li></ol><button className={s.secondary} type="button" onClick={() => choose("affiliation")}>{tr("Choisir l’affiliation", "Choose affiliation")}<ArrowRight size={17} aria-hidden="true" /></button></article>
        </div>
        <div className={s.existingLink}><span>{tr("Vous êtes déjà dans notre canal Telegram VIP ?", "Already in our VIP Telegram channel?")}</span><Link href="/vip/deja-membre" prefetch={false}>{tr("Rattacher mon accès actuel", "Link my existing membership")}<ArrowRight size={14} aria-hidden="true" /></Link></div>

        {intake && (intake.membership || intake.request?.status === "pending") && <section className={s.statusPanel} aria-labelledby="request-status-title">
          <span className={s.finishBadge}><ShieldCheck size={17} aria-hidden="true" />{intake.active ? tr("VOTRE ACCÈS EST PRÊT", "YOUR ACCESS IS READY") : intake.membership ? tr("VOTRE ACCÈS EXISTANT", "YOUR EXISTING ACCESS") : tr("VÉRIFICATION EN COURS", "REVIEW IN PROGRESS")}</span>
          <h2 id="request-status-title">{intake.active ? tr("Bienvenue dans votre espace InvestPro.", "Welcome to your InvestPro space.") : intake.membership ? tr("Votre compte est déjà rattaché.", "Your account is already linked.") : tr("Votre demande est reçue.", "Your application has been received.")}</h2>
          <p>{intake.active ? tr("Vous pouvez maintenant ouvrir votre espace VIP.", "You can now open your VIP space.") : intake.membership ? tr("Retrouvez votre accès dans votre espace VIP, ou contactez l’équipe pour le renouveler ou le réactiver.", "Find your access in your VIP space, or contact the team to renew or reactivate it.") : tr("L’équipe vérifie les informations et le paiement ou le dépôt. Après validation, vous recevrez un e-mail avec le lien de votre espace VIP, ainsi qu’une notification sur cet appareil si vous avez activé les alertes. Aucun code supplémentaire n’est nécessaire.", "The team is checking your details and payment or deposit. Once approved, you will receive an email with a link to your VIP space, plus a notification on this device if you have enabled alerts. No additional code is needed.")}</p>
          <div className={s.summaryCard}><div><span>{tr("Compte", "Account")}</span><b>{intake.user.email}</b></div>{intake.request && <><div><span>{tr("Demande", "Application")}</span><b>{intake.request.type === "abonnement" ? tr("Abonnement", "Subscription") : `Affiliation · ${vipAffiliationBrokerLabel(intake.request.affiliation_broker) || "—"}`}</b></div>{intake.request.request_kind === "new" && intake.request.type === "affiliation" && <><div><span>{tr("Compte broker", "Broker account")}</span><b>{intake.request.broker_account_id || "—"}</b></div><div><span>{tr("Dépôt déclaré · à vérifier", "Declared deposit · awaiting review")}</span><b>{intake.request.declared_deposit_usd !== null ? formatUsd(intake.request.declared_deposit_usd) : "—"}</b></div><div><span>InvestPro Copy</span><b>{intake.request.copy_requested ? tr("Demandé · à vérifier", "Requested · awaiting review") : tr("Non demandé", "Not requested")}</b></div></>}{intake.request.type === "abonnement" && <div><span>{tr("Paiement déclaré · à vérifier", "Declared payment · awaiting review")}</span><b>{vipDate(intake.request.paid_on, locale)}</b></div>}<div><span>{tr("Envoyée le", "Sent on")}</span><b>{vipDate(intake.request.created_at, locale)}</b></div></>}</div>
          {intake.membership ? <Link className={s.primary} href="/dashboard/vip">{tr("Ouvrir mon espace VIP", "Open my VIP space")}<ArrowRight size={17} aria-hidden="true" /></Link> : <button type="button" className={s.secondary} onClick={() => void load()}>{tr("Vérifier mon accès", "Check my access")}<ShieldCheck size={16} aria-hidden="true" /></button>}
        </section>}
        {intake?.request?.status === "denied" && !intake.membership && <p className={s.formError} role="status">{tr("Votre précédente demande n’a pas été validée. Contactez l’équipe, puis corrigez vos informations si nécessaire.", "Your previous application was not approved. Contact the team, then correct your details if needed.")}</p>}
        {error && <p ref={errorNotice} tabIndex={-1} className={s.formError} role="alert">{t(error)}<button type="button" onClick={() => void load()}>{tr("Actualiser mon compte", "Refresh my account")}</button></p>}

        {access && !intake?.membership && intake?.request?.status !== "pending" && <section className={s.journey} aria-labelledby="journey-title">
          <div className={s.journeyToolbar}><button type="button" onClick={back} className={s.back}><ArrowLeft size={15} aria-hidden="true" />{tr("Retour", "Back")}</button><span>{access === "subscription" ? tr("ABONNEMENT", "SUBSCRIPTION") : tr("AFFILIATION", "AFFILIATION")}{broker ? ` · ${broker}` : ""}</span><button type="button" className={s.changeAccess} onClick={closeJourney}>{tr("Changer d’accès", "Change access")}</button></div>
          <div className={s.progressLabel}><span>{tr(`Étape ${currentStep} sur ${totalSteps}`, `Step ${currentStep} of ${totalSteps}`)}</span><span>{tr("Votre adhésion", "Your membership")}</span></div><div className={s.progressTrack} aria-hidden="true"><span style={{ width: `${currentStep / totalSteps * 100}%` }} /></div>
          <div className={s.journeyContent}><h2 id="journey-title" tabIndex={-1} ref={journeyHeading}>{stageTitle}</h2>
            {stage === "broker" && <><p className={s.lead}>{tr("Les étapes suivantes dépendent du broker et de l’existence d’un compte chez lui.", "The next steps depend on your broker and whether you already have an account with them.")}</p><div className={s.brokerGrid} role="group" aria-label={tr("Choix du broker", "Choose a broker")}>{brokers.map((name, index) => <button type="button" key={name} className={`${s.brokerButton} ${broker === name ? s.activeOption : ""}`} aria-pressed={broker === name} onClick={() => selectBroker(name)}><span className={`${s.brokerMonogram} ${s[`broker${index}`]}`}>{name === "Raise FX" ? "R" : name === "PU Prime" ? "PU" : name[0]}</span><b>{name}</b><span className={s.optionCheck}>{broker === name ? <Check size={15} aria-hidden="true" /> : <span />}</span></button>)}</div><p className={s.smallMuted}>{tr("Retrouvez les liens de création ou les consignes de rattachement à l’étape suivante.", "Find account creation links or account linking instructions in the next steps.")}</p><button type="button" className={s.primary} disabled={!broker} onClick={() => go("broker-account")}>{tr("Continuer avec ce broker", "Continue with this broker")}<ArrowRight size={17} aria-hidden="true" /></button></>}

            {stage === "broker-account" && <><p className={s.lead}>{tr(`Vous avez choisi ${broker}. Sélectionnez votre situation pour voir les bonnes étapes.`, `You chose ${broker}. Select your situation to see the right steps.`)}</p><div className={s.accountOptions} role="group" aria-label={tr("Votre situation chez le broker", "Your account status with the broker")}><button type="button" className={`${s.situationButton} ${brokerAccount === "new" ? s.activeOption : ""}`} aria-pressed={brokerAccount === "new"} onClick={() => selectSituation("new")}><UserRound size={23} aria-hidden="true" /><span><b>{tr("Je crée un nouveau compte", "I am creating a new account")}</b><small>{tr("Je n’ai pas encore de compte chez ce broker.", "I do not have an account with this broker yet.")}</small></span><span className={s.optionCheck}>{brokerAccount === "new" ? <Check size={15} aria-hidden="true" /> : null}</span></button><button type="button" className={`${s.situationButton} ${brokerAccount === "existing" ? s.activeOption : ""}`} aria-pressed={brokerAccount === "existing"} onClick={() => selectSituation("existing")}><Link2 size={23} aria-hidden="true" /><span><b>{tr("J’ai déjà un compte chez ce broker", "I already have an account with this broker")}</b><small>{tr("Je souhaite demander son rattachement à InvestPro.", "I would like to request linking it to InvestPro.")}</small></span><span className={s.optionCheck}>{brokerAccount === "existing" ? <Check size={15} aria-hidden="true" /> : null}</span></button></div>{existing && <div className={s.callout}><Link2 size={19} aria-hidden="true" /><p>{tr("Un compte existant doit être rattaché à InvestPro avant validation. Le rattachement dépend des règles du broker et doit être confirmé par celui-ci.", "An existing account must be linked to InvestPro before approval. Linking is subject to the broker’s rules and must be confirmed by them.")}</p></div>}<button type="button" className={s.primary} disabled={!brokerAccount} onClick={() => go("account")}>{tr("Continuer", "Continue")}<ArrowRight size={17} aria-hidden="true" /></button></>}

            {stage === "account" && <>
              <p className={s.lead}>{tr("Créez votre compte InvestPro et confirmez votre adresse e-mail. Vos choix vous attendront à votre retour. Déjà inscrit ? Connectez-vous avec votre compte actuel.", "Create your InvestPro account and confirm your email. Your choices will be waiting when you return. Already registered? Sign in with your existing account.")}</p>
              {loading ? <p role="status">{tr("Vérification de votre compte…", "Checking your account…")}</p> : intake ? <><div className={s.accountPreview}><span className={s.accountAvatar}><UserRound size={27} aria-hidden="true" /></span><div><strong>{intake.user.email}</strong><span>{tr("Votre compte InvestPro", "Your InvestPro account")}</span></div><ShieldCheck size={17} aria-hidden="true" /></div><button type="button" className={s.primary} onClick={() => go(access === "subscription" ? "checkout" : broker && brokerAccount ? "instructions" : "broker")}>{tr("Continuer mon adhésion", "Continue my application")}<ArrowRight size={17} aria-hidden="true" /></button></> : <div className={s.authActions}><Link href={`/signup?${authQuery}`} className={s.primary}>{tr("Créer mon compte", "Create my account")}<ArrowRight size={17} aria-hidden="true" /></Link><Link href={`/login?${authQuery}`} className={s.secondary}>{tr("J’ai déjà un compte", "I already have an account")}</Link></div>}
              <p className={s.identityNote}>{tr("La création du compte ne débloque pas le VIP à elle seule. L’équipe vérifie votre affiliation et votre dépôt, ou votre paiement, avant d’activer votre accès.", "Creating an account alone does not unlock VIP access. The team checks your affiliation and deposit, or payment, before activating access.")}</p>
            </>}

            {stage === "checkout" && <>
              <p className={s.lead}>{tr("Réglez votre abonnement sur la page sécurisée Stripe : 80 € par mois, avec renouvellement mensuel. Utilisez l’adresse e-mail de votre compte InvestPro, puis revenez ici après le paiement.", "Pay on the secure Stripe page: €80 per month, renewed monthly. Use your InvestPro account email, then return here after payment.")}</p>
              <div className={s.checkoutCard}><div><span className={s.choiceIcon}><Crown size={22} aria-hidden="true" /></span><div><b>InvestPro VIP</b><span>{tr("Abonnement mensuel", "Monthly subscription")}</span></div></div><strong>{subscriptionPrice}<small className={s.perMonth}>{tr("/ mois", "/ month")}</small></strong><ul><li><Check size={15} aria-hidden="true" />{tr("Analyses, signaux, suivi et bilans", "Analysis, signals, follow-up and reviews")}</li><li><Check size={15} aria-hidden="true" />{tr("Journal, rapports et simulateur de risque", "Journal, reports and risk calculator")}</li><li><Check size={15} aria-hidden="true" />{tr("Application mobile et alertes sur accord", "Mobile web app and opt-in alerts")}</li></ul>{intake ? <a href={checkoutUrl.toString()} target="_blank" rel="noopener noreferrer" className={s.primary}><LockKeyhole size={15} aria-hidden="true" />{tr(`Payer ${subscriptionPrice} / mois sur Stripe`, `Pay ${subscriptionPrice} / month on Stripe`)}</a> : <Link href={`/login?${authQuery}`} className={s.primary}>{tr("Me connecter pour continuer", "Sign in to continue")}</Link>}</div>
              <div className={s.previewHint}><CircleHelp size={16} aria-hidden="true" /><span>{tr("Après paiement, transmettez votre demande ci-dessous. L’équipe contrôle le règlement dans Stripe avant de valider l’accès. Aucun accès n’est accordé sur simple déclaration.", "After payment, submit your request below. The team checks the payment in Stripe before approving access. A declaration alone does not grant access.")}</span></div><button className={s.secondary} type="button" onClick={() => go("finish")}>{tr("J’ai effectué mon paiement · continuer", "I have paid · continue")}<ArrowRight size={17} aria-hidden="true" /></button>
            </>}

            {stage === "instructions" && <>
              <p className={s.lead}>{existing ? tr(`Votre compte ${broker} existe déjà. Demandez son rattachement à InvestPro, puis attendez la confirmation du broker avant de faire vérifier votre affiliation.`, `Your ${broker} account already exists. Request linking it to InvestPro, then wait for the broker’s confirmation before your affiliation is reviewed.`) : tr(`Ouvrez votre compte ${broker} depuis le lien InvestPro ci-dessous pour identifier votre affiliation. Suivez les démarches du broker, puis revenez pour déclarer votre dépôt réel.`, `Open your ${broker} account using the InvestPro link below to identify your affiliation. Follow the broker’s steps, then return to declare your actual deposit.`)}</p>
              <div className={s.instructionsCard}><span className={`${s.choiceIcon} ${s.cyanIcon}`}>{existing ? <Link2 size={23} aria-hidden="true" /> : <Handshake size={23} aria-hidden="true" />}</span><span className={s.cardTag}>{broker}</span><h3>{existing ? tr("Un rattachement avant validation", "Linking before approval") : tr("Un compte via votre lien InvestPro", "An account through your InvestPro link")}</h3>
                {!existing && brokerConfig ? <><p>{tr("Utilisez ce lien pour que votre ouverture de compte soit identifiée dans le parcours d’affiliation InvestPro.", "Use this link so your account opening is identified in the InvestPro affiliation journey.")}</p><a href={brokerConfig.signupUrl} target="_blank" rel="noopener noreferrer sponsored" className={s.secondary}>{tr(`Ouvrir un compte chez ${broker}`, `Open an account with ${broker}`)}<ArrowRight size={16} aria-hidden="true" /></a><small className={s.brokerLinkNote}>{tr("Ouvre le site du broker dans un nouvel onglet.", "Opens the broker’s website in a new tab.")}</small></> : linking?.kind === "pending" ? <><p>{tr("La procédure de rattachement Vantage est en cours de confirmation. Contactez l’équipe avant toute démarche : elle vous indiquera la marche à suivre.", "Vantage linking instructions are being confirmed. Contact the team before taking any action; they will guide you through the process.")}</p><Link href="/dashboard/contact" className={s.secondary}>{tr("Contacter l’équipe pour Vantage", "Contact the team about Vantage")}<MessageCircle size={16} aria-hidden="true" /></Link></> : <p>{tr("Le rattachement dépend des conditions du broker. Une demande envoyée ne confirme pas encore votre affiliation.", "Linking is subject to the broker’s terms. Sending a request does not yet confirm your affiliation.")}</p>}
              </div>
              {existing && linking?.kind === "email" && <div className={s.linkingTemplate}><h4>{tr("Votre e-mail de rattachement", "Your account linking email")}</h4><dl><div><dt>{tr("Destinataire(s)", "Recipient(s)")}</dt><dd>{linking.recipients.map(recipient => <span key={recipient}>{recipient}</span>)}</dd></div><div><dt>{tr("Objet", "Subject")}</dt><dd>{linking.subject}</dd></div></dl><pre>{linking.body}</pre><p>{tr("Envoyez ce message depuis l’adresse e-mail associée à votre compte broker. Vérifiez le message et complétez les champs entre crochets, s’il y en a, avant l’envoi.", "Send this message from the email address associated with your broker account. Review the message and complete any fields in brackets before sending.")}</p><div className={s.templateActions}><button type="button" className={s.secondary} onClick={copyLinkingMessage}>{messageCopyState === "copied" ? tr("Message copié", "Message copied") : tr("Copier le message", "Copy message")}</button><a className={s.primary} href={linkingMailto}>{tr("Ouvrir mon application e-mail", "Open my email app")}<ArrowRight size={15} aria-hidden="true" /></a></div><small className={s.emailNotice}>{tr("Ouvre un brouillon dans votre application e-mail. Aucun message n’est envoyé automatiquement.", "Opens a draft in your email app. No message is sent automatically.")}</small><span className={s.copyCodeStatus} aria-live="polite">{messageCopyState === "copied" ? tr("Le message a été copié dans votre presse-papiers.", "The message has been copied to your clipboard.") : messageCopyState === "failed" ? tr("Copie indisponible : sélectionnez et recopiez le modèle ci-dessus.", "Copy is unavailable: select and manually copy the template above.") : ""}</span></div>}
              {existing && linking?.kind === "chat" && <div className={s.linkingTemplate}><h4>{tr("Demander le rattachement au support Raise FX", "Request linking through Raise FX support")}</h4><ol><li>{tr("Connectez-vous à votre espace client Raise FX.", "Sign in to your Raise FX client area.")}</li><li>{tr("Ouvrez le chat du support en bas à droite.", "Open the support chat in the bottom-right corner.")}</li><li>{tr("Envoyez le message ci-dessous au support.", "Send the message below to support.")}</li></ol><pre>{linking.body}</pre><button type="button" className={s.secondary} onClick={copyLinkingMessage}>{messageCopyState === "copied" ? tr("Message copié", "Message copied") : tr("Copier le message", "Copy message")}</button><p>{tr("Attendez la réponse du support : il confirmera si le rattachement est possible et réalisé. L’accès InvestPro reste soumis à vérification.", "Wait for support’s response: they will confirm whether linking is possible and completed. InvestPro access remains subject to review.")}</p><span className={s.copyCodeStatus} aria-live="polite">{messageCopyState === "copied" ? tr("Le message a été copié dans votre presse-papiers.", "The message has been copied to your clipboard.") : messageCopyState === "failed" ? tr("Copie indisponible : sélectionnez et recopiez le modèle ci-dessus.", "Copy is unavailable: select and manually copy the template above.") : ""}</span></div>}
              {broker === "Raise FX" && <div className={s.welcomeOffer}><Sparkles size={19} aria-hidden="true" /><div><b>{tr("Votre code de bienvenue Raise FX", "Your Raise FX welcome code")}</b><div className={s.promoCode}><code>{WELCOME_CODE}</code><button type="button" onClick={copyWelcomeCode}>{codeCopyState === "copied" ? tr("Code copié", "Code copied") : tr("Copier le code", "Copy code")}</button></div><p>{tr("Offre soumise aux conditions Raise FX. Modalités du bonus à confirmer. Ce crédit éventuel n’est pas un dépôt retirable et reste distinct du dépôt réel vérifié pour l’accès InvestPro.", "Offer subject to Raise FX terms. Bonus details to be confirmed. Any bonus credit is not a withdrawable deposit and is separate from the verified actual deposit for InvestPro access.")}</p><a href="https://live.raisefx.com/documents/RAISEFX_Bonus_agreement.pdf" target="_blank" rel="noopener noreferrer">{tr("Consulter les conditions Raise FX", "Read the Raise FX terms")}<ArrowRight size={12} aria-hidden="true" /></a><span className={s.copyCodeStatus} aria-live="polite">{codeCopyState === "failed" ? tr("Copie indisponible : recopiez le code ENRICK100.", "Copy is unavailable: manually copy ENRICK100.") : codeCopyState === "copied" ? tr("ENRICK100 a été copié dans votre presse-papiers.", "ENRICK100 has been copied to your clipboard.") : ""}</span></div></div>}
              <ol className={s.explainerSteps}><li><span>01</span><div><b>{existing ? tr("Suivre les consignes de rattachement", "Follow the linking instructions") : tr("Suivre les étapes du broker", "Follow the broker’s steps")}</b><p>{existing ? tr("Le broker doit confirmer que le rattachement est possible et réalisé.", "The broker must confirm that linking is possible and completed.") : tr("Les conditions seront indiquées avant de commencer.", "Requirements will be stated before you start.")}</p></div></li><li><span>02</span><div><b>{tr("Déclarer votre dépôt", "Declare your deposit")}</b><p>{tr("L’équipe vérifie l’affiliation et le dépôt avant de valider l’accès InvestPro.", "The team checks affiliation and the deposit before approving InvestPro access.")}</p></div></li></ol>
              <div className={s.previewHint}><Sparkles size={15} aria-hidden="true" /><span>{tr("Effectuez les démarches sur le site du broker, puis revenez ici pour transmettre votre demande à notre équipe.", "Complete the steps on the broker’s website, then return here to send your application to our team.")}</span></div>
              <button type="button" className={s.primary} onClick={() => go("deposit")}>{tr("Continuer vers mon dépôt", "Continue to my deposit")}<ArrowRight size={17} aria-hidden="true" /></button>
            </>}

            {stage === "deposit" && <>
              <p className={s.lead}>{tr("Pour l’accès par affiliation, InvestPro demande un dépôt réel minimum de 300 USD sur votre compte broker. À partir de 500 USD, vous pouvez aussi demander l’accès à InvestPro Copy, si vous le souhaitez.", "For affiliation access, InvestPro requires a minimum actual deposit of USD 300 in your broker account. From USD 500, you can also request InvestPro Copy access if you wish.")}</p>
              <div className={s.currencyNote}>{tr("Montants en dollars américains · équivalents euros indicatifs", "Amounts in US dollars · indicative euro equivalents")}</div>
              <fieldset className={s.depositFieldset}><legend>{tr("Indiquez votre dépôt réel en USD", "Enter your actual deposit in USD")}</legend><div className={s.depositChoices}>{([300, 500, 1000] as const).map(amount => <button key={amount} className={`${s.depositChoice} ${deposit === amount ? s.activeOption : ""}`} type="button" aria-pressed={deposit === amount} onClick={() => selectDeposit(amount)}><strong>{formatUsd(amount)}</strong><small>≈ {formatEur(amount)}</small><span>{amount === 300 ? tr("Accès VIP", "VIP access") : tr("VIP + Copy en option", "VIP + optional Copy")}</span>{deposit === amount && <Check size={15} aria-hidden="true" />}</button>)}</div><label className={s.field}>{tr("Montant réellement déposé · USD", "Amount actually deposited · USD")}<input type="number" min="300" max="10000000" step="0.01" inputMode="decimal" value={deposit ?? ""} onChange={event => { const value = Number(event.target.value); setDeposit(event.target.value && Number.isFinite(value) ? value : null); if (value < 500) setWantsCopy(false); }} placeholder="300" /></label></fieldset>
              <label className={`${s.copyChoice} ${!deposit || deposit < 500 ? s.copyDisabled : ""}`}><input type="checkbox" checked={wantsCopy} disabled={!deposit || deposit < 500} onChange={event => setWantsCopy(event.target.checked && !!deposit && deposit >= 500)} /><span><b>{tr("Je souhaite aussi accéder à InvestPro Copy", "I would also like access to InvestPro Copy")}</b><small>{tr("Option disponible à partir de 500 USD, après vérification par l’équipe.", "Optional from USD 500, after review by the team.")}</small></span></label>
              <p className={s.copyDescription}>{tr("Copiez les opérations de la stratégie choisie avec vos propres réglages de risque, même lorsque vous n’êtes pas devant l’écran.", "Copy trades from your chosen strategy using your own risk settings, even when you are away from the screen.")}</p>
              <p className={s.rateNote}>{tr(`Équivalents indicatifs en euros au ${rateDate}. Les conditions d’accès restent exprimées en dollars.`, `Indicative euro equivalents as of ${rateDate}. Access requirements remain expressed in dollars.`)} <a href={RATE_SOURCE} target="_blank" rel="noopener noreferrer">{tr("Référence BCE", "ECB reference")}</a></p><div className={s.depositStatus}><ShieldCheck size={20} aria-hidden="true" /><div><b>{tr("Montant déclaré · à vérifier par l’équipe", "Declared amount · to be checked by the team")}</b><p>{tr("Indiquez uniquement votre dépôt réel, hors bonus de bienvenue. L’équipe le contrôle auprès du broker avant de valider vos accès.", "Enter only your actual deposit, excluding welcome bonuses. The team checks it with the broker before approving access.")}</p></div></div>
              
              <button type="button" className={s.primary} disabled={!deposit || deposit < 300} onClick={() => go("finish")}>{tr("Continuer vers ma demande", "Continue to my application")}<ArrowRight size={17} aria-hidden="true" /></button>
            </>}

            {stage === "finish" && <>
              <div className={s.finishBadge}><ShieldCheck size={17} aria-hidden="true" />{tr("VOTRE DEMANDE D’ADHÉSION", "YOUR MEMBERSHIP APPLICATION")}</div>
              <p className={s.lead}>{access === "subscription" ? tr("Renseignez la date du paiement effectué dans Stripe. L’équipe vérifiera le règlement avant d’activer votre abonnement.", "Enter the date of your Stripe payment. The team will check it before activating your subscription.") : tr("Indiquez la référence de votre compte broker et vos coordonnées. L’équipe vérifiera le rattachement et le dépôt réel avant d’activer votre VIP.", "Enter your broker account reference and contact details. The team will check linking and your actual deposit before activating VIP access.")}</p>
              <div className={s.summaryCard}><div><span>{tr("Origine de l’accès", "Access route")}</span><b>{access === "subscription" ? tr("Abonnement · 80 € / mois", "Subscription · €80 / month") : `Affiliation · ${broker}`}</b></div>{access === "affiliation" && <><div><span>{tr("Situation", "Account status")}</span><b>{existing ? tr("Compte existant · rattachement", "Existing account · linking") : tr("Nouveau compte", "New account")}</b></div><div><span>{tr("Dépôt réel déclaré", "Declared actual deposit")}</span><b>{deposit ? formatUsd(deposit) : "—"}</b></div><div><span>{tr("Accès demandés", "Requested access")}</span><b>{wantsCopy ? "InvestPro VIP + InvestPro Copy" : "InvestPro VIP"}</b></div></>}</div>
              {intake ? <form onSubmit={submit} className={s.form}>
                <p className={s.identityNote}>{tr("Compte InvestPro :", "InvestPro account:")} {intake.user.email}</p>
                <div className={s.nameFields}><label className={s.field}>{tr("Prénom", "First name")}<input autoComplete="given-name" maxLength={80} value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} required /></label><label className={s.field}>{tr("Nom", "Last name")}<input autoComplete="family-name" maxLength={80} value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} required /></label></div>
                <label className={s.field}>{tr("Pseudo Telegram · facultatif", "Telegram username · optional")}<input value={form.telegramUsername} onChange={event => setForm({ ...form, telegramUsername: event.target.value })} maxLength={33} autoComplete="off" placeholder="@monpseudo" spellCheck={false} /><small>{tr("Il aide l’équipe à vous retrouver et à confirmer votre entrée dans le canal.", "It helps the team identify you and confirm admission to the channel.")}</small></label>
                {access === "affiliation" ? <><label className={s.field}>{tr("Numéro / référence du compte broker", "Broker account number / reference")}<input value={form.brokerAccountId} onChange={event => setForm({ ...form, brokerAccountId: event.target.value })} maxLength={80} pattern="[A-Za-z0-9._\-]{1,80}" title={tr("Lettres, chiffres, point, tiret ou tiret bas · 80 caractères maximum", "Letters, numbers, dots, hyphens or underscores · up to 80 characters")} autoComplete="off" required /><small>{tr("Le numéro permettant au broker d’identifier votre compte. Ne partagez aucun mot de passe.", "The number the broker uses to identify your account. Do not share any password.")}</small></label><label className={s.field}>{tr("E-mail chez le broker · si différent", "Broker email · if different")}<input type="email" value={form.brokerEmail} onChange={event => setForm({ ...form, brokerEmail: event.target.value })} maxLength={254} autoComplete="email" /></label></> : <label className={s.field}>{tr("Date du paiement Stripe", "Stripe payment date")}<input type="date" value={form.paidOn} max={vipParisPaymentDate()} onChange={event => setForm({ ...form, paidOn: event.target.value })} required /></label>}
                <label className={s.copyChoice}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required /><span><b>{tr("Je confirme ces informations", "I confirm these details")}</b><small>{access === "subscription" ? tr("J’ai effectué le paiement. Je comprends que l’équipe doit le vérifier avant l’activation du VIP.", "I have paid. I understand that the team must verify payment before activating VIP access.") : tr("J’ai réalisé les démarches et le dépôt déclaré, hors bonus. Je comprends que l’équipe doit les vérifier.", "I have completed the steps and the declared deposit, excluding bonuses. I understand that the team must verify them.")}</small></span></label>
                <button type="submit" className={s.primary} disabled={busy || !confirmed}>{busy ? tr("Envoi de votre demande…", "Sending your request…") : tr("Envoyer ma demande à l’équipe", "Send my application to the team")}<ArrowRight size={17} aria-hidden="true" /></button>
              </form> : <Link href={`/login?${authQuery}`} className={s.primary}>{tr("Me connecter pour envoyer ma demande", "Sign in to send my application")}</Link>}
              <div className={s.afterApproval}><ShieldCheck size={22} aria-hidden="true" /><div><b>{tr("Après validation par l’équipe", "After approval by the team")}</b><p>{tr("Votre VIP s’ouvre depuis votre compte InvestPro. Vous retrouvez le lien Telegram dans votre espace ; l’équipe valide ensuite votre entrée dans le canal.", "Your VIP opens from your InvestPro account. Find the Telegram link in your space; the team then approves your channel admission.")}</p></div></div>
            </>}
          </div>
        </section>}
      </section>

      <section className={s.includedSection} aria-labelledby="included-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>{tr("DANS VOTRE ESPACE", "INSIDE YOUR SPACE")}</span><h2 id="included-title">{tr("Votre espace InvestPro. Vos outils au même endroit.", "Your InvestPro space. Your tools, all together.")}</h2></div></div><div className={s.featureGrid}>{features.map(({ icon: Icon, title, body }) => <article key={title}><Icon size={22} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></article>)}</div><section className={s.affiliationAccess} aria-labelledby="affiliation-access-title"><div className={s.affiliationAccessHeading}><span className={s.eyebrow}>{tr("ACCÈS PAR AFFILIATION UNIQUEMENT", "AFFILIATION ACCESS ONLY")}</span><h3 id="affiliation-access-title">{tr("Votre dépôt. Vos accès InvestPro.", "Your deposit. Your InvestPro access.")}</h3><p>{tr("Les conditions d’accès InvestPro sont vérifiées par notre équipe après vos démarches chez le broker.", "Our team checks InvestPro access requirements after you complete the broker’s steps.")}</p></div><div className={s.depositTiers}><article><span>{tr("DÉPÔT MINIMUM", "MINIMUM DEPOSIT")}</span><strong>{formatUsd(300)} <small>(≈ {formatEur(300)})</small></strong><h4>InvestPro VIP</h4><p>{tr("L’accès aux analyses, signaux, suivis, bilans et outils de votre espace VIP, après validation.", "Access to analysis, signals, follow-up, reviews and VIP tools, after approval.")}</p></article><article><span>{tr("À PARTIR DE", "FROM")}</span><strong>{formatUsd(500)} <small>(≈ {formatEur(500)})</small></strong><h4>{tr("InvestPro Copy · en option", "InvestPro Copy · optional")}</h4><p>{tr("Copiez les opérations de la stratégie choisie avec vos propres réglages de risque, même lorsque vous n’êtes pas devant l’écran.", "Copy trades from your chosen strategy using your own risk settings, even when you are away from the screen.")}</p></article></div><div className={s.affiliationConditions}><span>{tr(`Équivalents indicatifs en euros au ${rateDate}. Les conditions d’accès restent exprimées en dollars.`, `Indicative euro equivalents as of ${rateDate}. Access requirements remain expressed in dollars.`)}</span><a href={RATE_SOURCE} target="_blank" rel="noopener noreferrer">{tr(`Référence BCE · ${rateDate}`, `ECB reference · ${rateDate}`)}</a><p>{tr("Le dépôt réel est vérifié par l’équipe, séparément d’un éventuel bonus. Le Copy est optionnel : choisissez vos réglages de risque et suivez les opérations copiées. Le taux appliqué par votre banque ou broker peut différer.", "The team verifies the actual deposit separately from any bonus. Copy is optional: choose your risk settings and monitor the copied trades. Your bank or broker may apply a different exchange rate.")}</p></div></section><div className={s.coming}><GraduationCap size={21} aria-hidden="true" /><div><b>{tr("Formation, coaching & accompagnement", "Training, coaching & support")}</b><span>{tr("De nouvelles façons d’avancer avec InvestPro.", "New ways to move forward with InvestPro.")}</span></div><span className={s.comingBadge}>{tr("Bientôt", "Coming soon")}</span></div></section>

      <section className={s.appSection} aria-labelledby="app-title"><div className={s.appIntro}><span className={s.eyebrow}>{tr("VOTRE VIP, AUSSI EN APPLICATION", "YOUR VIP SPACE, AS A WEB APP")}</span><h2 id="app-title">{tr("InvestPro vous accompagne.", "InvestPro stays with you.")}</h2><p>{tr("Installez InvestPro depuis votre navigateur sur iPhone ou Android, Samsung inclus. Retrouvez ensuite votre espace depuis son icône.", "Install InvestPro from your browser on iPhone or Android, including Samsung. Then open your space from its icon.")}</p><span className={s.appChip}><Smartphone size={15} aria-hidden="true" />iPhone · Android · Samsung</span></div><div className={s.installGrid}><details><summary><Smartphone size={18} aria-hidden="true" />{tr("Installer sur iPhone", "Install on iPhone")}<ChevronRight size={16} aria-hidden="true" /></summary><ol><li>{tr("Ouvrez InvestPro dans Safari.", "Open InvestPro in Safari.")}</li><li>{tr("Touchez Partager, puis Sur l’écran d’accueil.", "Tap Share, then Add to Home Screen.")}</li><li>{tr("Activez « Ouvrir comme app web » si proposé, puis Ajouter.", "Enable “Open as Web App” if offered, then tap Add.")}</li></ol></details><details><summary><Smartphone size={18} aria-hidden="true" />{tr("Installer sur Android", "Install on Android")}<ChevronRight size={16} aria-hidden="true" /></summary><ol><li>{tr("Ouvrez InvestPro dans Chrome.", "Open InvestPro in Chrome.")}</li><li>{tr("Touchez le menu ⋮, puis Installer l’application ou Ajouter à l’écran d’accueil.", "Tap the ⋮ menu, then Install app or Add to Home screen.")}</li><li>{tr("Confirmez pour retrouver l’icône InvestPro sur votre téléphone.", "Confirm to add the InvestPro icon to your phone.")}</li></ol></details><p className={s.alertNote}><Bell size={16} aria-hidden="true" />{tr("Les alertes sont un choix : ouvrez l’application, puis autorisez-les si vous le souhaitez. Sur iPhone : iOS 16.4 ou ultérieur. Une connexion Internet est nécessaire pour les nouvelles publications.", "Alerts are optional: open the app, then enable them if you wish. On iPhone: iOS 16.4 or later. New posts require an internet connection.")}</p></div></section>

      <footer className={s.footer}><span>INVESTPRO VIP · {tr("ESPACE PRIVÉ", "PRIVATE SPACE")}</span><p>{tr("Le trading comporte un risque de perte en capital. Les publications ne garantissent aucun résultat.", "Trading involves risk of capital loss. Posts do not guarantee any result.")}</p><Link href="/vip/deja-membre" prefetch={false}><MessageCircle size={14} aria-hidden="true" />{tr("Déjà membre VIP", "Already a VIP member")}</Link></footer>
    </div>
  </main>;
}
