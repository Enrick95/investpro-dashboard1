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
    if("error" in access)return vipJson({error:access.error},access.status);
    const body=await readVipJson(request);
    const subscription=body.subscription as {endpoint?:unknown;keys?:unknown}|undefined;
    if(!subscription || !validPushEndpoint(subscription.endpoint)||!validPushKeys(subscription.keys))return vipJson({error:"Abonnement aux alertes invalide."},400);
    if(!vipPushConfig().available)return vipJson({error:"Les alertes sur téléphone ne sont pas encore disponibles."},503);
    // The RPC locks per user and enforces endpoint ownership and the device cap atomically.
    const {error}=await access.db.rpc("vip_register_push",{p_user_id:access.user.id,p_endpoint:subscription.endpoint,p_p256dh:subscription.keys.p256dh,p_auth:subscription.keys.auth});
    if(error)return vipJson({error:"Impossible d’associer cet appareil à ce compte."},409);
    return vipJson({ok:true});
  } catch(error) {return vipJson({error:error instanceof VipRequestError?error.message:"Impossible d’activer les alertes."},error instanceof VipRequestError?error.status:503);}
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
