import {createClient} from '@/lib/supabase/server';
import {database,sameOrigin} from '@/lib/metasync/server';
import {body,brokers,hostedAllowed} from '@/lib/metasync/hosted';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
async function access(){
 const {data:{user}}=await (await createClient()).auth.getUser();
 const admin=!!user&&(process.env.INVESTPRO_ADMIN_USER_IDS??'').split(',').map(s=>s.trim()).includes(user.id);
 return {user,admin,allowed:!!user&&(admin||hostedAllowed(user.id))};
}
export async function GET(req:Request){try{
 const {user,admin,allowed}=await access();if(!user||!allowed)return reply({error:'Accès refusé.'},403);
 const all=new URL(req.url).searchParams.get('admin')==='1';if(all&&!admin)return reply({error:'Accès refusé.'},403);
 let query=database().from('investpro_mt_server_requests').select('id,broker,platform,server,status,created_at,updated_at').order('created_at',{ascending:false}).limit(500);
 if(!all)query=query.eq('user_id',user.id);
 const {data,error}=await query;if(error)throw Error();return reply({requests:data});
}catch{return reply({error:'Demandes indisponibles. Vérifie que la migration SQL a été exécutée.'},503);}}
export async function POST(req:Request){try{
 const {user,admin,allowed}=await access();if(!user||!allowed||!sameOrigin(req))return reply({error:'Accès refusé.'},403);
 const v=await body(req,2000),db=database();
 if(v.action==='review'){
  if(!admin)return reply({error:'Accès refusé.'},403);
  if(!/^[a-f0-9-]{36}$/.test(v.id??'')||!['preparing','declined','available'].includes(v.status))return reply({error:'Demande invalide.'},400);
  if(v.status==='available'){
   if(v.tested!==true||typeof v.template!=='string'||!/^[a-z0-9-]{1,60}$/.test(v.template))return reply({error:'Indique l’identifiant exact du modèle Windows et confirme son test.'},400);
   const {data:request,error}=await db.from('investpro_mt_server_requests').select('platform,server').eq('id',v.id).single();
   if(error||!request)return reply({error:'Demande introuvable.'},404);
   const conflict=brokers().some(b=>(b.id===v.template&&(b.platform!==request.platform||b.server.toLowerCase()!==request.server.toLowerCase()))||(b.platform===request.platform&&b.server.toLowerCase()===request.server.toLowerCase()&&b.id!==v.template));
   if(conflict)return reply({error:'Ce modèle ou ce serveur existe déjà dans la configuration avec une autre correspondance.'},409);
  }
  const {error}=await db.rpc('investpro_review_server',{p_id:v.id,p_status:v.status,p_template:v.status==='available'?v.template:null});
  if(error)return reply({error:'Modification refusée : demande déjà publiée ou modèle déjà associé à un autre serveur.'},409);
 }else{
  const broker=typeof v.broker==='string'?v.broker.trim():'',server=typeof v.server==='string'?v.server.trim():'';
  if(!['MT4','MT5'].includes(v.platform)||broker.length<2||broker.length>80||server.length<2||server.length>120||/[\x00-\x1f\x7f]/.test(broker+server))return reply({error:'Renseigne le broker, MT4 ou MT5 et le nom exact du serveur (sans adresse web).'},400);
  if(/https?:|[\/\\]/i.test(server))return reply({error:'Copie le nom du serveur affiché dans MetaTrader, pas une URL.'},400);
  const {error}=await db.rpc('investpro_request_server',{p_user:user.id,p_broker:broker,p_platform:v.platform,p_server:server});
  if(error)return reply({error:'Demande non enregistrée. Limite : 10 demandes par jour.'},409);
 }
 return reply({ok:true});
}catch{return reply({error:'Enregistrement impossible. Réessaie ou contacte le support.'},503);}}
