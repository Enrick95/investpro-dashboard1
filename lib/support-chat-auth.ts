import { createClient } from "@supabase/supabase-js";
export async function supportContext(req: Request) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!key)return {error:"Configuration serveur incomplète",status:503} as const;
 const auth=req.headers.get("authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return {error:"Non authentifié",status:401} as const;
 const publicDb=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await publicDb.auth.getUser(token);
 if(error||!user)return {error:"Session invalide",status:401} as const;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return {user,admin} as const;
}
