"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, MonitorCog, Sparkles, WalletCards, X, CandlestickChart, ServerCog } from "lucide-react";

type Choice = "mt5" | "mt4" | "futures" | "tradelocker" | "ctrader" | "manual" | null;
type FuturePlatform = "projectx" | "tradovate" | "rithmic" | "other" | null;

type TradeLockerAccount = { accountId: string; accNum: number; name: string; currency: string; status: string; type: string };

type ProjectXAccount = {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
  isVisible: boolean;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findPilotPanel(): HTMLElement | null {
  // Connexions V2 : masque/révèle le bloc MetaSync COMPLET.
  // Il reste dans le DOM pour que "Ajouter un compte > MT4/MT5" puisse l'ouvrir,
  // mais il n'encombre plus "Mes comptes" par défaut.
  const v2Panel = document.querySelector<HTMLElement>(
    '[data-investpro-metasync-panel="true"]'
  );
  if (v2Panel) return v2Panel;

  // Fallback legacy : on ne cherche QUE parmi les <section>.
  // Cela évite de masquer par erreur le wrapper de toute la page.
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));

  const matches = sections.filter((section) => {
    const text = normalizeText(section.textContent);

    const directConnectForm =
      text.includes("connecter mon compte mt4 / mt5") &&
      (text.includes("numéro du compte") || text.includes("numero du compte")) &&
      text.includes("mot de passe investisseur") &&
      (text.includes("capital de départ") || text.includes("capital de depart")) &&
      text.includes("connecter mon compte");

    const pilotPanel =
      text.includes("synchronisation mt5") &&
      (text.includes("installation pilote") ||
        text.includes("créer / renouveler ma clé") ||
        text.includes("creer / renouveler ma cle") ||
        text.includes("renouveler ma clé de synchronisation") ||
        text.includes("renouveler ma cle de synchronisation"));

    return directConnectForm || pilotPanel;
  });

  if (matches.length === 0) return null;

  // Si plusieurs sections correspondent, on prend la plus petite :
  // c'est le formulaire lui-même, jamais le conteneur global de la page.
  matches.sort(
    (a, b) => normalizeText(a.textContent).length - normalizeText(b.textContent).length
  );

  return matches[0] ?? null;
}

