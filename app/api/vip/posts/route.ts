import {requireVipAccess,vipJson} from "@/lib/vip/membership-server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const access=await requireVipAccess(request);
    if("error" in access)return vipJson({error:access.error},access.status);
    const {data,error}=await access.db.from("vip_posts").select("id,category,title,body,symbol,direction,levels,image_url,created_at,updated_at,published").eq("published",true).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    return vipJson({posts:data||[]});
  } catch {return vipJson({error:"Les publications privées sont indisponibles."},503);}
}
