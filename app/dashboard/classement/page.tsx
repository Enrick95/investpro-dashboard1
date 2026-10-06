"use client";
import { useEffect,useMemo,useState } from "react";
import { Check,Crown,Loader2,Medal,ShieldCheck,Sparkles,Trophy,Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Row={user_id:string;username:string;plan:string;xp:number;trade_count:number;wins:number;losses:number;net_pnl:number;performance_pct:number;winrate:number;discipline_score:number;total_score:number};

export default function ClassementPage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [period,setPeriod]=useState<"week"|"month">("week");
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [optedIn,setOptedIn]=useState(false);
 const [saving,setSaving]=useState(false);
 const [me,setMe]=useState<string|null>(null);

 async function load(){
  try{
   setLoading(true);
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){window.location.href="/login";return;}
   setMe(user.id);
   const [prefResult,boardResult]=await Promise.all([
    supabase.from("trader_preferences").select("leaderboard_opt_in").eq("user_id",user.id).maybeSingle(),
    supabase.rpc("get_investpro_leaderboard",{p_period:period})
   ]);
   setOptedIn(!!prefResult.data?.leaderboard_opt_in);
   if(boardResult.error) throw boardResult.error;
   setRows((boardResult.data as Row[])||[]);
  }catch(e){console.error("Erreur classement :",e)}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[period]);

 async function toggleOptIn(){
  try{
   setSaving(true);
   const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
   const next=!optedIn;
   const {error}=await supabase.from("trader_preferences").upsert({user_id:user.id,leaderboard_opt_in:next,updated_at:new Date().toISOString()},{onConflict:"user_id"});
   if(error) throw error;
   setOptedIn(next); await load();
  }finally{setSaving(false)}
 }

 const myRow=rows.find(r=>r.user_id===me)||null;
 const top3=rows.slice(0,3);

 if(loading)return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-[color:var(--gold)]" size={24}/></div>;

 return <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
  <section className="rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
   <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
    <div>
     <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]"><Trophy size={12}/>Communauté InvestPro</div>
     <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">Classement <span className="text-[color:var(--gold)]">InvestPro</span></h1>
     <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">Un score équilibré entre performance, winrate et respect du risque.</p>
    </div>
    <div className="flex flex-wrap gap-2">
     <button onClick={()=>setPeriod("week")} className={period==="week"?"ip-rank-filter ip-rank-filter-active":"ip-rank-filter"}>Cette semaine</button>
     <button onClick={()=>setPeriod("month")} className={period==="month"?"ip-rank-filter ip-rank-filter-active":"ip-rank-filter"}>Ce mois</button>
    </div>
   </div>
  </section>

  <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
   <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 lg:col-span-8">
    <div className="flex items-center justify-between gap-3">
     <div><h2 className="text-sm font-semibold text-white">Top traders</h2><p className="mt-1 text-[10px] text-[color:var(--muted)]">Classement basé sur les données de trading de la période.</p></div>
     <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-black/20 px-3 py-1.5 text-[9px] text-white/45"><Users size={11}/>{rows.length} participant{rows.length>1?"s":""}</div>
    </div>
    {top3.length?<div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">{top3.map((row,index)=><PodiumCard key={row.user_id} row={row} rank={index+1} mine={row.user_id===me}/>)}</div>:<div className="mt-5 rounded-2xl border border-dashed border-white/[0.07] bg-black/10 p-8 text-center"><Trophy className="mx-auto text-[color:var(--gold)]" size={25}/><div className="mt-3 text-sm font-semibold text-white">Le classement se remplit</div><div className="mt-1 text-[10px] text-white/35">Les traders doivent activer leur participation.</div></div>}
    {rows.length>3?<div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.06]">
     <div className="min-w-[590px]">
      <div className="grid grid-cols-[52px_1fr_88px_78px_78px] gap-2 border-b border-white/[0.06] bg-black/20 px-3 py-3 text-[8px] uppercase tracking-[0.08em] text-white/25"><span>Rang</span><span>Trader</span><span>Score</span><span>Perf.</span><span>WR</span></div>
      {rows.slice(3,20).map((row,index)=><div key={row.user_id} className={["grid grid-cols-[52px_1fr_88px_78px_78px] gap-2 border-b border-white/[0.05] px-3 py-3 text-xs last:border-0",row.user_id===me?"bg-[color:var(--gold-soft)]":""].join(" ")}><span className="text-white/40">#{index+4}</span><div className="min-w-0"><div className="truncate font-semibold text-white">{row.username}</div><div className="mt-0.5 text-[8px] text-white/30">{row.trade_count} trades</div></div><span className="font-semibold text-[color:var(--gold)]">{Number(row.total_score).toFixed(1)}</span><span className={Number(row.performance_pct)>=0?"text-emerald-400":"text-red-400"}>{Number(row.performance_pct)>0?"+":""}{Number(row.performance_pct).toFixed(2)}%</span><span className="text-white/65">{Number(row.winrate).toFixed(1)}%</span></div>)}
     </div>
    </div>:null}
   </div>

   <div className="space-y-4 lg:col-span-4">
    <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5">
     <div className="flex items-center gap-2"><ShieldCheck className="text-[color:var(--gold)]" size={17}/><h2 className="text-sm font-semibold text-white">Ma participation</h2></div>
     <p className="mt-3 text-[10px] leading-5 text-[color:var(--muted)]">Le classement est volontaire. Ton pseudo et tes statistiques de la période ne sont visibles que si tu participes.</p>
     <button disabled={saving} onClick={toggleOptIn} className={["mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition",optedIn?"border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400":"border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"].join(" ")}>{saving?<Loader2 className="animate-spin" size={14}/>:optedIn?<Check size={14}/>:<Sparkles size={14}/>} {optedIn?"Participation activée":"Participer au classement"}</button>
    </section>
    <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
     <h2 className="text-sm font-semibold text-white">Mon classement</h2>
     {myRow?<div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Rang" value={`#${rows.findIndex(r=>r.user_id===me)+1}`}/><Mini label="Score" value={Number(myRow.total_score).toFixed(1)} gold/><Mini label="Performance" value={`${Number(myRow.performance_pct)>0?"+":""}${Number(myRow.performance_pct).toFixed(2)}%`}/><Mini label="Winrate" value={`${Number(myRow.winrate).toFixed(1)}%`}/></div>:<p className="mt-3 text-[10px] leading-5 text-[color:var(--muted)]">Active ta participation puis réalise au moins un trade clôturé sur la période.</p>}
    </section>
   </div>
  </section>
  <style jsx global>{`.ip-rank-filter{height:40px;border-radius:12px;border:1px solid var(--border);background:var(--panel);padding:0 14px;color:rgba(255,255,255,.5);font-size:11px;font-weight:600}.ip-rank-filter-active{border-color:var(--gold-border);background:var(--gold-soft);color:var(--gold)}`}</style>
 </div>
}

function PodiumCard({row,rank,mine}:{row:Row;rank:number;mine:boolean}){
 const icon=rank===1?<Crown size={20}/>:<Medal size={20}/>;
 return <div className={["rounded-2xl border p-4",rank===1?"border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]":"border-white/[0.06] bg-black/15"].join(" ")}>
  <div className="flex items-center justify-between"><span className="text-[color:var(--gold)]">{icon}</span><span className="text-[10px] font-semibold text-white/35">#{rank}</span></div>
  <div className="mt-4 truncate text-sm font-semibold text-white">{row.username}{mine?" · Toi":""}</div><div className="mt-1 text-[9px] text-white/30">{row.trade_count} trades</div>
  <div className="mt-4 text-2xl font-semibold text-[color:var(--gold)]">{Number(row.total_score).toFixed(1)}</div><div className="text-[8px] uppercase tracking-[0.08em] text-white/25">Score InvestPro</div>
  <div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Perf." value={`${Number(row.performance_pct)>0?"+":""}${Number(row.performance_pct).toFixed(2)}%`}/><Mini label="WR" value={`${Number(row.winrate).toFixed(1)}%`}/></div>
 </div>
}
function Mini({label,value,gold=false}:{label:string;value:string;gold?:boolean}){return <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="text-[8px] text-white/25">{label}</div><div className={["mt-1 text-xs font-semibold",gold?"text-[color:var(--gold)]":"text-white"].join(" ")}>{value}</div></div>}
