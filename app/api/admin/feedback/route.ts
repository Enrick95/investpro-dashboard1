import { authenticateAdmin } from "@/lib/admin/permissions";
import { canAdmin } from "@/lib/admin/permissions";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
}
async function verifyAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) throw new Error("SERVER_CONFIG");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  if (!await canAdmin(data.user.id, "feedback")) throw new Error("FORBIDDEN");
  return { user: data.user, admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { admin } = await verifyAdmin(request);
    const { data, error } = await admin.from("user_feedback").select("*").order("created_at",{ascending:false}).limit(300);
    if(error) throw error;
    const ids=[...new Set((data||[]).map((x:any)=>x.user_id).filter(Boolean))];
    const {data:profiles}=ids.length?await admin.from("profiles").select("id,username,plan").in("id",ids):{data:[]} as any;
    const map=new Map((profiles||[]).map((x:any)=>[x.id,x]));
    return NextResponse.json({ok:true,items:(data||[]).map((x:any)=>({...x,member:map.get(x.user_id)||null}))});
  } catch(error:any) { const m=String(error?.message||""); return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Accès refusé.":"Feedback indisponible."},{status:m==="FORBIDDEN"?403:500}); }
}
export async function PATCH(request: Request) {
  const pcheck=await authenticateAdmin(request,"feedback_write");
  if("error" in pcheck)return NextResponse.json({error:pcheck.error},{status:pcheck.status});
  try {
    const { admin } = await verifyAdmin(request);
    const body=await request.json();
    const id=String(body?.id||"");
    const status=["new","reviewed","resolved","closed"].includes(String(body?.status))?String(body.status):"reviewed";
    const note=String(body?.admin_note||"").slice(0,4000);
    if(!id) return NextResponse.json({ok:false,error:"ID manquant."},{status:400});
    const {error}=await admin.from("user_feedback").update({status,admin_note:note||null,updated_at:new Date().toISOString()}).eq("id",id);
    if(error) throw error;
    return NextResponse.json({ok:true});
  } catch(error:any) { return NextResponse.json({ok:false,error:String(error?.message||"Action impossible.")},{status:500}); }
}
