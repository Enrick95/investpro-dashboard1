import { randomUUID } from "node:crypto";
import { authenticateVip, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { readVipJson } from "@/lib/vip/membership-server";
import { telegram } from "@/lib/telegram/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET="vip-membership-proofs";

export async function POST(request:Request) {
  if(process.env.VERCEL_ENV==="preview") return vipJson({error:"Finalise ton accès depuis le site principal."},403);
  const context=await authenticateVip(request);
  if("error" in context) return vipJson({error:context.error},context.status);
  if(!context.user.email||!context.user.email_confirmed_at) return vipJson({error:"Confirme ton adresse e-mail avant de continuer."},403);
  try {
    const body=await readVipJson(request);
    const applicationId=typeof body.applicationId==="string"?body.applicationId:"";
    if(!uuid.test(applicationId)) return vipJson({error:"Lien de demande invalide."},400);
    const {data:app,error}=await context.db.from("vip_member_applications").select("*").eq("id",applicationId).eq("email",context.user.email.toLowerCase()).maybeSingle();
    if(error) throw error;
    if(!app) return vipJson({error:"Cette demande ne correspond pas à l’adresse e-mail de ton compte."},403);

    if(app.status==="claimed") {
      if(app.claimed_user_id!==context.user.id||!app.claim_request_id) return vipJson({error:"Cette demande a déjà été rattachée à un autre compte."},409);
      const {data:existing,error:readError}=await context.db.from("vip_access_requests").select("id,status,first_name,last_name,channel_invite_url,member_number,trading_account_id").eq("id",app.claim_request_id).maybeSingle();
      if(readError) throw readError;
      if(existing) return vipJson({ok:true,request:existing});
      return vipJson({error:"L’accès est en cours de finalisation. Contacte l’équipe si le problème persiste."},503);
    }
    if(app.status!=="approved"||!app.claim_expires_at||new Date(app.claim_expires_at).getTime()<=Date.now()) return vipJson({error:"Le dossier n’est pas validé ou le lien a expiré. Écris à @EquipeInvestPro."},409);
    const membership=await context.db.from("vip_memberships").select("user_id").eq("user_id",context.user.id).maybeSingle();
    if(membership.error) throw membership.error;
    if(membership.data) return vipJson({error:"Un accès VIP est déjà rattaché à ton compte."},409);
    if(!app.proof_path||!app.proof_path.startsWith(app.id+"/")) return vipJson({error:"La preuve du dossier est indisponible."},503);

    const extension=/\.([a-z0-9]{2,5})$/i.exec(app.proof_path)?.[1]?.toLowerCase();
    if(!extension||!["jpg","png","webp","pdf"].includes(extension)) return vipJson({error:"Le format de la preuve est invalide."},503);
    const {data:proof,error:proofError}=await context.db.storage.from(BUCKET).download(app.proof_path);
    if(proofError||!proof) return vipJson({error:"La preuve du dossier est temporairement indisponible."},503);
    const proofPath=`${context.user.id}/${randomUUID()}.${extension}`;
    const upload=await context.db.storage.from(BUCKET).upload(proofPath,proof,{contentType:proof.type,upsert:false});
    if(upload.error) return vipJson({error:"Impossible de préparer le dossier pour ton compte. Réessaie."},503);

    const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_VIP_CHAT_ID;
    if(process.env.VERCEL_ENV!=="production"||!token||!chatId) {
      await context.db.storage.from(BUCKET).remove([proofPath]);
      return vipJson({error:"L’invitation Telegram n’est pas configurée. Contacte l’équipe."},503);
    }
    let inviteUrl="";
    try {
      const invite=await telegram("createChatInviteLink",{chat_id:chatId,member_limit:1,expire_date:Math.floor(Date.now()/1000)+3*24*60*60,name:`VIP-${applicationId.slice(0,8)}`}) as {invite_link?:string};
      if(!invite.invite_link||!/^https:\/\/t\.me\//.test(invite.invite_link)) throw new Error("invite_unavailable");
      inviteUrl=invite.invite_link;
    } catch {
      await context.db.storage.from(BUCKET).remove([proofPath]);
      return vipJson({error:"Telegram n’a pas pu créer le lien personnel. Réessaie dans un instant."},503);
    }

    const result=await context.db.rpc("vip_claim_member_application",{
      p_application_id:applicationId,p_user_id:context.user.id,p_email:context.user.email.toLowerCase(),
      p_email_confirmed_at:context.user.email_confirmed_at,p_proof_path:proofPath,p_invite_url:inviteUrl,
    });
    if(result.error||!result.data) {
      try{await telegram("revokeChatInviteLink",{chat_id:chatId,invite_link:inviteUrl});}catch{}
      await context.db.storage.from(BUCKET).remove([proofPath]);
      if(result.error?.message==="vip_membership_exists") return vipJson({error:"Un accès VIP est déjà rattaché à ton compte."},409);
      if(result.error?.message==="vip_member_application_unavailable") return vipJson({error:"Cette demande a déjà été traitée ou le lien a expiré."},409);
      throw result.error||new Error("Application claim failed");
    }
    await context.db.storage.from(BUCKET).remove([app.proof_path]);
    return vipJson({ok:true,request:result.data});
  } catch(error) { return vipErrorResponse(error); }
}
