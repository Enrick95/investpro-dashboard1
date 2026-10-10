"use client";
import { useEffect, useMemo, useState } from "react";
import { Headset, Bell, X, Send, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
type Ticket = {id:string;subject:string;message:string;status:string;admin_reply?:string|null;created_at:string};
type Notice = {id:string;title:string;message:string;href?:string|null;read_at?:string|null};
export default function InvestProHelpCenter(){
 const db=useMemo(()=>createClient(),[]);
 const [open,setOpen]=useState(false),[tab,setTab]=useState<"help"|"notices">("help");
 const [subject,setSubject]=useState("InvestPro Copier"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const [tickets,setTickets]=useState<Ticket[]>([]),[notices,setNotices]=useState<Notice[]>([]);
 async function headers(){const {data:{session}}=await db.auth.getSession();return session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{ };}
 async function load(){try{const h=await headers();const [t,n]=await Promise.all([
 fetch("/api/support/ticket",{headers:h,cache:"no-store"}),fetch("/api/notifications",{cache:"no-store"})]);
 if(t.ok)setTickets((await t.json()).tickets||[]);if(n.ok)setNotices((await n.json()).notifications||[]);
 }catch{}}
 useEffect(()=>{void load();const id=setInterval(()=>void load(),60000);return()=>clearInterval(id)},[]);
 async function send(){if(message.trim().length<10){setFeedback("Écris au moins 10 caractères.");return;}setBusy(true);setFeedback("");
 try{const r=await fetch("/api/support/ticket",{method:"POST",headers:{...(await headers()),"Content-Type":"application/json"},body:JSON.stringify({subject,message})});
 const j=await r.json();if(!r.ok)throw Error(j.error||"Envoi impossible");setMessage("");setFeedback("Message envoyé au support InvestPro.");await load();}
 catch(e){setFeedback(e instanceof Error?e.message:"Erreur d’envoi");}finally{setBusy(false)}}
 async function read(id:string){const r=await fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});if(r.ok)await load()}
 const unread=notices.filter(n=>!n.read_at).length;
 return <div className="fixed bottom-20 right-4 z-[1000] md:bottom-6 md:right-6">
 {open?<div className="mb-3 w-[min(360px,calc(100vw-32px))] max-h-[70vh] overflow-y-auto rounded-2xl border border-amber-500/30 bg-[#0b0e0c] p-4 text-white shadow-2xl">
 <div className="flex items-center justify-between"><strong className="text-sm">Assistance InvestPro</strong><button onClick={()=>setOpen(false)} aria-label="Fermer" className="p-2"><X size={16}/></button></div>
 <div className="my-3 flex gap-2"><button onClick={()=>setTab("help")} className={`rounded-lg px-3 py-2 text-xs ${tab==="help"?"bg-amber-400 text-black":"bg-white/10"}`}>Support</button><button onClick={()=>setTab("notices")} className={`rounded-lg px-3 py-2 text-xs ${tab==="notices"?"bg-amber-400 text-black":"bg-white/10"}`}>Notifications ({unread})</button></div>
 {tab==="help"?<><p className="mb-3 text-xs text-white/60">Une question ? Ton message arrivera dans l’Inbox de l’équipe.</p>
 <select aria-label="Sujet" value={subject} onChange={e=>setSubject(e.target.value)} className="mb-2 w-full rounded-lg border border-white/20 bg-[#111] p-2 text-xs"><option>InvestPro Copier</option><option>Connexion MT4/MT5</option><option>Mon compte</option><option>Autre question</option></select>
 <textarea aria-label="Votre message" value={message} onChange={e=>setMessage(e.target.value)} maxLength={8000} rows={4} placeholder="Bonjour, j’ai une question…" className="w-full rounded-lg border border-white/20 bg-[#111] p-2 text-xs"/>
 <button disabled={busy} onClick={()=>void send()} className="mt-2 flex w-full justify-center gap-2 rounded-lg bg-amber-400 p-2 text-xs font-bold text-black disabled:opacity-40"><Send size={14}/>{busy?"Envoi…":"Envoyer au support"}</button>
 {feedback?<p role="status" className="mt-2 text-xs text-amber-200">{feedback}</p>:null}
 <div className="mt-4 border-t border-white/10 pt-3 text-xs font-semibold">Mes demandes</div>
 {tickets.slice(0,8).map(t=><div key={t.id} className="mt-2 rounded-lg bg-white/5 p-2 text-xs"><div className="font-semibold">{t.subject} · {t.status}</div><p className="mt-1 text-white/60">{t.message}</p>{t.admin_reply?<p className="mt-2 border-l-2 border-amber-400 pl-2">Réponse : {t.admin_reply}</p>:null}</div>)}
 </>:<div>{notices.length?notices.map(n=><div key={n.id} className="mb-2 rounded-lg bg-white/5 p-3 text-xs"><strong>{n.title}</strong><p className="my-1 text-white/70">{n.message}</p><div className="flex gap-3">{n.href?<a href={n.href} className="text-amber-300">Ouvrir <ExternalLink size={12} className="inline"/></a>:null}{!n.read_at?<button onClick={()=>void read(n.id)} className="text-amber-300">Marquer lu</button>:null}</div></div>):<p className="text-xs text-white/50">Aucune notification.</p>}</div>}
 </div>:null}
 <button onClick={()=>{setOpen(!open);if(!open)void load()}} className="relative flex items-center gap-2 rounded-full border border-amber-500/50 bg-[#171811] px-4 py-3 text-sm font-semibold text-amber-300 shadow-2xl" aria-label="Ouvrir le support InvestPro"><Headset size={19}/> Support {unread>0?<span className="rounded-full bg-amber-400 px-2 text-xs text-black">{unread}</span>:null}</button>
 </div>
}
