import {database,digest} from '@/lib/metasync/server';
import {validateSnapshot} from '@/lib/metasync/payload';
export const runtime='nodejs';
export async function POST(req:Request){
 const token=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!token)return Response.json({error:'Clé manquante.'},{status:401});
 try{
  const db=database(),hash=digest(token);
  const {data:c,error}=await db.from('investpro_mt_connections').select('id,login,server,currency,revoked,user_id').eq('token_hash',hash).maybeSingle();
  if(error)throw Error();
  if(!c||c.revoked||!(process.env.METASYNC_PILOT_USER_IDS??'').split(',').map(v=>v.trim()).includes(c.user_id))return Response.json({error:'Clé invalide ou révoquée.'},{status:401});
  const reader=req.body?.getReader();if(!reader)return Response.json({error:'Corps absent.'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000){await reader.cancel();return Response.json({error:'Lot trop volumineux.'},{status:413});}chunks.push(value);}
  let p;try{p=validateSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{return Response.json({error:'Données invalides.'},{status:400});}
  if(p.login!==c.login||p.server!==c.server||p.currency!==c.currency)return Response.json({error:'Le compte ouvert dans MT5 ne correspond pas au compte associé.'},{status:409});
  const {error:write}=await db.rpc('investpro_mt_receive',{p_connection:c.id,p_hash:hash,p_snapshot:p});
  if(write)throw Error();return Response.json({ok:true,count:p.trades.length});
 }catch{return Response.json({error:'Import indisponible. Aucun succès confirmé ; le connecteur réessaiera.'},{status:503});}
}
