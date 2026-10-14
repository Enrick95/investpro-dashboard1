import {authenticateAdmin} from "@/lib/admin/permissions";
import {vipJson,readVipJson,VipRequestError} from "@/lib/vip/membership-server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const access=await authenticateAdmin(request,"users_write");
  if("error" in access)return vipJson({error:access.error},access.status);
  const {data,error}=await access.admin.from("vip_settings").select("telegram_invite_url").eq("id",1).maybeSingle();
  return error?vipJson({error:"Réglages indisponibles."},503):vipJson({telegramInviteUrl:data?.telegram_invite_url||""});
}
export async function POST(request:Request) {
  try {
    const access=await authenticateAdmin(request,"users_write");
    if("error" in access)return vipJson({error:access.error},access.status);
    const body=await readVipJson(request);
    if(typeof body.telegramInviteUrl!=="string")return vipJson({error:"Lien Telegram requis."},400);
    const value=body.telegramInviteUrl.trim();
    if(value){try{const url=new URL(value);if(url.protocol!=="https:"||url.hostname!=="t.me"||url.port||url.username||url.password||url.search||url.hash||value.length>1024||!/^\/(?:\+[A-Za-z0-9_-]{5,}|joinchat\/[A-Za-z0-9_-]{5,}|[A-Za-z0-9_]{5,})$/.test(url.pathname))throw Error();}catch{return vipJson({error:"Utilisez le lien d’invitation HTTPS fourni par Telegram (t.me)."},400);}}
    const {error}=await access.admin.from("vip_settings").upsert({id:1,telegram_invite_url:value||null,updated_at:new Date().toISOString()});
    if(error)throw error;
    return vipJson({ok:true,telegramInviteUrl:value});
  } catch(error){return vipJson({error:error instanceof VipRequestError?error.message:"Enregistrement impossible."},error instanceof VipRequestError?error.status:503);}
}
