export type PerformanceTrade = {account_id:number|null;trade_date:string;status:string;result_r:number;result_amount:number};
export type PerformanceAccount = {id:number;name:string;currency:string;initial_balance:number};
export function tradeDay(value:string){
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(type:string)=>parts.find(p=>p.type===type)?.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export const isClosed=(trade:PerformanceTrade)=>['win','loss','breakeven'].includes(trade.status);
export function performanceSummary(trades:PerformanceTrade[],accounts:PerformanceAccount[]){
 const closed=trades.filter(isClosed);
 const initial=accounts.reduce((sum,a)=>sum+Number(a.initial_balance),0);
 const ids=new Set(accounts.map(a=>String(a.id)));
 const compatible=accounts.length>0&&new Set(accounts.map(a=>a.currency)).size===1&&accounts.every(a=>Number(a.initial_balance)>0)&&initial>0&&closed.every(t=>t.account_id!==null&&ids.has(String(t.account_id))&&Number.isFinite(Number(t.result_amount)));
 const pnl=closed.reduce((sum,t)=>sum+Number(t.result_amount||0),0);
 return {count:closed.length,r:closed.reduce((sum,t)=>sum+Number(t.result_r||0),0),percent:compatible?100*pnl/initial:null};
}
