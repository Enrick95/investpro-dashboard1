import {authenticateAdmin} from "@/lib/admin/permissions";
import {vipJson,readVipJson,VipRequestError} from "@/lib/vip/membership-server";
import {deliverVipNotifications} from "@/lib/vip/notifications";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
const categories=["signal","analysis","followup","partnership"];
export async function GET(request:Request) {
  const access=await authenticateAdmin(request,"users_write");
  if("error" in access)return vipJson({error:access.error},access.status);
  const {data,error}=await access.admin.from("vip_posts").select("*").order("created_at",{ascending:false}).limit(100);
  return error?vipJson({error:"Publications indisponibles."},503):vipJson({posts:data||[]});
}
export async function POST(request:Request) {
  try {
    const access=await authenticateAdmin(request,"users_write");
    if("error" in access)return vipJson({error:access.error},access.status);
    const body=await readVipJson(request,20000);
    const title=typeof body.title==="string"?body.title.trim():"";
    const text=typeof body.body==="string"?body.body.trim():"";
    if(!categories.includes(String(body.category))||!title||title.length>160||!text||text.length>12000)return vipJson({error:"Choisissez une catégorie, un titre (160 caractères maximum) et un texte (12 000 caractères maximum)."},400);
    const symbol=typeof body.symbol==="string"?body.symbol.trim().toUpperCase():null;
    if(symbol && !/^[A-Z0-9._-]{1,32}$/.test(symbol))return vipJson({error:"Symbole invalide."},400);
    const direction=body.direction||null;
    if(direction!==null&&direction!=="buy"&&direction!=="sell")return vipJson({error:"Direction invalide."},400);
    const levels:Record<string,number>={};
    if(body.levels && typeof body.levels==="object"&&!Array.isArray(body.levels))for(const key of ["entry","stopLoss","takeProfit","takeProfit2"]){
      const value=(body.levels as Record<string,unknown>)[key];
      if(value===undefined||value===null||value==="")continue;
      if(typeof value!=="number"||!Number.isFinite(value)||value<=0)return vipJson({error:"Les niveaux doivent être des nombres positifs."},400);
      levels[key]=value;
    }
    const imageUrl=typeof body.imageUrl==="string"?body.imageUrl.trim():null;
    if(imageUrl){try{const url=new URL(imageUrl);if(url.protocol!=="https:"||url.username||url.password||imageUrl.length>4096)throw Error();}catch{return vipJson({error:"L’image doit utiliser une adresse HTTPS valide."},400);}}
    const {data:post,error}=await access.admin.from("vip_posts").insert({category:body.category,title,body:text,symbol:symbol||null,direction,levels,image_url:imageUrl||null,created_by:access.user.id,published:true}).select("*").single();
    if(error)throw error;
    // The insert trigger queues one generic notification per active member in the same transaction.
    let notifications:unknown={queued:true};
    try{notifications=await deliverVipNotifications(access.admin);}catch{notifications={queued:true,retryPending:true};}
    return vipJson({post,notifications},201);
  } catch(error){return vipJson({error:error instanceof VipRequestError?error.message:"Publication impossible. Réessayez après avoir actualisé le fil pour vérifier qu’elle n’a pas déjà été publiée."},error instanceof VipRequestError?error.status:503);}
}
