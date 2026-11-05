import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { consumeEssaiVipRateLimit } from "@/lib/essai-vip-rate-limit";
import { isVipAffiliationBroker, normalizeVipPersonName } from "@/lib/vip/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE = 8 * 1024 * 1024;
const ALLOWED = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["application/pdf","pdf"]]);

function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return Response.json(body,{status,headers:{"Cache-Control":"no-store", "Referrer-Policy":"no-referrer",...headers}});
}
function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin=request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
function cleanPhone(value: FormDataEntryValue | null) {
  if(typeof value!=="string") return null;
  const phone=value.trim().replace(/[ ()-]/g,"");
  return /^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}

export async function POST(request: Request) {
  if(process.env.VERCEL_ENV!=="production") return json({error:"Les demandes sont ouvertes depuis le site principal."},403);
  if(!sameOrigin(request)) return json({error:"Origine de la demande refusée."},403);
  const length=Number(request.headers.get("content-length")||0);
  if(length>MAX_FILE+256*1024) return json({error:"La capture ne doit pas dépasser 8 Mo."},413);

  let form: FormData;
  try { form=await request.formData(); } catch { return json({error:"Formulaire invalide."},400); }
  if(String(form.get("website")||"").trim()) return json({ok:true},201);

  try {
    const limit=await consumeEssaiVipRateLimit(request);
    if(!limit.allowed) return json({error:"Trop de tentatives. Réessaie dans un moment."},429,{"Retry-After":String(Math.max(1,Math.ceil(limit.retryAfterSeconds)))});
  } catch { return json({error:"L’envoi est temporairement indisponible. Réessaie."},503); }

  const firstName=normalizeVipPersonName(form.get("firstName"));
  const lastName=normalizeVipPersonName(form.get("lastName"));
  const email=typeof form.get("email")==="string"?String(form.get("email")).trim().toLowerCase():"";
  const telegram=typeof form.get("telegram")==="string"?String(form.get("telegram")).trim().replace(/^@/,"").toLowerCase():"";
  const phone=cleanPhone(form.get("telWhatsapp"));
  const broker=String(form.get("broker")||"");
  const platform=String(form.get("plateforme")||"");
  const account=String(form.get("compteMT")||"").trim();
  const server=String(form.get("serveur")||"").trim();
  const deposit=String(form.get("depot")||"");
  const viaEnrick=form.get("viaEnrick")==="true";
  const proof=form.get("capture");
  if(!firstName||!lastName) return json({error:"Renseigne ton prénom et ton nom."},400);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({error:"Adresse e-mail invalide."},400);
  if(!phone) return json({error:"Indique un numéro WhatsApp international valide, avec indicatif."},400);
  if(!/^[a-z][a-z0-9_]{4,31}$/.test(telegram)) return json({error:"Vérifie ton nom d’utilisateur Telegram."},400);
  if(!isVipAffiliationBroker(broker)||broker==="vantage"||!["MT4","MT5"].includes(platform)) return json({error:"Choisis un broker et une plateforme valides."},400);
  if(!/^\d{4,12}$/.test(account)||server.length<2||server.length>100||/[\r\n\0]/.test(server)) return json({error:"Vérifie ton numéro de compte et le serveur MetaTrader."},400);
  const depositMin:Record<string,number>={"300-499":300,"500-999":500,"1000-plus":1000};
  if(!(deposit in depositMin)) return json({error:"Choisis une tranche de dépôt valide."},400);
  if(!viaEnrick) return json({error:"Confirme que tu as ouvert le compte avec le lien d’Enrick."},400);
  if(!(proof instanceof File)) return json({error:"Ajoute une capture de ton dépôt."},400);
  const extension=ALLOWED.get(proof.type);
  if(!extension||proof.size<1||proof.size>MAX_FILE) return json({error:"Ajoute une image ou un PDF de 8 Mo maximum."},400);

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceKey) return json({error:"Le service des demandes VIP est indisponible."},503);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const duplicate=await admin.from("vip_member_applications").select("id,status").eq("email",email).in("status",["submitted","approved","claimed"]).limit(1).maybeSingle();
  if(duplicate.error) return json({error:"Impossible de vérifier la demande. Réessaie."},503);
  if(duplicate.data) return json({error:"Une demande est déjà enregistrée pour cette adresse e-mail."},409);

  const id=randomUUID();
  const proofPath=`${id}/${randomUUID()}.${extension}`;
  const upload=await admin.storage.from("vip-membership-proofs").upload(proofPath,proof,{contentType:proof.type,upsert:false});
  if(upload.error) return json({error:"La capture n’a pas pu être enregistrée. Réessaie avec un fichier plus léger."},503);
  const inserted=await admin.from("vip_member_applications").insert({
    id,email,first_name:firstName,last_name:lastName,telegram_username:telegram,phone_whatsapp:phone,
    affiliation_broker:broker,mt_platform:platform,broker_account_id:account,mt_server:server,
    deposit_range:deposit,declared_deposit_usd:depositMin[deposit],via_enrick_link:true,proof_path:proofPath,
  }).select("id").single();
  if(inserted.error) {
    await admin.storage.from("vip-membership-proofs").remove([proofPath]).catch(()=>{});
    if(inserted.error.code==="23505") return json({error:"Une demande est déjà enregistrée pour cette adresse e-mail."},409);
    return json({error:"La demande n’a pas pu être enregistrée. Réessaie dans un instant."},503);
  }
  return json({ok:true,applicationId:inserted.data.id},201);
}
