import {timingSafeEqual} from 'node:crypto';
import {recordStripeChannelJoin} from '@/lib/stripe/vip-payments';
import {database,channel} from '@/lib/telegram/server';
import {parseMessage,type Parsed} from '@/lib/telegram/engine';
import {vipDatabase} from '@/lib/vip/membership-server';
import {telegram} from '@/lib/telegram/server';
import {relaunchMember} from '@/lib/telegram/vip-daily';
import {after} from 'next/server';
import {mirrorTelegramPost,type TelegramChannelPost} from '@/lib/vip/telegram-import';
import {deliverVipNotifications} from '@/lib/vip/notifications';
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
  if(u.callback_query&&typeof u.callback_query.data==='string'&&u.callback_query.data.startsWith('viprenew:')) return await handleRenewCallback(u.callback_query);
  if(u.callback_query) return await handleVipMemberCallback(u.callback_query);
  if(u.chat_member) return await handleVipChannelJoin(u.chat_member);
  if(u.message?.chat?.type==='private') return await handlePrivateMessage(u.message);
  const m=u.channel_post??u.edited_channel_post;
  if(!m||m.chat?.type!=='channel'||String(m.chat.id)!==channel())return Response.json({ok:true});
  if(!Number.isSafeInteger(u.update_id)||!Number.isSafeInteger(m.message_id)||!Number.isSafeInteger(m.date)||m.date<=0)return new Response(null,{status:400});
  // Channel-origin posts only; forwarded signals are held for manual review.
  const text=typeof m.text==='string'?m.text:typeof m.caption==='string'?m.caption:'';
  const parsed:Parsed=m.forward_origin?{kind:'review',reason:'Message transféré : vérification manuelle requise.'}:parseMessage(text);
  const reply=m.reply_to_message?.chat?.id===m.chat.id&&Number.isSafeInteger(m.reply_to_message?.message_id)?m.reply_to_message.message_id:null;
  const {error}=await database().rpc('investpro_receive_telegram',{p_chat:channel(),p_message:m.message_id,p_revision:m.edit_date??m.date,p_update:u.update_id,p_date:m.date,p_reply:reply,p_parsed:parsed});
  if(error)return Response.json({error:'Sauvegarde indisponible'},{status:503});
  // The team posts only here: signals and the replies that follow them also reach the VIP space, with a phone alert.
  if(!m.forward_origin)after(()=>mirrorToVip({chatId:channel(),messageId:m.message_id,revision:m.edit_date??m.date,date:m.date,replyTo:reply,text,parsed,edited:!u.channel_post}));
  return Response.json({ok:true});
 }catch{return Response.json({error:'Service indisponible'},{status:503});}
}

/** Runs once Telegram has its answer, so a slow import or alert never delays or repeats the delivery. */
async function mirrorToVip(post:TelegramChannelPost){
 try{
  const db=database();
  // Only a new publication alerts the members; a correction or a repeated delivery stays silent.
  if(await mirrorTelegramPost(db,post)==='created')await deliverVipNotifications(db).catch(()=>console.error('VIP_TELEGRAM_ALERT_FAILED'));
 }catch{console.error('VIP_TELEGRAM_IMPORT_FAILED');}
}

async function handleVipChannelJoin(update:any) {
 try {
  const expected=process.env.TELEGRAM_VIP_CHAT_ID||'';
  const user=update?.new_chat_member?.user;
  const status=update?.new_chat_member?.status;
  const oldStatus=update?.old_chat_member?.status;
  const invite=update?.invite_link?.invite_link;
  if(!expected||String(update?.chat?.id)!==expected||!invite||!user||!['member','administrator','creator'].includes(status)||['member','administrator','creator'].includes(oldStatus)) return Response.json({ok:true});
  const db=vipDatabase();
  const {data}=await db.from('vip_access_requests').select('id').eq('channel_invite_url',invite).eq('status','approved').eq('member_intake',true).maybeSingle();
  if(data) await db.from('vip_access_requests').update({channel_joined_at:new Date().toISOString(),channel_user_id:Number.isSafeInteger(user.id)?user.id:null,channel_username:typeof user.username==='string'?user.username.slice(0,32):null}).eq('id',data.id).eq('status','approved');
  else await recordStripeChannelJoin(db,invite,user).catch(()=>false);
  return Response.json({ok:true});
 } catch { return Response.json({ok:true}); }
}

