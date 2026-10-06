"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CircleUserRound,
  ClipboardCheck,
  GraduationCap,
  Grid2X2,
  Landmark,
  Library,
  LineChart,
  Menu,
  Newspaper,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

function activeFor(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function BottomTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "ip-mobile-tab",
        active ? "ip-mobile-tab-active" : "",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function MenuTile({
  href,
  label,
  icon,
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="ip-more-tile">
      <span className="ip-more-tile-icon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function MobileGlobalV1() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isReports =
    activeFor(pathname, "/dashboard/rapports") ||
    activeFor(pathname, "/dashboard/rapport-mensuel");

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const body = document.body;
    const classes = [
      "ip-mobile-dashboard",
      "ip-mobile-journal",
      "ip-mobile-vip",
      "ip-mobile-reports",
      "ip-mobile-accounts",
      "ip-mobile-plan",
      "ip-mobile-calendar",
      "ip-mobile-onboarding",
      "ip-mobile-profile",
    ];

    classes.forEach((name) => body.classList.remove(name));

    if (pathname === "/dashboard") body.classList.add("ip-mobile-dashboard");
    if (pathname.startsWith("/dashboard/journal")) body.classList.add("ip-mobile-journal");
    if (pathname.startsWith("/dashboard/performances-vip")) body.classList.add("ip-mobile-vip");
    if (
      pathname.startsWith("/dashboard/rapports") ||
      pathname.startsWith("/dashboard/rapport-mensuel")
    ) {
      body.classList.add("ip-mobile-reports");
    }
    if (pathname.startsWith("/dashboard/comptes")) body.classList.add("ip-mobile-accounts");
    if (pathname.startsWith("/dashboard/plan")) body.classList.add("ip-mobile-plan");
    if (pathname.startsWith("/dashboard/calendrier")) body.classList.add("ip-mobile-calendar");
    if (pathname.startsWith("/dashboard/onboarding")) body.classList.add("ip-mobile-onboarding");
    if (pathname.startsWith("/dashboard/profil")) body.classList.add("ip-mobile-profile");

    return () => classes.forEach((name) => body.classList.remove(name));
  }, [pathname]);

  useEffect(() => {
    function exactText(text: string) {
      return Array.from(document.querySelectorAll("h1,h2,h3,div,span,p")).find(
        (node) => node.textContent?.trim() === text
      ) as HTMLElement | undefined;
    }

    if (pathname === "/dashboard") {
      const quick = exactText("Analyse rapide");
      const quickSection = quick?.closest("section") as HTMLElement | null;
      if (quickSection) {
        quickSection.dataset.ipMobileQuick = "true";

        const metricLabels = ["Profit Factor", "Drawdown max", "Risque respecté"];
        const metricCards = metricLabels
          .map((label) => {
            const node = Array.from(quickSection.querySelectorAll("div,span")).find(
              (el) => el.textContent?.trim() === label
            ) as HTMLElement | undefined;
            return node?.closest("div.rounded-2xl") as HTMLElement | null;
          })
          .filter(Boolean) as HTMLElement[];

        if (metricCards.length) {
          metricCards.forEach((card) => (card.dataset.ipQuickMetric = "true"));
          const grid = metricCards[0]?.parentElement;
          if (grid) grid.dataset.ipQuickMetricsGrid = "true";
        }

        const curveLabel = Array.from(quickSection.querySelectorAll("div,span")).find(
          (el) => el.textContent?.trim() === "Mini equity curve"
        ) as HTMLElement | undefined;
        const curveCard = curveLabel?.closest("div.rounded-2xl") as HTMLElement | null;
        if (curveCard) curveCard.dataset.ipQuickCurve = "true";
      }

      ["Continuer ma formation", "Mon activité récente", "Marchés aujourd’hui", "Objectifs de la semaine", "Mes comptes", "Classement hebdo", "Défis en cours"].forEach((title) => {
        const node = exactText(title);
        const card = node?.closest("section, article") as HTMLElement | null;
        if (card) card.dataset.ipMobileDashboardCard = "true";
      });
    }

    if (pathname.startsWith("/dashboard/journal")) {
      const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[];
      const calendar = sections.find((section) =>
        /Calendrier de performance/i.test(section.innerText || "")
      );
      if (calendar) {
        calendar.dataset.ipJournalCalendar = "true";

        const grids = Array.from(calendar.querySelectorAll("div")).filter((element) => {
          const style = window.getComputedStyle(element);
          const text = (element.textContent || "").replace(/\s+/g, " ");
          return (
            style.display === "grid" &&
            element.children.length >= 8 &&
            text.includes("Lun") &&
            text.includes("Dim")
          );
        }) as HTMLElement[];

        const grid = grids.sort((a, b) => b.children.length - a.children.length)[0];
        if (grid) grid.dataset.ipCalendarGrid = "true";
      }

      const history = sections.find(
        (section) => section.querySelector("h2")?.textContent?.trim().toLowerCase() === "historique"
      );
      if (history) history.dataset.ipJournalHistory = "true";
    }

    if (pathname.startsWith("/dashboard/performances-vip")) {
      const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[];
      sections.forEach((section) => {
        const text = section.innerText || "";
        if (/Suivi transparent des performances/i.test(text)) {
          section.dataset.ipVipHero = "true";
        }
        if (/Connexion du canal Telegram/i.test(text)) {
          section.dataset.ipVipTelegram = "true";
        }
        if (/Évolution de la performance/i.test(text)) {
          section.dataset.ipVipChart = "true";
        }
      });
    }

    if (pathname.startsWith("/dashboard/plan")) {
      const labels = ["Risque max", "Trades max", "RR minimum"];
      const cards = labels
        .map((label) => {
          const node = exactText(label);
          return node?.closest("div.rounded-2xl") as HTMLElement | null;
        })
        .filter(Boolean) as HTMLElement[];

      if (cards.length) {
        cards.forEach((card) => (card.dataset.ipPlanTopStat = "true"));
        const grid = cards[0]?.parentElement;
        if (grid) grid.dataset.ipPlanTopGrid = "true";
      }

      const disciplineTitle = exactText("Score de discipline");
      const disciplineCard = disciplineTitle?.closest("div.rounded-[24px], div.rounded-\\[24px\\], section") as HTMLElement | null;
      if (disciplineCard) {
        disciplineCard.dataset.ipPlanDiscipline = "true";
        const gradient = disciplineCard.querySelector('[style*="conic-gradient"]') as HTMLElement | null;
        const ring = gradient?.parentElement as HTMLElement | null;
        if (ring) ring.dataset.ipPlanRing = "true";
      }

      const conformity = exactText("Conformité des derniers trades");
      const conformityCard = conformity?.closest("div.rounded-[24px], div.rounded-\\[24px\\], section") as HTMLElement | null;
      if (conformityCard) conformityCard.dataset.ipPlanConformity = "true";
    }

    if (pathname.startsWith("/dashboard/comptes")) {
      const next = exactText("Connexion automatique MetaTrader");
      const nextSection = next?.closest("section, article, div.rounded-[24px], div.rounded-\\[24px\\]") as HTMLElement | null;
      if (nextSection) nextSection.dataset.ipAccountsMetaNext = "true";

      const sync = exactText("Synchronisation MetaTrader");
      const syncSection = sync?.closest("section, article, div.rounded-[24px], div.rounded-\\[24px\\]") as HTMLElement | null;
      if (syncSection) syncSection.dataset.ipAccountsMetaSync = "true";

      const tradingAccounts = exactText("Comptes de trading");
      const accountsSection = tradingAccounts?.closest("section, article, div.rounded-[24px], div.rounded-\\[24px\\]") as HTMLElement | null;
      if (accountsSection) accountsSection.dataset.ipAccountsList = "true";
    }

    if (pathname.startsWith("/dashboard/rapports")) {
      const reportHeads = [
        "Performance par session",
        "Performance par setup",
        "Performance par timeframe",
        "Jours de la semaine",
        "Performance par actif",
      ];
      reportHeads.forEach((title) => {
        const node = exactText(title);
        const card = node?.closest("section, article, div.rounded-[22px], div.rounded-\\[22px\\], div.rounded-[24px], div.rounded-\\[24px\\]") as HTMLElement | null;
        if (card) card.dataset.ipReportsCompact = "true";
      });

      const equity = exactText("Courbe d’equity réalisée");
      const equityCard = equity?.closest("section, article, div.rounded-[22px], div.rounded-\\[22px\\], div.rounded-[24px], div.rounded-\\[24px\\]") as HTMLElement | null;
      if (equityCard) {
        equityCard.dataset.ipReportsEquity = "true";
        const svg = equityCard.querySelector("svg") as SVGElement | null;
        const graphWrap = svg?.parentElement as HTMLElement | null;
        if (graphWrap) graphWrap.dataset.ipReportsGraph = "true";
      }

      const heatmap = exactText("Calendrier / Heatmap");
      const heatmapCard = heatmap?.closest("section, article, div.rounded-[22px], div.rounded-\\[22px\\], div.rounded-[24px], div.rounded-\\[24px\\]") as HTMLElement | null;
      if (heatmapCard) {
        heatmapCard.dataset.ipReportsHeatmap = "true";
        const grids = Array.from(heatmapCard.querySelectorAll("div")).filter((element) => {
          const style = window.getComputedStyle(element);
          return style.display === "grid" && element.children.length >= 28;
        }) as HTMLElement[];
        const grid = grids.sort((a, b) => b.children.length - a.children.length)[0];
        if (grid) grid.dataset.ipReportsHeatmapGrid = "true";
      }
    }

    if (pathname.startsWith("/dashboard/rapport-mensuel")) {
      ["Ce qui fonctionne le mieux", "Discipline", "Continuer l’analyse"].forEach((title) => {
        const node = exactText(title);
        const card = node?.closest("section, article, div.rounded-[22px], div.rounded-\\[22px\\]") as HTMLElement | null;
        if (card) card.dataset.ipMonthlyCompact = "true";
      });

      const curve = exactText("Courbe du mois");
      const card = curve?.closest("section, article, div.rounded-[22px], div.rounded-\\[22px\\]") as HTMLElement | null;
      if (card) {
        card.dataset.ipMonthlyCurve = "true";
        const svg = card.querySelector("svg") as SVGElement | null;
        const wrap = svg?.parentElement as HTMLElement | null;
        if (wrap) wrap.dataset.ipMonthlyGraph = "true";
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [moreOpen]);

  const tradingTiles = useMemo(
    () => [
      { href: "/dashboard/comptes", label: "Comptes", icon: <WalletCards size={20} /> },
      { href: "/dashboard/plan", label: "Plan trading", icon: <ClipboardCheck size={20} /> },
      { href: "/dashboard/simulateur", label: "Simulateur", icon: <Target size={20} /> },
      { href: "/dashboard/rapport-mensuel", label: "Bilan mensuel", icon: <ChartNoAxesCombined size={20} /> },
      { href: "/dashboard/classement", label: "Classement", icon: <Trophy size={20} /> },
      { href: "/dashboard/defis", label: "Défis", icon: <Zap size={20} /> },
      { href: "/dashboard/performances-vip", label: "VIP", icon: <TrendingUp size={20} /> },
    ],
    []
  );

  const toolTiles = useMemo(
    () => [
      { href: "/dashboard/calendrier", label: "Calendrier éco", icon: <CalendarDays size={20} /> },
      { href: "/dashboard/tradingview", label: "TradingView", icon: <LineChart size={20} /> },
      { href: "/dashboard/analyse-fondamentale", label: "Analyse fonda.", icon: <Landmark size={20} /> },
      { href: "/dashboard/financialjuice", label: "FinancialJuice", icon: <Newspaper size={20} /> },
    ],
    []
  );

  const academyTiles = useMemo(
    () => [
      { href: "/dashboard/academy", label: "Formations", icon: <GraduationCap size={20} /> },
      { href: "/dashboard/academy/bibliotheque", label: "Bibliothèque", icon: <Library size={20} /> },
      { href: "/dashboard/academy/progression", label: "Progression", icon: <TrendingUp size={20} /> },
      { href: "/dashboard/profil", label: "Mon profil", icon: <CircleUserRound size={20} /> },
    ],
    []
  );

  return (
    <>
      <nav className="ip-mobile-global-nav" aria-label="Navigation mobile">
        <BottomTab
          href="/dashboard"
          label="Accueil"
          active={pathname === "/dashboard"}
          icon={<Grid2X2 size={21} />}
        />
        <BottomTab
          href="/dashboard/journal"
          label="Journal"
          active={activeFor(pathname, "/dashboard/journal")}
          icon={<BookOpen size={21} />}
        />
        <BottomTab
          href="/dashboard/comptes"
          label="Comptes"
          active={activeFor(pathname, "/dashboard/comptes")}
          icon={<WalletCards size={21} />}
        />
        <BottomTab
          href="/dashboard/rapports"
          label="Rapports"
          active={isReports}
          icon={<BarChart3 size={21} />}
        />

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={["ip-mobile-tab", moreOpen ? "ip-mobile-tab-active" : ""].join(" ")}
        >
          <Menu size={21} />
          <span>Plus</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="ip-more-overlay">
          <button
            type="button"
            aria-label="Fermer le menu"
            className="ip-more-backdrop"
            onClick={() => setMoreOpen(false)}
          />

          <div className="ip-more-sheet">
            <div className="ip-more-head">
              <div>
                <div className="ip-more-title">Plus</div>
                <div className="ip-more-subtitle">Toutes les fonctionnalités InvestPro</div>
              </div>

              <button
                type="button"
                className="ip-more-close"
                onClick={() => setMoreOpen(false)}
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="ip-more-scroll">
              <MenuGroup title="Trading">
                {tradingTiles.map((item) => (
                  <MenuTile key={item.href} {...item} onClick={() => setMoreOpen(false)} />
                ))}
              </MenuGroup>

              <MenuGroup title="Outils">
                {toolTiles.map((item) => (
                  <MenuTile key={item.href} {...item} onClick={() => setMoreOpen(false)} />
                ))}
              </MenuGroup>

              <MenuGroup title="Academy & compte">
                {academyTiles.map((item) => (
                  <MenuTile key={item.href} {...item} onClick={() => setMoreOpen(false)} />
                ))}
              </MenuGroup>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @media (max-width: 900px) {
          html, body {
            max-width: 100%;
            overflow-x: hidden;
          }

          body {
            padding-bottom: calc(82px + env(safe-area-inset-bottom));
          }

          [data-investpro-mobile-nav="true"] {
            display: none !important;
          }

          .ip-mobile-global-nav {
            position: fixed;
            z-index: 1350;
            left: 0;
            right: 0;
            bottom: 0;
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 2px;
            padding: 7px 8px max(7px, env(safe-area-inset-bottom));
            border-top: 1px solid rgba(216,175,71,.17);
            background: rgba(8,9,8,.94);
            backdrop-filter: blur(22px);
            -webkit-backdrop-filter: blur(22px);
            box-shadow: 0 -14px 34px rgba(0,0,0,.35);
          }

          .ip-mobile-tab {
            min-width: 0;
            height: 61px;
            border-radius: 15px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            color: rgba(255,255,255,.58);
            text-decoration: none;
            background: transparent;
            border: 0;
            font-size: 10px;
            font-weight: 600;
            transition: .16s ease;
          }

          .ip-mobile-tab-active {
            color: var(--gold, #e0b64f);
            background: rgba(216,175,71,.10);
          }

          .ip-more-overlay {
            position: fixed;
            inset: 0;
            z-index: 1450;
          }

          .ip-more-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,.72);
            backdrop-filter: blur(7px);
            -webkit-backdrop-filter: blur(7px);
          }

          .ip-more-sheet {
            position: absolute;
            left: 10px;
            right: 10px;
            bottom: calc(76px + env(safe-area-inset-bottom));
            max-height: min(76vh, 680px);
            overflow: hidden;
            border: 1px solid rgba(216,175,71,.22);
            border-radius: 26px;
            background: #0c0e0c;
            box-shadow: 0 24px 70px rgba(0,0,0,.6);
          }

          .ip-more-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 18px 18px 14px;
            border-bottom: 1px solid rgba(255,255,255,.06);
          }

          .ip-more-title {
            color: white;
            font-size: 20px;
            font-weight: 750;
          }

          .ip-more-subtitle {
            margin-top: 3px;
            color: rgba(255,255,255,.42);
            font-size: 11px;
          }

          .ip-more-close {
            width: 38px;
            height: 38px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,.08);
            background: rgba(255,255,255,.03);
            display: flex;
            align-items: center;
            justify-content: center;
            color: rgba(255,255,255,.7);
          }

          .ip-more-scroll {
            max-height: calc(min(76vh, 680px) - 72px);
            overflow-y: auto;
            padding: 14px 14px 20px;
            scrollbar-width: none;
          }

          .ip-more-scroll::-webkit-scrollbar {
            display: none;
          }

          .ip-more-group + .ip-more-group {
            margin-top: 18px;
          }

          .ip-more-group-title {
            padding: 0 3px 8px;
            color: rgba(255,255,255,.32);
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .16em;
            text-transform: uppercase;
          }

          .ip-more-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }

          .ip-more-tile {
            min-width: 0;
            min-height: 82px;
            padding: 10px 6px 8px;
            border: 1px solid rgba(255,255,255,.065);
            border-radius: 15px;
            background: rgba(255,255,255,.025);
            color: rgba(255,255,255,.74);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            text-align: center;
            text-decoration: none;
            font-size: 9px;
            line-height: 1.2;
          }

          .ip-more-tile-icon {
            width: 34px;
            height: 34px;
            border-radius: 11px;
            border: 1px solid rgba(216,175,71,.20);
            background: rgba(216,175,71,.07);
            color: var(--gold, #e0b64f);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          /* Dashboard : plus dense et proche de la maquette */
          body.ip-mobile-dashboard [data-ip-mobile-quick="true"] {
            padding: 16px !important;
            border-radius: 20px !important;
            margin-bottom: 18px !important;
          }

          body.ip-mobile-dashboard [data-ip-mobile-quick="true"] h2 {
            font-size: 18px !important;
          }

          body.ip-mobile-dashboard [data-ip-home-kpi-grid="true"] {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          body.ip-mobile-dashboard [data-ip-home-kpi="true"] {
            min-height: 108px !important;
            padding: 13px !important;
            border-radius: 18px !important;
          }

          body.ip-mobile-dashboard [data-ip-capital-kpi="true"] {
            grid-column: 1 / -1 !important;
            min-height: 118px !important;
          }

          body.ip-mobile-dashboard [data-ip-mobile-dashboard-card="true"] {
            border-radius: 20px !important;
          }

          /* Journal */
          body.ip-mobile-journal [data-journal-v2] .journal-v2-content > div {
            padding-bottom: 24px !important;
          }

          body.ip-mobile-journal [data-journal-v2] section {
            border-radius: 20px !important;
          }

          body.ip-mobile-journal [data-ip-journal-calendar="true"] {
            padding: 14px !important;
            overflow: hidden !important;
          }

          body.ip-mobile-journal [data-ip-journal-calendar="true"] select,
          body.ip-mobile-journal [data-ip-journal-calendar="true"] button {
            min-width: 0 !important;
          }

          body.ip-mobile-journal [data-ip-calendar-grid="true"] {
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
          }

          body.ip-mobile-journal [data-ip-calendar-grid="true"] > :nth-child(8n) {
            display: none !important;
          }

          body.ip-mobile-journal [data-ip-calendar-grid="true"] > * {
            min-width: 0 !important;
            padding-left: 3px !important;
            padding-right: 3px !important;
            font-size: 9px !important;
            overflow: hidden !important;
          }

          body.ip-mobile-journal [data-ip-journal-history="true"] .divide-y > div {
            margin: 8px !important;
            padding: 12px !important;
            border-radius: 15px !important;
          }

          body.ip-mobile-journal .journal-v2-select {
            height: 40px !important;
            font-size: 11px !important;
          }

          /* VIP : réduire les gros blocs */
          body.ip-mobile-vip [data-ip-vip-hero="true"],
          body.ip-mobile-vip [data-ip-vip-telegram="true"],
          body.ip-mobile-vip [data-ip-vip-chart="true"] {
            padding: 16px !important;
            border-radius: 20px !important;
          }

          body.ip-mobile-vip [data-ip-vip-telegram="true"] button {
            min-height: 42px !important;
          }

          /* Rapports / bilan */
          body.ip-mobile-reports section,
          body.ip-mobile-plan section,
          body.ip-mobile-accounts section {
            scroll-margin-bottom: 90px;
          }

          body.ip-mobile-reports h1,
          body.ip-mobile-journal h1,
          body.ip-mobile-plan h1,
          body.ip-mobile-accounts h1 {
            letter-spacing: -.03em;
          }

          /* V1.1 — safe-area / respiration haute */
          body.ip-mobile-journal .journal-v2-content {
            padding-top: 26px !important;
          }

          /* Dashboard V3 — 3 métriques sur une seule ligne */
          body.ip-mobile-dashboard [data-ip-quick-metrics-grid="true"] {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          body.ip-mobile-dashboard [data-ip-quick-metric="true"] {
            min-width: 0 !important;
            min-height: 92px !important;
            padding: 11px !important;
            border-radius: 15px !important;
          }

          body.ip-mobile-dashboard [data-ip-quick-metric="true"] > div:nth-child(2) {
            margin-top: 8px !important;
            font-size: 8px !important;
            line-height: 1.15 !important;
          }

          body.ip-mobile-dashboard [data-ip-quick-metric="true"] > div:last-child {
            margin-top: 4px !important;
            font-size: 15px !important;
          }

          body.ip-mobile-dashboard [data-ip-quick-curve="true"] {
            padding: 13px !important;
          }

          body.ip-mobile-dashboard [data-ip-quick-curve="true"] svg {
            max-height: 104px !important;
          }

          /* Plan de trading — stats hautes en 3 colonnes */
          body.ip-mobile-plan [data-ip-plan-top-grid="true"] {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          body.ip-mobile-plan [data-ip-plan-top-stat="true"] {
            min-width: 0 !important;
            min-height: 108px !important;
            padding: 11px !important;
            border-radius: 16px !important;
          }

          body.ip-mobile-plan [data-ip-plan-top-stat="true"] .h-10,
          body.ip-mobile-plan [data-ip-plan-top-stat="true"] .w-10 {
            width: 32px !important;
            height: 32px !important;
          }

          body.ip-mobile-plan [data-ip-plan-top-stat="true"] .text-lg {
            font-size: 17px !important;
          }

          body.ip-mobile-plan [data-ip-plan-discipline="true"] {
            padding: 15px !important;
          }

          body.ip-mobile-plan [data-ip-plan-ring="true"] {
            width: 116px !important;
            height: 116px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          body.ip-mobile-plan [data-ip-plan-conformity="true"] {
            padding: 15px !important;
          }

          body.ip-mobile-plan [data-ip-plan-conformity="true"] .space-y-2 > * {
            padding-top: 10px !important;
            padding-bottom: 10px !important;
          }

          /* Comptes — panneaux MetaTrader plus courts */
          body.ip-mobile-accounts [data-ip-accounts-meta-next="true"],
          body.ip-mobile-accounts [data-ip-accounts-meta-sync="true"] {
            padding: 15px !important;
            border-radius: 20px !important;
          }

          body.ip-mobile-accounts [data-ip-accounts-meta-next="true"] h2,
          body.ip-mobile-accounts [data-ip-accounts-meta-sync="true"] h2 {
            font-size: 21px !important;
            line-height: 1.15 !important;
          }

          body.ip-mobile-accounts [data-ip-accounts-meta-next="true"] p,
          body.ip-mobile-accounts [data-ip-accounts-meta-sync="true"] p {
            line-height: 1.55 !important;
          }

          body.ip-mobile-accounts [data-ip-accounts-meta-next="true"] .rounded-2xl,
          body.ip-mobile-accounts [data-ip-accounts-meta-sync="true"] .rounded-2xl {
            padding: 13px !important;
          }

          body.ip-mobile-accounts [data-ip-accounts-list="true"] {
            padding: 14px !important;
          }

          body.ip-mobile-accounts [data-ip-accounts-list="true"] .rounded-2xl {
            border-radius: 16px !important;
          }

          /* Rapports — heatmap 7 colonnes visible sans scroll horizontal */
          body.ip-mobile-reports [data-ip-reports-heatmap="true"] {
            padding: 14px !important;
            overflow: hidden !important;
          }

          body.ip-mobile-reports [data-ip-reports-heatmap-grid="true"] {
            width: 100% !important;
            min-width: 0 !important;
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 3px !important;
            overflow: hidden !important;
          }

          body.ip-mobile-reports [data-ip-reports-heatmap-grid="true"] > * {
            min-width: 0 !important;
            min-height: 62px !important;
            padding: 5px 3px !important;
            border-radius: 9px !important;
            font-size: 8px !important;
            overflow: hidden !important;
            word-break: break-word !important;
          }

          body.ip-mobile-reports [data-ip-reports-compact="true"] {
            padding: 14px !important;
            border-radius: 19px !important;
          }

          body.ip-mobile-reports [data-ip-reports-compact="true"] > div:not(:first-child) {
            margin-top: 10px !important;
          }

          body.ip-mobile-reports [data-ip-reports-equity="true"] {
            padding: 14px !important;
          }

          body.ip-mobile-reports [data-ip-reports-graph="true"] {
            height: 220px !important;
            max-height: 220px !important;
          }

          body.ip-mobile-reports [data-ip-reports-graph="true"] svg {
            height: 100% !important;
            max-height: 220px !important;
          }

          /* Rapport mensuel — plus dense */
          body.ip-mobile-reports [data-ip-monthly-compact="true"] {
            padding: 14px !important;
            border-radius: 19px !important;
          }

          body.ip-mobile-reports [data-ip-monthly-compact="true"] .rounded-xl {
            padding: 11px !important;
          }

          body.ip-mobile-reports [data-ip-monthly-curve="true"] {
            padding: 14px !important;
          }

          body.ip-mobile-reports [data-ip-monthly-graph="true"] {
            height: 190px !important;
            max-height: 190px !important;
          }

          body.ip-mobile-reports [data-ip-monthly-graph="true"] svg {
            height: 100% !important;
            max-height: 190px !important;
          }
        }

        @media (max-width: 390px) {
          .ip-more-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .ip-mobile-tab {
            font-size: 9px;
          }
        }

        @media (min-width: 901px) {
          .ip-mobile-global-nav,
          .ip-more-overlay {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

function MenuGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ip-more-group">
      <div className="ip-more-group-title">{title}</div>
      <div className="ip-more-grid">{children}</div>
    </section>
  );
}
