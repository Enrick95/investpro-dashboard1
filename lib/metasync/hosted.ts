import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
export type Broker={id:string;label:string;platform:'MT4'|'MT5';server:string};
export function brokers():Broker[]{
 const rows=JSON.parse(process.env.METASYNC_HOSTED_BROKERS??'[]');
 if(!Array.isArray(rows))throw Error('configuration');
 return rows.filter((b:Broker)=>/^[a-z0-9-]{1,60}$/.test(b.id)&&['MT4','MT5'].includes(b.platform)&&typeof b.label==='string'&&typeof b.server==='string'&&b.server.length<=120&&!/[\r\n\0]/.test(b.server));
}
export function hostedAllowed(id:string){const ids=(process.env.METASYNC_HOSTED_USER_IDS??'').split(',').map(s=>s.trim());return ids.includes('*')||ids.includes(id);}
export async function hostedUser(){
 const {data:{user}}=await (await createClient()).auth.getUser();
 return user&&hostedAllowed(user.id)?user:null;
}
function key(){const value=process.env.METASYNC_HOSTED_ENCRYPTION_KEY??'';if(!/^[a-f0-9]{64}$/.test(value))throw Error('configuration');return Buffer.from(value,'hex');}
export function seal(password:string,owner:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(owner));return Buffer.concat([iv,cipher.update(password,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');}
export function unseal(value:string,owner:string){const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));cipher.setAAD(Buffer.from(owner));cipher.setAuthTag(data.subarray(-16));return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8');}
export function workerAuth(req:Request){const secret=process.env.METASYNC_HOSTED_WORKER_TOKEN??'',given=req.headers.get('authorization')??'';return /^[a-f0-9]{64}$/.test(secret)&&given.length===secret.length+7&&timingSafeEqual(Buffer.from(given),Buffer.from('Bearer '+secret));}
export async function body(req:Request,max=6000){const reader=req.body?.getReader();if(!reader)throw Error('body');let size=0;const parts:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('body');}parts.push(value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
