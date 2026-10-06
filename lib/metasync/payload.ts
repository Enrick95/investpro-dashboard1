// This pilot receives closed MT4 tickets and MT5 positions. It never executes trades.
export type SyncTrade={external_id:string;symbol:string;direction:'buy'|'sell';entry_price:number;trade_date:string;result_amount:number};
export type Snapshot={platform:'MT4'|'MT5';login:string;server:string;currency:string;balance:number;equity:number;observed_at:string;trades:SyncTrade[];warnings:string[]};
export function validateSnapshot(x:unknown):Snapshot{
 if(!x||typeof x!=='object')throw Error('Format invalide');
 const v=x as Record<string,unknown>;
 const platform=v.platform??'MT5'; // Preserve existing MT5 Windows connectors.
 if(platform!=='MT4'&&platform!=='MT5')throw Error('Plateforme invalide');
 const str=(x:unknown,max:number)=>typeof x==='string'&&x.length>0&&x.length<=max;
 const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1e12;
 if(!str(v.login,30)||!/^\d+$/.test(v.login as string)||!str(v.server,120)||!str(v.currency,12)||!finite(v.balance)||!finite(v.equity))throw Error('Compte invalide');
 const stamp=typeof v.observed_at==='string'?Date.parse(v.observed_at):NaN;
 if(!Number.isFinite(stamp)||stamp>Date.now()+300000||stamp<Date.now()-86400000)throw Error('Horodatage invalide');
 if(!Array.isArray(v.trades)||v.trades.length>500||!Array.isArray(v.warnings)||v.warnings.length>20||v.warnings.some(w=>!str(w,300)))throw Error('Lot trop volumineux');
 // Trade times can carry the broker wall clock (MT5) or broker date (MT4).
 // Allow a bounded 24h offset; observed_at still requires a fresh UTC timestamp.
 const maxTradeStamp=stamp+86400000;
 const ids=new Set<string>();
 for(const t of v.trades){
  if(!t||!str(t.external_id,50)||!new RegExp('^'+platform.toLowerCase()+':\\d+$').test(t.external_id)||ids.has(t.external_id)||!str(t.symbol,40)||!['buy','sell'].includes(t.direction)||!finite(t.entry_price)||t.entry_price<=0||!finite(t.result_amount)||typeof t.trade_date!=='string'||!Number.isFinite(Date.parse(t.trade_date))||Date.parse(t.trade_date)>maxTradeStamp||(platform==='MT4'&&(!/^\d{4}-\d{2}-\d{2}$/.test(t.trade_date)||new Date(t.trade_date).toISOString().slice(0,10)!==t.trade_date)))throw Error('Trade invalide');
  ids.add(t.external_id);
 }
 return {...v,platform} as unknown as Snapshot;
}
