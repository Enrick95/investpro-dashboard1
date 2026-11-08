import { authenticateAdmin } from "@/lib/admin/permissions";
import { validateNewVipApproval, validateVipApproval, VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { after } from "next/server";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import { deliverVipAccessConfirmations } from "@/lib/vip/access-confirmations";
import { deliverVipRequestCompletionNotifications } from "@/lib/vip/request-completion-notifications";
import { completionColumns, completionRevisionValid, validateCompletionRequest } from "@/lib/vip/request-completions";
import type { VipAccessRequest } from "@/lib/vip/types";
import { telegram } from "@/lib/telegram/server";
import { notifyAdminExistingMemberApproved } from "@/lib/vip/admin-request-alert";
const REQUEST_COLUMNS = `${VIP_ACCESS_REQUEST_COLUMNS},${completionColumns}`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const context = await authenticateAdmin(request, "users_write");
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const history = new URL(request.url).searchParams.get("history") === "1";
    const { data, error } = await context.admin.from("vip_access_requests").select(REQUEST_COLUMNS).eq("status", history ? "approved" : "pending").order(history ? "reviewed_at" : "created_at", { ascending: !history }).limit(history ? 100 : 1000);
    if (error) throw error;
    return vipJson(history ? { history: data || [] } : { requests: data || [] });
  } catch (error) { return vipErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Validez les demandes depuis le site principal." }, 403);
    const context = await authenticateAdmin(request, "users_write");
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    const body = await readVipJson(request);
    if (typeof body.id !== "string" || !uuid.test(body.id) || !["approve", "deny", "request_completion"].includes(String(body.action)) || !completionRevisionValid(body.expectedRevision)) return vipJson({ error: "Demande, action ou version invalide. Actualisez la page si nécessaire." }, 400);
    const source = await context.admin.from("vip_access_requests").select(REQUEST_COLUMNS).eq("id", body.id).maybeSingle();
    if (source.error) throw source.error;
    if (!source.data || source.data.status !== "pending") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
    const memberIntake = source.data.member_intake === true;
    const denialReason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (body.action === "deny" && memberIntake && denialReason.length < 5) return vipJson({ error: "Indiquez un motif de refus (5 caractères minimum)." }, 400);
    if (body.action === "request_completion") {
      const completion = validateCompletionRequest(body, source.data as VipAccessRequest);
      if (!completion.ok) return vipJson({ error: completion.error }, 400);
      const result = await context.admin.rpc("vip_request_completion_action", { p_request_id: body.id, p_expected_revision: body.expectedRevision, p_actor_id: context.user.id, p_fields: completion.fields, p_note: completion.note });
      if (result.error?.message === "vip_request_revision_conflict" || result.error?.message === "vip_request_unavailable") return vipJson({ error: "Le dossier a changé. Actualisez avant de poursuivre." }, 409);
      if (result.error?.message === "vip_completion_invalid") return vipJson({ error: "Vérifiez les informations demandées et votre message." }, 400);
      if (result.error) throw result.error;
      after(async () => {
        try { await deliverVipRequestCompletionNotifications(context.admin); }
        catch { console.error("VIP_COMPLETION_DEFERRED_FAILED"); }
      });
      return vipJson({ ok: true, request: result.data });
    }
    const validation = body.action === "approve" ? validateVipApproval(body) : null;
    if (validation && !validation.ok) return vipJson({ error: validation.error }, 400);
    const value = validation?.ok ? validation.value : null;
    // The stored intake controls additional checks; browser-supplied requestKind
    // cannot disguise a new application as an existing member declaration.
    const checks = body.action === "approve" && source.data.request_kind === "new" ? validateNewVipApproval(body, source.data) : null;
    if (checks && !checks.ok) return vipJson({ error: checks.error }, 400);
    const verified = checks?.ok ? checks.value : null;
    let inviteUrl: string | null = null;
    // Abonnés (formulaire /vip/abonne) : eux aussi reçoivent un lien personnel du canal à la validation.
    // Les membres déjà dans le canal (« Déjà membre ») n’ont pas besoin de lien d’invitation.
    const subscriberInvite = !memberIntake && source.data.request_kind === "new" && (value?.type || source.data.type) === "abonnement";
    if (body.action === "approve" && (memberIntake || subscriberInvite)) {
      if (process.env.VERCEL_ENV !== "production" || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_VIP_CHAT_ID) return vipJson({ error: "L’invitation Telegram personnelle n’est pas configurée." }, 503);
      try {
        const invite = await telegram("createChatInviteLink", { chat_id: process.env.TELEGRAM_VIP_CHAT_ID, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60, name: `VIP-${source.data.id.slice(0, 8)}` }) as { invite_link?: string };
        if (!invite.invite_link || !/^https:\/\/t\.me\//.test(invite.invite_link)) throw new Error("VIP invite unavailable");
        inviteUrl = invite.invite_link;
      } catch { return vipJson({ error: "Telegram n’a pas pu créer le lien personnel. La demande reste en attente." }, 503); }
    }
    const { data, error } = await context.admin.rpc("vip_review_access_request_revision", {
      p_request_id: body.id, p_expected_revision: body.expectedRevision, p_action: body.action, p_reviewed_by: context.user.id,
      p_first_name: value?.first_name || null, p_last_name: value?.last_name || null,
      p_type: value?.type || null, p_affiliation_broker: value?.affiliation_broker || null, p_paid_on: value?.paid_on || null,
      p_verified_deposit_usd: verified?.verified_deposit_usd ?? null,
      p_broker_linked_verified: verified?.verified_broker_linked ?? false,
      p_payment_verified: verified?.verified_payment ?? false,
    });
    if (error) {
      if (inviteUrl) { try { await telegram("revokeChatInviteLink", { chat_id: process.env.TELEGRAM_VIP_CHAT_ID, invite_link: inviteUrl }); } catch {} }
      if (error.message === "vip_request_revision_conflict") return vipJson({ error: "Le membre ou un autre administrateur a modifié le dossier. Actualisez et vérifiez à nouveau les informations." }, 409);
      if (error.message === "vip_completion_outstanding") return vipJson({ error: "Le membre doit répondre à la demande de complément avant validation." }, 409);
      if (error.message === "vip_request_unavailable") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
      if (error.message === "vip_membership_exists") return vipJson({ error: "Ce compte a déjà un accès VIP. Utilisez sa fiche membre pour le gérer." }, 409);
      if (error.message === "vip_request_approval_invalid") return vipJson({ error: "Vérifiez l’identité, le broker et la date réelle du dernier paiement." }, 400);
      throw error;
    }
    if (memberIntake && body.action === "approve") {
      const member = await context.admin.from("vip_memberships").select("member_number").eq("user_id", source.data.user_id).maybeSingle();
      if (member.error || !member.data) return vipJson({ error: "L’accès est validé, mais la carte membre n’a pas pu être finalisée. Contacte l’équipe." }, 503);
      const saved = await context.admin.from("vip_access_requests").update({ channel_invite_url: inviteUrl, member_number: member.data.member_number }).eq("id", body.id).eq("status", "approved");
      if (saved.error) return vipJson({ error: "L’accès est validé, mais le lien privé n’a pas pu être enregistré. Contacte l’équipe." }, 503);
    }
    if (subscriberInvite && body.action === "approve" && inviteUrl) {
      await context.admin.from("vip_access_requests").update({ channel_invite_url: inviteUrl }).eq("id", body.id).eq("status", "approved");
      const row = source.data as unknown as { first_name?: string; last_name?: string; email?: string; phone_whatsapp?: string | null; telegram_username?: string | null };
      after(async () => { await deliverSubscriberInvite(row, inviteUrl as string).catch(() => {}); });
    }
    if (body.action === "approve" && source.data.request_kind === "existing" && source.data.phone_whatsapp) {
      const row = source.data as unknown as VipAccessRequest;
      after(async () => { await notifyAdminExistingMemberApproved(row).catch(() => {}); });
    }
    if (memberIntake && body.action === "deny") {
      const saved = await context.admin.from("vip_access_requests").update({ rejection_reason: denialReason }).eq("id", body.id).eq("status", "denied");
      if (saved.error) throw saved.error;
    }
    after(async () => {
      if (process.env.VERCEL_ENV !== "production") return;
      const outcomes = await Promise.allSettled([
        deliverVipAccessConfirmations(context.admin),
        (async () => {
          try { await queueVipAdminActivity(context.admin); }
          catch { console.error("VIP_ADMIN_ACTIVITY_DEFERRED_FAILED"); }
          return deliverVipNotifications(context.admin);
        })(),
      ]);
      if (outcomes.some(outcome => outcome.status === "rejected")) console.error("VIP_ACCESS_CONFIRMATION_DEFERRED_FAILED");
    });
    return vipJson({ ok: true, request: data });
  } catch (error) { return vipErrorResponse(error); }
}

