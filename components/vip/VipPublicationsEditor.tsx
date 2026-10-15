"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import { ArrowLeft, ChevronDown, Eye, ImagePlus, Image as ImageIcon, Info, Layers, Pencil, RefreshCw, Save, Send, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import { safeHttps, vipDate, vipRequest, type VipMediaUpload, type VipMediaUploadPreparation, type VipPost, type VipPostCategory } from "@/lib/vip/client";
import VipPostCard from "./VipPostCard";
import s from "./VipPublicationsEditor.module.css";

const categories = [
  { value: "analysis", label: "Analyses", title: "Mon analyse graphique" },
  { value: "signal", label: "Signaux", title: "Nouveau signal" },
  { value: "performance", label: "Bilan", title: "Le bilan de la session" },
  { value: "followup", label: "Suivi", title: "Mise à jour du scénario" },
  { value: "partnership", label: "Partenariats", title: "Nouveau partenariat" },
] as const satisfies readonly { value: VipPostCategory; label: string; title: string }[];

type Translate = (message: string) => string;
type Draft = {
  category: VipPostCategory;
  title: string;
  titleExpanded: boolean;
  body: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageName: string;
  imageChanged: boolean;
};

function newDraft(category: VipPostCategory, t: Translate): Draft {
  return {
    category,
    title: t(categories.find(item => item.value === category)?.title || "Nouvelle publication"),
    titleExpanded: false,
    body: category === "signal" ? t("🎯 #SIGNAL\n\n🟡 Actif :\n📈 Direction :\n📍 Entrée :\n🛑 Stop Loss :\n🎯 TP1 :\n🎯 TP2 :\n🎯 TP3 :\n\n⚠️ Respectez votre money management.") : "",
    imagePath: null,
    imageUrl: null,
    imageName: "",
    imageChanged: false,
  };
}

function draftFromPost(post: VipPost): Draft {
  return {
    category: post.category,
    title: post.title,
    titleExpanded: true,
    body: post.body || "",
    imagePath: post.image_path || null,
    imageUrl: safeHttps(post.image_url),
    imageName: "",
    imageChanged: false,
  };
}

type VipPublicationsEditorProps = {
  active: boolean;
  /** Presentation-only: local drafting is allowed, all API reads and mutations are disabled. */
  readOnlyPreview?: boolean;
  initialPosts?: VipPost[];
  embedded?: boolean;
  onPublished?: () => void;
};

