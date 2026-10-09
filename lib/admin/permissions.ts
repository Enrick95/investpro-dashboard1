import { createClient } from "@supabase/supabase-js";
export const PERMISSIONS = ["overview","users","users_write","moderation","inbox","inbox_write","copier","copier_write","finance","analytics","feedback","feedback_write","system","navigation"] as const;
export type AdminPermission = typeof PERMISSIONS[number] | "staff";
export function ownerIds() { return (process.env.INVESTPRO_ADMIN_USER_IDS || "").split(",").map(s=>s.trim()).filter(Boolean); }
export function isOwner(id: string) { return ownerIds().includes(id); }
export async function permissionsFor(userId: string): Promise<{owner:boolean;permissions:string[]}> {
  if (isOwner(userId)) return {owner:true,permissions:[...PERMISSIONS,"staff"]};
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Configuration admin incomplète");
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.from("admin_staff_permissions").select("permissions,enabled").eq("user_id",userId).maybeSingle();
  if(error) throw new Error("Impossible de vérifier les permissions staff");
  return {owner:false,permissions:data?.enabled && Array.isArray(data.permissions)?data.permissions.filter((p:unknown)=>typeof p==="string" && PERMISSIONS.includes(p as typeof PERMISSIONS[number])):[]};
}
export async function canAdmin(userId:string,permission:AdminPermission) { const access=await permissionsFor(userId); return access.owner || access.permissions.includes(permission); }
export async function authenticateAdmin(request:Request,permission?:AdminPermission) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!service) return {error:"Configuration serveur incomplète",status:500} as const;
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token) return {error:"Non authentifié",status:401} as const;
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await auth.auth.getUser(token);
 if(error||!data.user) return {error:"Session invalide",status:401} as const;
 try {
 const access=await permissionsFor(data.user.id);
 if(!access.owner && !(permission?access.permissions.includes(permission):access.permissions.length>0)) return {error:"Accès refusé",status:403} as const;
 return {user:data.user,access,admin:createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})} as const;
 } catch {return {error:"Vérification des droits indisponible",status:503} as const;}
}
