export type NavigationKey =
  | "dashboard"
  | "academy"
  | "library"
  | "progression"
  | "accounts"
  | "connections"
  | "journal"
  | "plan"
  | "risk"
  | "reports"
  | "copy"
  | "tradingview"
  | "calendar"
  | "fundamentals"
  | "financialjuice"
  | "vip"
  | "ranking"
  | "challenges"
  | "members"
  | "partners"
  | "profile"
  | "subscription"
  | "billing"
  | "history"
  | "settings"
  | "bug"
  | "support";

export type NavigationDefinition = {
  key: NavigationKey;
  label: string;
  href: string;
  group: string;
  defaultVisible: boolean;
  order: number;
};

export const navigationDefinitions: NavigationDefinition[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", group: "ACCUEIL", defaultVisible: true, order: 10 },

  { key: "accounts", label: "Mes comptes", href: "/dashboard/comptes", group: "TRADING", defaultVisible: true, order: 20 },
  { key: "connections", label: "Connexions", href: "/dashboard/connexions", group: "TRADING", defaultVisible: true, order: 21 },
  { key: "journal", label: "Journal", href: "/dashboard/journal", group: "TRADING", defaultVisible: true, order: 22 },
  { key: "plan", label: "Plan de trading", href: "/dashboard/plan", group: "TRADING", defaultVisible: true, order: 23 },
  { key: "risk", label: "Simulateur risque", href: "/dashboard/simulateur", group: "TRADING", defaultVisible: true, order: 24 },
  { key: "reports", label: "Rapports", href: "/dashboard/rapports", group: "TRADING", defaultVisible: true, order: 25 },
  { key: "copy", label: "Copieur multi-comptes", href: "/dashboard/copieur", group: "TRADING", defaultVisible: true, order: 26 },

  { key: "tradingview", label: "TradingView", href: "/dashboard/tradingview", group: "MARCHÉS & ANALYSE", defaultVisible: true, order: 30 },
  { key: "calendar", label: "Calendrier éco", href: "/dashboard/calendrier", group: "MARCHÉS & ANALYSE", defaultVisible: true, order: 31 },
  { key: "fundamentals", label: "Analyse fondamentale", href: "/dashboard/analyse-fondamentale", group: "MARCHÉS & ANALYSE", defaultVisible: true, order: 32 },
  { key: "financialjuice", label: "FinancialJuice", href: "/dashboard/financialjuice", group: "MARCHÉS & ANALYSE", defaultVisible: true, order: 33 },

  { key: "vip", label: "Performances VIP", href: "/dashboard/performances-vip", group: "COMMUNAUTÉ", defaultVisible: true, order: 40 },
  { key: "ranking", label: "Classement", href: "/dashboard/classement", group: "COMMUNAUTÉ", defaultVisible: false, order: 41 },
  { key: "challenges", label: "Challenges", href: "/dashboard/challenges", group: "COMMUNAUTÉ", defaultVisible: false, order: 42 },
  { key: "members", label: "Membres", href: "/dashboard/membres", group: "COMMUNAUTÉ", defaultVisible: false, order: 43 },

  { key: "partners", label: "Partenaires", href: "/dashboard/partenaires", group: "ÉCOSYSTÈME", defaultVisible: true, order: 50 },

  { key: "academy", label: "Mes formations", href: "/dashboard/academy", group: "ACADEMY", defaultVisible: false, order: 60 },
  { key: "library", label: "Bibliothèque", href: "/dashboard/academy/bibliotheque", group: "ACADEMY", defaultVisible: false, order: 61 },
  { key: "progression", label: "Progression", href: "/dashboard/academy/progression", group: "ACADEMY", defaultVisible: false, order: 62 },

  { key: "profile", label: "Profil", href: "/dashboard/profil", group: "COMPTE", defaultVisible: true, order: 70 },
  { key: "subscription", label: "Abonnement", href: "/dashboard/abonnement", group: "COMPTE", defaultVisible: true, order: 71 },
  { key: "billing", label: "Facturation", href: "/dashboard/facturation", group: "COMPTE", defaultVisible: true, order: 72 },
  { key: "history", label: "Historique", href: "/dashboard/historique", group: "COMPTE", defaultVisible: true, order: 73 },
  { key: "settings", label: "Paramètres", href: "/dashboard/parametres", group: "COMPTE", defaultVisible: true, order: 74 },
  { key: "bug", label: "Signaler un bug", href: "/dashboard/bug", group: "COMPTE", defaultVisible: true, order: 75 },
  { key: "support", label: "Support", href: "/dashboard/contact", group: "COMPTE", defaultVisible: true, order: 76 },
];

export function defaultVisibility() {
  return Object.fromEntries(
    navigationDefinitions.map((item) => [item.key, item.defaultVisible])
  ) as Record<NavigationKey, boolean>;
}

export function navigationKeyForPath(pathname: string): NavigationKey | null {
  if (pathname === "/dashboard/defis" || pathname.startsWith("/dashboard/defis/")) return "challenges";
  const candidates = [...navigationDefinitions]
    .filter((item) => item.href !== "/dashboard")
    .sort((a, b) => b.href.length - a.href.length);

  for (const item of candidates) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.key;
  }

  if (pathname === "/dashboard") return "dashboard";
  return null;
}
