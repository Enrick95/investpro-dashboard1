(() => {
  "use strict";
  const messages = {
  "pageTitle": [
    "Enrick95 × InvestPro — Le live continue ici",
    "Enrick95 × InvestPro — The live stream continues here"
  ],
  "metaDescription": [
    "Retrouve l’univers d’Enrick95 : Telegram, contenus et outils InvestPro pour préparer et suivre ton trading.",
    "Explore Enrick95’s world: Telegram, content and InvestPro tools to plan and track your trading."
  ],
  "ogDescription": [
    "Retrouve ma communauté, mes contenus et les outils InvestPro pour préparer et suivre ton trading.",
    "Find my community, my content and InvestPro tools to plan and track your trading."
  ],
  "languageLabel": [
    "Choisir la langue",
    "Choose your language"
  ],
  "quickAccessLabel": [
    "Accès rapides",
    "Quick links"
  ],
  "topUniverse": [
    "Mon univers",
    "My world"
  ],
  "existingMember": [
    "Déjà membre VIP ↗",
    "Already a VIP member ↗"
  ],
  "existingMemberShort": ["Déjà VIP ↗", "VIP member ↗"],
  "pointerMenu": [
    "MENU TIKTOK",
    "TIKTOK MENU"
  ],
  "helpTitle": [
    "Telegram ne s’ouvre pas dans TikTok ?",
    "Telegram not opening in TikTok?"
  ],
  "helpSubtitle": [
    "Ouvre cette page dans ton navigateur habituel.",
    "Open this page in your usual browser."
  ],
  "helpClose": [
    "Fermer l’aide",
    "Close help"
  ],
  "helpStep1": [
    "<b>01.</b> Appuie sur <b>⋯ en haut à droite</b> de TikTok.",
    "<b>01.</b> Tap <b>⋯ in the top-right corner</b> of TikTok."
  ],
  "helpStep2": [
    "<b>02.</b> Choisis <b>« Ouvrir dans le navigateur »</b>.",
    "<b>02.</b> Choose <b>“Open in browser”</b>."
  ],
  "copyLink": [
    "Copier le lien de cette page",
    "Copy this page’s link"
  ],
  "continueHere": [
    "Continuer ici →",
    "Continue here →"
  ],
  "copySuccess": [
    "Lien copié. Colle-le dans Safari ou Chrome.",
    "Link copied. Paste it into Safari or Chrome."
  ],
  "copyFallback": [
    "Adresse à ouvrir dans Safari ou Chrome : ",
    "Open this address in Safari or Chrome: "
  ],
  "identitySubtitle": [
    "Le trading, la discipline, la communauté.",
    "Trading, discipline, community."
  ],
  "welcome": [
    "Bienvenue dans mon univers",
    "Welcome to my world"
  ],
  "heroTitle": [
    "Le live<br>continue <em>ici.</em>",
    "The stream<br>continues <em>here.</em>"
  ],
  "introduction": [
    "Retrouve ma communauté, mes contenus et les outils InvestPro pour préparer et suivre ton trading.",
    "Find my community, my content and InvestPro tools to plan and track your trading."
  ],
  "joinTelegram": [
    "Rejoindre mon Telegram",
    "Join my Telegram"
  ],
  "telegramNote": [
    "Retrouve mon canal et les informations pour nous rejoindre.",
    "Find my channel and the information you need to join us."
  ],
  "showHelp": [
    "Le lien ne s’ouvre pas ? Voir comment faire",
    "Link not opening? See how to open it"
  ],
  "discoverInvestPro": [
    "Découvrir InvestPro",
    "Discover InvestPro"
  ],
  "joinVip": [
    "Comment rejoindre le VIP",
    "How to join the VIP"
  ],
  "universeLabel": [
    "L’univers Enrick95",
    "Enrick95’s world"
  ],
  "meetingPoint": [
    "TON POINT DE RENDEZ-VOUS",
    "YOUR MEETING POINT"
  ],
  "portraitAlt": [
    "Enrick95 au bord de la mer",
    "Enrick95 by the sea"
  ],
  "beyondLive": [
    "AU-DELÀ DU LIVE",
    "BEYOND THE LIVE"
  ],
  "keepInTouch": [
    "On garde le lien.",
    "Let’s stay connected."
  ],
  "community": [
    "La communauté",
    "The community"
  ],
  "findTelegram": [
    "Retrouve-moi sur Telegram",
    "Find me on Telegram"
  ],
  "investproApp": [
    "L’application InvestPro",
    "The InvestPro app"
  ],
  "appMotto": [
    "Préparer. Suivre. Comprendre.",
    "Plan. Track. Understand."
  ],
  "vipArea": [
    "L’espace VIP",
    "The VIP area"
  ],
  "accessAfterReview": [
    "Un accès personnel, après validation",
    "Personal access, after approval"
  ],
  "supportedDevices": [
    "iPhone · Android · Ordinateur",
    "iPhone · Android · Desktop"
  ],
  "firstStep": [
    "Tout commence par un premier pas",
    "It all starts with one step"
  ],
  "universeTitle": [
    "Ton univers. Tes prochains repères.",
    "Your world. Your next steps."
  ],
  "universeIntro": [
    "Découvre mes contenus et les outils qui t’aident à structurer ta pratique du trading.",
    "Explore my content and the tools that help you bring structure to your trading."
  ],
  "communityNumber": [
    "01 · COMMUNAUTÉ",
    "01 · COMMUNITY"
  ],
  "telegramCardTitle": [
    "On se retrouve sur Telegram.",
    "Let’s connect on Telegram."
  ],
  "telegramCardDescription": [
    "Retrouve mon canal, mes publications et les informations pour rejoindre mon univers.",
    "Find my channel, my posts and the information you need to join my community."
  ],
  "openTelegram": [
    "Ouvrir mon Telegram",
    "Open my Telegram"
  ],
  "appNumber": [
    "02 · APPLICATION",
    "02 · APP"
  ],
  "appCardTitle": [
    "Ton trading, au même endroit.",
    "Your trading, all in one place."
  ],
  "appCardDescription": [
    "Journal, rapports, plan de trading et simulateur de risque. Sur iPhone, Android et ordinateur.",
    "Journal, reports, trading plan and risk calculator. On iPhone, Android and desktop."
  ],
  "contentNumber": [
    "03 · CONTENUS",
    "03 · CONTENT"
  ],
  "videoCardTitle": [
    "Prendre le temps de comprendre.",
    "Take the time to understand."
  ],
  "videoCardDescription": [
    "Retrouve mes vidéos sur YouTube pour prolonger les sujets abordés pendant les lives.",
    "Watch my YouTube videos to explore the topics we discuss during live streams."
  ],
  "watchVideos": [
    "Voir mes vidéos",
    "Watch my videos"
  ],
  "privateCircle": [
    "Le cercle privé InvestPro",
    "The InvestPro private circle"
  ],
  "vipTitle": [
    "Envie d’aller plus loin ?",
    "Ready to go further?"
  ],
  "vipDescription": [
    "Découvre le fonctionnement du VIP, les analyses, les signaux et leurs suivis. L’accès est personnel et activé après vérification de ton adhésion.",
    "Discover how the VIP works, with analyses, signals and follow-ups. Access is personal and activated after your membership has been verified."
  ],
  "telegramInformation": [
    "Retrouver les informations sur Telegram",
    "Find the information on Telegram"
  ],
  "vipStep1Title": [
    "Découvre les conditions d’accès.",
    "Learn about the access requirements."
  ],
  "vipStep1Description": [
    "Retrouve les informations sur Telegram, puis échange avec moi pour connaître les démarches.",
    "Find the information on Telegram, then contact me to discuss the steps to join."
  ],
  "vipStep2Title": [
    "Ton adhésion est vérifiée.",
    "Your membership is verified."
  ],
  "vipStep2Description": [
    "Affiliation ou abonnement : on confirme ensemble les informations avant d’activer ton accès.",
    "Affiliate membership or subscription: we confirm your details together before activating your access."
  ],
  "vipStep3Title": [
    "Retrouve ton espace personnel.",
    "Access your personal area."
  ],
  "vipStep3Description": [
    "Accède à ton VIP InvestPro et aux instructions pour l’installer sous forme d’application.",
    "Access your InvestPro VIP area and the instructions to install it as an app."
  ],
  "linkExistingAccount": [
    "Déjà membre du VIP ? Rattacher mon compte ↗",
    "Already a VIP member? Link my account ↗"
  ],
  "nextChapter": [
    "Le prochain chapitre InvestPro",
    "The next InvestPro chapter"
  ],
  "trainingTitle": [
    "Formation, coaching & accompagnement.",
    "Training, coaching & support."
  ],
  "trainingDescription": [
    "Une nouvelle façon d’apprendre et de progresser avec InvestPro se prépare. Le programme et les modalités d’accès seront présentés ici à l’ouverture.",
    "A new way to learn and progress with InvestPro is on its way. The programme and access details will be shared here when it launches."
  ],
  "comingSoon": [
    "Bientôt",
    "Coming soon"
  ],
  "otherNetworksLabel": [
    "Mes autres réseaux",
    "My other social channels"
  ],
  "socialHeading": [
    "ON GARDE AUSSI LE LIEN ICI",
    "LET’S STAY CONNECTED HERE TOO"
  ],
  "footerText": [
    "ENRICK95 × INVESTPRO TRADING<br>Le trading comporte un risque de perte en capital. Les contenus partagés ne garantissent aucun résultat.",
    "ENRICK95 × INVESTPRO TRADING<br>Trading involves the risk of losing capital. The content shared does not guarantee any results."
  ],
  "terms": [
    "Conditions",
    "Terms"
  ],
  "privacy": [
    "Confidentialité",
    "Privacy"
  ]
};
  const canonical = "https://investprotrading.fr/enrick95";
  const preferenceKey = "ip_locale";
  const supported = value => value === "fr" || value === "en";
  const byId = id => document.getElementById(id);
  const help = byId("browser-help");
  const pointer = byId("pointer");
  const open = byId("open-help");
  const status = byId("copy-status");
  let locale = "fr";
  let statusKey = null;
  function initialLocale() {
    try {
      const cookie = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith(preferenceKey + "="));
      const value = cookie ? decodeURIComponent(cookie.slice(preferenceKey.length + 1)) : null;
      if (supported(value)) return value;
    } catch {}
    try {
      const value = localStorage.getItem(preferenceKey);
      if (supported(value)) return value;
    } catch {}
    for (const language of navigator.languages || [navigator.language]) {
      const value = String(language || "").toLowerCase().split("-")[0];
      if (supported(value)) return value;
    }
    return "fr";
  }
  function t(key) {
    return messages[key][locale === "en" ? 1 : 0];
  }
  function updateStatus() {
    status.textContent = statusKey ? t(statusKey) + (statusKey === "copyFallback" ? canonical : "") : "";
  }
  function setLocale(value, explicit = false) {
    if (!supported(value)) return;
    locale = value;
    document.documentElement.lang = locale;
    document.title = t("pageTitle");
    document.querySelector('meta[name="description"]').content = t("metaDescription");
    document.querySelector('meta[property="og:title"]').content = t("pageTitle");
    document.querySelector('meta[property="og:description"]').content = t("ogDescription");
    document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach(node => { node.innerHTML = t(node.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(node => { node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel)); });
    document.querySelectorAll("[data-i18n-alt]").forEach(node => { node.alt = t(node.dataset.i18nAlt); });
    document.querySelectorAll("[data-locale]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.locale === locale)); });
    updateStatus();
    if (explicit) {
      try { localStorage.setItem(preferenceKey, locale); } catch {}
      try { document.cookie = preferenceKey + "=" + locale + "; Path=/; SameSite=Lax; Secure; Max-Age=31536000"; } catch {}
      window.dispatchEvent(new CustomEvent("investpro:locale", { detail: locale }));
    }
  }
  document.querySelectorAll("[data-locale]").forEach(button => {
    button.addEventListener("click", () => setLocale(button.dataset.locale, true));
  });
  function setHelp(visible, scroll = false) {
    help.hidden = !visible;
    pointer.hidden = !visible;
    open.setAttribute("aria-expanded", String(visible));
    if (scroll && visible) {
      help.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      byId("help-title").focus({ preventScroll: true });
    }
  }
  open.addEventListener("click", () => setHelp(true, true));
  byId("close-help").addEventListener("click", () => {
    setHelp(false);
    open.focus({ preventScroll: true });
  });
  byId("continue").addEventListener("click", () => {
    setHelp(false);
    byId("telegram-cta").focus({ preventScroll: true });
    byId("hero-title").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  });
  byId("copy-link").addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(canonical);
      statusKey = "copySuccess";
    } catch {
      statusKey = "copyFallback";
    }
    updateStatus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !help.hidden) {
      setHelp(false);
      open.focus({ preventScroll: true });
    }
  });
  setLocale(initialLocale());
  if (/tiktok|musical_ly|bytedance|bytelocale|\btrill\b/i.test(navigator.userAgent)) setHelp(true);
})();
