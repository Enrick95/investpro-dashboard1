import { authenticateAdmin } from "@/lib/admin/permissions";
import { vipJson } from "@/lib/vip/membership-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const context=await authenticateAdmin(request,"users_write");
  if("error" in context) return vipJson({error:context.error},context.status);
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return vipJson({error:"Demande invalide."},400);
  const {data,error}=await context.admin.from("vip_member_applications").select("proof_path").eq("id",id).maybeSingle();
  if(error||!data?.proof_path) return vipJson({error:"Aucune capture n’est jointe."},404);
  const {data:signed,error:signError}=await context.admin.storage.from("vip-membership-proofs").createSignedUrl(data.proof_path,60);
  if(signError||!signed?.signedUrl) return vipJson({error:"La capture privée est indisponible."},503);
  return vipJson({url:signed.signedUrl});
}
