import {randomBytes} from 'node:crypto';
import {database,digest,sameOrigin} from '@/lib/metasync/server';
import {body,brokers,hostedUser,seal} from '@/lib/metasync/hosted';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){try{
 const user=await hostedUser();if(!user)return Response.json({enabled:false},{headers});
 const {data,error}=await database().from('investpro_mt_hosted').select('id,broker_id,active,status,updated_at,capital_auto,capital_reference,capital_method,funding_summary,equity,investpro_mt_connections(login,server,platform,last_sync,account_id,warnings,currency)').eq('user_id',user.id).order('created_at');
 if(error)throw Error();return Response.json({enabled:true,brokers:brokers(),connections:data},{headers});
}catch{return Response.json({error:'Connexion hébergée indisponible : vérifier la configuration.'},{status:503,headers});}}
export async function POST(req:Request){try{
 const user=await hostedUser();if(!user||!sameOrigin(req))return Response.json({error:'Accès refusé.'},{status:403,headers});
 const v=await body(req),db=database();
 if(v.action==='stop'){
  if(typeof v.id!=='string'||!/^[a-f0-9-]{36}$/.test(v.id))return Response.json({error:'Connexion invalide.'},{status:400});
  const {error}=await db.rpc('investpro_hosted_stop',{p_user:user.id,p_id:v.id});if(error)throw Error();return Response.json({ok:true},{headers});
 }
 const b=brokers().find(b=>b.id===v.broker);
 if(!b||!/^\d{1,10}$/.test(v.login??'')||Number(v.login)<=0||(b.platform==='MT4'&&Number(v.login)>2147483647)||typeof v.password!=='string'||!v.password.length||v.password.length>128||/[\r\n\0]/.test(v.password)||v.syncConsent!==true||!['real','demo','prop'].includes(v.type)||!/^[A-Z]{3}$/.test(v.currency??''))return Response.json({error:'Vérifie le numéro, le mot de passe, la devise et coche l’autorisation de synchronisation.'},{status:400,headers});
 const {data,error}=await db.rpc('investpro_hosted_pair_auto',{p_user:user.id,p_platform:b.platform,p_login:v.login,p_server:b.server,p_currency:v.currency,p_type:v.type,p_broker:b.id,p_secret:seal(v.password,user.id),p_hash:digest(randomBytes(32).toString('hex'))});
 if(error)return Response.json({error:'Connexion non créée : limite de 3 comptes, compte déjà associé localement ou configuration à vérifier.'},{status:409,headers});
 return Response.json({ok:true,id:data},{headers});
}catch{return Response.json({error:'Connexion impossible. Réessaie ou contacte le support.'},{status:503,headers});}}
