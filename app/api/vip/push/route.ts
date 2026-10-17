import {NextResponse} from "next/server";
import {requireVipAccess,authenticateVip,vipJson,readVipJson,VipRequestError} from "@/lib/vip/membership-server";
import {vipPushConfig} from "@/lib/vip/notifications";
import {validPushEndpoint,validPushKeys} from "@/lib/vip/push-validation";
export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function GET() {
  const {publicKey,available}=vipPushConfig();
  return NextResponse.json({publicKey:available?publicKey:null,available},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
  try {
    const access=await requireVipAccess(request);
    if("error" in access)return vipJson({error:access.error,code:access.status===401?"push_auth_required":access.status===403?"push_vip_inactive":"push_unavailable"},access.status);
    const body=await readVipJson(request);
    const subscription=body.subscription as {endpoint?:unknown;keys?:unknown}|undefined;
    if(!subscription || !validPushEndpoint(subscription.endpoint)||!validPushKeys(subscription.keys))return vipJson({error:"Abonnement aux alertes invalide.",code:"push_invalid_subscription"},400);
    if(!vipPushConfig().available)return vipJson({error:"Les alertes sur cet appareil ne sont pas encore disponibles.",code:"push_unavailable"},503);
    // The RPC locks per user and enforces endpoint ownership and the device cap atomically.
    const {error}=await access.db.rpc("vip_register_push",{p_user_id:access.user.id,p_endpoint:subscription.endpoint,p_p256dh:subscription.keys.p256dh,p_auth:subscription.keys.auth});
    if(error) {
      if(error.message==="vip_push_endpoint_owned")return vipJson({error:"Cet appareil utilise encore une ancienne inscription aux alertes. Réactivez les alertes pour ce compte.",code:"push_endpoint_owned"},409);
      if(error.message==="vip_push_limit")return vipJson({error:"La limite d’appareils est atteinte. Contactez le support InvestPro.",code:"push_device_limit"},409);
      // No endpoint, encryption material, user identity or raw database error is logged.
      console.error("[vip-push][register]", {code:typeof error.code==="string" && /^[A-Z0-9]{5,12}$/.test(error.code)?error.code:"unknown"});
      return vipJson({error:"L’enregistrement des alertes est temporairement indisponible.",code:"push_save_unavailable"},503);
    }
    return vipJson({ok:true});
  } catch(error) {return vipJson({error:error instanceof VipRequestError?error.message:"Impossible d’activer les alertes.",code:error instanceof VipRequestError&&error.status===403?"push_origin_denied":"push_save_unavailable"},error instanceof VipRequestError?error.status:503);}
}
export async function DELETE(request:Request) {
  try {
    const access=await authenticateVip(request);
    if("error" in access)return vipJson({error:access.error},access.status);
    const body=await readVipJson(request);
    if(!validPushEndpoint(body.endpoint))return vipJson({error:"Appareil invalide."},400);
    const {error}=await access.db.from("vip_push_subscriptions").delete().eq("endpoint",body.endpoint).eq("user_id",access.user.id);
    if(error)throw error;
    return vipJson({ok:true});
  } catch(error){return vipJson({error:error instanceof VipRequestError?error.message:"Impossible de désactiver les alertes."},error instanceof VipRequestError?error.status:503);}
}
