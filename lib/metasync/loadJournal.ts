import type {SupabaseClient} from '@supabase/supabase-js';
export async function loadJournal(db:SupabaseClient,userId:string){
 const rows:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await db.from('trading_journal').select('*').eq('user_id',userId).order('trade_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+999);
  if(error)return {data:null,error};
  rows.push(...data);if(data.length<1000)return {data:rows,error:null};
 }
}