function setPlatformInsidePanel(panel: HTMLElement, platform: "MT4" | "MT5") {
  // Essaie les select natifs.
  const selects = Array.from(panel.querySelectorAll<HTMLSelectElement>("select"));
  const platformSelect = selects.find((select) =>
    Array.from(select.options).some((option) =>
      normalizeText(option.textContent).includes(platform.toLowerCase())
    )
  );

  if (platformSelect) {
    const option = Array.from(platformSelect.options).find((item) =>
      normalizeText(item.textContent).includes(platform.toLowerCase())
    );
    if (option) {
      platformSelect.value = option.value;
      platformSelect.dispatchEvent(new Event("input", { bubbles: true }));
      platformSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  }

  // Fallback pour les composants custom : clique sur le contrôle proche du label Plateforme.
  const candidates = Array.from(panel.querySelectorAll<HTMLElement>("button, [role='combobox'], input"));
  const candidate = candidates.find((el) => {
    const parentText = normalizeText(el.parentElement?.textContent);
    const ownText = normalizeText(el.textContent || (el as HTMLInputElement).value);
    return parentText.includes("plateforme") && (ownText.includes("mt4") || ownText.includes("mt5"));
  });

  if (candidate) {
    candidate.click();
    window.setTimeout(() => {
      const options = Array.from(document.querySelectorAll<HTMLElement>("[role='option'], button, li, div"));
      const option = options.find((el) => normalizeText(el.textContent) === platform.toLowerCase());
      option?.click();
    }, 80);
  }
}


export default function ComptesMotionLayout({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [futurePlatform, setFuturePlatform] = useState<FuturePlatform>(null);
  const [pxUsername, setPxUsername] = useState("");
  const [pxApiKey, setPxApiKey] = useState("");
  const [pxAccounts, setPxAccounts] = useState<ProjectXAccount[]>([]);
  const [pxSelectedId, setPxSelectedId] = useState<number | null>(null);
  const [pxBusy, setPxBusy] = useState(false);
  const [pxError, setPxError] = useState<string | null>(null);
  const [pxConnected, setPxConnected] = useState(false);
  const [tlEmail, setTlEmail] = useState("");
  const [tlPassword, setTlPassword] = useState("");
  const [tlServer, setTlServer] = useState("");
  const [tlEnvironment, setTlEnvironment] = useState<"live" | "demo">("live");
  const [tlAccounts, setTlAccounts] = useState<TradeLockerAccount[]>([]);
  const [tlSelected, setTlSelected] = useState<string>("");
  const [tlBusy, setTlBusy] = useState(false);
  const [tlError, setTlError] = useState<string | null>(null);
  const [tlConnected, setTlConnected] = useState(false);
  const [ctraderBusy, setCtraderBusy] = useState(false);
  const [ctraderMessage, setCtraderMessage] = useState<string | null>(null);
  const bypassNextAddClick = useRef(false);
  const originalAddButton = useRef<HTMLElement | null>(null);
  const pilotPanel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function hidePilotPanel() {
      const panel = findPilotPanel();
      if (!panel) return;

      pilotPanel.current = panel;
      if (panel.dataset.ipPilotOpened !== "1") {
        panel.classList.add("ip-mt5-pilot-hidden");
      }
    }

    hidePilotPanel();

    const observer = new MutationObserver(() => hidePilotPanel());
    observer.observe(document.body, { childList: true, subtree: true });

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button, a") as HTMLElement | null;
      if (!button) return;

      const text = normalizeText(button.textContent);
      if (!text.includes("ajouter un compte") && !text.includes("ajouter mon premier compte")) {
        return;
      }

      if (bypassNextAddClick.current) {
        bypassNextAddClick.current = false;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      originalAddButton.current = button;
      setChoice(null);
      setChooserOpen(true);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, []);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = String(params.get("connect") || "").toLowerCase();

    if (!connect) return;

    // Nettoie l’URL immédiatement pour éviter de rouvrir le parcours au refresh.
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);

    if (connect === "projectx") {
      setChoice("futures");
      setFuturePlatform("projectx");
      setChooserOpen(true);
      return;
    }

    if (connect === "futures" || connect === "tradovate" || connect === "rithmic") {
      setChoice("futures");
      setFuturePlatform(
        connect === "tradovate"
          ? "tradovate"
          : connect === "rithmic"
            ? "rithmic"
            : null
      );
      setChooserOpen(true);
      return;
    }

    if (connect === "tradelocker") {
      setChoice("tradelocker");
      setChooserOpen(true);
      return;
    }

    if (connect === "ctrader") {
      setChoice("ctrader");
      setChooserOpen(true);
      return;
    }

    const connection = String(params.get("connection") || "").toLowerCase();
    const connectionStatus = String(params.get("status") || "").toLowerCase();
    if (connection === "ctrader") {
      setChoice("ctrader");
      setCtraderMessage(connectionStatus === "authorized" ? "Autorisation cTrader enregistrée ✓" : "La connexion cTrader n’a pas pu être finalisée.");
      setChooserOpen(true);
      return;
    }

    if (connect === "mt4" || connect === "mt5") {
      const platform = connect === "mt4" ? "MT4" : "MT5";

      if (window.matchMedia("(max-width: 767px)").matches) {
        window.location.replace(
          `/dashboard/connexions/metatrader?platform=${connect}`
        );
        return;
      }

      window.setTimeout(() => {
        revealMetaTrader(platform);
      }, 250);
    }
  }, []);

  useEffect(() => {
    if (!chooserOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [chooserOpen]);

  function openFutures() {
    setChoice("futures");
    setFuturePlatform(null);
  }

  function selectFuturePlatform(platform: FuturePlatform) {
    setFuturePlatform(platform);
    setPxError(null);
    setPxConnected(false);
    if (platform !== "projectx") {
      setPxAccounts([]);
      setPxSelectedId(null);
    }
  }

  async function getInvestProAccessToken() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Ta session InvestPro a expiré. Reconnecte-toi puis réessaie.");
    }
    return data.session.access_token;
  }

  async function projectXRequest(path: string, body: Record<string, unknown>) {
    const accessToken = await getInvestProAccessToken();
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Erreur serveur (${response.status}).`);
    }
    return data;
  }

  async function testProjectX() {
    if (!pxUsername.trim() || !pxApiKey.trim()) {
      setPxError("Renseigne ton username ProjectX et ta clé API.");
      return;
    }
    try {
      setPxBusy(true);
      setPxError(null);
      setPxConnected(false);
      setPxAccounts([]);
      setPxSelectedId(null);
      const data = await projectXRequest("/api/futures/projectx/accounts", {
        userName: pxUsername.trim(),
        apiKey: pxApiKey.trim(),
      });
      const list = Array.isArray(data.accounts) ? data.accounts : [];
      setPxAccounts(list);
      setPxSelectedId(list[0]?.id ?? null);
      if (list.length === 0) setPxError("Connexion réussie, mais aucun compte ProjectX actif n’a été trouvé.");
    } catch (error: any) {
      setPxError(String(error?.message || error));
    } finally {
      setPxBusy(false);
    }
  }

  async function connectProjectX() {
    if (!pxSelectedId) {
      setPxError("Choisis le compte ProjectX à ajouter.");
      return;
    }
    try {
      setPxBusy(true);
      setPxError(null);
      await projectXRequest("/api/futures/projectx/connect", {
        userName: pxUsername.trim(),
        apiKey: pxApiKey.trim(),
        accountId: pxSelectedId,
      });
      setPxConnected(true);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error: any) {
      setPxError(String(error?.message || error));
    } finally {
      setPxBusy(false);
    }
  }

  async function tradeLockerRequest(path: string, body: Record<string, unknown>) {
    const accessToken = await getInvestProAccessToken();
    const response = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Erreur serveur (${response.status}).`);
    return data;
  }

  async function testTradeLocker() {
    if (!tlEmail.trim() || !tlPassword || !tlServer.trim()) { setTlError("Renseigne ton e-mail, ton mot de passe et ton serveur TradeLocker."); return; }
    try {
      setTlBusy(true); setTlError(null); setTlConnected(false); setTlAccounts([]); setTlSelected("");
      const data = await tradeLockerRequest("/api/connections/tradelocker/test", { email: tlEmail.trim(), password: tlPassword, server: tlServer.trim(), environment: tlEnvironment });
      const list = Array.isArray(data.accounts) ? data.accounts : [];
      setTlAccounts(list); setTlSelected(list[0]?.accountId ? `${list[0].accountId}:${list[0].accNum}` : "");
      if (!list.length) setTlError("Connexion réussie mais aucun compte TradeLocker n’a été trouvé.");
    } catch(error:any) { setTlError(String(error?.message || error)); }
    finally { setTlBusy(false); }
  }

  async function connectTradeLocker() {
    const selected = tlAccounts.find((item) => `${item.accountId}:${item.accNum}` === tlSelected);
    if (!selected) { setTlError("Choisis le compte TradeLocker à ajouter."); return; }
    try {
      setTlBusy(true); setTlError(null);
      await tradeLockerRequest("/api/connections/tradelocker/connect", { email: tlEmail.trim(), password: tlPassword, server: tlServer.trim(), environment: tlEnvironment, account: selected });
      setTlConnected(true); window.setTimeout(() => window.location.reload(), 900);
    } catch(error:any) { setTlError(String(error?.message || error)); }
    finally { setTlBusy(false); }
  }

  async function startCTrader() {
    try {
      setCtraderBusy(true); setCtraderMessage(null);
      const accessToken = await getInvestProAccessToken();
      const response = await fetch("/api/connections/ctrader/start", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ returnTo: "/dashboard/comptes" }) });
      const data = await response.json();
      if (!response.ok || !data?.ok || !data?.url) throw new Error(data?.error || "Connexion cTrader impossible.");
      window.location.href = data.url;
    } catch(error:any) { setCtraderMessage(String(error?.message || error)); setCtraderBusy(false); }
  }

  function chooseManual() {
    setChoice("manual");
    setChooserOpen(false);

    const button = originalAddButton.current;
    if (!button) return;

    bypassNextAddClick.current = true;
    window.setTimeout(() => button.click(), 40);
  }

  function revealMetaTrader(platform: "MT4" | "MT5") {
    setChoice(platform === "MT5" ? "mt5" : "mt4");
    setChooserOpen(false);

    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    // MOBILE / PWA :
    // route dédiée = parcours fiable, sans dépendre du panneau caché de Mes comptes.
    if (isMobile) {
      window.setTimeout(() => {
        window.location.assign(
          `/dashboard/connexions/metatrader?platform=${platform.toLowerCase()}`
        );
      }, 80);
      return;
    }

    // DESKTOP :
    // on conserve le fonctionnement historique dans "Mes comptes",
    // afin de garder toutes les sections situées juste en dessous.
    let attempt = 0;

    const reveal = () => {
      const panel = pilotPanel.current || findPilotPanel();

      if (!panel) {
        attempt += 1;
        if (attempt <= 15) {
          window.setTimeout(reveal, 100);
        }
        return;
      }

      pilotPanel.current = panel;
      panel.dataset.ipPilotOpened = "1";
      panel.classList.remove("ip-mt5-pilot-hidden");
      panel.classList.add("ip-mt5-pilot-reveal");
      setPlatformInsidePanel(panel, platform);

      window.requestAnimationFrame(() => {
        panel.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });

      window.setTimeout(
        () => panel.classList.remove("ip-mt5-pilot-reveal"),
        850
      );
    };

    window.setTimeout(reveal, 120);
  }

  function chooseMt5() {
    revealMetaTrader("MT5");
  }

  function chooseMt4() {
    revealMetaTrader("MT4");
  }

  return (
    <motion.div
      className="accounts-motion-scope relative isolate"
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.994 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 145, damping: 22, mass: 0.75 }}
    >
      {!reduceMotion ? (
        <>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed right-[8%] top-[12%] -z-10 h-[420px] w-[420px] rounded-full bg-[color:var(--gold)] blur-[150px]"
            animate={{ opacity: [0.02, 0.065, 0.02], scale: [0.96, 1.1, 0.96] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed bottom-[5%] left-[24%] -z-10 h-[300px] w-[300px] rounded-full bg-[color:var(--gold)] blur-[160px]"
            animate={{ opacity: [0.012, 0.04, 0.012], x: [0, 36, 0], y: [0, -18, 0] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      ) : null}

      {children}

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {chooserOpen ? (
          <motion.div
            className="fixed inset-0 z-[2147483000] flex items-end justify-center overflow-hidden bg-black/[0.92] p-0 backdrop-blur-md sm:items-center sm:p-4"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setChooserOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Ajouter un compte"
              className="relative flex h-[calc(100dvh-env(safe-area-inset-top))] max-h-[100dvh] w-full max-w-[920px] flex-col overflow-hidden rounded-none border border-[color:var(--gold-border)] bg-[#0b0d0b] shadow-[0_30px_120px_rgba(0,0,0,.72)] sm:h-auto sm:max-h-[90dvh] sm:rounded-[28px]"
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
              transition={{ type: "spring", stiffness: 240, damping: 25 }}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[-190px] h-[390px] w-[540px] -translate-x-1/2 rounded-full bg-[color:var(--gold)] blur-[130px]"
                animate={reduceMotion ? undefined : { opacity: [0.05, 0.11, 0.05], scale: [0.94, 1.07, 0.94] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
              />

              <div className="relative z-20 shrink-0 border-b border-white/[0.07] bg-[#0b0d0b]/96 px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5 md:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--gold)] sm:text-[10px]">
                      <Sparkles size={12} />
                      Connexion InvestPro
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-white sm:text-xl md:text-2xl">
                      {choice === "futures" ? (
                        <>Ajouter un compte <span className="text-[color:var(--gold)]">Futures</span></>
                      ) : (
                        <>Ajouter un <span className="text-[color:var(--gold)]">compte</span></>
                      )}
                    </h2>
                    <p className="mt-1.5 max-w-xl text-[10px] leading-4 text-white/45 sm:text-xs sm:leading-5 md:text-sm">
                      {choice === "futures"
                        ? "Choisis la plateforme Futures utilisée par ton compte."
                        : "Choisis comment tu souhaites ajouter ton compte de trading."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setChooserOpen(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white sm:h-10 sm:w-10"
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>

              <div className="ip-account-modal-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5 pb-[calc(28px+env(safe-area-inset-bottom))] sm:p-5 md:p-7">
                <AnimatePresence mode="wait" initial={false}>
                  {choice !== "futures" && choice !== "tradelocker" && choice !== "ctrader" ? (
                    <motion.div
                      key="account-types"
                      initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3"
                    >
                      <ChoiceCard
                        title="MetaTrader 5"
                        subtitle="MT5"
                        text="Synchronisation automatique du compte, de la balance et de l’historique."
                        icon={<MonitorCog size={24} />}
                        onClick={chooseMt5}
                      />

                      <ChoiceCard
                        title="MetaTrader 4"
                        subtitle="MT4"
                        text="Synchronisation automatique du compte, de la balance et de l’historique."
                        icon={<MonitorCog size={24} />}
                        onClick={chooseMt4}
                      />

                      <ChoiceCard
                        title="Futures"
                        subtitle="FUTURES"
                        text="Connecte une plateforme Futures pour alimenter ton journal et tes statistiques."
                        icon={<CandlestickChart size={24} />}
                        onClick={openFutures}
                      />

                      <ChoiceCard
                        title="TradeLocker"
                        subtitle="TRADELOCKER"
                        text="Connecte un compte TradeLocker via l’API officielle REST."
                        icon={<ServerCog size={24} />}
                        onClick={() => { setChoice("tradelocker"); setTlError(null); }}
                      />

                      <ChoiceCard
                        title="cTrader"
                        subtitle="CTRADER"
                        text="Autorisation sécurisée via cTrader Open API en lecture seule."
                        icon={<ServerCog size={24} />}
                        onClick={() => { setChoice("ctrader"); setCtraderMessage(null); }}
                      />

                      <ChoiceCard
                        title="Compte manuel"
                        subtitle="MANUEL"
                        text="Ajoute un compte sans synchronisation et renseigne toi-même le capital."
                        icon={<WalletCards size={24} />}
                        onClick={chooseManual}
                      />
                    </motion.div>
                  ) : choice === "tradelocker" ? (
                    <motion.div key="tradelocker" initial={reduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                      <button type="button" onClick={() => setChoice(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-[color:var(--gold-border)] hover:text-[color:var(--gold)]"><ArrowLeft size={14}/>Retour</button>
                      <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 sm:p-5">
                        <div className="text-sm font-semibold text-white">Connecter TradeLocker</div>
                        <p className="mt-1 text-[10px] leading-5 text-white/45">InvestPro teste l’API officielle puis chiffre les identifiants côté serveur. L’intention est lecture seule : aucun ordre n’est envoyé par ce connecteur.</p>
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label><span className="mb-1.5 block text-[10px] text-white/65">Environnement</span><select value={tlEnvironment} onChange={e=>setTlEnvironment(e.target.value as "live"|"demo")} className="h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm text-white"><option value="live">Live</option><option value="demo">Demo</option></select></label>
                          <label><span className="mb-1.5 block text-[10px] text-white/65">Serveur TradeLocker</span><input value={tlServer} onChange={e=>setTlServer(e.target.value)} placeholder="Nom exact du serveur" className="h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]"/></label>
                          <label><span className="mb-1.5 block text-[10px] text-white/65">E-mail TradeLocker</span><input type="email" value={tlEmail} onChange={e=>setTlEmail(e.target.value)} placeholder="trader@email.com" autoComplete="username" className="h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]"/></label>
                          <label><span className="mb-1.5 block text-[10px] text-white/65">Mot de passe</span><input type="password" value={tlPassword} onChange={e=>setTlPassword(e.target.value)} placeholder="Mot de passe TradeLocker" autoComplete="current-password" className="h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]"/></label>
                        </div>
                        <button type="button" onClick={testTradeLocker} disabled={tlBusy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-bold text-black disabled:opacity-50">{tlBusy?"Connexion...":"Tester la connexion"}<ArrowRight size={14}/></button>
                        {tlError?<div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[.06] px-3 py-2 text-[10px] text-red-300">{tlError}</div>:null}
                        {tlAccounts.length?<div className="mt-4 space-y-2"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--gold)]">Choisis ton compte</div>{tlAccounts.map(account=><button key={`${account.accountId}:${account.accNum}`} type="button" onClick={()=>setTlSelected(`${account.accountId}:${account.accNum}`)} className={["flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left",tlSelected===`${account.accountId}:${account.accNum}`?"border-[color:var(--gold-border)] bg-black/30":"border-white/[.07] bg-black/15"].join(" ")}><div><div className="text-xs font-semibold text-white">{account.name}</div><div className="mt-1 text-[9px] text-white/35">ID {account.accountId} · {account.type} · {account.status}</div></div><div className="text-[10px] font-semibold text-white">{account.currency}</div></button>)}<button type="button" onClick={connectTradeLocker} disabled={tlBusy||!tlSelected} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] text-xs font-bold text-black disabled:opacity-50">{tlConnected?"Compte ajouté ✓":"Ajouter ce compte à InvestPro"}<ArrowRight size={14}/></button></div>:null}
                      </div>
                    </motion.div>
                  ) : choice === "ctrader" ? (
                    <motion.div key="ctrader" initial={reduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                      <button type="button" onClick={() => setChoice(null)} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-[color:var(--gold-border)] hover:text-[color:var(--gold)]"><ArrowLeft size={14}/>Retour</button>
                      <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-5">
                        <div className="text-sm font-semibold text-white">Connecter cTrader</div>
                        <p className="mt-2 text-[10px] leading-5 text-white/45">cTrader utilise OAuth 2.0. InvestPro demande uniquement le scope <b className="text-white/70">accounts</b> (lecture seule), donc le connecteur ne peut pas envoyer d’ordres.</p>
                        <div className="mt-4 rounded-xl border border-white/[.07] bg-black/20 p-3 text-[10px] leading-5 text-white/45">La première autorisation nécessite une application cTrader Open API approuvée et trois variables Vercel. Après l’autorisation, les tokens sont chiffrés avec la clé serveur déjà utilisée pour les connexions Futures.</div>
                        {ctraderMessage?<div className="mt-3 rounded-xl border border-[color:var(--gold-border)] bg-black/20 px-3 py-2 text-[10px] text-[color:var(--gold)]">{ctraderMessage}</div>:null}
                        <button type="button" onClick={startCTrader} disabled={ctraderBusy} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-bold text-black disabled:opacity-50">{ctraderBusy?"Ouverture...":"Autoriser cTrader"}<ArrowRight size={14}/></button>
                        <p className="mt-3 text-[9px] leading-4 text-white/30">L’autorisation OAuth est incluse dans ce pack. La synchro historique temps réel cTrader utilise un WebSocket persistant (port JSON 5036) et sera activée lorsque le worker cTrader sera déployé.</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="futures-platforms"
                      initial={reduceMotion ? false : { opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setChoice(null);
                          setFuturePlatform(null);
                        }}
                        className="mb-3 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/70 hover:border-[color:var(--gold-border)] hover:text-[color:var(--gold)] sm:mb-5"
                      >
                        <ArrowLeft size={14} />
                        Retour
                      </button>

                      <div className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-2">
                        <FuturePlatformCard
                          title="ProjectX"
                          subtitle="PROJECTX"
                          text="Pour les environnements compatibles ProjectX et certaines prop firms Futures."
                          selected={futurePlatform === "projectx"}
                          onClick={() => selectFuturePlatform("projectx")}
                        />
                        <FuturePlatformCard
                          title="Tradovate"
                          subtitle="TRADOVATE"
                          text="Connexion Futures Tradovate pour récupérer l’activité du compte."
                          selected={futurePlatform === "tradovate"}
                          onClick={() => selectFuturePlatform("tradovate")}
                        />
                        <FuturePlatformCard
                          title="Rithmic"
                          subtitle="RITHMIC"
                          text="Pour les comptes et prop firms utilisant l’infrastructure Rithmic."
                          selected={futurePlatform === "rithmic"}
                          onClick={() => selectFuturePlatform("rithmic")}
                        />
                        <FuturePlatformCard
                          title="Autre plateforme"
                          subtitle="AUTRE"
                          text="Prépare ton compte pour une plateforme Futures qui n’est pas encore listée."
                          selected={futurePlatform === "other"}
                          onClick={() => selectFuturePlatform("other")}
                        />
                      </div>

                      {futurePlatform === "projectx" ? (
                        <motion.div
                          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 sm:mt-5 sm:p-5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)]">
                              <ServerCog size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-white">Connecter ProjectX</div>
                              <p className="mt-1 text-[10px] leading-4 text-white/50 sm:text-[11px] sm:leading-5">
                                Utilise ton username de plateforme ProjectX et une clé API. Le mot de passe de trading n’est pas demandé.
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-medium text-white/65">Username ProjectX</span>
                              <input
                                value={pxUsername}
                                onChange={(event) => setPxUsername(event.target.value)}
                                placeholder="Ex. enrick95"
                                autoComplete="username"
                                className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]"
                              />
                            </label>

                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-medium text-white/65">Clé API ProjectX</span>
                              <input
                                type="password"
                                value={pxApiKey}
                                onChange={(event) => setPxApiKey(event.target.value)}
                                placeholder="Colle ta clé API"
                                autoComplete="off"
                                className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]"
                              />
                            </label>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={testProjectX}
                              disabled={pxBusy}
                              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {pxBusy ? "Connexion..." : "Tester la connexion"}
                              <ArrowRight size={14} />
                            </button>
                            <span className="text-[9px] leading-4 text-white/35">Lecture seule côté InvestPro · aucun ordre n’est envoyé.</span>
                          </div>

                          {pxError ? (
                            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[10px] leading-4 text-red-300">
                              {pxError}
                            </div>
                          ) : null}

                          {pxAccounts.length > 0 ? (
                            <div className="mt-4">
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">Choisis ton compte</div>
                              <div className="space-y-2">
                                {pxAccounts.map((account) => (
                                  <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => setPxSelectedId(account.id)}
                                    className={[
                                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left",
                                      pxSelectedId === account.id
                                        ? "border-[color:var(--gold-border)] bg-black/30"
                                        : "border-white/[0.07] bg-black/15 hover:border-white/[0.13]",
                                    ].join(" ")}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-semibold text-white">{account.name}</div>
                                      <div className="mt-0.5 text-[9px] text-white/40">ID {account.id} · {account.canTrade ? "Actif" : "Lecture seule"}</div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-xs font-semibold text-white">{Number(account.balance || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $</div>
                                      <div className="mt-0.5 text-[8px] text-white/35">Balance</div>
                                    </div>
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={connectProjectX}
                                disabled={pxBusy || !pxSelectedId}
                                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                              >
                                {pxConnected ? "Compte ajouté ✓" : pxBusy ? "Ajout..." : "Ajouter ce compte à InvestPro"}
                                {!pxConnected ? <ArrowRight size={14} /> : null}
                              </button>
                            </div>
                          ) : null}
                        </motion.div>
                      ) : futurePlatform ? (
                        <motion.div
                          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 sm:mt-5 sm:p-5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)]">
                              <ServerCog size={18} />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white">Connexion en préparation</div>
                              <p className="mt-1 text-[10px] leading-4 text-white/50 sm:text-[11px] sm:leading-5">
                                ProjectX est le premier connecteur Futures activé. Tradovate sera branché ensuite ; Rithmic et les autres plateformes restent disponibles pour la suite.
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}

      <style jsx global>{`
        .ip-mt5-pilot-hidden {
          display: none !important;
        }

        .ip-mt5-pilot-reveal {
          animation: ipPilotReveal 760ms cubic-bezier(.2,.8,.2,1) both;
        }

        @keyframes ipPilotReveal {
          0% { opacity: 0; transform: translateY(22px) scale(.985); filter: brightness(.9); }
          55% { opacity: 1; transform: translateY(-2px) scale(1.004); filter: brightness(1.08); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }

        .accounts-motion-scope > div > section,
        .accounts-motion-scope main section {
          transition:
            transform 260ms cubic-bezier(.2,.8,.2,1),
            border-color 260ms ease,
            box-shadow 260ms ease,
            background-color 260ms ease;
        }

        .accounts-motion-scope > div > section:hover,
        .accounts-motion-scope main section:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--gold) 34%, transparent);
          box-shadow: 0 20px 64px rgba(0,0,0,.22), 0 0 30px color-mix(in srgb, var(--gold) 7%, transparent);
        }

        .accounts-motion-scope button,
        .accounts-motion-scope a {
          transition:
            transform 180ms cubic-bezier(.2,.8,.2,1),
            box-shadow 180ms ease,
            filter 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease !important;
        }

        .accounts-motion-scope button:hover,
        .accounts-motion-scope a:hover {
          transform: translateY(-2px);
        }

        .accounts-motion-scope button:active,
        .accounts-motion-scope a:active {
          transform: translateY(0) scale(.98);
        }

        .ip-account-modal-scroll {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          touch-action: pan-y;
        }

        @media (max-width: 639px) {
          .ip-account-modal-scroll {
            scrollbar-width: none;
          }
          .ip-account-modal-scroll::-webkit-scrollbar {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .accounts-motion-scope *,
          .accounts-motion-scope *::before,
          .accounts-motion-scope *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </motion.div>
  );
}

function ChoiceCard({
  title,
  subtitle,
  text,
  icon,
  onClick,
  eyebrow,
  highlighted = false,
}: {
  title: string;
  subtitle: string;
  text: string;
  icon: ReactNode;
  onClick: () => void;
  eyebrow?: string;
  highlighted?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -7, scale: 1.012 }}
      whileTap={{ scale: 0.985 }}
      className={[
        "group relative min-h-0 overflow-hidden rounded-[18px] border p-4 text-left sm:rounded-[22px] sm:p-5 md:min-h-[220px]",
        highlighted
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.08] bg-black/25 hover:border-[color:var(--gold-border)]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute right-[-55px] top-[-55px] h-[150px] w-[150px] rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[55px] transition-opacity group-hover:opacity-[0.12]" />

      <div className="relative z-10 grid grid-cols-[44px_1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:h-full sm:flex-col sm:items-stretch sm:gap-0">
        <div className="contents sm:flex sm:items-start sm:justify-between sm:gap-3">
          <div className="row-span-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)] shadow-[0_0_30px_rgba(255,190,60,.05)] sm:h-12 sm:w-12 sm:rounded-2xl">
            {icon}
          </div>

          {eyebrow ? (
            <span className="rounded-full border border-[color:var(--gold-border)] bg-black/25 px-2.5 py-1 text-[8px] font-bold tracking-[0.1em] text-[color:var(--gold)]">
              {eyebrow}
            </span>
          ) : null}
        </div>

        <div className="col-start-2 mt-0 text-[8px] font-bold uppercase tracking-[0.16em] text-[color:var(--gold)] sm:mt-7 sm:text-[9px] sm:tracking-[0.18em]">{subtitle}</div>
        <div className="col-start-2 mt-0 text-sm font-semibold text-white sm:mt-1 sm:text-base">{title}</div>
        <p className="col-start-2 mt-0 line-clamp-2 text-[10px] leading-4 text-white/45 sm:mt-3 sm:flex-1 sm:text-[11px] sm:leading-5">{text}</p>

        <div className="col-start-3 row-span-4 row-start-1 mt-0 flex items-center gap-1 text-[11px] font-semibold text-white transition-colors group-hover:text-[color:var(--gold)] sm:mt-5 sm:gap-2 sm:text-xs">
          {subtitle === "MANUEL" ? "Ajouter" : "Connecter"}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}

function FuturePlatformCard({
  title,
  subtitle,
  text,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  text: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.008 }}
      whileTap={{ scale: 0.988 }}
      className={[
        "group relative overflow-hidden rounded-[18px] border p-4 text-left sm:rounded-[22px] sm:p-5",
        selected
          ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
          : "border-white/[0.08] bg-black/25 hover:border-[color:var(--gold-border)]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute right-[-45px] top-[-55px] h-[140px] w-[140px] rounded-full bg-[color:var(--gold)] opacity-[0.05] blur-[50px] transition-opacity group-hover:opacity-[0.11]" />
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/25 text-[color:var(--gold)]">
          <CandlestickChart size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-[color:var(--gold)]">{subtitle}</div>
          <div className="mt-0.5 text-sm font-semibold text-white sm:text-base">{title}</div>
          <p className="mt-1 text-[10px] leading-4 text-white/45 sm:text-[11px] sm:leading-5">{text}</p>
        </div>
        <ArrowRight size={15} className="shrink-0 text-white/45 transition-transform group-hover:translate-x-1 group-hover:text-[color:var(--gold)]" />
      </div>
    </motion.button>
  );
}

