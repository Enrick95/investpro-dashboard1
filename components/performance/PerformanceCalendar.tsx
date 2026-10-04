'use client';
import {Fragment,useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {isClosed,tradeDay,performanceSummary,type PerformanceAccount,type PerformanceTrade} from '@/lib/performance';

const signed=(value:number,suffix:string)=>`${value>0?'+':''}${value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})}${suffix}`;
const tone=(value:number|null)=>value===null?'':value>0?'positive':value<0?'negative':'';

export default function PerformanceCalendar({trades,accounts,accountId='all',accountPicker=false}:{trades:PerformanceTrade[];accounts:PerformanceAccount[];accountId?:number|'all';accountPicker?:boolean}){
 const [localAccount,setLocalAccount]=useState('all');
 const scope=accountPicker?localAccount:String(accountId);
 const scopedAccounts=useMemo(()=>accounts.filter(a=>scope==='all'||String(a.id)===scope),[accounts,scope]);
 const closed=useMemo(()=>trades.filter(t=>isClosed(t)&&(scope==='all'||String(t.account_id)===scope)&&tradeDay(t.trade_date)),[trades,scope]);
 const latest=closed.map(t=>tradeDay(t.trade_date)).sort().at(-1)?.slice(0,7)||tradeDay(new Date().toISOString()).slice(0,7);
 const [month,setMonth]=useState(latest);
 useEffect(()=>setMonth(latest),[latest,scope]);
 const monthly=closed.filter(t=>tradeDay(t.trade_date).startsWith(month));
 const currencies=new Set(scopedAccounts.map(a=>a.currency.trim().toUpperCase()));
 const currency=currencies.size===1?[...currencies][0]:null;
 const ids=new Set(scopedAccounts.map(a=>String(a.id)));
 const summary=(items:PerformanceTrade[])=>{
  const result=performanceSummary(items,scopedAccounts);
  const valid=!!currency&&items.every(t=>t.account_id!==null&&ids.has(String(t.account_id))&&t.result_amount!=null&&Number.isFinite(Number(t.result_amount)));
  return {count:items.length,amount:valid?items.reduce((sum,t)=>sum+Number(t.result_amount),0):null,percent:valid?result.percent:null};
 };
 const money=(value:number|null)=>{
  if(value===null||!currency)return '—';
  try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency,currencyDisplay:'narrowSymbol',signDisplay:'exceptZero',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);}
  catch{return signed(value,` ${currency}`);}
 };
 const total=summary(monthly);
 const [year,m]=month.split('-').map(Number);
 const first=new Date(year,m-1,1,12),offset=(first.getDay()+6)%7;
 const days=Array.from({length:Math.ceil((offset+new Date(year,m,0).getDate())/7)*7},(_,i)=>{
  const date=new Date(year,m-1,1+i-offset,12);
  const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return {date,key,inMonth:date.getMonth()===m-1,items:monthly.filter(t=>tradeDay(t.trade_date)===key)};
 });
 const weeks=Array.from({length:days.length/7},(_,i)=>days.slice(i*7,i*7+7));
 const move=(delta:number)=>{const date=new Date(year,m-1+delta,1,12);setMonth(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`);};
 const today=tradeDay(new Date().toISOString());
 return <section className="perf-calendar" aria-label="Calendrier de performance">
  <header><div><h2>Calendrier de performance</h2><p>Résultat net · montant et pourcentage{currency?` · ${currency}`:''}</p></div>
   <div className="controls">
    {accountPicker&&<select aria-label="Compte du calendrier" value={localAccount} onChange={e=>setLocalAccount(e.target.value)}><option value="all">Tous les comptes</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>}
    <button type="button" onClick={()=>move(-1)} aria-label="Mois précédent"><ChevronLeft size={18}/></button>
    <input aria-label="Mois du calendrier" type="month" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)&&Number(e.target.value.slice(0,4))>=1000)setMonth(e.target.value);}}/>
    <button type="button" onClick={()=>move(1)} aria-label="Mois suivant"><ChevronRight size={18}/></button>
   </div>
  </header>
  <div className={`monthly ${tone(total.amount)}`}><div><span>Bilan du mois</span><small>{first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</small></div><div className="monthly-value"><strong>{money(total.amount)}</strong><b>{total.percent===null?'— %':signed(total.percent,' %')}</b></div></div>
  <div className="grid-scroll" role="region" aria-label="Performances quotidiennes et hebdomadaires" tabIndex={0}><div className="grid">
   {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim','Semaine'].map(day=><div key={day} className="weekday">{day}</div>)}
   {weeks.map((week,index)=>{
    const weekly=summary(week.flatMap(day=>day.items));
    return <Fragment key={week[0].key}>{week.map(({key,date,inMonth,items})=>{
     const result=summary(items);
     return <div key={key} className={`day ${inMonth?'':'outside'} ${items.length?tone(result.amount):''}`} aria-label={inMonth?`${date.toLocaleDateString('fr-FR')}, ${items.length?money(result.amount):'aucun résultat'}`:undefined}>
      <span className={key===today?'today':''}>{date.getDate()}</span>
      {inMonth&&result.count>0?<div className="values"><strong>{money(result.amount)}</strong><b>{result.percent===null?'— %':signed(result.percent,' %')}</b></div>:<span className="empty">—</span>}
     </div>;
    })}<div className={`day week-total ${weekly.count?tone(weekly.amount):''}`}><span>S{index+1}</span>{weekly.count?<div className="values"><strong>{money(weekly.amount)}</strong><b>{weekly.percent===null?'— %':signed(weekly.percent,' %')}</b></div>:<span className="empty">—</span>}</div></Fragment>;
   })}
  </div></div>
  {!monthly.length&&<p className="note">Aucun trade clôturé pour ce mois avec les filtres actuels.</p>}
  <p className="note">% calculé sur le capital de départ{scope==='all'?' total des comptes sélectionnés':''}. Les filtres de la page s’appliquent au calendrier.</p>
  {total.amount===null?<p className="note">Sélectionnez un compte pour afficher les montants et pourcentages. Les devises différentes ne sont pas additionnées et chaque trade doit être associé à un compte.</p>:total.percent===null&&<p className="note">Renseignez un capital de départ positif pour afficher les pourcentages.</p>}
  <style jsx>{`
   .perf-calendar{border:1px solid var(--border,#655537);background:var(--panel,#111210);border-radius:20px;padding:24px;margin:20px 0;color:#eee;min-width:0}
   header,.controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h2{font-size:18px;font-weight:650;margin:0}p{font-size:12px;color:#a6aaa6;line-height:1.6;margin:6px 0}
   button,select,input{min-height:44px;border:1px solid #ffffff20;border-radius:10px;background:#171916;color:#eee;padding:8px;font-size:14px;color-scheme:dark}input{max-width:165px}select{max-width:220px}button{display:grid;place-items:center;min-width:44px;cursor:pointer}button:hover{border-color:#cba760}button:focus-visible,input:focus-visible,select:focus-visible,.grid-scroll:focus-visible{outline:2px solid #cba760;outline-offset:3px}
   .monthly{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:22px 0 18px;padding:18px 20px;border:1px solid #ffffff15;border-radius:12px;background:#ffffff03}.monthly span{color:#b4b8b1;font-size:12px}.monthly small{display:block;margin-top:5px;color:#eee;text-transform:capitalize;font-size:15px}.monthly-value{text-align:right;display:flex;flex-direction:column;gap:4px}.monthly strong{font-size:25px;font-weight:650;font-variant-numeric:tabular-nums}.monthly b{font-size:14px;font-weight:500}
   .grid-scroll{overflow-x:auto;border:1px solid #ffffff15;border-radius:12px}.grid{display:grid;grid-template-columns:repeat(7,minmax(100px,1fr)) minmax(115px,1fr);min-width:815px;gap:1px;background:#ffffff10}.weekday{text-align:center;font-size:11px;letter-spacing:.04em;padding:12px 4px;background:#1a1c19;color:#9da69d}.day{background:#151814;min-height:110px;padding:10px 7px;display:flex;flex-direction:column;gap:6px;min-width:0}.day>span{font-size:11px;color:#a9b1a7;align-self:flex-start;padding:2px 5px}.values{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding-bottom:12px;font-variant-numeric:tabular-nums}.values strong{font-size:13px;font-weight:650;white-space:nowrap}.values b{font-size:12px;font-weight:500;white-space:nowrap}.day .empty{margin:auto;color:#555d53}.day .today{border:1px solid #cba760;border-radius:5px;color:#e5c883}.positive{color:#80e6ab;background:#15392a}.negative{color:#ffa096;background:#3c211f}.week-total{box-shadow:inset 2px 0 #cba76060;background:#22261d}.week-total.positive{background:#1d3b2b}.week-total.negative{background:#402822}.outside{background:#11140f}.outside>span{opacity:.25}.note{font-size:11px;margin-top:14px}
   @media(max-width:650px){.perf-calendar{padding:14px;border-radius:16px}.controls{gap:6px;width:100%;justify-content:flex-start}.controls select{max-width:100%;width:100%}input,select{font-size:16px}.monthly{padding:14px;margin-top:16px}.monthly strong{font-size:22px}.grid{grid-template-columns:repeat(7,minmax(90px,1fr)) 105px;min-width:735px}.day{min-height:100px}.values strong{font-size:12px}}
  `}</style>
 </section>;
}
