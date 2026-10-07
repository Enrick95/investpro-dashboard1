import type {SupabaseClient} from '@supabase/supabase-js';
import {loadActiveTradingScope,scopeTradesToActiveAccounts} from '@/lib/trading/activeScope';
export async function loadJournal(db:SupabaseClient,userId:string){
 const rows:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await db.from('trading_journal').select('*').eq('user_id',userId).order('trade_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+999);
  if(error)return {data:null,error};
  rows.push(...data);
  if(data.length<1000)break;
 }
 const scope=await loadActiveTradingScope(db,userId);
 const scoped=scopeTradesToActiveAccounts(rows as Array<Record<string,unknown>&{account_id:number|null}>,scope.activeIds);
 return {data:scoped,error:null};
}