/** Abonné validé : lien du canal par e-mail au client, et copie à Enrick avec les boutons WhatsApp / Telegram. */
async function deliverSubscriberInvite(row: { first_name?: string; last_name?: string; email?: string; phone_whatsapp?: string | null; telegram_username?: string | null }, invite: string) {
  const first = row.first_name || "";
  const text = `Salut${first ? " " + first : ""} 👋\n\nTon abonnement VIP InvestPro est validé 🎉\n\nVoici ton lien personnel pour rejoindre le canal VIP sur Telegram (utilisable une seule fois, valable 3 jours) :\n${invite}\n\nUne question ? Écris à @EquipeInvestPro sur Telegram.\n\nEnrick — InvestPro`;
  const apiKey = process.env.RESEND_API_KEY, from = process.env.INVESTPRO_EMAIL_FROM;
  let mailed = false;
  if (apiKey && from && row.email) {
    try { const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `vip-sub-invite-${invite.slice(-16)}` }, body: JSON.stringify({ from, to: [row.email], subject: "Ton accès au VIP InvestPro est validé 🎉", text }), signal: AbortSignal.timeout(8000) }); mailed = r.ok; } catch { mailed = false; }
  }
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!/^-?\d+$/.test(chat)) return;
  const esc = (v: string) => v.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const buttons: { text: string; url: string }[] = [];
  const phone = (row.phone_whatsapp || "").replace(/\D/g, "");
  if (phone.length >= 8) buttons.push({ text: "💬 Lui envoyer sur WhatsApp", url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` });
  if (row.telegram_username && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(row.telegram_username)) buttons.push({ text: "✈️ Telegram", url: `https://t.me/${row.telegram_username}` });
  await telegram("sendMessage", { chat_id: chat, parse_mode: "HTML", disable_web_page_preview: true,
    text: `✅ <b>Abonné validé</b> : ${esc(`${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email || "")}\n🔗 Son lien du canal : ${invite}\n${mailed ? "📧 Envoyé par e-mail." : "⚠️ E-mail non envoyé : transmets-lui le lien."}`,
    ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}) }).catch(() => {});
}
