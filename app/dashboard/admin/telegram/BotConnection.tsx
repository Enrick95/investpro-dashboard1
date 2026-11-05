"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, Link2, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { vipRequest } from "@/lib/vip/client";
import s from "./TelegramAdmin.module.css";

type Status = {
  configured: boolean; environment: string;
  bot: { username: string | null; name: string | null } | null;
  webhook: { connected: boolean; pointsToSite: boolean; pending: number; lastError: string | null; missingUpdates: string[] } | null;
  channel: { configured: boolean; isAdmin: boolean; canInvite: boolean; canBan: boolean } | null;
  adminChatConfigured: boolean; problems: string[];
};

function Line({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <li className={s.botLine} data-ok={ok || undefined}>{ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}<span>{children}</span></li>;
}

/** État du bot Telegram et connexion au site, réservés au propriétaire. Aucun secret n’est affiché. */
export default function BotConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setStatus(await vipRequest<Status>("/api/admin/telegram/bot")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "État du bot indisponible."); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  async function act(action: "connect" | "test") {
    if (busy) return;
    setBusy(action); setNotice(""); setError("");
    try {
      const result = await vipRequest<{ ok: true; status?: Status }>("/api/admin/telegram/bot", { method: "POST", body: JSON.stringify({ action }) });
      if (result.status) setStatus(result.status);
      setNotice(action === "connect" ? "Bot connecté au site." : "Message de test envoyé : regarde ton Telegram.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action impossible."); }
    finally { setBusy(""); }
  }
  const ready = !!status?.configured && !!status.bot && !!status.webhook?.pointsToSite && !!status.channel?.isAdmin && status.problems.length === 0;
  return <section className={s.card + " " + s.wide}>
    <header><h3><Bot size={16} aria-hidden="true" /> Ton bot Telegram</h3><button type="button" className={s.ghost} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />Vérifier</button></header>
    {!status && !error && <p className={s.muted}><Loader2 size={14} className={s.spin} aria-hidden="true" /> Vérification du bot…</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {status && <>
      <div className={s.botHead} data-ready={ready || undefined}>
        <span>{ready ? "✅ Tout est prêt" : status.configured ? "⚙️ Encore quelques réglages" : "⏸️ Bot non branché ici"}</span>
        {status.bot?.username && <a className={s.chip} data-kind="tg" href={`https://t.me/${status.bot.username}`} target="_blank" rel="noreferrer">@{status.bot.username}</a>}
      </div>
      {status.configured && <ul className={s.botLines}>
        <Line ok={!!status.bot}>Telegram reconnaît le bot{status.bot?.name ? ` (${status.bot.name})` : ""}</Line>
        <Line ok={!!status.webhook?.pointsToSite && !status.webhook.missingUpdates.length}>Connecté au site investprotrading.fr</Line>
        <Line ok={!!status.channel?.isAdmin}>Administrateur du canal VIP</Line>
        <Line ok={!!status.channel?.canInvite}>Peut créer des liens d’invitation</Line>
        <Line ok={!!status.channel?.canBan}>Peut retirer les membres expirés</Line>
        <Line ok={status.adminChatConfigured}>Sait où t’envoyer les alertes</Line>
      </ul>}
      {status.problems.length > 0 && <div className={s.warnBox}><div><b>À faire :</b><ul>{status.problems.map(problem => <li key={problem}>{problem}</li>)}</ul></div></div>}
      {status.webhook?.lastError && <p className={s.muted}>Dernière erreur signalée par Telegram : {status.webhook.lastError}</p>}
      {status.configured && <div className={s.actionsRow}>
        <button type="button" className={s.primaryBtn} disabled={!!busy || !status.bot} onClick={() => void act("connect")}>{busy === "connect" ? <Loader2 size={14} className={s.spin} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}{status.webhook?.pointsToSite ? "Reconnecter le bot" : "Connecter le bot"}</button>
        <button type="button" className={s.ghost} disabled={!!busy || !status.bot} onClick={() => void act("test")}>{busy === "test" ? <Loader2 size={14} className={s.spin} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}M’envoyer un message test</button>
      </div>}
      {notice && <p className={s.notice} role="status">{notice}</p>}
    </>}
  </section>;
}
