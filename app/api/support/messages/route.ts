import { NextResponse } from "next/server";
import { supportContext } from "@/lib/support-chat-auth";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const ctx=await supportContext(req);if("error" in ctx)return NextResponse.json({error:ctx.error},{status:ctx.status});
 const id=new URL(req.url).searchParams.get("ticket_id")||"";
 if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"Conversation invalide"},{status:400});
 const {data:ticket,error:tErr}=await ctx.admin.from("support_tickets").select("id,status").eq("id",id).eq("user_id",ctx.user.id).maybeSingle();
 if(tErr||!ticket)return NextResponse.json({error:"Conversation introuvable"},{status:404});
 const {data,error}=await ctx.admin.from("support_messages").select("id,sender_role,body,created_at").eq("ticket_id",id).order("created_at",{ascending:true}).limit(300);
 if(error){console.error("[support/chat] read",error.code);return NextResponse.json({error:"Historique indisponible"},{status:503});}
 return NextResponse.json({messages:data||[],status:ticket.status},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
 const ctx=await supportContext(req);if("error" in ctx)return NextResponse.json({error:ctx.error},{status:ctx.status});
 const b=await req.json().catch(()=>({}));const id=String(b.ticket_id||"");const body=String(b.message||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||body.length<1||body.length>8000)return NextResponse.json({error:"Message invalide"},{status:400});
 const {data:ticket}=await ctx.admin.from("support_tickets").select("id,status").eq("id",id).eq("user_id",ctx.user.id).maybeSingle();
 if(!ticket)return NextResponse.json({error:"Conversation introuvable"},{status:404});
 if(ticket.status==="closed")return NextResponse.json({error:"Conversation fermée"},{status:409});
 const {data,error}=await ctx.admin.from("support_messages").insert({ticket_id:id,sender_id:ctx.user.id,sender_role:"client",body}).select("id,sender_role,body,created_at").single();
 if(error){console.error("[support/chat] insert",error.code);return NextResponse.json({error:"Envoi impossible"},{status:503});}
 await ctx.admin.from("support_tickets").update({status:"open",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",ctx.user.id);
 return NextResponse.json({ok:true,message:data});
}
