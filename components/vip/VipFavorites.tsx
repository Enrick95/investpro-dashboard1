"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { VipApiError, vipRequest, type VipPost } from "@/lib/vip/client";
import VipPostCard from "./VipPostCard";
import s from "./VipPortal.module.css";

type FavoritePage = { posts: VipPost[]; nextCursor: string | null };
export type VipFavoritesProps = {
  userId: string;
  refreshKey?: number;
  onFavoriteChange?: (postId: string, favorite: boolean) => void;
};

/** Key the entire saved feed so no prior account's state survives a member change. */
export default function VipFavorites(props: VipFavoritesProps) {
  return <VipFavoritesForMember key={props.userId} {...props} />;
}

/** Mounted only for a verified active member; every API request rechecks that access. */
function VipFavoritesForMember({ userId, refreshKey = 0, onFavoriteChange }: VipFavoritesProps) {
  const { t } = useLocale();
  const [posts, setPosts] = useState<VipPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const version = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const cancelReads = useCallback(() => {
    ++version.current; pending.current?.abort(); pending.current = null;
  }, []);

  const load = useCallback(async (cursor: string | null = null) => {
    const request = ++version.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError("");
    try {
      const result = await vipRequest<FavoritePage>(`/api/vip/favorites${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: controller.signal });
      if (controller.signal.aborted || request !== version.current) return;
      if (!Array.isArray(result.posts) || (result.nextCursor !== null && typeof result.nextCursor !== "string")) throw new Error("Vos favoris sont indisponibles. Réessayez.");
      setPosts(previous => cursor ? [...new Map([...previous, ...result.posts].map(post => [post.id, post])).values()] : result.posts);
      setNextCursor(result.nextCursor); setLoaded(true);
    } catch (cause) {
      if (controller.signal.aborted || request !== version.current) return;
      if (cause instanceof VipApiError && (cause.status === 401 || cause.status === 403)) { setPosts([]); setNextCursor(null); setLoaded(false); }
      setError(cause instanceof Error ? cause.message : "Vos favoris sont indisponibles. Réessayez.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted && request === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Start a cancelable authenticated read on mount and on an explicit refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return cancelReads;
  }, [load, refreshKey, cancelReads]);

  function favoriteChanged(postId: string, favorite: boolean) {
    // A pending first/next page must never restore a save that was just removed.
    cancelReads(); setLoading(false);
    setPosts(previous => favorite ? previous.map(post => post.id === postId ? { ...post, favorite } : post) : previous.filter(post => post.id !== postId));
    onFavoriteChange?.(postId, favorite);
  }

  return <div className={`${s.posts} ${s.favorites}`} aria-label={t("Publications favorites")} aria-busy={loading}>
    {error && <div className={s.notice} role="alert"><p>{t(error)}</p><button className={s.secondary} type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} aria-hidden="true" />{t("Réessayer")}</button></div>}
    {loading && <p className={s.favoriteStatus} role="status">{t(loaded ? "Actualisation des favoris…" : "Chargement de vos favoris…")}</p>}
    {posts.map(post => <VipPostCard key={`${userId}:${post.id}`} post={post} onFavoriteChange={favoriteChanged} />)}
    {!loading && !error && loaded && posts.length === 0 && <section className={s.empty}><Bookmark size={25} aria-hidden="true" /><h2>{t("Vos publications à retrouver.")}</h2><p>{t("Appuyez sur le marque-page d’une publication pour l’ajouter à vos favoris.")}</p></section>}
    {nextCursor && <button type="button" className={s.secondary} onClick={() => void load(nextCursor)} disabled={loading}>{t(loading ? "Chargement…" : "Voir plus de favoris")}</button>}
  </div>;
}
