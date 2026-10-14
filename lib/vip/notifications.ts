import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import webpush from "web-push";
import {validPushEndpoint} from "./push-validation";
import {isVipMembershipActive} from "./membership";
import type {VipMembership} from "./types";

export function vipPushConfig() {
  // The shared service-worker registration must use the same VAPID identity as Copier.
  const commonConfigured=Boolean(process.env.VAPID_PUBLIC_KEY||process.env.VAPID_PRIVATE_KEY||process.env.VAPID_SUBJECT);
  const publicKey = (commonConfigured?process.env.VAPID_PUBLIC_KEY:process.env.VIP_VAPID_PUBLIC_KEY) || "";
  const privateKey = (commonConfigured?process.env.VAPID_PRIVATE_KEY:process.env.VIP_VAPID_PRIVATE_KEY) || "";
  const subject = (commonConfigured?process.env.VAPID_SUBJECT:process.env.VIP_VAPID_SUBJECT) || "";
  return {publicKey,privateKey,subject,available:Boolean(publicKey && privateKey && subject)};
}

/** The database claims rows atomically; concurrent publishers and cron jobs cannot claim the same row. */
export async function deliverVipNotifications(db:SupabaseClient, limit=20) {
  if (process.env.VERCEL_ENV === "preview") return {sent:0,failed:0,skipped:0,preview:true};
  const config=vipPushConfig();
  if (!config.available) return {sent:0,failed:0,skipped:0,unavailable:true};
  webpush.setVapidDetails(config.subject,config.publicKey,config.privateKey);
  const claimLimit=Number.isFinite(limit)?Math.max(1,Math.min(Math.trunc(limit),20)):20;
  const {data:rows,error}=await db.rpc("vip_claim_notifications",{p_limit:claimLimit});
  if(error)throw new Error("VIP_NOTIFICATION_CLAIM_FAILED");
  const counts={sent:0,failed:0,skipped:0};
  type QueuedNotice={id:string;kind:string;user_id:string;title:string;message:string;event_key:string};
  const queued=(rows||[]) as QueuedNotice[];
  // Five recipients run together; at most four batches fit within the 60-second job.
  for (let offset=0;offset<queued.length;offset+=5) {
    const batch=await Promise.allSettled(queued.slice(offset,offset+5).map(async row=>{
    let status:"sent"|"failed"|"skipped"="skipped", lastError:string|null=null;
    if (row.kind === "publication") {
      const {data:member,error:memberError}=await db.from("vip_memberships").select("type,started_at,expires_at,status").eq("user_id",row.user_id).maybeSingle();
      if(memberError) {status="failed";lastError="membership_lookup_failed";}
      else if (!isVipMembershipActive(member as VipMembership|null)) lastError="membership_inactive";
      else status="sent";
    } else status="sent";
    if(status==="sent") {
      const {data:subscriptions,error:subscriptionError}=await db.from("vip_push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",row.user_id).limit(10);
      if(subscriptionError){status="failed";lastError="subscription_lookup_failed";}
      else if(!subscriptions?.length){status="skipped";lastError="no_push_subscription";}
      else {
        const payload=JSON.stringify({title:row.title,body:row.message,url:"/dashboard/vip",tag:row.event_key});
        const outcomes=await Promise.all(subscriptions.map(async subscription=>{
          if (!validPushEndpoint(subscription.endpoint)) return false;
          try {
            await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{TTL:3600,timeout:8000});
            return true;
          } catch(error) {
            const code=Number((error as {statusCode?:number})?.statusCode||0);
            if(code===404||code===410)await db.from("vip_push_subscriptions").delete().eq("id",subscription.id).eq("user_id",row.user_id);
            return false;
          }
        }));
        if(!outcomes.some(Boolean)){status="failed";lastError="push_delivery_failed";}
      }
    }
    const {error:finishError}=await db.from("vip_notification_outbox").update({status,last_error:lastError,updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","processing");
    if(finishError)throw new Error("VIP_NOTIFICATION_TRACKING_FAILED");
    counts[status]++;
    }));
    if(batch.some(result=>result.status==="rejected"))throw new Error("VIP_NOTIFICATION_BATCH_FAILED");
  }
  return counts;
}
