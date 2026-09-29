import {access,database,channel} from '@/lib/telegram/server';
import {buildStats,type Event} from '@/lib/telegram/engine';
export const dynamic='force-dynamic';
export async function GET(){try{
 const permission=await access();if(!permission.allowed)return Response.json({error:'Accès pilote réservé aux utilisateurs autorisés.'},{status:403});
 const db=database(),events:Event[]=[];
 // Explicit pagination avoids Supabase's default 1000-row truncation.
 for(let offset=0;;offset+=1000){const {data,error}=await db.from('investpro_telegram_events').select('message_id,date,reply_to,parsed,received_at').eq('chat_id',channel()).order('message_id').range(offset,offset+999);if(error)throw Error('DB');events.push(...(data as Event[]));if(data.length<1000)break;if(events.length>=100000)throw Error('LIMIT');}
 const result=buildStats(events);const last=events.reduce((s,e)=>(e.received_at??'')>s?e.received_at!:s,'');
 return Response.json({trades:result.trades,issues:permission.admin?result.issues:[],reviewCount:result.issues.length,lastReceived:last||null,admin:permission.admin},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Connexion non configurée ou base indisponible.'},{status:503});}}
