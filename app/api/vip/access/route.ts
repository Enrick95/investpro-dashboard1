import { authenticateVip, readVipMembership, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isVipMembershipActive, safeVipTelegramUrl } from "@/lib/vip/membership";
import type { VipAccessResponse } from "@/lib/vip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authenticateVip(request);
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const membership = await readVipMembership(context.db, context.user.id);
    const active = context.admin || isVipMembershipActive(membership);
    let telegramUrl: string | null = null;
    if (active) {
      const { data, error } = await context.db.from("vip_settings").select("telegram_invite_url").eq("id", 1).maybeSingle();
      if (error) throw error;
      telegramUrl = safeVipTelegramUrl(data?.telegram_invite_url);
    }
    const response: VipAccessResponse = {
      user: { id: context.user.id, email: context.user.email || null },
      membership,
      active,
      telegramUrl,
      admin: context.admin,
    };
    return vipJson(response);
  } catch (error) { return vipErrorResponse(error); }
}
