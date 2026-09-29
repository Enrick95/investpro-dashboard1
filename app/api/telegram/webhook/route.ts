import {timingSafeEqual} from 'node:crypto';
import {database,channel} from '@/lib/telegram/server';
import {parseMessage} from '@/lib/telegram/engine';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET,provided=req.headers.get('x-telegram-bot-api-secret-token')??'';
 if(!secret||secret.length<32)return Response.json({error:'Configuration requise'},{status:503});
 if(Buffer.byteLength(provided)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(secret),Buffer.from(provided)))return Response.json({error:'Unauthorized'},{status:401});
 try{
  if(Number(req.headers.get('content-length')??0)>65536)return new Response(null,{status:413});
  const raw=await req.text();if(Buffer.byteLength(raw)>65536)return new Response(null,{status:413});
  let u;try{u=JSON.parse(raw);}catch{return new Response(null,{status:400});}
  const m=u.channel_post??u.edited_channel_post;
  if(!m||m.chat?.type!=='channel'||String(m.chat.id)!==channel())return Response.json({ok:true});
  if(!Number.isSafeInteger(u.update_id)||!Number.isSafeInteger(m.message_id)||!Number.isSafeInteger(m.date)||m.date<=0)return new Response(null,{status:400});
  // Channel-origin posts only; forwarded signals are held for manual review.
  const text=typeof m.text==='string'?m.text:typeof m.caption==='string'?m.caption:'';
  const parsed=m.forward_origin?{kind:'review',reason:'Message transféré : vérification manuelle requise.'}:parseMessage(text);
  const reply=m.reply_to_message?.chat?.id===m.chat.id&&Number.isSafeInteger(m.reply_to_message?.message_id)?m.reply_to_message.message_id:null;
  const {error}=await database().rpc('investpro_receive_telegram',{p_chat:channel(),p_message:m.message_id,p_revision:m.edit_date??m.date,p_update:u.update_id,p_date:m.date,p_reply:reply,p_parsed:parsed});
  if(error)return Response.json({error:'Sauvegarde indisponible'},{status:503});
  return Response.json({ok:true});
 }catch{return Response.json({error:'Service indisponible'},{status:503});}
}