export default function VipPublicationsEditor({ active, readOnlyPreview = false, initialPosts = [], embedded = false, onPublished }: VipPublicationsEditorProps) {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<"compose" | "published">("compose");
  const [draft, setDraft] = useState<Draft>(() => newDraft("analysis", t));
  const [editing, setEditing] = useState<VipPost | null>(null);
  const [preview, setPreview] = useState(false);
  const [posts, setPosts] = useState<VipPost[]>(initialPosts);
  const [loading, setLoading] = useState(!readOnlyPreview);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const originalCreation = useRef<Draft | null>(null);
  const categoryDrafts = useRef<Partial<Record<VipPostCategory, Pick<Draft, "title" | "titleExpanded" | "body">>>>({});
  const uploadController = useRef<AbortController | null>(null);
  const readVersion = useRef(0);
  const uploadVersion = useRef(0);
  const objectUrl = useRef<string | null>(null);

  const loadPosts = useCallback(async (signal?: AbortSignal) => {
    if (readOnlyPreview) return;
    const version = ++readVersion.current;
    try {
      const result = await vipRequest<{ posts: VipPost[] }>("/api/admin/vip/posts", { signal });
      if (!signal?.aborted && version === readVersion.current) { setPosts(result.posts || []); setError(""); }
    } catch (cause) {
      if (!signal?.aborted && version === readVersion.current) setError(cause instanceof Error ? cause.message : "Impossible de charger les publications.");
    } finally { if (!signal?.aborted && version === readVersion.current) setLoading(false); }
  }, [readOnlyPreview]);

  useEffect(() => {
    if (!active || readOnlyPreview) return;
    const controller = new AbortController();
    // This authenticated read updates state after network I/O and cancels when the tab closes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPosts(controller.signal);
    return () => controller.abort();
  }, [active, readOnlyPreview, loadPosts]);

  useEffect(() => {
    if (readOnlyPreview) {
      // Presentation mode cancels the external transfer and clears its local progress UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingImage(null);
      setUploading(false);
    }
    return () => {
      // This is an operation counter, not a DOM ref: invalidate the latest upload at cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      uploadVersion.current++;
      uploadController.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [readOnlyPreview]);

  function clearPendingUpload() {
    uploadVersion.current++;
    uploadController.current?.abort();
    uploadController.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setPendingImage(null);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    if (readOnlyPreview) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Choisissez une image JPG, PNG, WebP ou GIF. Pour une photo HEIC d’iPhone, exportez-la en JPG.");
      event.target.value = "";
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setError("Choisissez une image non vide de 10 Mo maximum.");
      event.target.value = "";
      return;
    }
    clearPendingUpload();
    const version = uploadVersion.current;
    const controller = new AbortController();
    uploadController.current = controller;
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setPendingImage({ url, name: file.name });
    setUploading(true); setError(""); setMessage("");
    try {
      const prepared = await vipRequest<VipMediaUploadPreparation>("/api/admin/vip/media/upload", {
        method: "POST", body: JSON.stringify({ action: "prepare", filename: file.name, mimeType: file.type, sizeBytes: file.size }), signal: controller.signal,
      });
      if (controller.signal.aborted || version !== uploadVersion.current) return;
      if (!prepared.imagePath || !prepared.token || !prepared.uploadTicket || prepared.mimeType !== file.type || prepared.sizeBytes !== file.size) throw new Error("L’image n’a pas pu être préparée. Réessayez.");
      // The file goes directly to private Storage; application routes receive only small JSON payloads.
      const uploaded = await createClient().storage.from("vip-post-media").uploadToSignedUrl(prepared.imagePath, prepared.token, file, { contentType: prepared.mimeType });
      if (controller.signal.aborted || version !== uploadVersion.current) return;
      if (uploaded.error) throw new Error("L’image n’a pas pu être transférée. Réessayez.");
      const result = await vipRequest<VipMediaUpload>("/api/admin/vip/media/upload", {
        method: "POST", body: JSON.stringify({ action: "complete", imagePath: prepared.imagePath, uploadTicket: prepared.uploadTicket }), signal: controller.signal,
      });
      if (controller.signal.aborted || version !== uploadVersion.current) return;
      const imageUrl = safeHttps(result.imageUrl);
      if (result.imagePath !== prepared.imagePath || !imageUrl) throw new Error("L’image n’a pas pu être préparée. Réessayez.");
      setDraft(current => ({ ...current, imagePath: result.imagePath, imageUrl, imageName: file.name, imageChanged: true }));
    } catch (cause) {
      if (!controller.signal.aborted && version === uploadVersion.current) setError(cause instanceof Error ? cause.message : "Impossible d’ajouter cette image.");
    } finally {
      if (!controller.signal.aborted && version === uploadVersion.current) {
        URL.revokeObjectURL(url); objectUrl.current = null; uploadController.current = null;
        setPendingImage(null); setUploading(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    }
  }

  function changeCategory(value: VipPostCategory) {
    if (!editing) {
      categoryDrafts.current[draft.category] = { title: draft.title, titleExpanded: draft.titleExpanded, body: draft.body };
      const cached = categoryDrafts.current[value] || newDraft(value, t);
      setDraft(current => ({ ...current, category: value, title: cached.title, titleExpanded: cached.titleExpanded, body: cached.body }));
    } else setDraft(current => ({ ...current, category: value }));
    setError("");
  }

  function restoreCreation() {
    setDraft(originalCreation.current || newDraft("analysis", t));
    originalCreation.current = null;
    setEditing(null); setPreview(false);
  }

  function resetScroll() { requestAnimationFrame(() => scrollArea.current?.scrollTo({ top: 0 })); }

  function startEditing(post: VipPost) {
    if (saving || uploading) return;
    if (!editing) originalCreation.current = draft;
    clearPendingUpload();
    setDraft(draftFromPost(post)); setEditing(post); setPreview(false); setTab("compose"); setError(""); setMessage("");
    requestAnimationFrame(() => { scrollArea.current?.scrollTo({ top: 0 }); titleInput.current?.focus({ preventScroll: true }); });
  }

  function cancelEditing() {
    clearPendingUpload(); restoreCreation(); setTab("compose"); setError(""); setMessage(""); resetScroll();
  }

  function changeTab(next: "compose" | "published") {
    if (saving || uploading) return;
    if (editing) restoreCreation();
    setTab(next); setPreview(false); setError(""); resetScroll();
  }

  function validDraft() {
    if (editing && !draft.title.trim()) { setError("Ajoutez un titre à votre publication."); titleInput.current?.focus(); return false; }
    if (!draft.body.trim() && !draft.imagePath && !draft.imageUrl) { setError("Ajoutez un message, une image, ou les deux."); return false; }
    setError(""); return true;
  }

  function showPreview() {
    if (!uploading && validDraft()) { setPreview(true); resetScroll(); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (readOnlyPreview || saving || uploading || !validDraft()) return;
    setSaving(true); setMessage("");
    try {
      const payload: { category: VipPostCategory; title: string; body: string; id?: string; expectedUpdatedAt?: string; imagePath?: string | null } = {
        category: draft.category, title: (draft.title.trim() || t(categories.find(item => item.value === draft.category)?.title || "Nouvelle publication")), body: draft.body.trim(),
      };
      if (editing) {
        payload.id = editing.id;
        if (editing.updated_at) payload.expectedUpdatedAt = editing.updated_at;
        // Omitted historical symbol/direction/levels and unchanged media remain intact on PATCH.
        if (draft.imageChanged) payload.imagePath = draft.imagePath;
      } else if (draft.imagePath) payload.imagePath = draft.imagePath;
      const result = await vipRequest<{ post: VipPost }>("/api/admin/vip/posts", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      // An older list response must never hide a publication that has just been saved.
      readVersion.current++; setLoading(false);
      setPosts(current => editing ? current.map(post => post.id === result.post.id ? result.post : post) : [result.post, ...current.filter(post => post.id !== result.post.id)]);
      if (editing) { restoreCreation(); setMessage("Les modifications ont été enregistrées. Aucune nouvelle alerte n’a été envoyée."); }
      else {
        categoryDrafts.current[draft.category] = undefined;
        setDraft(newDraft(draft.category, t)); setPreview(false);
        setMessage("Votre publication est disponible dans le canal privé.");
      }
      setTab("published"); resetScroll();
      // A failed feed refresh must not turn a completed save into a failed publication.
      try { void Promise.resolve(onPublished?.()).catch(() => {}); } catch { /* The saved post remains available in this list. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer la publication. Votre brouillon est conservé."); }
    finally { setSaving(false); }
  }

  const image = pendingImage?.url || draft.imageUrl;
  const previewPost: VipPost = {
    ...(editing || { id: "draft", created_at: "", symbol: null, direction: null, levels: {} }),
    category: draft.category, title: draft.title.trim() ? draft.title : t(categories.find(item => item.value === draft.category)?.title || "Nouvelle publication"), body: draft.body, image_url: safeHttps(draft.imageUrl), image_path: draft.imagePath,
  };
  const categoryLabel = categories.find(item => item.value === draft.category)?.label || "Publication";
  const busy = saving || uploading;

  return <section ref={editor} className={`${s.editor}${embedded ? ` ${s.embedded}` : ""}`} hidden={!active} aria-label={t("Gestion des publications VIP")}>
    <nav className={s.tabs} aria-label={t("Gestion des publications")}>
      <button type="button" onClick={() => changeTab("compose")} aria-pressed={tab === "compose"} disabled={busy}><Pencil size={15} aria-hidden="true" />{t("Publier")}</button>
      <button type="button" onClick={() => changeTab("published")} aria-pressed={tab === "published"} disabled={busy}><Layers size={15} aria-hidden="true" />{t("Posts publiés")}</button>
    </nav>
    <input ref={fileInput} className={s.fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => void selectImage(event)} aria-label={t("Sélectionner un graphique ou une photo")} disabled={readOnlyPreview || saving} />
    <form onSubmit={event => void save(event)} className={s.form}>
      <div ref={scrollArea} className={s.scroll}>
        {readOnlyPreview && <p className={s.previewNotice} role="note"><Info size={14} aria-hidden="true" />{t("Aperçu de présentation : aucune publication, modification ou importation n’est envoyée.")}</p>}
        {message && <p className={s.success} role="status">{t(message)}</p>}
        {tab === "published" ? <>
          <div className={s.listHeading}><div><span className={s.kicker}>{t("Admin VIP · Publications")}</span><h2>{t("Posts publiés.")}</h2></div><button type="button" className={s.reload} onClick={() => { if (!readOnlyPreview) { setLoading(true); void loadPosts(); } }} disabled={readOnlyPreview || loading} aria-label={t("Actualiser les publications")}><RefreshCw size={17} aria-hidden="true" /></button></div>
          <p className={s.lead}>{t("Retrouvez et modifiez vos publications.")}</p>
          {error && <p className={s.error} role="alert">{t(error)}</p>}
          {loading ? <p className={s.empty} role="status">{t("Chargement des publications…")}</p> : posts.length ? posts.map(post => <article className={s.published} key={post.id}>
            <div className={s.publishedMeta}><span className={s.badge}>{t(categories.find(item => item.value === post.category)?.label || "Publication")}</span><span>{vipDate(post.created_at, locale)}</span>{post.updated_at && post.updated_at !== post.created_at && <span className={s.edited}>{t("Modifié")}</span>}</div>
            <h3>{post.title}</h3>{post.body && <p className={s.excerpt}>{post.body.length > 170 ? `${post.body.slice(0, 170)}…` : post.body}</p>}
            {safeHttps(post.image_url) && <Image className={s.publishedImage} src={safeHttps(post.image_url)!} alt={`${t("Graphique de la publication :")} ${post.title}`} width={960} height={580} unoptimized loading="lazy" referrerPolicy="no-referrer" />}
            <div className={s.publishedBottom}><span>{Object.values(post.reactions?.counts || {}).reduce((sum, count) => sum + count, 0)} {t("réactions")}</span><button type="button" onClick={() => startEditing(post)} aria-label={`${t("Modifier la publication :")} ${post.title}`}><Pencil size={14} aria-hidden="true" />{t("Modifier")}</button></div>
          </article>) : <div className={s.empty}><Layers size={25} aria-hidden="true" /><p>{t("Aucune publication pour le moment.")}</p><button type="button" className={s.secondary} onClick={() => changeTab("compose")}>{t("Créer ma première publication")}</button></div>}
        </> : preview ? <>
          <button type="button" className={s.back} onClick={() => { setPreview(false); resetScroll(); }} disabled={saving}><ArrowLeft size={14} aria-hidden="true" />{t("Revenir à la rédaction")}</button>
          <span className={s.kicker}>{t("Comme le verront les membres")}</span><h2>{t("L’aperçu.")}</h2><p className={s.lead}>{t("Destination :")} {t(categoryLabel)}.</p>
          <div className={s.preview}><VipPostCard post={previewPost} preview imagePreviewUrl={pendingImage?.url || null} /></div>
          <p className={s.note}><Info size={14} aria-hidden="true" />{editing ? t("Les changements seront appliqués au même post.") : t("Cette publication n’a pas encore été envoyée.")}</p>
          {error && <p className={s.error} role="alert">{t(error)}</p>}
        </> : <>
          <span className={s.kicker}>{editing ? t("Admin VIP · Modification") : t("Admin VIP · Publication")}</span><h2>{editing ? t("Modifier le post.") : t("Partager au cercle.")}</h2><p className={s.lead}>{editing ? t("Corrige le texte ou le graphique de ce post.") : t("Ton texte, ton graphique. C’est tout.")}</p>
          <label className={s.field}>{editing ? t("Rubrique") : t("Publier dans")}<select value={draft.category} onChange={event => changeCategory(event.target.value as VipPostCategory)} disabled={busy}>{categories.map(item => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label>
          <label className={s.field}>{t("Ton message")}{draft.category === "signal" && !editing && <span className={s.templateHint}>{t("Modèle prérempli · complète simplement les lignes.")}</span>}<textarea className={draft.category === "signal" ? s.signalEditor : undefined} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} placeholder={t("Ton analyse, ton signal, ton bilan…")} maxLength={12000} disabled={saving} /></label>
          <div className={s.mediaLabel}>{t("Graphique ou photo")} <span>{t("· facultatif")}</span></div>
          {image ? <div className={s.attachment}><Image src={image} alt={t("Aperçu du graphique ou de la photo sélectionnée")} width={960} height={580} unoptimized referrerPolicy="no-referrer" /><div className={s.attachmentInfo}><ImageIcon size={16} aria-hidden="true" /><span>{pendingImage?.name || draft.imageName || t("Graphique de la publication")}</span></div><div className={s.mediaActions}><button type="button" onClick={() => { if (!readOnlyPreview) fileInput.current?.click(); }} disabled={readOnlyPreview || busy}>{t("Remplacer")}</button><button type="button" onClick={() => { clearPendingUpload(); setDraft(current => ({ ...current, imagePath: null, imageUrl: null, imageName: "", imageChanged: true })); }} disabled={saving}>{t("Retirer")}</button></div></div> : <button type="button" className={s.attach} onClick={() => { if (!readOnlyPreview) fileInput.current?.click(); }} disabled={readOnlyPreview || busy}><ImagePlus size={26} aria-hidden="true" /><strong>{t("Ajouter un graphique ou une photo")}</strong><small>{t("JPG, PNG, WebP ou GIF · 10 Mo max")}</small></button>}
          {uploading && <p className={s.uploadStatus} role="status">{t("Préparation de l’image…")}</p>}
          {!editing && <button type="button" className={s.titleToggle} aria-expanded={draft.titleExpanded} onClick={() => setDraft(current => ({ ...current, titleExpanded: !current.titleExpanded }))} disabled={saving}><Pencil size={14} aria-hidden="true" />{draft.titleExpanded ? t("Masquer le titre") : t("Ajouter un titre")}<ChevronDown size={14} aria-hidden="true" /></button>}
          {(editing || draft.titleExpanded) && <label className={s.field}>{t("Titre")}<input ref={titleInput} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder={t("Titre de ta publication")} maxLength={160} disabled={saving} /></label>}
          {error && <p className={s.error} role="alert">{t(error)}</p>}
          <p className={s.note}><ImageIcon size={14} aria-hidden="true" />{t("L’image s’affiche entière et les membres peuvent l’agrandir.")}</p>
        </>}
      </div>
      {tab === "compose" && <div className={`${s.actions}${editing ? ` ${s.editingActions}` : ""}`}>
        <button type="button" className={s.secondary} onClick={() => { if (preview) { setPreview(false); resetScroll(); } else showPreview(); }} disabled={busy}>{preview ? <Pencil size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}{preview ? t("Modifier") : t("Aperçu")}</button>
        <button className={s.primary} type="submit" disabled={readOnlyPreview || busy}>{editing ? <Save size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}{saving ? t("Enregistrement…") : uploading ? t("Préparation de l’image…") : editing ? t("Enregistrer les modifications") : t("Publier")}</button>
        {editing && <button type="button" className={s.cancel} onClick={cancelEditing} disabled={saving}><X size={14} aria-hidden="true" />{t("Annuler les modifications")}</button>}
      </div>}
    </form>
  </section>;
}
