import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
export async function GET() {
 const db=await createClient(); const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
 const {data,error}=await db.from("investpro_notifications").select("id,title,message,href,read_at,created_at")
  .eq("user_id",user.id).order("created_at",{ascending:false}).limit(30);
 if(error)return NextResponse.json({error:"Notifications indisponibles"},{status:503});
 return NextResponse.json({notifications:data||[]},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(req:Request){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
 const {id}=await req.json();if(typeof id!=="string"||!id)return NextResponse.json({error:"ID requis"},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:"Configuration serveur incomplète"},{status:503});
 const admin=createAdminClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await admin.from("investpro_notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);
 if(error)return NextResponse.json({error:"Mise à jour impossible"},{status:503});
 return NextResponse.json({ok:true});
}
