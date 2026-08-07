"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import GoldSelect from "../../../components/ui/GoldSelect";

import { pushNotif } from "../../../lib/notifyStore";
import { getCurrentAccount } from "../../../lib/authStore";
import { loadMt5Accounts, Mt5Account, getMt5AccountUsd } from "../../../lib/mt5Store";


import {
  Bell,
  Volume2,
  VolumeX,
  Gauge,
  RotateCcw,
  History,
  Sparkles,
  CheckCircle2,
  Globe,
  User,
  Lock,
  Timer,
  Ban,
  AlertTriangle,
  Palette,
} from "lucide-react";

import {
  usePrefs,
  patchPrefs,
  lockTrading,
  unlockTrading,
  ThemeMode,
  Language,
  NotifKind,
  BlockDuration,
} from "../../../lib/prefsStore";

/* ----------------------------- Helpers ----------------------------- */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hh > 0) return `${hh}h ${pad(mm)}m`;
  return `${mm}m ${pad(ss)}s`;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const setDark = () => root.classList.add("dark");
  const setLight = () => root.classList.remove("dark");

  if (mode === "system") {
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    prefersDark ? setDark() : setLight();
    return;
  }
  mode === "dark" ? setDark() : setLight();
}

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** ✅ Robust balance/equity getter (MT5 objects can vary) */
function pickAccountUsd(a: any) {
  if (!a) return 0;

  const candidates = [
    a?.equity,
    a?.balance,
    a?.accountBalance,
    a?.accountEquity,

    a?.info?.equity,
    a?.info?.balance,

    a?.account?.equity,
    a?.account?.balance,

    a?.stats?.equity,
    a?.stats?.balance,

    a?.summary?.equity,
    a?.summary?.balance,

    a?.metrics?.equity,
    a?.metrics?.balance,
  ];

  for (const v of candidates) {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** ✅ clé lue par app/dashboard/classement/[username] */
function publicProfilePrefsKeyFor(username: string) {
  return `investpro_profile_prefs_v1_${(username || "unknown").toLowerCase()}`;
}

function savePublicProfilePrefs(next: {
  profilePublic: boolean;
  showStats: boolean;
  showTrades: boolean;
}) {
  const me = getCurrentAccount();
  if (!me?.username) return;
  try {
    localStorage.setItem(
      publicProfilePrefsKeyFor(me.username),
      JSON.stringify(next)
    );
  } catch {}
}

/**
 * ✅ Masquer / afficher l’utilisateur dans le classement
 * (on essaie plusieurs clés possibles selon ton uiStore)
 */
function updateLeaderboardVisibility(username: string, visible: boolean) {
  const keys = [
    "investpro_leaderboard_v1",
    "investpro_leaderboard",
    "investpro_ui_leaderboard_v1",
    "investpro_ui_leaderboard",
    "investpro_leaderboard_cache_v1",
  ];

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) continue;

      const next = arr.map((u: any) =>
        String(u?.username || "").toLowerCase() === username.toLowerCase()
          ? { ...u, showOnLeaderboard: visible }
          : u
      );

      localStorage.setItem(k, JSON.stringify(next));

      window.dispatchEvent(
        new CustomEvent("investpro:leaderboard_updated", {
          detail: { username, visible, key: k },
        })
      );
      return;
    } catch {
      // ignore
    }
  }
}

const ALL_KINDS: { k: NotifKind; label: string; hint: string }[] = [
  { k: "tp", label: "TP", hint: "Take profit touché" },
  { k: "sl", label: "SL", hint: "Stop loss touché" },
  { k: "be", label: "BE", hint: "Break-even" },
  { k: "admin", label: "Admin", hint: "Actions et messages admin" },
  { k: "live", label: "Live", hint: "Alertes live / status" },
  { k: "video", label: "Vidéo", hint: "Contenu vidéo" },
  { k: "info", label: "Info", hint: "Infos générales" },
  { k: "success", label: "Succès", hint: "Confirmations" },
  { k: "warning", label: "Warning", hint: "Avertissements" },
  { k: "error", label: "Error", hint: "Erreurs" },
  { k: "pending", label: "Pending", hint: "En attente / traitement" },
];

