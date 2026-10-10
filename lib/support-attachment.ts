import { NextResponse } from "next/server";
import { supportContext } from "@/lib/support-chat-auth";
import { authenticateAdmin } from "@/lib/admin/permissions";

export async function uploadSupportImage(req: Request, isAdmin = false) {
 if(isAdmin){const permitted=await authenticateAdmin(req,"inbox_write");if("error" in permitted)return NextResponse.json({error:permitted.error},{status:permitted.status});}
 const ctx=await supportContext(req);if("error" in ctx)return NextResponse.json({error:ctx.error},{status:ctx.status});
 const form=await req.formData().catch(()=>null);
 const id=String(form?.get("ticket_id")||"");const file=form?.get("file");
 if(!/^[0-9a-f-]{36}$/i.test(id)||!(file instanceof File))return NextResponse.json({error:"Pièce jointe invalide"},{status:400});
 const types:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
 if(!types[file.type]||file.size>5*1024*1024||file.size===0)return NextResponse.json({error:"Image JPG, PNG ou WebP de 5 Mo maximum"},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());
 const valid=file.type==="image/png"?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:file.type==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(!valid)return NextResponse.json({error:"Format image invalide"},{status:400});
 let q=ctx.admin.from("support_tickets").select("id,status,user_id").eq("id",id);
 if(!isAdmin)q=q.eq("user_id",ctx.user.id);
 const {data:ticket}=await q.maybeSingle();
 if(!ticket)return NextResponse.json({error:"Conversation introuvable"},{status:404});
 if(ticket.status==="closed")return NextResponse.json({error:"Conversation définitivement clôturée"},{status:409});
 const path=`${ticket.user_id}/${id}/${crypto.randomUUID()}.${types[file.type]}`;
 const {error:up}=await ctx.admin.storage.from("support-attachments").upload(path,bytes,{contentType:file.type,upsert:false});
 if(up){console.error("[support/attachment] upload",up.message);return NextResponse.json({error:"Envoi de l’image impossible"},{status:503});}
 const {data,error}=await ctx.admin.from("support_messages").insert({ticket_id:id,sender_id:ctx.user.id,sender_role:isAdmin?"staff":"client",body:"📎 Image jointe",attachment_path:path}).select("id").single();
 if(error){await ctx.admin.storage.from("support-attachments").remove([path]);console.error("[support/attachment] message",error.code);return NextResponse.json({error:"Conversation indisponible"},{status:409});}
 const now=new Date().toISOString();await ctx.admin.from("support_tickets").update({status:isAdmin?"answered":"open",updated_at:now}).eq("id",id).neq("status","closed");
 if(isAdmin){await ctx.admin.from("investpro_notifications").insert({user_id:ticket.user_id,event_key:`support_image:${data.id}`,title:"Nouvelle réponse du support",message:"L’équipe InvestPro a partagé une image.",href:"/dashboard",created_at:now});}
 return NextResponse.json({ok:true});
}
