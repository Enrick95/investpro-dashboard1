// This pilot receives closed MT5 positions only. It never executes trades.
export type SyncTrade={external_id:string;symbol:string;direction:'buy'|'sell';entry_price:number;trade_date:string;result_amount:number};
export type Snapshot={login:string;server:string;currency:string;balance:number;equity:number;observed_at:string;trades:SyncTrade[];warnings:string[]};
export function validateSnapshot(x:unknown):Snapshot{
 if(!x||typeof x!=='object')throw Error('Format invalide');
 const v=x as Record<string,unknown>;
 const str=(x:unknown,max:number)=>typeof x==='string'&&x.length>0&&x.length<=max;
 const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1e12;
 if(!str(v.login,30)||!/^\d+$/.test(v.login as string)||!str(v.server,120)||!str(v.currency,12)||!finite(v.balance)||!finite(v.equity))throw Error('Compte invalide');
 const stamp=typeof v.observed_at==='string'?Date.parse(v.observed_at):NaN;
 if(!Number.isFinite(stamp)||stamp>Date.now()+300000||stamp<Date.now()-86400000)throw Error('Horodatage invalide');
 if(!Array.isArray(v.trades)||v.trades.length>500||!Array.isArray(v.warnings)||v.warnings.length>20||v.warnings.some(w=>!str(w,300)))throw Error('Lot trop volumineux');
 const ids=new Set<string>();
 for(const t of v.trades){
  if(!t||!str(t.external_id,50)||!/^mt5:\d+$/.test(t.external_id)||ids.has(t.external_id)||!str(t.symbol,40)||!['buy','sell'].includes(t.direction)||!finite(t.entry_price)||t.entry_price<=0||!finite(t.result_amount)||typeof t.trade_date!=='string'||!Number.isFinite(Date.parse(t.trade_date))||Date.parse(t.trade_date)>stamp+300000)throw Error('Trade invalide');
  ids.add(t.external_id);
 }
 return v as unknown as Snapshot;
}
