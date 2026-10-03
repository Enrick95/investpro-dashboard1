import {randomBytes} from 'node:crypto';
import {database,digest,pilot,sameOrigin} from '@/lib/metasync/server';
export const dynamic='force-dynamic';
export async function GET(){try{
 const user=await pilot();if(!user)return Response.json({enabled:false});
 const {data,error}=await database().from('investpro_mt_connections').select('id,account_id,login,server,revoked,last_sync,warnings,platform').eq('user_id',user.id).order('created_at',{ascending:false});
 if(error)throw Error();return Response.json({enabled:true,connections:data},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Installation SQL ou configuration à vérifier.'},{status:503});}}
export async function POST(req:Request){try{
 const user=await pilot();if(!user)return Response.json({error:'Accès pilote non activé.'},{status:403});
 if(!sameOrigin(req))return Response.json({error:'Origine refusée : vérifier METASYNC_SITE_ORIGIN.'},{status:403});
 const raw=await req.text();if(raw.length>4000)return Response.json({error:'Requête trop longue.'},{status:413});
 const v=JSON.parse(raw),db=database();
 if(v.action==='revoke'){
  const {error}=await db.from('investpro_mt_connections').update({revoked:true}).eq('id',v.id).eq('user_id',user.id);if(error)throw Error();return Response.json({ok:true});
 }
 if(!/^\d{1,30}$/.test(v.login??'')||typeof v.server!=='string'||!v.server.trim()||v.server.length>120||!['real','demo','prop'].includes(v.account_type)||typeof v.currency!=='string'||!/^[A-Z0-9]{2,12}$/.test(v.currency)||typeof v.initial_balance!=='number'||!Number.isFinite(v.initial_balance)||v.initial_balance<=0)return Response.json({error:'Vérifie le numéro, le serveur, la devise et le capital de référence.'},{status:400});
 const platform=v.platform??'MT5';
 if(!['MT4','MT5'].includes(platform))return Response.json({error:'Plateforme invalide.'},{status:400});
 const token=randomBytes(32).toString('hex');
 const {data,error}=await db.rpc('investpro_mt_pair_v2',{p_platform:platform,p_user:user.id,p_login:v.login,p_server:v.server.trim(),p_currency:v.currency,p_initial:v.initial_balance,p_type:v.account_type,p_hash:digest(token)});
 if(error)throw Error();return Response.json({token,account_id:data},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Connexion non créée. Vérifie la migration SQL et la configuration.'},{status:503});}}
