"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Command,
  FileText,
  LineChart,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

const items = [
  { label: "Dashboard", hint: "Vue d'ensemble", href: "/dashboard", icon: LineChart },
  { label: "Journal", hint: "Trades & analyse", href: "/dashboard/journal", icon: BookOpen },
  { label: "Mes comptes", hint: "Comptes & connexions", href: "/dashboard/comptes", icon: WalletCards },
  { label: "Rapports", hint: "Performances détaillées", href: "/dashboard/rapports", icon: BarChart3 },
  { label: "Plan de trading", hint: "Règles & discipline", href: "/dashboard/plan", icon: ShieldCheck },
  { label: "Simulateur de risque", hint: "Calcul du risque", href: "/dashboard/simulateur", icon: Target },
  { label: "TradingView", hint: "Graphiques", href: "/dashboard/tradingview", icon: LineChart },
  { label: "Calendrier économique", hint: "Événements macro", href: "/dashboard/calendrier", icon: CalendarDays },
  { label: "FinancialJuice", hint: "Flux marché", href: "/dashboard/financialjuice", icon: Zap },
  { label: "Bilan mensuel", hint: "Rapport mensuel", href: "/dashboard/rapport-mensuel", icon: FileText },
  { label: "Abonnement", hint: "Plan InvestPro", href: "/dashboard/abonnement", icon: CircleDollarSign },
  { label: "Profil", hint: "Préférences trader", href: "/dashboard/profil", icon: UserRound },
  { label: "Paramètres", hint: "Compte & sécurité", href: "/dashboard/compte", icon: Settings2 },
];

export default function InvestProCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(q));
  }, [query]);

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
    }
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
      setSelected((value) => (value - 1 + filtered.length) % filtered.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(filtered[selected]?.href || filtered[0].href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ip-command-trigger"
        aria-label="Ouvrir la navigation rapide"
        title="Navigation rapide (Ctrl/⌘ + K)"
      >
        <Search size={15} />
        <span>Accès rapide</span>
        <kbd>⌘K</kbd>
      </button>

      {open ? (
        <div
          className="ip-command-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="ip-command-modal" role="dialog" aria-modal="true" aria-label="Navigation rapide InvestPro">
            <div className="ip-command-search-row">
              <Search size={17} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Rechercher Journal, Comptes, Rapports..."
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>

            <div className="ip-command-list">
              {filtered.length ? (
                filtered.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => go(item.href)}
                      className={index === selected ? "is-active" : ""}
                    >
                      <span className="ip-command-icon"><Icon size={16} /></span>
                      <span className="ip-command-copy">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                      <span className="ip-command-enter">↵</span>
                    </button>
                  );
                })
              ) : (
                <div className="ip-command-empty">
                  <Command size={22} />
                  Aucun raccourci trouvé.
                </div>
              )}
            </div>

            <div className="ip-command-footer">
              <span>↑↓ naviguer</span>
              <span>↵ ouvrir</span>
              <span>Esc fermer</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
