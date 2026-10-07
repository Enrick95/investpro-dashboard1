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
  if (!adminIds().includes(data.user.id)) throw new Error("FORBIDDEN");
  return { user: data.user, admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { admin } = await verifyAdmin(request);
    const from30 = new Date(Date.now() - 30*86400000).toISOString();
    const from7 = new Date(Date.now() - 7*86400000).toISOString();
    const { data, error } = await admin.from("product_events").select("user_id,event_name,page_path,created_at").gte("created_at", from30).order("created_at", { ascending: false }).limit(10000);
    if (error) throw error;
    const rows = data || [];
    const last7 = rows.filter((x:any) => x.created_at >= from7);
    const active7 = new Set(last7.map((x:any)=>x.user_id).filter(Boolean)).size;
    const active30 = new Set(rows.map((x:any)=>x.user_id).filter(Boolean)).size;
    const pageMap = new Map<string, number>();
    const eventMap = new Map<string, number>();
    rows.forEach((row:any) => { if(row.page_path) pageMap.set(row.page_path,(pageMap.get(row.page_path)||0)+1); eventMap.set(row.event_name,(eventMap.get(row.event_name)||0)+1); });
    const topPages = [...pageMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([path,count])=>({path,count}));
    const events = [...eventMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([name,count])=>({name,count}));
    return NextResponse.json({ ok:true, stats:{ active7,active30,events30:rows.length,events7:last7.length }, topPages, events });
  } catch(error:any) {
    const m=String(error?.message||"");
    return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Accès refusé.":m==="UNAUTHORIZED"?"Session expirée.":"Analytics indisponible."},{status:m==="FORBIDDEN"?403:m==="UNAUTHORIZED"?401:500});
  }
}
