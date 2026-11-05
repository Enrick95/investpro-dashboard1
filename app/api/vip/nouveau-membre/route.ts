import { after } from "next/server";
import { authenticateVip, readVipMembership, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isVipMembershipActive } from "@/lib/vip/membership";
import { VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { VIP_AFFILIATION_BROKERS } from "@/lib/vip/identity";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE = 8 * 1024 * 1024;
const ALLOWED = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["application/pdf", "pdf"]]);
const BROKERS = new Set<string>(VIP_AFFILIATION_BROKERS.map((broker) => broker.value));

function safePhone(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[ ()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export async function GET(request: Request) {
  const context = await authenticateVip(request);
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const [membership, result] = await Promise.all([
      readVipMembership(context.db, context.user.id),
      context.db.from("vip_access_requests").select(`${VIP_ACCESS_REQUEST_COLUMNS},phone_whatsapp,mt_platform,mt_server,deposit_range,proof_path,via_enrick_link,channel_invite_url,member_number,rejection_reason,trading_account_id`).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (result.error) throw result.error;
    const item = result.data;
    const requestData = item ? {
      id: item.id, status: item.status, created_at: item.created_at,
      first_name: item.first_name, last_name: item.last_name,
      channel_invite_url: item.status === "approved" ? item.channel_invite_url : null,
      member_number: item.status === "approved" ? item.member_number : null,
      rejection_reason: item.status === "denied" ? item.rejection_reason : null,
    } : null;
    return vipJson({ user: { email: context.user.email }, request: requestData, membership, active: isVipMembershipActive(membership) });
  } catch (error) { return vipErrorResponse(error); }
}

export async function POST(request: Request) {
  let proofPath = "";
  let accountId: number | null = null;
  let createdAccount = false;
  try {
    if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Les demandes sont envoyées uniquement depuis le site principal." }, 403);
    const context = await authenticateVip(request);
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    if (!context.user.email || !context.user.email_confirmed_at) return vipJson({ error: "Confirme ton adresse e-mail avant d’envoyer ta demande." }, 403);
    if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return vipJson({ error: "Origine de la requête refusée." }, 403);
    const origin = request.headers.get("origin");
    if (origin) { try { if (new URL(origin).origin !== new URL(request.url).origin) return vipJson({ error: "Origine de la requête refusée." }, 403); } catch { return vipJson({ error: "Origine de la requête refusée." }, 403); } }
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_FILE + 256 * 1024) return vipJson({ error: "Le fichier ne doit pas dépasser 8 Mo." }, 413);
    const form = await request.formData();
    const get = (name: string) => form.get(name);
    const firstName = typeof get("firstName") === "string" ? String(get("firstName")).trim() : "";
    const lastName = typeof get("lastName") === "string" ? String(get("lastName")).trim() : "";
    const memberEmail = typeof get("email") === "string" ? String(get("email")).trim().toLowerCase() : "";
    const rawTg = typeof get("telegram") === "string" ? String(get("telegram")).trim().replace(/^@/, "") : "";
    const tel = safePhone(get("telWhatsapp"));
    const broker = String(get("broker") || "");
    const platform = String(get("plateforme") || "");
    const account = String(get("compteMT") || "").trim();
    const server = String(get("serveur") || "").trim();
    const deposit = String(get("depot") || "");
    const viaLink = get("viaEnrick") === "true";
    const proof = get("capture");
    if (firstName.length < 1 || firstName.length > 80 || lastName.length < 1 || lastName.length > 80) return vipJson({ error: "Renseigne ton prénom et ton nom (80 caractères maximum)." }, 400);
    if (memberEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(memberEmail)) return vipJson({ error: "Adresse e-mail invalide." }, 400);
    if (!tel) return vipJson({ error: "Indique un numéro WhatsApp international valide, avec indicatif (ex. +33…)." }, 400);
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(rawTg)) return vipJson({ error: "Vérifie ton nom Telegram, par exemple @monpseudo." }, 400);
    if (!BROKERS.has(broker) || !["MT4", "MT5"].includes(platform)) return vipJson({ error: "Choisis un broker et une plateforme valides." }, 400);
    if (!/^\d{4,12}$/.test(account) || server.length < 2 || server.length > 100 || /[\r\n\0]/.test(server)) return vipJson({ error: "Vérifie le numéro et le serveur de ton compte MetaTrader." }, 400);
    const depositMin: Record<string, number> = { "300-499": 300, "500-999": 500, "1000-plus": 1000 };
    if (!(deposit in depositMin)) return vipJson({ error: "Choisis une tranche de dépôt valide." }, 400);
    if (!viaLink) return vipJson({ error: "Confirme que tu as ouvert le compte avec le lien d’Enrick." }, 400);
    if (!(proof instanceof File)) return vipJson({ error: "Ajoute une capture de ton dépôt." }, 400);
    const extension = ALLOWED.get(proof.type);
    if (!extension || proof.size < 1 || proof.size > MAX_FILE) return vipJson({ error: "Ajoute une image JPEG, PNG ou WebP, ou un PDF, de 8 Mo maximum." }, 400);
    const membership = await readVipMembership(context.db, context.user.id);
    if (membership && isVipMembershipActive(membership)) return vipJson({ error: "Un accès VIP est déjà rattaché à ce compte." }, 409);
    const existing = await context.db.from("vip_access_requests").select("id,status").eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === "pending") return vipJson({ error: "Ta demande est déjà en attente de vérification." }, 409);

    const bucket = "vip-membership-proofs";
    proofPath = `${context.user.id}/${crypto.randomUUID()}.${extension}`;
    const upload = await context.db.storage.from(bucket).upload(proofPath, proof, { contentType: proof.type, upsert: false });
    if (upload.error) throw upload.error;

    // A password is deliberately not collected here. This creates the private account entry;
    // the member can separately opt into hosted MetaTrader synchronization from Connections.
    const accountName = `${broker} · ${platform} · ${account} · ${server}`;
    const accountResult = await context.db.from("trading_accounts").insert({
      user_id: context.user.id, name: accountName, account_type: "real", platform, broker,
      currency: "USD", initial_balance: 0, current_balance: 0, connection_type: "manual",
    }).select("id").single();
    if (accountResult.error || !accountResult.data) throw accountResult.error || new Error("Account creation failed");
    accountId = Number(accountResult.data.id);
    createdAccount = true;

    const inserted = await context.db.from("vip_access_requests").insert({
      user_id: context.user.id, email: memberEmail, first_name: firstName.normalize("NFC"), last_name: lastName.normalize("NFC"), telegram_username: rawTg.toLowerCase(),
      type: "affiliation", affiliation_broker: broker, status: "pending", request_kind: "new",
      broker_account_kind: "new", broker_account_id: account, broker_email: context.user.email.toLowerCase(), declared_deposit_usd: depositMin[deposit], copy_requested: false,
      phone_whatsapp: tel, mt_platform: platform, mt_server: server, deposit_range: deposit,
      proof_path: proofPath, via_enrick_link: viaLink, trading_account_id: accountId,
    }).select("id,status,created_at").single();
    if (inserted.error) throw inserted.error;

    after(async () => {
      try { await queueVipAdminActivity(context.db); await deliverVipNotifications(context.db); } catch { console.error("VIP_NEW_MEMBER_ALERT_DEFERRED_FAILED"); }
      try { await notifyNewVipRequest(context.db, inserted.data.id, { firstName, lastName, telegram: rawTg, phone: tel, broker, platform, account, server, deposit: depositLabel(deposit) }); }
      catch { console.error("VIP_NEW_MEMBER_TELEGRAM_DEFERRED_FAILED"); }
    });
    return vipJson({ ok: true, request: inserted.data }, 201);
  } catch (error) {
    // Clean up any partially-created private upload/account, without logging submitted data.
    const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (envUrl && serviceKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(envUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      try { if (proofPath) await admin.storage.from("vip-membership-proofs").remove([proofPath]); } catch {}
      try { if (accountId && createdAccount) await admin.from("trading_accounts").delete().eq("id", accountId); } catch {}
    }
    return vipErrorResponse(error);
  }
}

function depositLabel(value: string) { return value === "300-499" ? "300 $ à 499 $" : value === "500-999" ? "500 $ à 999 $" : "1 000 $ ou plus"; }

async function notifyNewVipRequest(db: SupabaseClient, id: string, data: Record<string, string>) {
  if (process.env.VERCEL_ENV !== "production") return;
  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || !/^-?[1-9]\d{0,19}$/.test(chatId)) return;
  const { data: request } = await db.from("vip_access_requests").select("proof_path").eq("id", id).maybeSingle();
  if (!request?.proof_path) return;
  const { data: proof } = await db.storage.from("vip-membership-proofs").download(request.proof_path);
  if (!proof) return;
  const caption = `🆕 <b>Nouveau membre VIP</b>\n👤 ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)} · <a href="https://t.me/${encodeURIComponent(data.telegram)}">@${escapeHtml(data.telegram)}</a> · <a href="https://wa.me/${data.phone.replace(/\D/g, "")}">WhatsApp</a>\n🏦 ${escapeHtml(data.broker)} · ${escapeHtml(data.platform)} n° ${escapeHtml(data.account)} · ${escapeHtml(data.server)}\n💰 Dépôt déclaré : ${escapeHtml(data.deposit)} · 📎 capture jointe\n\nÀ vérifier dans l’admin : /dashboard/admin?tool=vip&view=requests`;
  const form = new FormData();
  form.set("chat_id", chatId); form.set("caption", caption); form.set("parse_mode", "HTML");
  form.set("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: "✅ Valider", callback_data: `vipmember:approve:${id}` }, { text: "❌ Refuser", callback_data: `vipmember:deny:${id}` }]] }));
  const pdf = proof.type === "application/pdf";
  form.set(pdf ? "document" : "photo", new File([proof], `preuve-${id}.${pdf ? "pdf" : "image"}`, { type: proof.type }));
  const response = await fetch(`https://api.telegram.org/bot${token}/${pdf ? "sendDocument" : "sendPhoto"}`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Telegram notification failed");
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
