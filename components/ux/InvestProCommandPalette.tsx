"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Command,
  DatabaseBackup,
  FileText,
  HeartPulse,
  LineChart,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  UserRound,
  WalletCards,
  X,
  Zap,
  Handshake,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SearchItem = {
  label: string;
  hint: string;
  href: string;
  icon: React.ElementType;
  keywords?: string;
  kind?: "page" | "account" | "trade";
};

const pageItems: SearchItem[] = [
  { label: "Dashboard", hint: "Vue d’ensemble", href: "/dashboard", icon: LineChart, kind: "page" },
  { label: "Journal", hint: "Trades & analyse", href: "/dashboard/journal", icon: BookOpen, kind: "page" },
  { label: "Mes comptes", hint: "Comptes & connexions", href: "/dashboard/comptes", icon: WalletCards, kind: "page" },
  { label: "Rapports", hint: "Performances détaillées", href: "/dashboard/rapports", icon: BarChart3, kind: "page" },
  { label: "Plan de trading", hint: "Règles & discipline", href: "/dashboard/plan", icon: ShieldCheck, kind: "page" },
  { label: "Simulateur de risque", hint: "Calcul du risque", href: "/dashboard/simulateur", icon: Target, kind: "page" },
  { label: "TradingView", hint: "Graphiques", href: "/dashboard/tradingview", icon: LineChart, kind: "page" },
  { label: "Calendrier économique", hint: "Événements macro", href: "/dashboard/calendrier", icon: CalendarDays, kind: "page" },
  { label: "FinancialJuice", hint: "Flux marché", href: "/dashboard/financialjuice", icon: Zap, kind: "page" },
  { label: "Bilan mensuel", hint: "Rapport mensuel", href: "/dashboard/rapport-mensuel", icon: FileText, kind: "page" },
  { label: "Centre d’activité", hint: "Timeline InvestPro", href: "/dashboard/activite", icon: Activity, kind: "page" },
  { label: "Santé du compte", hint: "Sécurité & connexions", href: "/dashboard/sante", icon: HeartPulse, kind: "page" },
  { label: "Sauvegarde & export", hint: "JSON / CSV", href: "/dashboard/sauvegarde", icon: DatabaseBackup, kind: "page" },
  { label: "Abonnement", hint: "Plan InvestPro", href: "/dashboard/abonnement", icon: CircleDollarSign, kind: "page" },
  { label: "Partenaires", hint: "Écosystème InvestPro", href: "/dashboard/partenaires", icon: Handshake, kind: "page" },
  { label: "Profil", hint: "Préférences trader", href: "/dashboard/profil", icon: UserRound, kind: "page" },
  { label: "Paramètres", hint: "Compte & sécurité", href: "/dashboard/compte", icon: Settings2, kind: "page" },
];

export default function InvestProCommandPalette() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [dynamicItems, setDynamicItems] = useState<SearchItem[]>([]);
  const [loadedDynamic, setLoadedDynamic] = useState(false);

  async function loadDynamic() {
    if (loadedDynamic) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [accountsResult, tradesResult] = await Promise.all([
        supabase
          .from("trading_accounts")
          .select("id,name,platform,broker")
          .eq("user_id", user.id)
          .limit(50),
        supabase
          .from("trading_journal")
          .select("id,symbol,trade_date,status,result_amount")
          .eq("user_id", user.id)
          .order("trade_date", { ascending: false })
          .limit(100),
      ]);

      const items: SearchItem[] = [];

      for (const account of accountsResult.data || []) {
        items.push({
          label: account.name || `Compte ${account.id}`,
          hint: `${account.platform || "Compte"} · ${account.broker || "InvestPro"}`,
          href: "/dashboard/comptes",
          icon: WalletCards,
          kind: "account",
          keywords: `${account.id} ${account.name || ""} ${account.platform || ""} ${account.broker || ""}`,
        });
      }

      for (const trade of tradesResult.data || []) {
        const date = trade.trade_date
          ? new Date(trade.trade_date).toLocaleDateString("fr-FR")
          : "";
        items.push({
          label: `${trade.symbol || "Trade"} · ${date}`,
          hint: `${trade.status || "Journal"} · ${
            trade.result_amount != null ? Number(trade.result_amount).toFixed(2) : "—"
          }`,
          href: "/dashboard/journal",
          icon: BookOpen,
          kind: "trade",
          keywords: `${trade.id} ${trade.symbol || ""} ${trade.status || ""} ${date}`,
        });
      }

      setDynamicItems(items);
    } finally {
      setLoadedDynamic(true);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = [...pageItems, ...dynamicItems];

    if (!q) return pageItems;

    return source
      .filter((item) =>
        `${item.label} ${item.hint} ${item.keywords || ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 30);
  }, [query, dynamicItems]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      void loadDynamic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!filtered.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((value) => (value + 1) % filtered.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(
        (value) => (value - 1 + filtered.length) % filtered.length
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(filtered[selected]?.href || filtered[0].href);
    }
  }

  return (
    <>
      {open ? (
        <div
          className="ip-command-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="ip-command-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Recherche InvestPro"
          >
            <div className="ip-command-search-row">
              <Search size={17} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Page, compte, GOLD, EURUSD..."
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ip-command-list">
              {filtered.length ? (
                filtered.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={`${item.kind}-${item.href}-${item.label}-${index}`}
                      type="button"
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => go(item.href)}
                      className={index === selected ? "is-active" : ""}
                    >
                      <span className="ip-command-icon">
                        <Icon size={16} />
                      </span>

                      <span className="ip-command-copy">
                        <strong>{item.label}</strong>
                        <small>
                          {item.kind === "trade"
                            ? "TRADE · "
                            : item.kind === "account"
                              ? "COMPTE · "
                              : ""}
                          {item.hint}
                        </small>
                      </span>

                      <span className="ip-command-enter">↵</span>
                    </button>
                  );
                })
              ) : (
                <div className="ip-command-empty">
                  <Command size={22} />
                  Aucun résultat.
                </div>
              )}
            </div>

            <div className="ip-command-footer">
              <span>Recherche pages + comptes + trades</span>
              <span>↑↓ naviguer</span>
              <span>↵ ouvrir</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
