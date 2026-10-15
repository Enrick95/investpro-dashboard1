"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Calculator, Crown, Expand, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { safeHttps, vipDate, vipRequest, type VipPost, type VipPostReactions, type VipReaction } from "@/lib/vip/client";
import s from "./VipPostCard.module.css";

const categories: Record<string, string> = {
  analysis: "Analyses", signal: "Signaux", performance: "Bilan", followup: "Suivi", partnership: "Partenariats",
};
const reactions = [
  { key: "like", emoji: "👍", label: "J’aime" },
  { key: "fire", emoji: "🔥", label: "Flamme" },
  { key: "heart", emoji: "❤️", label: "Cœur" },
] as const;
const emptyReactions: VipPostReactions = { counts: { like: 0, fire: 0, heart: 0 }, mine: null };
const recentSignalDuration = 24 * 60 * 60 * 1000;

function previewImage(value?: string | null) {
  try { const url = new URL(value || ""); return url.protocol === "blob:" ? url.toString() : null; }
  catch { return null; }
}

export type VipPostCardProps = {
  post: VipPost;
  /** A presentation-only card: no API request or reaction mutation is permitted. */
  preview?: boolean;
  /** A local object URL selected in the editor. Never persisted or accepted from the member API. */
  imagePreviewUrl?: string | null;
};

export default function VipPostCard({ post, preview = false, imagePreviewUrl }: VipPostCardProps) {
  const { t, locale } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionError, setReactionError] = useState("");
  const [localReaction, setLocalReaction] = useState<{ source: VipPostReactions | undefined; value: VipPostReactions } | null>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const imageTrigger = useRef<HTMLButtonElement>(null);
  const viewerTitle = useId();
  const image = (preview && previewImage(imagePreviewUrl)) || safeHttps(post.image_url);
  const reactionState = localReaction && localReaction.source === post.reactions ? localReaction.value : post.reactions || emptyReactions;
  const created = Date.parse(post.created_at);
  const isRecentSignal = preview || (Number.isFinite(created) && now >= created && now - created < recentSignalDuration);
  const signalLabel = t(isRecentSignal ? "Nouveau signal" : "Signal");
  const titleIsSignalLabel = post.category === "signal" && post.title === signalLabel;
  const edited = Boolean(post.updated_at && Date.parse(post.updated_at) > created + 1000);
  const levels = [["Entrée", post.levels?.entry], ["Stop loss", post.levels?.stopLoss], ["Objectif 1", post.levels?.takeProfit], ["Objectif 2", post.levels?.takeProfit2]] as const;
  const availableLevels = levels.filter(([, value]) => typeof value === "number" && Number.isFinite(value));
  const includesRiskReminder = /respect(?:ez)?[^\n]*(?:gestion du risque|money management|risk management)/i.test(post.body);

  useEffect(() => {
    if (preview || post.category !== "signal" || !Number.isFinite(created)) return;
    const remaining = created + recentSignalDuration - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining + 100, 2147483647));
    return () => window.clearTimeout(timer);
  }, [created, post.category, preview]);

  async function react(reaction: VipReaction) {
    if (preview || reactionBusy) return;
    setReactionBusy(true); setReactionError("");
    try {
      const result = await vipRequest<{ postId: string; reactions: VipPostReactions }>(`/api/vip/posts/${encodeURIComponent(post.id)}/reaction`, {
        method: "PUT", body: JSON.stringify({ reaction: reactionState.mine === reaction ? null : reaction }),
      });
      setLocalReaction({ source: post.reactions, value: result.reactions });
    } catch (cause) {
      setReactionError(cause instanceof Error ? cause.message : "Impossible d’enregistrer votre réaction.");
    } finally { setReactionBusy(false); }
  }

  function closeImage() { viewer.current?.close(); }

  return <article className={s.post} id={`publication-${post.id}`}>
    <div className={s.copy}>
      <div className={s.byline}>
        <span className={s.avatar}><Crown size={14} aria-hidden="true" /></span>
        <div className={s.author}><b>InvestPro</b><small>{preview && !post.created_at ? t("À l’instant") : vipDate(post.created_at, locale)}{edited && <span className={s.edited}> · {t("Modifié")}</span>}</small></div>
        <span className={s.badge}>{t(categories[post.category] || "Publication")}</span>
      </div>
      {post.category === "signal" && <div className={s.signalLabel}><span className={isRecentSignal ? s.signalDot : s.signalHistory} aria-hidden="true" />{titleIsSignalLabel ? <h2>{post.title}</h2> : signalLabel}</div>}
      {post.title && !titleIsSignalLabel && <h2>{post.title}</h2>}
      {post.symbol && <div className={s.symbol}>{post.symbol}{post.direction && <span className={post.direction === "buy" ? s.buy : s.sell}>{post.direction === "buy" ? t("Achat") : t("Vente")}</span>}</div>}
      {post.body && <p className={s.body}>{post.body}</p>}
      {availableLevels.length > 0 && <dl className={s.levels}>{availableLevels.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value?.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 8 })}</dd></div>)}</dl>}
      {post.category === "signal" && !includesRiskReminder && <p className={s.riskReminder}>{t("⚠️ Respectez votre gestion du risque.")}</p>}
    </div>
    {image && <>
      <button type="button" className={s.photo} ref={imageTrigger} onClick={() => viewer.current?.showModal()} aria-label={`${t("Agrandir le graphique :")} ${post.title}`}>
        <Image src={image} alt={`${t("Illustration de la publication :")} ${post.title}`} width={1200} height={800} unoptimized loading="lazy" referrerPolicy="no-referrer" />
        <span className={s.photoHint}><Expand size={12} aria-hidden="true" />{t("Agrandir le graphique")}</span>
      </button>
      <dialog className={s.viewer} ref={viewer} aria-labelledby={viewerTitle} onClose={() => imageTrigger.current?.focus({ preventScroll: true })} onClick={event => { if (event.target === event.currentTarget) closeImage(); }}>
        <div className={s.viewerBar}><span id={viewerTitle}>{post.title || t("Graphique agrandi")}</span><button type="button" onClick={closeImage} aria-label={t("Fermer le graphique")} autoFocus><X size={20} aria-hidden="true" /></button></div>
        <div className={s.viewerImage}><Image src={image} alt={`${t("Illustration de la publication :")} ${post.title}`} width={1600} height={1200} unoptimized referrerPolicy="no-referrer" /></div>
        <p>{t("L’image entière, sans recadrage.")}</p>
      </dialog>
    </>}
    {post.category === "signal" && <Link className={s.riskLink} href="/dashboard/simulateur"><span className={s.riskIcon}><Calculator size={16} aria-hidden="true" /></span><span><strong>{t("Calculer mon lot")}</strong><small>{t("Préparer mon risque avant la prise de position.")}</small></span><ArrowUpRight size={13} aria-hidden="true" /></Link>}
    <div className={s.reactions} role="group" aria-label={t("Réactions à la publication")} aria-busy={reactionBusy}>
      {reactions.map(({ key, emoji, label }) => <button type="button" key={key} className={s.reaction} disabled={preview || reactionBusy} onClick={() => void react(key)} aria-pressed={reactionState.mine === key} aria-label={`${t(label)} · ${reactionState.counts[key]}`}><span aria-hidden="true">{emoji}</span><span>{reactionState.counts[key]}</span></button>)}
    </div>
    {reactionError && <p className={s.reactionError} role="alert">{t(reactionError)}</p>}
    {preview && <p className={s.reactionHint}>{t("Les membres pourront réagir ici.")}</p>}
  </article>;
}
