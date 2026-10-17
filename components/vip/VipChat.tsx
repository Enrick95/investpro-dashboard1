"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ChevronUp, LockKeyhole, MessageCircle, RefreshCw, Send, ShieldCheck, Trash2 } from "lucide-react";
import { VipApiError, vipRequest } from "@/lib/vip/client";
import s from "./VipChat.module.css";

type ChatMessage = { id: string; body: string; authorId: string; authorName: string; createdAt: string; own: boolean; adminAuthor: boolean };
type ChatPage = { messages: ChatMessage[]; nextCursor: string | null; canModerate: boolean };
type ScrollPosition = { bottom: true } | { bottom: false; id?: string; offset: number; top: number };
const maxPages = 3;
const maxLength = 2000;

function messageOrder(a: ChatMessage, b: ChatMessage) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
function uniqueMessages(messages: ChatMessage[]) {
  return [...new Map(messages.map(message => [message.id, message])).values()].sort(messageOrder).slice(-120);
}
function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function clientId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  return [...bytes].map((value, index) => `${[4, 6, 8, 10].includes(index) ? "-" : ""}${value.toString(16).padStart(2, "0")}`).join("");
}

export default function VipChat({ userId, admin, locale }: { userId: string; admin: boolean; locale: "fr" | "en" }) {
  const en = locale === "en";
  const label = useCallback((fr: string, english: string) => en ? english : fr, [en]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pages, setPages] = useState(1);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [blocked, setBlocked] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const scrollArea = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pagesRef = useRef(1);
  const initialized = useRef(false);
  const nearBottom = useRef(true);
  const pendingScroll = useRef<ScrollPosition | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const generation = useRef(0);
  const readVersion = useRef(0);
  const activeRead = useRef<AbortController | null>(null);
  const refreshing = useRef(false);
  const blockedRef = useRef<number | null>(null);
  const retryMessage = useRef<{ text: string; id: string } | null>(null);
  const retryAction = useRef<{ kind: "send" } | { kind: "delete"; id: string } | null>(null);
  const composerId = useId();
  const hintId = useId();

  const captureScroll = useCallback((bottom = false) => {
    const area = scrollArea.current;
    if (!area) return;
    if (bottom || nearBottom.current) { pendingScroll.current = { bottom: true }; return; }
    const areaTop = area.getBoundingClientRect().top;
    const firstVisible = [...area.querySelectorAll<HTMLElement>("[data-chat-message]")].find(element => element.getBoundingClientRect().bottom >= areaTop);
    pendingScroll.current = { bottom: false, id: firstVisible?.dataset.chatMessage, offset: firstVisible ? firstVisible.getBoundingClientRect().top - areaTop : 0, top: area.scrollTop };
  }, []);

  const revoke = useCallback((code: number) => {
    generation.current += 1;
    readVersion.current += 1; activeRead.current = null; refreshing.current = false;
    controllers.current.forEach(controller => controller.abort()); controllers.current.clear();
    blockedRef.current = code; messagesRef.current = []; retryMessage.current = null; retryAction.current = null;
    setBlocked(code); setMessages([]); setDraft(""); setCanModerate(false); setConfirmDelete(null); setNextCursor(null); setUnread(0); setStatus("");
    setError(code === 401 ? label("Votre session a expiré. Reconnectez-vous pour accéder au chat.", "Your session has expired. Sign in again to access the chat.") : label("Votre accès au chat VIP n’est plus actif. Contactez l’équipe si nécessaire.", "Your VIP chat access is no longer active. Contact the team if needed."));
    setLoading(false); setHistoryBusy(false); setSending(false); setDeleting(null);
  }, [label]);

  const showError = useCallback((cause: unknown, fallback: string) => {
    if (cause instanceof VipApiError && (cause.status === 401 || cause.status === 403)) { revoke(cause.status); return; }
    setError(cause instanceof VipApiError && cause.status === 429
      ? label("Patientez quelques instants avant de réessayer. Vos messages ne sont pas perdus.", "Please wait a moment before trying again. Your draft has been kept.")
      : fallback);
  }, [label, revoke]);

  const refresh = useCallback(async (requestedPages?: number, manual = false) => {
    if (refreshing.current || (blockedRef.current && !manual)) return;
    refreshing.current = true;
    const version = generation.current;
    const read = ++readVersion.current;
    const controller = new AbortController(); controllers.current.add(controller);
    activeRead.current = controller;
    const depth = Math.min(requestedPages ?? pagesRef.current, maxPages);
    if (requestedPages) setHistoryBusy(true);
    try {
      let cursor: string | null = null;
      let result: ChatPage | null = null;
      let combined: ChatMessage[] = [];
      let loadedPages = 0;
      for (let page = 0; page < depth; page++) {
        result = await vipRequest<ChatPage>(`/api/vip/chat${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`, { signal: controller.signal });
        combined = [...result.messages, ...combined]; cursor = result.nextCursor; loadedPages += 1;
        if (!cursor) break;
      }
      if (controller.signal.aborted || version !== generation.current || read !== readVersion.current || !result) return;
      const next = uniqueMessages(combined);
      const known = new Set(messagesRef.current.map(message => message.id));
      const last = messagesRef.current.at(-1);
      const fresh = initialized.current && last ? next.filter(message => !known.has(message.id) && !message.own && messageOrder(message, last) > 0).length : 0;
      captureScroll(!initialized.current);
      if (fresh && !nearBottom.current) setUnread(value => value + fresh);
      if (nearBottom.current) setUnread(0);
      initialized.current = true; messagesRef.current = next; pagesRef.current = loadedPages;
      blockedRef.current = null;
      setMessages(next); setNextCursor(cursor); setPages(loadedPages); setCanModerate(result.canModerate); setBlocked(null);
      if (!retryAction.current) setError("");
    } catch (cause) {
      if (!controller.signal.aborted && version === generation.current && read === readVersion.current && (!retryAction.current || (cause instanceof VipApiError && [401, 403].includes(cause.status)))) showError(cause, label("Impossible d’actualiser le chat. Réessayez dans un instant.", "The chat could not be refreshed. Please try again shortly."));
    } finally {
      controllers.current.delete(controller);
      if (read === readVersion.current) {
        refreshing.current = false; activeRead.current = null;
        if (version === generation.current && !controller.signal.aborted) { setLoading(false); setHistoryBusy(false); }
      }
    }
  }, [captureScroll, label, showError]);

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    const version = ++generation.current;
    const requests = controllers.current;
    void refreshRef.current();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refreshRef.current(); };
    const timer = window.setInterval(visibleRefresh, 5000);
    window.addEventListener("focus", visibleRefresh); document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      if (generation.current === version) generation.current += 1;
      readVersion.current += 1; refreshing.current = false; activeRead.current = null;
      requests.forEach(controller => controller.abort()); requests.clear();
      window.clearInterval(timer); window.removeEventListener("focus", visibleRefresh); document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [userId]);

  function invalidateRead() {
    // A poll started before a successful mutation must never restore deleted text or drop a confirmed message.
    readVersion.current += 1; activeRead.current?.abort(); activeRead.current = null; refreshing.current = false;
    setHistoryBusy(false);
  }

  useLayoutEffect(() => {
    const area = scrollArea.current; const position = pendingScroll.current;
    if (!area || !position) return;
    pendingScroll.current = null;
    if (position.bottom) { area.scrollTop = area.scrollHeight; nearBottom.current = true; return; }
    const anchor = [...area.querySelectorAll<HTMLElement>("[data-chat-message]")].find(element => element.dataset.chatMessage === position.id);
    area.scrollTop = anchor ? area.scrollTop + anchor.getBoundingClientRect().top - area.getBoundingClientRect().top - position.offset : position.top;
  }, [messages]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || text.length > maxLength || sending || loading || blockedRef.current) return;
    const version = generation.current;
    const controller = new AbortController(); controllers.current.add(controller);
    retryAction.current = null; setSending(true); setError(""); setStatus("");
    try {
      if (!retryMessage.current || retryMessage.current.text !== text) retryMessage.current = { text, id: clientId() };
      const result = await vipRequest<{ message: ChatMessage }>("/api/vip/chat", { method: "POST", body: JSON.stringify({ text, clientId: retryMessage.current.id }), signal: controller.signal });
      if (controller.signal.aborted || version !== generation.current) return;
      invalidateRead();
      captureScroll(true);
      const next = uniqueMessages([...messagesRef.current, result.message]); messagesRef.current = next; setMessages(next);
      setDraft(value => value.trim() === text ? "" : value); retryMessage.current = null;
      setUnread(0); setStatus(label("Message envoyé.", "Message sent.")); input.current?.focus();
      void refresh();
    } catch (cause) {
      if (!controller.signal.aborted && version === generation.current) { retryAction.current = { kind: "send" }; showError(cause, label("Votre message n’a pas été confirmé. Réessayez : le texte est conservé.", "Your message could not be confirmed. Your draft has been kept; please try again.")); }
    } finally { controllers.current.delete(controller); if (version === generation.current && !controller.signal.aborted) setSending(false); }
  }

  async function deleteMessage(id: string) {
    if (deleting || blockedRef.current) return;
    const version = generation.current;
    const controller = new AbortController(); controllers.current.add(controller);
    retryAction.current = null; setDeleting(id); setError(""); setStatus("");
    try {
      await vipRequest<{ ok: boolean }>(`/api/vip/chat/${encodeURIComponent(id)}`, { method: "DELETE", signal: controller.signal });
      if (controller.signal.aborted || version !== generation.current) return;
      invalidateRead();
      captureScroll(); const next = messagesRef.current.filter(message => message.id !== id); messagesRef.current = next; setMessages(next); setConfirmDelete(null);
      setStatus(label("Message supprimé.", "Message deleted.")); void refresh();
    } catch (cause) {
      if (!controller.signal.aborted && version === generation.current) { retryAction.current = { kind: "delete", id }; showError(cause, label("Impossible de supprimer ce message. Réessayez.", "This message could not be deleted. Please try again.")); }
    } finally { controllers.current.delete(controller); if (version === generation.current && !controller.signal.aborted) setDeleting(null); }
  }

  const dateFormat = new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });
  const timeFormat = new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  return <section className={s.chat} aria-label={label("Chat des membres VIP", "VIP member chat")}>
    <header className={s.header}>
      <span className={s.chatIcon}><MessageCircle size={20} aria-hidden="true" /></span>
      <div><h2>{label("Entre membres.", "Together, as members.")}</h2><p><LockKeyhole size={11} aria-hidden="true" />{label("Chat privé · Membres VIP", "Private chat · VIP members")}</p></div>
      <button type="button" className={s.iconButton} onClick={() => void refresh(undefined, true)} disabled={loading || historyBusy} aria-label={label("Actualiser le chat", "Refresh chat")} title={label("Actualiser le chat", "Refresh chat")}><RefreshCw size={17} aria-hidden="true" /></button>
    </header>
    <p className={s.welcome}>{label("Un espace pour échanger, poser vos questions et avancer ensemble. Restons respectueux et ne partageons pas d’informations personnelles.", "A space to exchange ideas, ask questions and move forward together. Please be respectful and keep personal information private.")}</p>
    <div className={s.conversation}>
      <div ref={scrollArea} className={s.messages} tabIndex={0} aria-label={label("Messages du groupe", "Group messages")} aria-busy={loading || historyBusy} onScroll={() => {
        const area = scrollArea.current; if (!area) return;
        nearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 70;
        if (nearBottom.current) setUnread(0);
      }}>
        {!blocked && nextCursor && pages < maxPages && <button type="button" className={s.historyButton} onClick={() => void refresh(pagesRef.current + 1)} disabled={historyBusy || loading}><ChevronUp size={15} aria-hidden="true" />{historyBusy ? label("Chargement…", "Loading…") : label("Messages précédents", "Earlier messages")}</button>}
        {!blocked && pages === maxPages && nextCursor && <p className={s.historyNote}>{label("Les 120 messages les plus récents sont affichés.", "Showing the 120 most recent messages.")}</p>}
        {loading ? <div className={s.empty} role="status"><MessageCircle size={25} aria-hidden="true" /><p>{label("Ouverture du chat…", "Opening chat…")}</p></div> : !messages.length && !error ? <div className={s.empty}><MessageCircle size={29} aria-hidden="true" /><h3>{label("La conversation commence ici.", "The conversation starts here.")}</h3><p>{label("Présentez-vous ou partagez votre première question avec le groupe.", "Introduce yourself or share your first question with the group.")}</p></div> : null}
        {messages.map((message, index) => <Fragment key={message.id}>
          {(index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt)) && <div className={s.date}><span>{dateFormat.format(new Date(message.createdAt))}</span></div>}
          <article className={`${s.message} ${message.own ? s.mine : ""}`} data-chat-message={message.id}>
            <div className={s.author}><b>{message.own ? label("Vous", "You") : message.authorName}</b>{message.adminAuthor && <span className={s.team}><ShieldCheck size={11} aria-hidden="true" />{label("Équipe", "Team")}</span>}<time dateTime={message.createdAt} title={`${dateFormat.format(new Date(message.createdAt))} · ${label("heure de Paris", "Paris time")}`}>{timeFormat.format(new Date(message.createdAt))}</time></div>
            <p className={s.body}>{message.body}</p>
            {(message.own || (admin && canModerate)) && !blocked && <div className={s.messageActions}>
              {confirmDelete === message.id ? <div className={s.deleteConfirmation}><p>{label("Supprimer ce message définitivement ?", "Permanently delete this message?")}</p><div><button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting === message.id}>{label("Annuler", "Cancel")}</button><button type="button" className={s.danger} onClick={() => void deleteMessage(message.id)} disabled={Boolean(deleting)}>{deleting === message.id ? label("Suppression…", "Deleting…") : label("Supprimer", "Delete")}</button></div></div> : <button type="button" className={s.deleteButton} onClick={() => setConfirmDelete(message.id)} aria-label={label("Supprimer le message", "Delete message")}><Trash2 size={13} aria-hidden="true" /><span>{label("Supprimer", "Delete")}</span></button>}
            </div>}
          </article>
        </Fragment>)}
      </div>
      {unread > 0 && <button type="button" className={s.newMessages} onClick={() => { const area = scrollArea.current; if (area) area.scrollTop = area.scrollHeight; nearBottom.current = true; setUnread(0); }}><ArrowDown size={15} aria-hidden="true" />{unread === 1 ? label("Nouveau message", "New message") : label(`${unread} nouveaux messages`, `${unread} new messages`)}</button>}
    </div>
    <div className={s.composer}>
      {error && <div className={s.error} role="alert"><p>{error}</p>{blocked === 401 ? <Link href="/login?next=%2Fdashboard%2Fvip%3Fview%3Dchat">{label("Me reconnecter", "Sign in again")}</Link> : <button type="button" onClick={() => {
        const retry = retryAction.current;
        if (retry?.kind === "send") void sendMessage();
        else if (retry?.kind === "delete") void deleteMessage(retry.id);
        else void refresh(undefined, true);
      }} disabled={loading || historyBusy || sending || Boolean(deleting)}>{label("Réessayer", "Try again")}</button>}</div>}
      <label htmlFor={composerId}>{label("Votre message", "Your message")}</label>
      <textarea ref={input} id={composerId} value={draft} maxLength={maxLength} rows={3} placeholder={label("Écrivez au groupe…", "Write to the group…")} disabled={Boolean(blocked) || loading} aria-describedby={hintId} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
      <div className={s.composerFooter}><p id={hintId}>{label("Texte uniquement", "Text only")}<span>{draft.length} / {maxLength}</span></p><button type="button" className={s.sendButton} onClick={() => void sendMessage()} disabled={Boolean(blocked) || loading || sending || !draft.trim() || draft.trim().length > maxLength}><Send size={16} aria-hidden="true" />{sending ? label("Envoi…", "Sending…") : label("Envoyer", "Send")}</button></div>
      <p className={s.screenReader} role="status" aria-live="polite">{status}</p>
    </div>
  </section>;
}
