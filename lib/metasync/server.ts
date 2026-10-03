import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
export {database} from '@/lib/telegram/server';
export const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function pilot(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user&&(process.env.METASYNC_PILOT_USER_IDS??'').split(',').map(v=>v.trim()).includes(user.id)?user:null;
}
export function sameOrigin(req:Request){
 const expected=process.env.METASYNC_SITE_ORIGIN;
 return !!expected&&req.headers.get('origin')===expected;
}
