import type { SupabaseClient } from "@supabase/supabase-js";
import { channel, telegram } from "@/lib/telegram/server";
import { formatVipTelegramCopy, type VipNoticePost } from "@/lib/vip/publication-notice";
import { VIP_MEDIA_BUCKET, VIP_MEDIA_TTL_SECONDS } from "@/lib/vip/post-validation";

export type VipTelegramCopyPost = VipNoticePost & { image_path?: string | null };

/**
 * Copie automatique d'une publication créée dans le VIP vers le canal Telegram des membres.
 * Appelée seulement à la création : une modification ou un retrait n'envoie rien. Un échec est journalisé sans contenu.
 */
export async function copyVipPublicationToTelegram(db: SupabaseClient, post: VipTelegramCopyPost): Promise<void> {
  try {
    const chatId = channel();
    if (post.image_path) {
      try {
        const { data, error } = await db.storage.from(VIP_MEDIA_BUCKET).createSignedUrl(post.image_path, VIP_MEDIA_TTL_SECONDS);
        if (!error && data?.signedUrl) {
          await telegram("sendPhoto", { chat_id: chatId, photo: data.signedUrl, caption: formatVipTelegramCopy(post, 1024) });
          return;
        }
      } catch {
        // Pas d'image envoyable : le texte part seul ci-dessous.
      }
    }
    await telegram("sendMessage", { chat_id: chatId, text: formatVipTelegramCopy(post, 4000), disable_web_page_preview: true });
  } catch {
    console.error("VIP_TELEGRAM_COPY_FAILED");
  }
}
