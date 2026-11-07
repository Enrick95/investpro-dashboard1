import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { validateVipIdentity } from "@/lib/vip/identity";
import { issueMemberAccess, type VipAccessIssue, type VipApplicationAccess } from "@/lib/vip/access-account";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request:Request) {
  const context=await authenticateAdmin(request,"users_write");
  if("error" in context) return vipJson({error:context.error},context.status);
  try {
    const history=new URL(request.url).searchParams.get("history")==="1";
    const query=context.admin.from("vip_member_applications").select("*");
    const result=history
      ? await query.in("status",["approved","denied","claimed"]).order("created_at",{ascending:false}).limit(100)
      : await query.in("status",["submitted","approved"]).order("created_at",{ascending:true}).limit(500);
    if(result.error) throw result.error;
    return vipJson({applications:result.data||[]});
  } catch(error) { return vipErrorResponse(error); }
}

export async function POST(request:Request) {
  try {
    if(process.env.VERCEL_ENV==="preview") return vipJson({error:"Traitez les demandes depuis le site principal."},403);
    const context=await authenticateAdmin(request,"users_write");
    if("error" in context) return vipJson({error:context.error},context.status);
    const body=await readVipJson(request);
    if(typeof body.id!=="string"||!uuid.test(body.id)||!Number.isSafeInteger(body.expectedRevision)||!["approve","deny","resend"].includes(String(body.action))) {
      return vipJson({error:"Demande ou action invalide."},400);
    }
    const found=await context.admin.from("vip_member_applications").select("*").eq("id",body.id).maybeSingle();
    if(found.error) throw found.error;
    const app=found.data;
    if(!app) return vipJson({error:"Cette demande n’existe plus."},404);
    if(app.revision!==body.expectedRevision) return vipJson({error:"La demande a changé. Actualisez la page."},409);

    if(body.action==="resend") {
      if(app.status!=="approved"||app.claimed_user_id) return vipJson({error:"Le lien ne peut plus être envoyé pour ce dossier."},409);
      const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
      const saved=await context.admin.from("vip_member_applications").update({claim_expires_at:expiresAt,revision:app.revision+1}).eq("id",app.id).eq("revision",app.revision).select("*").single();
      if(saved.error) throw saved.error;
      const access=await issueAccess(context.admin,saved.data);
      if(access.emailSent) await context.admin.from("vip_member_applications").update({approval_email_sent_at:new Date().toISOString()}).eq("id",app.id).eq("status","approved");
      return vipJson({ok:true,emailSent:access.emailSent,accountCreated:access.accountCreated});
    }

    if(app.status!=="submitted") return vipJson({error:"Cette demande a déjà été traitée."},409);
    if(body.action==="deny") {
      const reason=typeof body.reason==="string"?body.reason.trim().slice(0,300):"";
      if(reason.length<5) return vipJson({error:"Indiquez un motif de refus (5 caractères minimum)."},400);
      const denied=await context.admin.from("vip_member_applications").update({
        status:"denied",reviewed_at:new Date().toISOString(),reviewed_by:context.user.id,
        rejection_reason:reason,revision:app.revision+1,
      }).eq("id",app.id).eq("status","submitted").eq("revision",app.revision).select("id").maybeSingle();
      if(denied.error) throw denied.error;
      if(!denied.data) return vipJson({error:"Cette demande a déjà été traitée."},409);
      return vipJson({ok:true});
    }

    const identity=validateVipIdentity({firstName:body.firstName,lastName:body.lastName,affiliationBroker:body.affiliationBroker},"affiliation");
    if(!identity.ok) return vipJson({error:identity.error},400);
    if(body.brokerLinkedVerified!==true) return vipJson({error:"Confirmez le rattachement du compte auprès du broker."},400);
    const deposit=typeof body.verifiedDepositUsd==="number"?body.verifiedDepositUsd:Number(body.verifiedDepositUsd);
    if(!Number.isFinite(deposit)||deposit<300||deposit>100000000) return vipJson({error:"Vérifiez le dépôt réel, hors bonus (minimum 300 $ USD)."},400);
    const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
    const updated=await context.admin.from("vip_member_applications").update({
      status:"approved",reviewed_at:new Date().toISOString(),reviewed_by:context.user.id,
      verified_first_name:identity.identity.first_name,verified_last_name:identity.identity.last_name,
      verified_affiliation_broker:identity.identity.affiliation_broker,verified_deposit_usd:deposit,
      broker_linked_verified:true,claim_expires_at:expiresAt,approval_email_sent_at:null,revision:app.revision+1,
    }).eq("id",app.id).eq("status","submitted").eq("revision",app.revision).select("*").maybeSingle();
    if(updated.error) throw updated.error;
    if(!updated.data) return vipJson({error:"Cette demande a déjà été traitée."},409);
    const access=await issueAccess(context.admin,updated.data);
    if(access.emailSent) {
      const saved=await context.admin.from("vip_member_applications").update({approval_email_sent_at:new Date().toISOString()}).eq("id",app.id).eq("status","approved");
      if(saved.error) console.error("VIP_MEMBER_APPLICATION_EMAIL_STATUS_SAVE_FAILED");
    }
    return vipJson({ok:true,emailSent:access.emailSent,accountCreated:access.accountCreated});
  } catch(error) { return vipErrorResponse(error); }
}

/** Crée ou prépare le compte puis envoie le mail. Un échec ici ne défait pas la validation : « Renvoyer » reprend. */
async function issueAccess(admin:SupabaseClient,app:VipApplicationAccess):Promise<VipAccessIssue> {
  try { return await issueMemberAccess(admin,app); }
  catch { console.error("VIP_MEMBER_ACCESS_ISSUE_FAILED"); return {emailSent:false,accountCreated:false}; }
}