async function handleVipMemberCallback(q:any) {
 try {
  const match=typeof q?.data==='string'?q.data.match(/^vipmember:(approve|deny):([0-9a-f-]{36})$/i):null;
  const message=q?.message, chat=message?.chat, from=q?.from;
  const adminChat=process.env.TELEGRAM_CHAT_ID||'';
  const allowedIds=(process.env.TELEGRAM_ADMIN_TELEGRAM_IDS||'').split(',').map((v:string)=>v.trim()).filter(Boolean);
  const privateOwner=chat?.type==='private'&&String(chat.id)===adminChat&&String(from?.id)===adminChat;
  if(!match||!adminChat||String(chat?.id)!==adminChat||!(privateOwner||allowedIds.includes(String(from?.id)))) {
    if(q?.id) await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Action réservée à l’équipe InvestPro.',show_alert:true}).catch(()=>{});
    return Response.json({ok:true});
  }
  const [,action,id]=match;
  const reviewer=(process.env.TELEGRAM_ADMIN_USER_IDS||'').split(',').map(v=>v.trim()).find(v=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v));
  if(!reviewer) { await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Admin InvestPro non configuré.',show_alert:true}).catch(()=>{}); return Response.json({ok:true}); }
  const db=vipDatabase();
  const {data:request,error:readError}=await db.from('vip_access_requests').select('id,user_id,first_name,last_name,type,affiliation_broker,paid_on,declared_deposit_usd,verified_deposit_usd,revision,status,request_kind,member_intake,broker_linked_verified').eq('id',id).maybeSingle();
  if(readError||!request||request.status!=='pending'||request.member_intake!==true) { await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Cette demande n’est plus en attente.',show_alert:true}).catch(()=>{}); return Response.json({ok:true}); }
  let inviteUrl:string|null=null;
  if(action==='approve') {
    const channelId=process.env.TELEGRAM_VIP_CHAT_ID;
    if(!channelId) { await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Canal VIP non configuré.',show_alert:true}).catch(()=>{}); return Response.json({ok:true}); }
    try { const invite=await telegram('createChatInviteLink',{chat_id:channelId,member_limit:1,expire_date:Math.floor(Date.now()/1000)+259200,name:`VIP-${id.slice(0,8)}`}) as {invite_link?:string}; inviteUrl=invite.invite_link||null; }
    catch { inviteUrl=null; }
    if(!inviteUrl) { await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Telegram n’a pas créé le lien. Réessaie depuis l’admin.',show_alert:true}).catch(()=>{}); return Response.json({ok:true}); }
  }
  const {error}=await db.rpc('vip_review_access_request_revision',{
    p_request_id:id,p_expected_revision:request.revision||0,p_action:action,p_reviewed_by:reviewer,
    p_first_name:request.first_name,p_last_name:request.last_name,p_type:'affiliation',p_affiliation_broker:request.affiliation_broker,p_paid_on:null,
    p_verified_deposit_usd:action==='approve'?Math.max(300,Number(request.declared_deposit_usd)||300):null,
    p_broker_linked_verified:action==='approve',p_payment_verified:false,
  });
  if(error) { if(inviteUrl) await telegram('revokeChatInviteLink',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,invite_link:inviteUrl}).catch(()=>{}); await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'La demande n’a pas été modifiée. Actualise l’admin.',show_alert:true}).catch(()=>{}); return Response.json({ok:true}); }
  if(action==='approve') {
    const {data:member}=await db.from('vip_memberships').select('member_number').eq('user_id',request.user_id).maybeSingle();
    if(member?.member_number) await db.from('vip_access_requests').update({channel_invite_url:inviteUrl,member_number:member.member_number}).eq('id',id).eq('status','approved');
  } else await db.from('vip_access_requests').update({rejection_reason:'Refusée après vérification par l’équipe. Contacte @EquipeInvestPro si tu as une question.'}).eq('id',id).eq('status','denied');
  await telegram('answerCallbackQuery',{callback_query_id:q.id,text:action==='approve'?'Accès VIP validé.':'Demande refusée.'}).catch(()=>{});
  await telegram('editMessageReplyMarkup',{chat_id:chat.id,message_id:message.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
  await telegram('sendMessage',{chat_id:chat.id,text:action==='approve'?`✅ Accès validé pour ${request.first_name} ${request.last_name}. Le lien personnel a été créé.`:`❌ Demande de ${request.first_name} ${request.last_name} refusée. Le membre recevra le motif générique de refus.`}).catch(()=>{});
  return Response.json({ok:true});
 } catch { return Response.json({ok:true}); }
}

/** Messages privés envoyés au bot : /start et /aide. Aucun contenu n’est enregistré. */
async function handlePrivateMessage(message:any) {
 try {
  const text=typeof message?.text==='string'?message.text.trim():'';
  const chatId=message?.chat?.id;
  if(!Number.isSafeInteger(chatId)||!text.startsWith('/'))return Response.json({ok:true});
  const owner=String(chatId)===(process.env.TELEGRAM_CHAT_ID||'');
  if(/^\/start\b/.test(text)) {
   await telegram('sendMessage',{chat_id:chatId,parse_mode:'HTML',text:owner
    ?'✅ <b>C’est bon, je peux t’écrire.</b>\nTu recevras ici les nouvelles demandes VIP, les retraits d’abonnement et le résumé du matin.'
    :'👋 <b>Bienvenue sur l’assistant InvestPro VIP.</b>\nTes rappels d’abonnement arriveront ici, quelques jours avant la fin de ton accès.\n\nUne question ? Écris à @EquipeInvestPro.'}).catch(()=>{});
  } else if(/^\/aide\b/.test(text)) {
   await telegram('sendMessage',{chat_id:chatId,text:'Pour toute question sur ton accès VIP, écris à @EquipeInvestPro. Rejoindre le VIP : https://investprotrading.fr/vip'}).catch(()=>{});
  }
  return Response.json({ok:true});
 } catch { return Response.json({ok:true}); }
}

/** Bouton « Relancer » envoyé à Enrick après le retrait d’un membre expiré. */
async function handleRenewCallback(q:any) {
 try {
  const adminChat=process.env.TELEGRAM_CHAT_ID||'';
  const match=String(q.data).match(/^viprenew:([0-9a-f-]{36})$/i);
  const chat=q?.message?.chat;
  if(!match||!adminChat||String(chat?.id)!==adminChat||String(q?.from?.id)!==adminChat) {
   await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Action réservée à l’équipe InvestPro.',show_alert:true}).catch(()=>{});
   return Response.json({ok:true});
  }
  const result=await relaunchMember(vipDatabase(),match[1]);
  const label=result==='telegram'?'Relance envoyée sur Telegram ✅':result==='email'?'Relance envoyée par e-mail ✅':'Impossible de le joindre (ni Telegram ni e-mail).';
  await telegram('answerCallbackQuery',{callback_query_id:q.id,text:label,show_alert:result==='none'}).catch(()=>{});
  if(result!=='none') await telegram('editMessageReplyMarkup',{chat_id:chat.id,message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
  return Response.json({ok:true});
 } catch { return Response.json({ok:true}); }
}
