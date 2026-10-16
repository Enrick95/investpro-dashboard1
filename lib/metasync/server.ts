import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
export {database} from '@/lib/telegram/server';
export const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function pilot(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user&&(process.env.METASYNC_PILOT_USER_IDS??'').split(',').map(v=>v.trim()).includes(user.id)?user:null;
}
const productionOrigins = new Set([
 'https://investprotrading.fr',
 'https://www.investprotrading.fr',
]);

export function sameOrigin(req: Request): boolean {
 const origin = req.headers.get('origin');
 if (!origin || req.headers.get('sec-fetch-site') === 'cross-site' || process.env.VERCEL_ENV === 'preview') return false;
 try {
  // Require the browser's serialized Origin, never Host or forwarding headers.
  if (new URL(origin).origin !== origin) return false;
  // Both verified public domains must work independently of stale origin config.
  if (productionOrigins.has(origin)) return true;
  const development = process.env.VERCEL_ENV === 'development' || (!process.env.VERCEL_ENV && process.env.NODE_ENV !== 'production');
  if (!development) return false;
  const configured = new URL((process.env.METASYNC_SITE_ORIGIN ?? '').trim());
  if (configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash) return false;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname);
  if (configured.protocol !== 'https:' && !(configured.protocol === 'http:' && loopback)) return false;
  return origin === configured.origin;
 } catch {
  return false;
 }
}
