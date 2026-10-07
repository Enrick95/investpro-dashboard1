"use client";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function FeedbackWidget(){
  const supabase=useMemo(()=>createClient(),[]);
  const pathname=usePathname();
  const [open,setOpen]=useState(false); const [category,setCategory]=useState("idea"); const [rating,setRating]=useState(5); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const [status,setStatus]=useState("");
  async function submit(){
    if(message.trim().length<5){setStatus("Écris quelques mots avant d’envoyer.");return;}
    setBusy(true);setStatus("");
    try{
      const {data:{session}}=await supabase.auth.getSession(); if(!session?.access_token)throw new Error("Reconnecte-toi puis réessaie.");
      const r=await fetch("/api/feedback",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({category,rating,message,page_path:pathname})});
      const j=await r.json(); if(!r.ok||!j.ok)throw new Error(j.error||"Envoi impossible.");
      setMessage("");setStatus("Merci 👌 ton retour a bien été envoyé."); setTimeout(()=>setOpen(false),1200);
    }catch(e:any){setStatus(e?.message||"Envoi impossible.");}finally{setBusy(false)}
  }
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="fixed bottom-[92px] left-3 z-[850] inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[#0b0d0b]/95 px-3 text-[10px] font-semibold text-[color:var(--gold)] shadow-xl backdrop-blur md:bottom-5 md:left-auto md:right-[165px]" aria-label="Donner mon avis"><MessageSquarePlus size={14}/><span className="hidden sm:inline">Feedback</span></button>
    {open?<div className="fixed inset-0 z-[1000002] grid place-items-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={(e)=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="w-full max-w-lg rounded-[22px] border border-[color:var(--gold-border)] bg-[#0b0d0b] p-5 shadow-2xl">
      <div className="flex items-start justify-between"><div><div className="text-sm font-semibold text-white">Ton avis nous aide</div><div className="mt-1 text-[9px] text-white/35">Bug, idée, design ou connexion.</div></div><button onClick={()=>setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[.08] text-white/45"><X size={14}/></button></div>
      <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[9px] text-white/40">Catégorie<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white"><option value="idea">Idée</option><option value="bug">Bug</option><option value="design">Design</option><option value="connection">Connexion</option><option value="other">Autre</option></select></label><label className="text-[9px] text-white/40">Note<select value={rating} onChange={e=>setRating(Number(e.target.value))} className="mt-2 h-10 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-xs text-white">{[5,4,3,2,1].map(n=><option key={n} value={n}>{n}/5</option>)}</select></label></div>
      <textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Dis-moi ce qui t’a plu, ce qui bloque ou ce que tu voudrais..." className="mt-4 w-full rounded-xl border border-white/[.08] bg-black/30 p-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-[color:var(--gold-border)]"/>
      {status?<div className="mt-3 text-[10px] text-white/55">{status}</div>:null}
      <button disabled={busy} onClick={submit} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] text-xs font-semibold text-black disabled:opacity-50"><Send size={13}/>{busy?"Envoi...":"Envoyer mon retour"}</button>
    </div></div>:null}
  </>
}
