import {database} from '@/lib/metasync/server';
import {body,unseal,workerAuth,hostedAllowed} from '@/lib/metasync/hosted';
import {validateHostedSnapshot} from '@/lib/metasync/hosted-capital';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const headers={'Cache-Control':'no-store'};
 if(!workerAuth(req))return Response.json({error:'unauthorized'},{status:401,headers});
 try{
  const v=await body(req,500000),db=database();
  if(!/^[a-f0-9-]{36}$/.test(v.worker??''))return Response.json({error:'worker'},{status:400,headers});
  if(v.action==='poll'){
   const {data:lease,error}=await db.rpc('investpro_hosted_lease',{p_worker:v.worker});if(error)throw Error();if(!lease)return Response.json({error:'another_worker'},{status:409,headers});
   const {data:jobs,error:read}=await db.from('investpro_mt_hosted').select('id,user_id,broker_id,secret,generation,allow_trading_password,investpro_mt_connections!inner(login,server,currency,platform,revoked)').eq('active',true).eq('investpro_mt_connections.revoked',false).order('created_at').limit(200);
   if(read)throw Error();
   return Response.json({jobs:(jobs??[]).filter(j=>hostedAllowed(j.user_id)).map(j=>({...j,user_id:undefined,secret:undefined,password:unseal(j.secret,j.user_id)}))},{headers});
  }
  if(!/^[a-f0-9-]{36}$/.test(v.id??'')||!Number.isInteger(v.generation))return Response.json({error:'job'},{status:400,headers});
  const {data:owner}=await db.from('investpro_mt_hosted').select('user_id').eq('id',v.id).maybeSingle();
  if(!owner||!hostedAllowed(owner.user_id))return Response.json({error:'access_removed'},{status:409,headers});
  let snapshot=null;if(v.snapshot){try{snapshot=validateHostedSnapshot(v.snapshot);}catch{return Response.json({error:'snapshot'},{status:400,headers});}}
  const {error}=await db.rpc('investpro_hosted_receive_v2',{p_worker:v.worker,p_id:v.id,p_generation:v.generation,p_status:v.status,p_snapshot:snapshot});
  if(error)return Response.json({error:'stale_or_invalid'},{status:409,headers});return Response.json({ok:true},{headers});
 }catch{return Response.json({error:'unavailable'},{status:503,headers});}
}
