import {access,database,channel,telegram} from '@/lib/telegram/server';
export const dynamic='force-dynamic';
function target(){const origin=process.env.TELEGRAM_SITE_ORIGIN;if(!origin)throw Error('CONFIG');const u=new URL(origin);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('CONFIG');return u.origin;}
export async function GET(){try{
 if(!(await access()).admin)return Response.json({error:'Accès refusé'},{status:403});
 const info=await telegram('getWebhookInfo');return Response.json({configured:info.url===target()+'/api/telegram/webhook',pending:info.pending_update_count,lastErrorAt:info.last_error_date??null},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Vérifie la configuration Telegram.'},{status:503});}}
export async function POST(req:Request){try{
 if(!(await access()).admin)return Response.json({error:'Accès refusé'},{status:403});
 if(req.headers.get('origin')!==target())return Response.json({error:'Origine refusée'},{status:403});
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET??'';if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))throw Error('CONFIG');
 const me=await telegram('getMe');if(me.username?.toLowerCase()!=='investprotradingbot')return Response.json({error:'Le token ne correspond pas à @InvestProTradingBOT.'},{status:400});
 const chat=await telegram('getChat',{chat_id:channel()});if(chat.type!=='channel')throw Error('CONFIG');
 const membership=await telegram('getChatMember',{chat_id:channel(),user_id:me.id});if(membership.status!=='administrator')return Response.json({error:'Ajoute le bot comme administrateur du canal.'},{status:400});
 const {error}=await database().from('investpro_telegram_events').select('message_id').limit(1);if(error)throw Error('DB');
 const url=target()+'/api/telegram/webhook';const info=await telegram('getWebhookInfo');
 if(info.url&&info.url!==url)return Response.json({error:'Ce bot est déjà relié à une autre adresse. Vérifie cette connexion avant de la remplacer.'},{status:409});
 await telegram('setWebhook',{url,secret_token:secret,allowed_updates:['channel_post','edited_channel_post'],drop_pending_updates:false,max_connections:2});
 const check=await telegram('getWebhookInfo');return Response.json({ok:check.url===url,message:'Adresse enregistrée. Publie un message ordinaire dans le canal puis actualise pour vérifier sa réception.'});
}catch{return Response.json({error:'Échec : vérifier le token, les variables, le canal et la migration Supabase.'},{status:503});}}
