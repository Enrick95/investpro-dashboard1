'use client';
type Trade={account_id:number|null;status:string;result_amount:number;trade_date:string};
export default function SyncReport({trades,currency}:{trades:Trade[];currency:string|null}){
 const rows=trades.filter(t=>['win','loss','breakeven'].includes(t.status)).sort((a,b)=>a.trade_date.localeCompare(b.trade_date));
 const wins=rows.filter(t=>t.result_amount>0).length,losses=rows.filter(t=>t.result_amount<0).length,be=rows.length-wins-losses;
 const positive=rows.reduce((n,t)=>n+Math.max(t.result_amount,0),0),negative=rows.reduce((n,t)=>n+Math.max(-t.result_amount,0),0),pnl=positive-negative;
 const money=(n:number)=>currency?`${n.toLocaleString('fr-FR',{maximumFractionDigits:2})} ${currency}`:'Multi-devises';
 let running=0;const values=[0,...rows.map(t=>running+=t.result_amount)],min=Math.min(...values),max=Math.max(...values),span=max-min||1;
 const points=values.map((v,i)=>`${20+i/Math.max(values.length-1,1)*960},${220-(v-min)/span*180}`).join(' ');
 return <section className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Trades clôturés',String(rows.length)],['Winrate hors BE',wins+losses?`${(100*wins/(wins+losses)).toFixed(1)} %`:'—'],['Gains / pertes / BE',`${wins} / ${losses} / ${be}`],['PnL net',money(pnl)],['Profit factor',currency?(negative?(positive/negative).toFixed(2):'—'):'—']].map(([label,value])=><div className="rounded-xl border border-white/10 p-4" key={label}><span className="text-sm text-white/60">{label}</span><strong className="block text-xl">{value}</strong></div>)}</div>
 <div className="rounded-2xl border border-white/10 p-5"><h2>Évolution du PnL réalisé {currency?`(${currency})`:''}</h2>{rows.length&&currency?<svg role="img" aria-label="Courbe du PnL cumulé" className="h-56 w-full" viewBox="0 0 1000 250" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="#ffc867" strokeWidth="3"/></svg>:<p className="py-10">Sélectionne un compte avec des trades clôturés pour afficher sa courbe.</p>}</div>
 <p className="text-sm text-white/60">Historique importé : le stop initial n’est pas disponible. Les statistiques en R, de risque et de discipline ne sont pas calculées pour cette sélection. MT4 compte les tickets clôturés, y compris les clôtures partielles ; MT5 compte les positions entièrement clôturées. Les avertissements d’import sont dans Mes comptes.</p></section>;
}