export default function ParametresPage() {
  const { notif, ui, profile, rules, lock } = usePrefs();
  const [nowMs, setNowMs] = useState(Date.now());

  // MT5 accounts for selector
  const [mt5Accounts, setMt5Accounts] = useState<Mt5Account[]>([]);
  const [mt5Loading, setMt5Loading] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // appliquer thème depuis prefs
  useEffect(() => {
    try {
      const saved =
        (localStorage.getItem("ip_theme") as ThemeMode | null) || ui.theme;
      applyTheme(saved || "dark");
    } catch {}
  }, [ui.theme]);

  // ✅ Sync auto vers la clé publique lue par [username]
  useEffect(() => {
    savePublicProfilePrefs({
      profilePublic: !!profile.profilePublic,
      showStats: !!profile.showStats,
      showTrades: !!profile.showTrades,
    });
  }, [profile.profilePublic, profile.showStats, profile.showTrades]);

  const lockActive = lock.active && lock.untilMs > nowMs;
  const lockRemaining = lockActive ? lock.untilMs - nowMs : 0;

  const enabledCount = useMemo(() => {
    return ALL_KINDS.reduce((acc, x) => acc + (notif.enabled[x.k] ? 1 : 0), 0);
  }, [notif.enabled]);

  function setTheme(mode: ThemeMode) {
    patchPrefs({ ui: { ...ui, theme: mode } });
    localStorage.setItem("ip_theme", mode);
    applyTheme(mode);
    pushNotif({
      kind: "success",
      title: "Thème",
      message: "Préférence enregistrée ✅",
    });
  }

  function setLanguage(lang: Language) {
    patchPrefs({ ui: { ...ui, language: lang } });
    pushNotif({
      kind: "success",
      title: "Langue",
      message: "Préférence enregistrée ✅",
    });
  }

  function toggleKind(k: NotifKind) {
    patchPrefs({
      notif: { ...notif, enabled: { ...notif.enabled, [k]: !notif.enabled[k] } },
    });
  }

  function enableAllKinds() {
    const enabled = { ...notif.enabled };
    for (const { k } of ALL_KINDS) enabled[k] = true;
    patchPrefs({ notif: { ...notif, enabled } });
  }

  function disableAllKinds() {
    const enabled = { ...notif.enabled };
    for (const { k } of ALL_KINDS) enabled[k] = false;
    patchPrefs({ notif: { ...notif, enabled } });
  }

  function testNotif() {
    pushNotif({
      kind: "info",
      title: "Test notification",
      message: "Toast OK ✅",
    });
  }

  function resetAllPrefs() {
    localStorage.removeItem("ip_prefs_v1");

    const me = getCurrentAccount();
    if (me?.username) {
      try {
        localStorage.removeItem(publicProfilePrefsKeyFor(me.username));
      } catch {}
    }

    window.location.reload();
  }

  /* ----------------- ✅ Réglages par trade : MT5 auto ou manuel ----------------- */
  const accountUsdMode = ((rules as any).accountUsdMode ?? "manual") as
    | "manual"
    | "mt5";

  const manualAccountUsd = Number((rules as any).accountUsdManual ?? 50000);
  const mt5SelectedId = String((rules as any).accountUsdMt5Id ?? "");

  async function syncMt5() {
    try {
      setMt5Loading(true);
      const accs = await loadMt5Accounts();
      const list = Array.isArray(accs) ? accs : [];
      setMt5Accounts(list);

      // ✅ auto-select first account if MT5 mode and none selected
      if (
        (((rules as any).accountUsdMode ?? "manual") === "mt5" ||
          accountUsdMode === "mt5") &&
        !String((rules as any).accountUsdMt5Id ?? "") &&
        list.length
      ) {
        const firstId = String((list[0] as any)?.id ?? (list[0] as any)?.login ?? "");
        patchPrefs({
          rules: { ...(rules as any), accountUsdMode: "mt5", accountUsdMt5Id: firstId } as any,
        });
      }

      pushNotif({
        kind: "success",
        title: "MT5",
        message: "Comptes MT5 synchronisés ✅",
      });
    } catch {
      pushNotif({
        kind: "error",
        title: "MT5",
        message: "Impossible de synchroniser les comptes MT5.",
      });
      setMt5Accounts([]);
    } finally {
      setMt5Loading(false);
    }
  }

  // load once
  useEffect(() => {
    syncMt5();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMt5 = useMemo(() => {
    const sid = String(mt5SelectedId || "");
    return mt5Accounts.find((a: any) => String(a?.id ?? a?.login ?? "") === sid);
  }, [mt5Accounts, mt5SelectedId]);

  // ✅ robust getter
  const mt5AutoUsd = getMt5AccountUsd(selectedMt5);


  const accountUsd =
    accountUsdMode === "mt5"
      ? Number.isFinite(mt5AutoUsd) && mt5AutoUsd > 0
        ? mt5AutoUsd
        : 0
      : manualAccountUsd;

  const riskPct = Number((rules as any).riskPerTradePct ?? 1);

  const riskUsdPreview = useMemo(() => {
    const a = Number(accountUsd);
    const p = Number(riskPct);
    if (!Number.isFinite(a) || !Number.isFinite(p)) return 0;
    return (a * p) / 100;
  }, [accountUsd, riskPct]);

  // Options GoldSelect (MT5)
  const mt5Options = useMemo(() => {
    return (mt5Accounts || []).map((a: any) => {
      const id = String(a?.id ?? a?.login ?? "");
      const name = a?.name
        ? String(a.name)
        : a?.login
        ? `Compte ${a.login}`
        : `Compte ${id}`;
      const val = getMt5AccountUsd(a);

      return {
        value: id,
        label: `${name} — ${Number.isFinite(val) ? fmtUsd(val) : "$0.00"}`,
      };
    });
  }, [mt5Accounts]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <Card>
        <CardBody className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">⚙️ Paramètres</div>
            <div className="text-sm text-muted mt-1">
              Langue, profil, règles de trading, sons & notifications, thème, UI.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={testNotif}>
              Tester une notif
            </Button>
            <Link href="/dashboard/historique">
              <Button variant="ghost">
                <History size={16} className="mr-2" />
                Historique connexions
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>

      {/* Trading lock banner */}
      {lock.active && lock.untilMs > nowMs ? (
        <Card>
          <CardBody className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl border border-rose-500/25 bg-rose-500/10 flex items-center justify-center">
                <Lock size={18} className="text-rose-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Trading bloqué
                </div>
                <div className="text-xs text-muted mt-1">
                  Raison :{" "}
                  <span className="text-[color:var(--text)] font-semibold">
                    {lock.reason || "—"}
                  </span>{" "}
                  • Temps restant :{" "}
                  <span className="text-[color:var(--text)] font-semibold">
                    {fmtCountdown(lock.untilMs - nowMs)}
                  </span>
                </div>
              </div>
            </div>

            <Button variant="danger" onClick={() => unlockTrading()}>
              Débloquer maintenant
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {/* Langue */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-[color:var(--muted)]" />
            <div className="text-lg font-semibold">Langue</div>
          </div>

          <CardSubCard>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Langue de l’interface
                </div>
                <div className="text-xs text-muted mt-1">
                  EN peut être activé plus tard (traductions).
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={ui.language === "fr" ? "primary" : "ghost"}
                  onClick={() => setLanguage("fr")}
                >
                  FR
                </Button>
                <Button
                  variant={ui.language === "en" ? "primary" : "ghost"}
                  onClick={() => setLanguage("en")}
                >
                  EN
                </Button>
              </div>
            </div>
          </CardSubCard>
        </CardBody>
      </Card>

      {/* Profil public */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <User size={18} className="text-[color:var(--muted)]" />
            <div className="text-lg font-semibold">Profil public</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ToggleCard
              icon={<User size={18} className="text-[color:var(--muted)]" />}
              title="Profil public"
              desc="Visible dans le classement."
              value={profile.profilePublic}
              onToggle={() => {
                const next = {
                  ...profile,
                  profilePublic: !profile.profilePublic,
                };
                if (!next.profilePublic) {
                  next.showStats = false;
                  next.showTrades = false;
                }

                patchPrefs({ profile: next });

                savePublicProfilePrefs({
                  profilePublic: next.profilePublic,
                  showStats: next.showStats,
                  showTrades: next.showTrades,
                });

                const me = getCurrentAccount();
                if (me?.username) {
                  updateLeaderboardVisibility(me.username, next.profilePublic);
                }
              }}
            />
            <ToggleCard
              icon={
                <CheckCircle2 size={18} className="text-[color:var(--muted)]" />
              }
              title="Afficher stats"
              desc="Winrate, RR, performance…"
              value={profile.showStats}
              disabled={!profile.profilePublic}
              onToggle={() => {
                const next = { ...profile, showStats: !profile.showStats };
                patchPrefs({ profile: next });
                savePublicProfilePrefs({
                  profilePublic: next.profilePublic,
                  showStats: next.showStats,
                  showTrades: next.showTrades,
                });
              }}
            />
            <ToggleCard
              icon={<Sparkles size={18} className="text-[color:var(--muted)]" />}
              title="Afficher trades"
              desc="Historique visible publiquement."
              value={profile.showTrades}
              disabled={!profile.profilePublic}
              onToggle={() => {
                const next = { ...profile, showTrades: !profile.showTrades };
                patchPrefs({ profile: next });
                savePublicProfilePrefs({
                  profilePublic: next.profilePublic,
                  showStats: next.showStats,
                  showTrades: next.showTrades,
                });
              }}
            />
          </div>

          <div className="text-[11px] text-muted">
            ✅ Profil public OFF = invisible dans le classement.
          </div>
        </CardBody>
      </Card>

      {/* Sons & Notifications */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[color:var(--muted)]" />
            <div className="text-lg font-semibold">Sons & notifications</div>
            <div className="text-xs text-muted">
              {enabledCount}/{ALL_KINDS.length} activées
            </div>
          </div>

          <CardSubCard>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Son global
                </div>
                <div className="text-xs text-muted mt-1">
                  Coupe / active tous les sons (sans désactiver les types).
                </div>
              </div>

              <Button
                variant={notif.muted ? "danger" : "primary"}
                onClick={() =>
                  patchPrefs({ notif: { ...notif, muted: !notif.muted } })
                }
              >
                {notif.muted ? (
                  <span className="inline-flex items-center gap-2">
                    <VolumeX size={16} /> Muet
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Volume2 size={16} /> Actif
                  </span>
                )}
              </Button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted">Volume</div>
                <div className="text-xs text-muted">
                  {Math.round(clamp(Number(notif.volume ?? 0), 0, 1) * 100)}%
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={clamp(Number(notif.volume ?? 0), 0, 1)}
                onChange={(e) =>
                  patchPrefs({
                    notif: {
                      ...notif,
                      volume: clamp(Number(e.target.value), 0, 1),
                    },
                  })
                }
                className="w-full mt-2"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={enableAllKinds}>
                  Tout activer
                </Button>
                <Button variant="ghost" onClick={disableAllKinds}>
                  Tout désactiver
                </Button>
                <Button variant="ghost" onClick={testNotif}>
                  Tester
                </Button>
              </div>
            </div>
          </CardSubCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ALL_KINDS.map((x) => (
              <CheckToggle
                key={x.k}
                label={`${x.label} — ${x.hint}`}
                value={!!notif.enabled[x.k]}
                onToggle={() => toggleKind(x.k)}
              />
            ))}
          </div>

          <div className="text-[11px] text-muted">
            💡 Même si un type est activé, si tu es en “Muet”, aucun son ne sortira.
          </div>
        </CardBody>
      </Card>

      {/* Règles de trading */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-[color:var(--muted)]" />
            <div className="text-lg font-semibold">Règles de trading</div>
            <div className="text-xs text-muted">Discipline & contrôle</div>
          </div>

          <CardSubCard>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Activer les règles
                </div>
                <div className="text-xs text-muted mt-1">
                  Utilisées par le Terminal (limites, auto-remplissage, blocage).
                </div>
              </div>
              <Button
                variant={rules.enabled ? "primary" : "danger"}
                onClick={() =>
                  patchPrefs({ rules: { ...rules, enabled: !rules.enabled } })
                }
              >
                {rules.enabled ? "ON" : "OFF"}
              </Button>
            </div>
          </CardSubCard>

          <CardSubCard>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-[color:var(--muted)]" />
              <div className="text-sm font-semibold text-[color:var(--text)]">
                Limites journalières
              </div>
            </div>

            {/* ✅ Trades max/jour + SL max/jour SUPPRIMÉS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldNumber
                label="Perte max / jour (€)"
                value={rules.dailyLossMax}
                min={0}
                max={1_000_000}
                disabled={!rules.enabled}
                placeholder="0 = OFF"
                onChange={(v) =>
                  patchPrefs({
                    rules: { ...rules, dailyLossMax: Math.max(0, v) },
                  })
                }
              />
              <FieldNumber
                label="Objectif / jour (€)"
                value={rules.dailyProfitTarget}
                min={0}
                max={1_000_000}
                disabled={!rules.enabled}
                placeholder="0 = OFF"
                onChange={(v) =>
                  patchPrefs({
                    rules: { ...rules, dailyProfitTarget: Math.max(0, v) },
                  })
                }
              />
            </div>

            <div className="mt-3 text-[11px] text-muted flex items-center gap-2">
              <Ban size={14} className="text-rose-400" />
              Si une limite est atteinte, le Terminal pourra auto-bloquer selon tes réglages.
            </div>
          </CardSubCard>

          {/* Réglages par trade (prévisu) */}
          <CardSubCard>
            <div className="flex items-center gap-2 mb-3">
              <Timer size={16} className="text-[color:var(--muted)]" />
              <div className="text-sm font-semibold text-[color:var(--text)]">
                Réglages par trade (prévisu)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Taille du compte (MT5 ou Manuel) */}
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text)]">
                      Taille du compte (USD)
                    </div>
                    <div className="text-xs text-muted mt-1">
                      MT5 = auto (equity/balance) • Manuel = saisie libre
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={accountUsdMode === "mt5" ? "primary" : "ghost"}
                      onClick={() =>
                        patchPrefs({
                          rules: { ...(rules as any), accountUsdMode: "mt5" } as any,
                        })
                      }
                      disabled={!rules.enabled}
                    >
                      MT5
                    </Button>
                    <Button
                      variant={accountUsdMode === "manual" ? "primary" : "ghost"}
                      onClick={() =>
                        patchPrefs({
                          rules: { ...(rules as any), accountUsdMode: "manual" } as any,
                        })
                      }
                      disabled={!rules.enabled}
                    >
                      Manuel
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  {accountUsdMode === "mt5" ? (
                    <>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs text-muted">Compte MT5</div>
                        <Button
                          variant="ghost"
                          onClick={syncMt5}
                          disabled={!rules.enabled || mt5Loading}
                        >
                          {mt5Loading ? "Sync..." : "Sync MT5"}
                        </Button>
                      </div>

                      <GoldSelect
                        value={mt5SelectedId}
                        onChange={(v: any) => {
                          const id = String(v || "");
                          patchPrefs({
                            rules: {
                              ...(rules as any),
                              accountUsdMode: "mt5",
                              accountUsdMt5Id: id,
                            } as any,
                          });
                          if (id) {
                            pushNotif({
                              kind: "success",
                              title: "MT5",
                              message: "Compte sélectionné ✅",
                            });
                          }
                        }}
                        placeholder={
                          mt5Loading
                            ? "Chargement..."
                            : mt5Options.length
                            ? "Sélectionner un compte"
                            : "Aucun compte MT5"
                        }
                        options={mt5Options}
                        disabled={
                          !rules.enabled ||
                          mt5Loading ||
                          mt5Options.length === 0
                        }
                      />

                      <div className="mt-2 text-[11px] text-muted">
                        Valeur utilisée :{" "}
                        <span className="text-[color:var(--text)] font-semibold">
                          {fmtUsd(accountUsd)}
                        </span>
                      </div>

                      {accountUsd <= 0 ? (
                        <div className="mt-2 text-[11px] text-rose-400">
                          MT5 ne renvoie pas balance/equity (valeur = 0). Il faut
                          que loadMt5Accounts() fournisse ces champs.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-muted mb-1">
                        Entrer manuellement
                      </div>
                      <input
                        type="number"
                        value={manualAccountUsd}
                        min={0}
                        step={100}
                        disabled={!rules.enabled}
                        onChange={(e) =>
                          patchPrefs({
                            rules: {
                              ...(rules as any),
                              accountUsdManual: Math.max(
                                0,
                                Number(e.target.value || 0)
                              ),
                            } as any,
                          })
                        }
                        className="w-full rounded-xl border border-gold-soft bg-panel px-3 py-2 outline-none disabled:opacity-60"
                        placeholder="Ex: 50000"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Risque % + prévisualisation USD */}
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Risque par trade (%)
                </div>
                <div className="text-xs text-muted mt-1">
                  Décimales autorisées (0.9 / 0.01 / etc.)
                </div>

                <div className="mt-3">
                  <input
                    type="number"
                    value={Number((rules as any).riskPerTradePct ?? 1)}
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    disabled={!rules.enabled}
                    onChange={(e) =>
                      patchPrefs({
                        rules: {
                          ...(rules as any),
                          riskPerTradePct: clamp(
                            Number(e.target.value || 0),
                            0,
                            100
                          ),
                        } as any,
                      })
                    }
                    className="w-full rounded-xl border border-gold-soft bg-panel px-3 py-2 outline-none disabled:opacity-60"
                    placeholder="Ex: 0.5"
                  />

                  <div className="mt-3 text-[11px] text-muted">
                    Prévisualisation :{" "}
                    <span className="text-[color:var(--text)] font-semibold">
                      {fmtUsd(riskUsdPreview)}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-muted">
                    (Calcul : compte USD × risque %)
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-muted">
              Le Terminal peut utiliser ces valeurs pour pré-remplir le risque automatiquement.
            </div>
          </CardSubCard>

          {/* Blocage du trading */}
          <CardSubCard>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={16} className="text-[color:var(--muted)]" />
              <div className="text-sm font-semibold text-[color:var(--text)]">
                Blocage du trading
              </div>
              <div className="text-xs text-muted">Volontaire + automatique</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Blocage manuel
                </div>
                <div className="text-xs text-muted mt-1">Anti revenge-trade.</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => lockTrading("15m", "Blocage manuel")}
                  >
                    15 min
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => lockTrading("30m", "Blocage manuel")}
                  >
                    30 min
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => lockTrading("1h", "Blocage manuel")}
                  >
                    1h
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => lockTrading("eod", "Blocage manuel")}
                    title="Jusqu’à demain 00:00 (FR)"
                  >
                    Fin de journée
                  </Button>
                  <Button variant="danger" onClick={() => unlockTrading()}>
                    Débloquer
                  </Button>
                </div>

                <div className="mt-3 text-[11px] text-muted">
                  “Fin de journée” = jusqu’à 00:00 heure française.
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Blocage automatique
                </div>
                <div className="text-xs text-muted mt-1">
                  Déclenché par le Terminal/MT5.
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-[color:var(--text)] font-semibold">
                    Activer
                  </div>
                  <Button
                    variant={rules.autoBlockEnabled ? "primary" : "danger"}
                    onClick={() =>
                      patchPrefs({
                        rules: {
                          ...rules,
                          autoBlockEnabled: !rules.autoBlockEnabled,
                        },
                      })
                    }
                    disabled={!rules.enabled}
                  >
                    {rules.autoBlockEnabled ? "ON" : "OFF"}
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <CheckToggle
                    label="Après perte max atteinte"
                    value={rules.autoBlockOnDailyLoss}
                    disabled={!rules.enabled || !rules.autoBlockEnabled}
                    onToggle={() =>
                      patchPrefs({
                        rules: {
                          ...rules,
                          autoBlockOnDailyLoss: !rules.autoBlockOnDailyLoss,
                        },
                      })
                    }
                  />
                  <CheckToggle
                    label="Après objectif atteint"
                    value={rules.autoBlockOnProfitTarget}
                    disabled={!rules.enabled || !rules.autoBlockEnabled}
                    onToggle={() =>
                      patchPrefs({
                        rules: {
                          ...rules,
                          autoBlockOnProfitTarget: !rules.autoBlockOnProfitTarget,
                        },
                      })
                    }
                  />
                </div>

                <div className="mt-3">
                  <div className="text-xs text-muted mb-1">Durée</div>
                  <select
                    value={rules.autoBlockDuration}
                    onChange={(e) =>
                      patchPrefs({
                        rules: {
                          ...rules,
                          autoBlockDuration: e.target.value as BlockDuration,
                        },
                      })
                    }
                    disabled={!rules.enabled || !rules.autoBlockEnabled}
                    className="w-full rounded-xl border border-gold-soft bg-panel px-3 py-2 outline-none"
                  >
                    <option value="15m">15 minutes</option>
                    <option value="30m">30 minutes</option>
                    <option value="1h">1 heure</option>
                    <option value="eod">Fin de journée (00:00 FR)</option>
                  </select>

                  <div className="mt-2 text-[11px] text-muted">
                    Le Terminal appliquera ce blocage quand il détecte la limite atteinte.
                  </div>
                </div>
              </div>
            </div>
          </CardSubCard>
        </CardBody>
      </Card>

      {/* Thème */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-[color:var(--muted)]" />
            <div className="text-lg font-semibold">Thème</div>
          </div>

          <CardSubCard>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Mode
                </div>
                <div className="text-xs text-muted mt-1">
                  Dark / Light / Système
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={ui.theme === "dark" ? "primary" : "ghost"}
                  onClick={() => setTheme("dark")}
                >
                  Dark
                </Button>
                <Button
                  variant={ui.theme === "light" ? "primary" : "ghost"}
                  onClick={() => setTheme("light")}
                >
                  Light
                </Button>
                <Button
                  variant={ui.theme === "system" ? "primary" : "ghost"}
                  onClick={() => setTheme("system")}
                >
                  Système
                </Button>
              </div>
            </div>
          </CardSubCard>
        </CardBody>
      </Card>

      {/* Réinitialisation */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw size={18} className="text-[color:var(--muted)]" />
            <div className="text-lg font-semibold">Réinitialisation</div>
          </div>

          <CardSubCard>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Reset paramètres
                </div>
                <div className="text-xs text-muted mt-1">
                  Supprime ip_prefs_v1 + préférences publiques de profil.
                </div>
              </div>

              <Button variant="danger" onClick={resetAllPrefs}>
                Tout reset
              </Button>
            </div>
          </CardSubCard>
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------- Small components ----------------------------- */
function ToggleCard(props: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const disabled = !!props.disabled;
  return (
    <CardSubCard>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          props.onToggle();
        }}
        className={[
          "w-full text-left",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)] flex items-center justify-center">
            {props.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[color:var(--text)]">
                {props.title}
              </div>
              <span
                className={[
                  "text-[10px] px-2 py-0.5 rounded-full font-bold border",
                  props.value
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-200",
                ].join(" ")}
              >
                {props.value ? "ON" : "OFF"}
              </span>
            </div>
            <div className="text-xs text-muted mt-1">{props.desc}</div>
          </div>
        </div>
      </button>
    </CardSubCard>
  );
}

function FieldNumber(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-xs text-muted mb-1">{props.label}</div>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        placeholder={props.placeholder}
        disabled={!!props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value || 0))}
        className="w-full rounded-xl border border-gold-soft bg-panel px-3 py-2 outline-none disabled:opacity-60"
      />
    </div>
  );
}

function CheckToggle(props: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const disabled = !!props.disabled;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        props.onToggle();
      }}
      className={[
        "w-full px-3 py-2 rounded-xl border flex items-center justify-between gap-3 transition text-left",
        "bg-[color:var(--panel)] hover:bg-[color:var(--panel-2)]",
        props.value
          ? "border-[color:var(--gold-border)]"
          : "border-[color:var(--border)] opacity-80",
        disabled
          ? "opacity-60 cursor-not-allowed hover:bg-[color:var(--panel)]"
          : "",
      ].join(" ")}
    >
      <span className="text-sm text-[color:var(--text)]">{props.label}</span>
      <span
        className={[
          "text-[10px] px-2 py-0.5 rounded-full font-bold border",
          props.value
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
            : "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-200",
        ].join(" ")}
      >
        {props.value ? "ON" : "OFF"}
      </span>
    </button>
  );
}
