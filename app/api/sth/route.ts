import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {createClient as databaseClient,type SupabaseClient} from '@supabase/supabase-js';
import {partnerCall,lotValue} from '@/lib/sth/client';
export const dynamic='force-dynamic';
export const maxDuration=60;
const messages:Record<string,string>={NOT_CONFIGURED:'Connexion partenaire non configurée.',UNKNOWN_RESULT:'Résultat non confirmé. Vérifiez le statut avant toute nouvelle action ; la demande a pu être exécutée.',BUSY:'Une opération est déjà en cours. Patientez puis vérifiez le statut.',LICENCE:'Licence partenaire à faire vérifier auprès de Social Trade Hub.',CAPACITY:'Capacité de la licence atteinte.',SERVER:'Serveur MetaTrader introuvable. Vérifiez son nom exact.',PROVIDER_REJECTED:'Demande refusée par Social Trade Hub. Vérifiez le compte et les paramètres.',LOTS:'Volume invalide ou supérieur à la limite du pilote.',INPUT:'Paramètres invalides.',DB:'Le verrou de connexion n’est pas disponible. Vérifiez la migration Supabase.'};
function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
async function permission(){const c=await createClient();const {data:{user}}=await c.auth.getUser();if(!user)return null;return (process.env.STH_PILOT_USER_IDS||'').split(',').map(v=>v.trim()).includes(user.id)?user:null;}
function enabled(){return process.env.STH_ENABLED==='true'&&process.env.VERCEL_ENV!=='preview';}
export async function GET(){try{
 const user=await permission();if(!user)return json({error:'Copieur bientôt disponible. Accès pilote réservé.'},403);
 if(!enabled())return json({enabled:false,message:'Intégration préparée. Le pilote doit être activé sur le site principal.'});
 const status=await partnerCall('get-user-status',user.id);return json({enabled:true,status,maxLots:Number(process.env.STH_MAX_LOTS||'0.10')});
 }catch(e){return json({error:messages[(e as Error).message]||'Connexion indisponible.'},503);}}
export async function POST(req:Request){
 let db:SupabaseClient|undefined,lock:string|undefined;
 try{
 const user=await permission();if(!user)return json({error:'Accès pilote réservé.'},403);
 if(!enabled())return json({error:'Pilote désactivé sur cet environnement.'},403);
 const origin=process.env.STH_SITE_ORIGIN;if(!origin||new URL(origin).origin!==origin||!origin.startsWith('https://')||req.headers.get('origin')!==origin)return json({error:'Origine refusée.'},403);
 const raw=await req.text();if(raw.length>16000)throw Error('INPUT');let b:any;try{b=JSON.parse(raw);}catch{throw Error('INPUT');}
 let endpoint:string,payload:Record<string,unknown>={};
 if(b.action==='connect'){
 if(b.consent!==true||typeof b.login!=='string'||!/^\d{1,15}$/.test(b.login)||typeof b.password!=='string'||!b.password||b.password.length>256||typeof b.server!=='string'||!b.server.trim()||b.server.length>200||!['MT4','MT5'].includes(b.platform))throw Error('INPUT');
 endpoint='connect-customer-copier';payload={MetatraderLogin:Number(b.login),MetatraderPassword:b.password,MetatraderServer:b.server.trim(),IsMT4:b.platform==='MT4',Lots:lotValue(b.lots)};
 }else if(b.action==='masters'){
 if(b.consent!==true||!Array.isArray(b.masters)||b.masters.length>50)throw Error('INPUT');
 const ids=new Set<string>();payload={MasterAccounts:b.masters.map((m:any)=>{if(typeof m.id!=='string'||!m.id||m.id.length>200||ids.has(m.id))throw Error('INPUT');ids.add(m.id);return {id:m.id,lots:lotValue(m.lots)};})};endpoint='join-master-account';
 }else if(b.action==='disconnect'&&b.consent===true){endpoint='disconnect';}else throw Error('INPUT');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('DB');
 db=databaseClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const token=randomUUID();
 const acquired=await db.rpc('investpro_sth_acquire_lock',{p_token:token});if(acquired.error)throw Error('DB');if(!acquired.data)throw Error('BUSY');lock=token;
 // Do not retry writes: a timed-out operation may already have started copying.
 const status=await partnerCall(endpoint,user.id,payload);
 return json({status,message:'État confirmé par Social Trade Hub.'});
 }catch(e){if((e as Error).message==='UNKNOWN_RESULT')lock=undefined;return json({error:messages[(e as Error).message]||'Connexion indisponible.'},400);}
 finally{if(db&&lock){try{await db.rpc('investpro_sth_release_lock',{p_token:lock});}catch{/* Lock expires automatically. */}}}
}
