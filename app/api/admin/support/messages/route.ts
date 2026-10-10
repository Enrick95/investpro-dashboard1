import { notifySupportReply } from "@/lib/support-notification-delivery";
import { NextResponse } from "next/server";
import { supportContext } from "@/lib/support-chat-auth";
import { authenticateAdmin } from "@/lib/admin/permissions";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const permitted=await authenticateAdmin(req,"inbox");if("error" in permitted)return NextResponse.json({error:permitted.error},{status:permitted.status});
 const ctx=await supportContext(req);if("error" in ctx)return NextResponse.json({error:ctx.error},{status:ctx.status});
 const id=new URL(req.url).searchParams.get("ticket_id")||"";
 if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"Conversation invalide"},{status:400});
 const {data:ticket}=await ctx.admin.from("support_tickets").select("id").eq("id",id).maybeSingle();
 if(!ticket)return NextResponse.json({error:"Conversation introuvable"},{status:404});
 const {data,error}=await ctx.admin.from("support_messages").select("id,sender_role,body,created_at").eq("ticket_id",id).order("created_at",{ascending:true}).limit(300);
 if(error){console.error("[admin/chat] read",error.code);return NextResponse.json({error:"Historique indisponible"},{status:503});}
 return NextResponse.json({messages:data||[]},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
 const permitted=await authenticateAdmin(req,"inbox_write");if("error" in permitted)return NextResponse.json({error:permitted.error},{status:permitted.status});
 const ctx=await supportContext(req);if("error" in ctx)return NextResponse.json({error:ctx.error},{status:ctx.status});
 const b=await req.json().catch(()=>({}));const id=String(b.ticket_id||"");const body=String(b.message||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||body.length<1||body.length>8000)return NextResponse.json({error:"Message invalide"},{status:400});
 const {data:ticket}=await ctx.admin.from("support_tickets").select("id,user_id,status").eq("id",id).maybeSingle();
 if(!ticket)return NextResponse.json({error:"Conversation introuvable"},{status:404});
 if(ticket.status==="closed")return NextResponse.json({error:"Rouvrez la conversation avant de répondre"},{status:409});
 const {data,error}=await ctx.admin.from("support_messages").insert({ticket_id:id,sender_id:ctx.user.id,sender_role:"staff",body}).select("id,sender_role,body,created_at").single();
 if(error){console.error("[admin/chat] insert",error.code);return NextResponse.json({error:"Réponse impossible"},{status:503});}
 const now=new Date().toISOString();
 await ctx.admin.from("support_tickets").update({status:"answered",admin_reply:body,answered_at:now,updated_at:now,assigned_admin_id:ctx.user.id}).eq("id",id);
 const {error:noticeError}=await ctx.admin.from("investpro_notifications").insert({user_id:ticket.user_id,event_key:`support_reply:${data.id}`,title:"Nouvelle réponse du support",message:"L’équipe InvestPro a répondu à votre demande.",href:"/dashboard/copieur",created_at:now});
 if(noticeError)console.error("[admin/chat] notification",noticeError.code);
 await notifySupportReply(ticket.user_id,id,"Assistance");
 return NextResponse.json({ok:true,message:data,notification_sent:!noticeError});
}
