import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { telegram } from "@/lib/telegram/server";
import { readVipMembership, vipDatabase, vipJson } from "@/lib/vip/membership-server";
import { validateVipAccessRequest, vipPaymentExpiry } from "@/lib/vip/access-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Formulaire « J'ai payé l'abonnement » : en une seule étape, le client
 *  - crée son compte InvestPro (ou se connecte s'il en a déjà un, avec son mot de passe),
 *  - envoie sa demande d'accès VIP (prénom, nom, e-mail, WhatsApp, Telegram, date du paiement Stripe),
 *  - repart connecté.
 * Enrick reçoit tout sur Telegram ; l'accès ne s'ouvre qu'après sa validation (paiement vérifié dans Stripe).
 * Le mot de passe ne sert qu'à créer/ouvrir le compte : il n'est ni stocké ici ni journalisé.
 */

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const esc = (v: string) => v.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("CONFIG");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Les demandes sont envoyées uniquement depuis le site principal." }, 403);
  if (!sameOrigin(request)) return vipJson({ error: "Origine de la requête refusée." }, 403);
  let body: Record<string, unknown>;
  try { const raw = await request.json(); if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw 0; body = raw as Record<string, unknown>; }
  catch { return vipJson({ error: "Données invalides." }, 400); }
  if (str(body.website)) return vipJson({ ok: true }, 200); // pot de miel anti-robots

  const email = str(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const phone = str(body.phone).replace(/[\s().-]/g, "");
  const telegramRaw = str(body.telegram).replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "").replace(/^@+/, "");
  const mode = body.mode === "login" ? "login" : "signup";
  if (!email || email.length > 254 || !EMAIL.test(email)) return vipJson({ error: "Vérifie ton adresse e-mail." }, 400);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return vipJson({ error: "Indique ton numéro WhatsApp avec l’indicatif du pays, par exemple +33 6 12 34 56 78." }, 400);
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramRaw)) return vipJson({ error: "Indique ton pseudo Telegram, par exemple @monpseudo (5 à 32 caractères)." }, 400);
  if (password.length < 8 || password.length > 72) return vipJson({ error: "Ton mot de passe doit contenir au moins 8 caractères." }, 400);
  const validation = validateVipAccessRequest({ requestKind: "new", type: "abonnement", firstName: body.firstName, lastName: body.lastName, telegramUsername: telegramRaw, paidOn: body.paidOn } as never);
  if (!validation.ok) return vipJson({ error: validation.error }, 400);

  let db, auth;
  try { db = vipDatabase(); auth = anonClient(); } catch { return vipJson({ error: "Service momentanément indisponible." }, 503); }

  // 1. Compte : création (e-mail directement validé) ou connexion au compte existant.
  let created = false;
  if (mode === "signup") {
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: validation.value.first_name, last_name: validation.value.last_name } });
    if (error) {
      const exists = /already|exists|registered/i.test(error.message || "") || (error as { code?: string }).code === "email_exists";
      if (!exists) return vipJson({ error: "Impossible de créer ton compte pour le moment. Réessaie dans un instant." }, 503);
    } else created = true;
  }
  const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session || !signIn.user) {
    return vipJson({ error: created ? "Ton compte est créé mais la connexion a échoué. Connecte-toi avec ton e-mail et ton mot de passe." : "Un compte existe déjà avec cet e-mail : entre le mot de passe de ce compte (ou utilise « Mot de passe oublié » sur la page de connexion).", code: created ? undefined : "EXISTING_ACCOUNT" }, created ? 503 : 409);
  }
  const user = signIn.user;
  const session = { access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token };

  // 2. Demande d'accès VIP (abonnement), avec toutes les infos.
  try {
    if (await readVipMembership(db, user.id).then(m => m && m.status === "active")) return vipJson({ ok: true, already: true, session });
  } catch { /* on continue : la demande sera vérifiée par l'équipe */ }
  const { data: inserted, error } = await db.from("vip_access_requests").insert({
    ...validation.value, telegram_username: telegramRaw.toLowerCase(), phone_whatsapp: phone,
    user_id: user.id, email, status: "pending",
  }).select("id").single();
  if (error?.code === "23505") return vipJson({ ok: true, pending: true, session });
  if (error) return vipJson({ error: "Ta demande n’a pas pu être enregistrée. Réessaie dans un instant.", session }, 503);

  // 3. Alerte à Enrick avec tout le dossier (+ paiement Stripe retrouvé si le webhook l'a reçu).
  const v = validation.value;
  after(async () => {
    const chat = process.env.TELEGRAM_CHAT_ID || "";
    if (!process.env.TELEGRAM_BOT_TOKEN || !/^-?\d+$/.test(chat)) return;
    let stripe = "";
    try {
      const { data } = await db.from("vip_stripe_payments").select("full_name,created_at,status").ilike("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
      stripe = data ? `✅ Paiement Stripe trouvé (${new Date(data.created_at as string).toLocaleDateString("fr-FR")})` : "🔎 Paiement à vérifier dans Stripe";
    } catch { stripe = "🔎 Paiement à vérifier dans Stripe"; }
    const expiry = vipPaymentExpiry(v.paid_on);
    const text = [
      "💳 <b>Nouvel abonné VIP — dossier complet</b>",
      "",
      `👤 ${esc(`${v.first_name} ${v.last_name}`)}${created ? " (nouveau compte)" : " (compte existant)"}`,
      `✉️ ${esc(email)}`,
      `📱 WhatsApp : ${esc(phone)}`,
      `✈️ Telegram : @${esc(telegramRaw)}`,
      `🗓 Payé le ${esc(v.paid_on || "—")}${expiry ? ` · échéance le ${new Date(expiry).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}`,
      stripe,
      "",
      "👉 Valider : https://investprotrading.fr/dashboard/admin?tool=vip&view=requests",
    ].join("\n");
    await telegram("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "💬 WhatsApp", url: `https://wa.me/${phone.slice(1)}` }, { text: "✈️ Telegram", url: `https://t.me/${telegramRaw}` }]] } }).catch(() => {});
  });

  return vipJson({ ok: true, requestId: inserted?.id, session }, 201);
}
