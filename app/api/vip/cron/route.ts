import {timingSafeEqual} from "node:crypto";
import {vipDatabase,vipJson} from "@/lib/vip/membership-server";
import {deliverVipNotifications} from "@/lib/vip/notifications";
import {queueVipAdminActivity} from "@/lib/vip/admin-activity";
import {deliverVipAccessConfirmations} from "@/lib/vip/access-confirmations";
import {deliverVipRequestCompletionNotifications} from "@/lib/vip/request-completion-notifications";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  const token=request.headers.get("authorization")||"";
  const expected=secret?`Bearer ${secret}`:"";
  const tokenBytes=Buffer.from(token),expectedBytes=Buffer.from(expected);
  if(!secret||tokenBytes.byteLength!==expectedBytes.byteLength||!timingSafeEqual(tokenBytes,expectedBytes))return vipJson({error:"Accès refusé."},401);
  if(process.env.VERCEL_ENV!=="production")return vipJson({error:"Les rappels sont exécutés uniquement sur le site principal."},403);
  try {
    const db=vipDatabase();
    const [notifications,confirmations,completions]=await Promise.allSettled([
      (async()=>{
        let activity;
        try {activity=await queueVipAdminActivity(db);}
        catch {console.error("VIP_ADMIN_ACTIVITY_CRON_FAILED");}
        const {data,error}=await db.rpc("vip_enqueue_due_reminders");
        if(error)throw error;
        const delivery=await deliverVipNotifications(db,20);
        return {queued:data,activity,delivery};
      })(),
      deliverVipAccessConfirmations(db),
      deliverVipRequestCompletionNotifications(db),
    ]);
    if(notifications.status==="rejected"||confirmations.status==="rejected"||completions.status==="rejected")throw new Error("VIP_NOTIFICATION_CRON_FAILED");
    return vipJson({ok:true,...notifications.value,confirmations:confirmations.value,completions:completions.value});
  } catch{return vipJson({error:"Traitement des rappels indisponible."},503);}
}
