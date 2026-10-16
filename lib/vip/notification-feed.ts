import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVipPublicationNotice, publicationPostId, type VipNoticePost } from "./publication-notice";

export type VipNotificationFeedRow = {
  id: string;
  title: string;
  message: string;
  href: string;
  read_at: string | null;
  created_at: string;
  event_key?: string | null;
};

type PublicNotification = Omit<VipNotificationFeedRow, "event_key">;

/** Use the caller's session client: RLS must decide which private posts remain visible. */
export async function hydrateVipNotificationFeed(
  db: SupabaseClient,
  notices: readonly VipNotificationFeedRow[],
  userId: string,
): Promise<PublicNotification[]> {
  const references = notices.map(notice => publicationPostId(notice.event_key || "", userId));
  const ids = [...new Set(references.filter((id): id is string => Boolean(id)).map(id => id.toLowerCase()))];
  const posts = new Map<string, VipNoticePost>();

  if (ids.length) {
    try {
      const { data, error } = await db.from("vip_posts")
        .select("id,category,title,body,symbol,direction,levels")
        .in("id", ids)
        .eq("published", true);
      // Never use partial results returned alongside an error.
      if (!error) {
        for (const post of (data || []) as (VipNoticePost & { id: string })[]) {
          if (ids.includes(post.id.toLowerCase())) posts.set(post.id.toLowerCase(), post);
        }
      }
    } catch {
      // A read failure must not recover private text from a stored notification snapshot.
    }
  }

  return notices.map((notice, index) => {
    const { event_key, ...visible } = notice;
    if (!event_key || !/^vip:post:/i.test(event_key)) return visible;
    const postId = references[index];
    const post = postId ? posts.get(postId.toLowerCase()) : undefined;
    if (!post) return {
      ...visible,
      title: "Publication VIP",
      message: "Retrouvez les publications disponibles dans votre espace VIP.",
    };
    const formatted = formatVipPublicationNotice(post);
    return { ...visible, title: formatted.title, message: formatted.body };
  });
}
