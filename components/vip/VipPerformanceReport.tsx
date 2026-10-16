"use client";
/* eslint-disable @next/next/no-img-element -- Preview the exact local PNG blob that is downloaded. */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, ChevronLeft, ChevronRight, Download, Expand, Loader2, RefreshCw, Share2, X } from "lucide-react";
import { buildVipPerformanceReport, type ReportTrade } from "@/lib/vip/performance-report";
import { renderVipPerformanceReportImage, type VipPerformancePoster } from "@/lib/vip/performance-report-image";
import s from "./VipPerformanceReport.module.css";

type Props = { trades: ReportTrade[]; periodLabel: string; filterLabel: string; disabled?: boolean; locale: "fr" | "en"; authorize?: () => Promise<boolean> };
type ImageResult = VipPerformancePoster & { url: string; request: object };

export default function VipPerformanceReport({ trades, periodLabel, filterLabel, disabled = false, locale, authorize }: Props) {
  const english = locale === "en";
  const titleId = useId();
  const tr = (fr: string, en: string) => english ? en : fr;
  const report = useMemo(() => buildVipPerformanceReport(trades), [trades]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [session, setSession] = useState(0);
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [image, setImage] = useState<ImageResult | null>(null);
  const [failure, setFailure] = useState<{ request: object; kind: "permission" | "image" } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sharing, setSharing] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const generatedAt = useRef(new Date());
  const access = useRef({ disabled, authorize, request: {} as object, mounted: true });
  const request = useMemo(() => ({ report, periodLabel, filterLabel, locale, page, session, retry }), [report, periodLabel, filterLabel, locale, page, session, retry]);
  const current = !disabled && !(failure?.request === request && failure.kind === "permission") && image?.request === request ? image : null;
  const failed = failure?.request === request;
  const loading = open && !current && !failed;

  useLayoutEffect(() => {
    access.current = { disabled, authorize, request, mounted: true };
    if (disabled) modal.current?.close();
    return () => { access.current.mounted = false; };
  }, [disabled, authorize, request]);

  const allowed = useCallback(async (candidate: object, requireOpen = true) => {
    const state = access.current;
    if (state.disabled || !state.mounted || state.request !== candidate || (requireOpen && !modal.current?.open)) return false;
    let verified = false;
    try { verified = state.authorize ? await state.authorize() : true; } catch { /* Access checks fail closed. */ }
    return verified && access.current.mounted && !access.current.disabled && access.current.request === candidate && state.authorize === access.current.authorize && (!requireOpen || modal.current?.open === true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = modal.current;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close(); document.body.style.overflow = priorOverflow;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let createdUrl: string | null = null;
    async function generate() {
      if (!await allowed(request)) { if (!controller.signal.aborted) setFailure({ request, kind: "permission" }); return; }
      if (controller.signal.aborted) return;
      try {
        const result = await renderVipPerformanceReportImage(report, { periodLabel, filterLabel, locale, pageIndex: page, generatedAt: generatedAt.current, signal: controller.signal });
        if (controller.signal.aborted || access.current.disabled || access.current.request !== request) return;
        createdUrl = URL.createObjectURL(result.blob); setImage({ ...result, url: createdUrl, request });
      } catch { if (!controller.signal.aborted) setFailure({ request, kind: "image" }); }
    }
    void generate();
    return () => { controller.abort(); if (createdUrl) URL.revokeObjectURL(createdUrl); };
  }, [open, request, report, periodLabel, filterLabel, locale, page, allowed]);

  async function launch() {
    if (disabled || authorizing) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthorizing(true); setFeedback("");
    const permitted = await allowed(request, false);
    if (!access.current.mounted) return;
    setAuthorizing(false);
    if (!permitted) { setFeedback(tr("Votre accès ou les données de la sélection ne peuvent pas être vérifiés. Actualisez avant de créer le rapport.", "Your access or selection data could not be verified. Refresh before creating the report.")); return; }
    generatedAt.current = new Date(); setPage(0); setZoom(false); setFeedback(""); setSession(value => value + 1); setOpen(true);
  }
  async function save() {
    if (!current || disabled || authorizing) return;
    setAuthorizing(true);
    const permitted = await allowed(request);
    if (!access.current.mounted) return;
    setAuthorizing(false);
    if (!permitted) { setFailure({ request, kind: "permission" }); return; }
    const anchor = document.createElement("a"); anchor.href = current.url; anchor.download = current.filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setFeedback(tr("Le téléchargement de l’affiche PNG a été lancé.", "Your PNG poster download has started."));
  }
  async function share() {
    if (!current || sharing || disabled || authorizing) return;
    setSharing(true); setFeedback("");
    if (!await allowed(request)) { if (access.current.mounted) { setFailure({ request, kind: "permission" }); setSharing(false); } return; }
    const file = new File([current.blob], current.filename, { type: "image/png" });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) { setSharing(false); void save(); return; }
    try { await navigator.share({ files: [file], title: "InvestPro VIP · " + tr("Rapport statistiques", "Statistics report") }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setFeedback(tr("Le partage n’a pas abouti. Vous pouvez télécharger l’affiche PNG.", "Sharing did not complete. You can download the PNG poster instead.")); }
    finally { if (access.current.mounted) setSharing(false); }
  }
  const pageCount = current?.pageCount || image?.pageCount || 1;
  const pageIndex = current?.pageIndex ?? Math.min(page, pageCount - 1);
  const sourceNote = report.rBasis === "telegram_model" ? tr("Performance théorique au meilleur TP annoncé.", "Theoretical performance at the best announced TP.") : report.rBasis === "mixed" ? tr("R saisis et théoriques. Historiques indépendants : certains trades peuvent figurer dans les deux sources.", "Recorded and theoretical R. Independent histories may contain the same trades.") : report.rBasis === "recorded" ? tr("Résultats R saisis manuellement.", "Manually recorded R results.") : tr("Les résultats R disponibles figurent sur les trades clôturés.", "Available R results appear on closed trades.");

  return <>
    <button type="button" className={s.trigger} disabled={disabled || authorizing} onClick={() => void launch()}>{authorizing ? <Loader2 size={17} className={s.spinner} aria-hidden="true" /> : <BarChart3 size={17} aria-hidden="true" />}{tr("Rapport statistiques", "Statistics report")}</button>
    {!open && feedback && <p className={s.feedback} role="status">{feedback}</p>}
    <dialog ref={modal} className={s.dialog} aria-labelledby={titleId} onClose={() => setOpen(false)} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) modal.current?.close();
    }}>
      <div className={s.panel}>
        <header className={s.header}><div><span>INVESTPRO VIP</span><h2 id={titleId}>{tr("Votre rapport statistiques", "Your statistics report")}</h2></div><button type="button" className={s.iconButton} onClick={() => modal.current?.close()} aria-label={tr("Fermer le rapport", "Close report")}><X size={20} aria-hidden="true" /></button></header>
        <div className={s.context}><strong>{periodLabel}</strong><p>{filterLabel}</p><span>{report.counts.total} {tr("trades dans la sélection", "trades in this selection")} · {report.counts.closed} {tr("clôturés", "closed")}</span></div>
        <div className={s.previewToolbar}><span>{tr("Affiche", "Poster")} {pageIndex + 1} / {pageCount}</span><button type="button" className={s.textButton} disabled={!current} onClick={() => setZoom(value => !value)}><Expand size={14} aria-hidden="true" />{zoom ? tr("Vue complète", "Fit poster") : tr("Agrandir", "Enlarge")}</button></div>
        <div className={`${s.preview} ${zoom ? s.zoomed : ""}`} aria-busy={loading}>
          {loading ? <div className={s.placeholder} role="status"><Loader2 size={30} className={s.spinner} aria-hidden="true" /><strong>{tr("Création de votre affiche…", "Creating your poster…")}</strong><p>{tr("Vos statistiques et tous les trades de la sélection sont inclus.", "Your statistics and every selected trade are included.")}</p></div> : failed ? <div className={s.placeholder} role="alert"><BarChart3 size={30} aria-hidden="true" /><strong>{failure?.kind === "permission" ? tr("Votre accès ou les données de la sélection ne sont plus vérifiés.", "Your access or selection data is no longer verified.") : tr("L’affiche n’a pas pu être créée.", "Your poster could not be created.")}</strong><button type="button" className={s.secondary} onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{tr("Réessayer", "Retry")}</button></div> : current ? <img src={current.url} width={1080} height={1350} alt={tr(`Rapport statistiques InvestPro VIP, affiche ${current.pageIndex + 1} sur ${current.pageCount}. ${current.rowCount} trades.`, `InvestPro VIP statistics report, poster ${current.pageIndex + 1} of ${current.pageCount}. ${current.rowCount} trades.`)} /> : null}
        </div>
        <nav className={s.pagination} aria-label={tr("Affiches du rapport", "Report posters")}><button type="button" className={s.secondary} disabled={disabled || loading || authorizing || sharing || pageIndex <= 0} onClick={() => { setPage(pageIndex - 1); setZoom(false); setFeedback(""); }}><ChevronLeft size={16} aria-hidden="true" />{tr("Précédente", "Previous")}</button><span aria-live="polite">{current?.kind === "context" ? tr("Contexte de sélection", "Selection context") : current ? `${current.rowCount} ${tr("trades", "trades")}` : "—"}</span><button type="button" className={s.secondary} disabled={disabled || loading || authorizing || sharing || !current || pageIndex >= pageCount - 1} onClick={() => { setPage(pageIndex + 1); setZoom(false); setFeedback(""); }}>{tr("Suivante", "Next")}<ChevronRight size={16} aria-hidden="true" /></button></nav>
        <p className={s.note}>{sourceNote} {tr("R/R : gain moyen / perte moyenne. Winrate hors BE.", "R/R: average win / average loss. Win rate excludes BE.")}</p>
        {pageCount > 1 && <p className={s.note}>{tr("L’historique complet tient sur plusieurs affiches. Parcourez-les et enregistrez chaque PNG.", "The full history spans several posters. Browse them and save each PNG.")}</p>}
        {feedback && <p className={s.feedback} role="status"><Check size={15} aria-hidden="true" />{feedback}</p>}
        <footer className={s.actions}><button type="button" className={s.primary} disabled={disabled || !current || sharing || authorizing} onClick={() => void save()}><Download size={17} aria-hidden="true" />{tr("Télécharger cette affiche PNG", "Download this PNG poster")}</button><button type="button" className={s.secondary} disabled={disabled || !current || sharing || authorizing} onClick={() => void share()}><Share2 size={16} aria-hidden="true" />{sharing ? tr("Partage…", "Sharing…") : tr("Partager / Enregistrer", "Share / Save")}</button></footer>
      </div>
    </dialog>
  </>;
}
