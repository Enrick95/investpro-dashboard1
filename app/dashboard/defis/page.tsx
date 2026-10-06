"use client";
import { useEffect,useMemo,useState } from "react";
import { Check,CheckCircle2,Flame,Gift,Loader2,NotebookPen,ShieldCheck,Sparkles,Target,Trophy,Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Trade={trade_date:string;status:string;result_amount:number|null;risk_percent:number|null;notes:string|null;screenshot_url:string|null};
type Plan={max_risk_percent:number;max_trades_per_day:number};
type Claim={challenge_code:string;period_key:string};
type Challenge={code:string;title:string;description:string;xp:number;current:number;target:number;completed:boolean;icon:React.ReactNode};

function weekKey(date=new Date()){const temp=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));const day=temp.getUTCDay()||7;temp.setUTCDate(temp.getUTCDate()+4-day);const yearStart=new Date(Date.UTC(temp.getUTCFullYear(),0,1));const weekNo=Math.ceil((((temp.getTime()-yearStart.getTime())/86400000)+1)/7);return `${temp.getUTCFullYear()}-${String(weekNo).padStart(2,"0")}`}

export default function DefisPage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [loading,setLoading]=useState(true),[claiming,setClaiming]=useState<string|null>(null);
 const [trades,setTrades]=useState<Trade[]>([]),[plan,setPlan]=useState<Plan>({max_risk_percent:1,max_trades_per_day:2});
 const [claims,setClaims]=useState<Claim[]>([]),[xp,setXp]=useState(0),[message,setMessage]=useState("");
 const currentWeekKey=weekKey();

 async function load(){
  try{
   setLoading(true);
   const {data:{user}}=await supabase.auth.getUser(); if(!user){window.location.href="/login";return;}
   const now=new Date(); const day=now.getDay()||7; const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-day+1);
   const [tradeResult,planResult,claimResult,profileResult]=await Promise.all([
    supabase.from("trading_journal").select("trade_date,status,result_amount,risk_percent,notes,screenshot_url").eq("user_id",user.id).gte("trade_date",monday.toISOString()).lte("trade_date",now.toISOString()),
    supabase.from("trading_plans").select("max_risk_percent,max_trades_per_day").eq("user_id",user.id).maybeSingle(),
    supabase.from("challenge_claims").select("challenge_code,period_key").eq("user_id",user.id).eq("period_key",currentWeekKey),
    supabase.from("profiles").select("xp").eq("id",user.id).maybeSingle()
   ]);
   setTrades((tradeResult.data as Trade[])||[]);
   if(planResult.data)setPlan({max_risk_percent:Number(planResult.data.max_risk_percent||1),max_trades_per_day:Number(planResult.data.max_trades_per_day||2)});
   setClaims((claimResult.data as Claim[])||[]); setXp(Number(profileResult.data?.xp||0));
  }catch(e){console.error("Erreur défis :",e)}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[]);

 const challenges=useMemo<Challenge[]>(()=>{
  const closed=trades.filter(t=>["win","loss","breakeven"].includes(t.status));
  const knownRisk=trades.filter(t=>t.risk_percent!=null),badRisk=knownRisk.filter(t=>Number(t.risk_percent)>plan.max_risk_percent);
  const perDay=new Map<string,number>(); closed.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);perDay.set(d,(perDay.get(d)||0)+1)}); const maxDaily=Math.max(0,...Array.from(perDay.values()));
  const documented=trades.filter(t=>(t.notes&&t.notes.trim())||(t.screenshot_url&&t.screenshot_url.trim())).length;
  const pnlByDay=new Map<string,number>(); closed.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);pnlByDay.set(d,(pnlByDay.get(d)||0)+Number(t.result_amount||0))}); const positiveDays=Array.from(pnlByDay.values()).filter(v=>v>0).length;
  return [
   {code:"five_trades",title:"Régularité",description:"Clôturer 5 trades cette semaine.",xp:100,current:Math.min(closed.length,5),target:5,completed:closed.length>=5,icon:<Target size={18}/>},
   {code:"risk_respected",title:"Risque maîtrisé",description:`Ne dépasser aucune fois ton risque max de ${plan.max_risk_percent}%.`,xp:150,current:knownRisk.length?Math.max(0,knownRisk.length-badRisk.length):0,target:Math.max(1,knownRisk.length),completed:knownRisk.length>0&&badRisk.length===0,icon:<ShieldCheck size={18}/>},
   {code:"daily_limit",title:"Discipline quotidienne",description:`Ne jamais dépasser ${plan.max_trades_per_day} trades sur une journée.`,xp:150,current:perDay.size&&maxDaily<=plan.max_trades_per_day?1:0,target:1,completed:perDay.size>0&&maxDaily<=plan.max_trades_per_day,icon:<CheckCircle2 size={18}/>},
   {code:"documented_five",title:"Journal complet",description:"Documenter 5 trades avec une note ou une capture.",xp:125,current:Math.min(documented,5),target:5,completed:documented>=5,icon:<NotebookPen size={18}/>},
   {code:"positive_days_three",title:"Série positive",description:"Terminer 3 journées de trading avec un P&L positif.",xp:200,current:Math.min(positiveDays,3),target:3,completed:positiveDays>=3,icon:<Flame size={18}/>}
  ];
 },[trades,plan]);

 const claimed=new Set(claims.map(c=>c.challenge_code));
 const completedCount=challenges.filter(c=>c.completed).length;
 const claimedXp=challenges.filter(c=>claimed.has(c.code)).reduce((s,c)=>s+c.xp,0);

 async function claim(code:string){
  try{
   setClaiming(code); setMessage("");
   const {data,error}=await supabase.rpc("claim_investpro_challenge",{p_challenge_code:code});
   if(error)throw error;
   const result=Array.isArray(data)?data[0]:data; setMessage(result?.message||"Terminé");
   if(result?.success){setXp(Number(result.total_xp||xp)); await load()}
  }catch(e:any){setMessage(e?.message||"Impossible de récupérer la récompense.")}finally{setClaiming(null)}
 }

 if(loading)return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-[color:var(--gold)]" size={24}/></div>;

 return <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
  <section className="rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
   <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
    <div><div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]"><Zap size={12}/>Progression InvestPro</div><h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">Défis <span className="text-[color:var(--gold)]">hebdomadaires</span></h1><p className="mt-1 text-sm text-[color:var(--muted)]">Transforme ta discipline en progression et gagne de l’XP.</p></div>
    <div className="grid grid-cols-3 gap-2"><MiniStat label="Terminés" value={`${completedCount}/5`}/><MiniStat label="XP total" value={xp.toLocaleString("fr-FR")} gold/><MiniStat label="XP semaine" value={`+${claimedXp}`}/></div>
   </div>
  </section>

  {message?<div className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 py-3 text-xs text-[color:var(--gold)]">{message}</div>:null}

  <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
   {challenges.map(challenge=>{const hasClaimed=claimed.has(challenge.code);const progress=Math.min(100,(challenge.current/Math.max(1,challenge.target))*100);return <article key={challenge.code} className={["rounded-[22px] border bg-[color:var(--panel)] p-5",challenge.completed?"border-emerald-500/20":"border-[color:var(--border)]"].join(" ")}>
    <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className={["flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",challenge.completed?"border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400":"border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"].join(" ")}>{challenge.icon}</div><div><h2 className="text-sm font-semibold text-white">{challenge.title}</h2><p className="mt-1 text-[10px] leading-4 text-[color:var(--muted)]">{challenge.description}</p></div></div><div className="rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-2.5 py-1 text-[9px] font-semibold text-[color:var(--gold)]">+{challenge.xp} XP</div></div>
    <div className="mt-5"><div className="flex items-center justify-between text-[9px]"><span className="text-white/35">Progression</span><span className="font-semibold text-white">{challenge.current}/{challenge.target}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5"><div className={challenge.completed?"h-full rounded-full bg-emerald-400":"h-full rounded-full bg-[color:var(--gold)]"} style={{width:`${progress}%`}}/></div></div>
    <button disabled={!challenge.completed||hasClaimed||claiming===challenge.code} onClick={()=>claim(challenge.code)} className={["mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition",hasClaimed?"border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400":challenge.completed?"border-[color:var(--gold-border)] bg-[color:var(--gold)] text-black":"border-white/[0.06] bg-black/20 text-white/25"].join(" ")}>{claiming===challenge.code?<Loader2 className="animate-spin" size={14}/>:hasClaimed?<Check size={14}/>:challenge.completed?<Gift size={14}/>:<Sparkles size={14}/>} {hasClaimed?"Récompense récupérée":challenge.completed?`Récupérer +${challenge.xp} XP`:"Défi en cours"}</button>
   </article>})}
  </section>

  <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5"><div className="flex items-start gap-3"><Trophy className="mt-0.5 text-[color:var(--gold)]" size={19}/><div><h2 className="text-sm font-semibold text-white">Comment ça fonctionne ?</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-[color:var(--muted)]">Les défis se recalculent automatiquement à partir de ton Journal et de ton Plan de trading. Les récompenses XP ne peuvent être récupérées qu’une fois par semaine et sont revérifiées côté serveur avant attribution.</p></div></div></section>
 </div>
}
function MiniStat({label,value,gold=false}:{label:string;value:string;gold?:boolean}){return <div className="min-w-[90px] rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="text-[8px] text-white/25">{label}</div><div className={["mt-1 text-sm font-semibold",gold?"text-[color:var(--gold)]":"text-white"].join(" ")}>{value}</div></div>}
