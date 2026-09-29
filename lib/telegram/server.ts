import {createClient as supabase} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
export function database(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('CONFIG');
 return supabase(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function channel(){const id=process.env.TELEGRAM_VIP_CHAT_ID??'';if(!/^-100\d+$/.test(id))throw Error('CONFIG');return id;}
export async function access(){
 const client=await createClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)return {allowed:false,admin:false};
 const admin=(process.env.TELEGRAM_ADMIN_USER_IDS??'').split(',').map(s=>s.trim()).includes(user.id);
 // Pilot access is explicit; no reliance on the existing client-side admin cookie.
 const reader=(process.env.TELEGRAM_READER_USER_IDS??'').split(',').map(s=>s.trim()).includes(user.id);
 return {allowed:admin||reader,admin};
}
export async function telegram(method:string,body:Record<string,unknown>={}){
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw Error('CONFIG');
 try{
 const res=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(10000)});
 const data=await res.json();if(!res.ok||!data.ok)throw Error('TELEGRAM');return data.result;
 }catch{throw Error('TELEGRAM');} // Never propagate token-bearing network URLs.
}
