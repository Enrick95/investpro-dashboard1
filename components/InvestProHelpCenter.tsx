"use client";
import { useLocale } from "@/components/i18n/LocaleProvider";

import { useEffect, useMemo, useState } from "react";
import { Headset, X, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
type Ticket={id:string;subject:string;message:string;status:string;created_at:string};
type ChatMessage={id:string;sender_role:string;body:string;created_at:string;attachment_url?:string|null};
type Notice={id:string;title:string;message:string;read_at?:string|null};
export default function InvestProHelpCenter(){
  const { t, locale } = useLocale();

 const db=useMemo(()=>createClient(),[]);
 const [open,setOpen]=useState(false),[tab,setTab]=useState<"help"|"notices">("help");
 const [subject,setSubject]=useState("InvestPro Copier"),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const [archive,setArchive]=useState(false),[file,setFile]=useState<File|null>(null);
 const [tickets,setTickets]=useState<Ticket[]>([]),[notices,setNotices]=useState<Notice[]>([]),[active,setActive]=useState<string|null>(null),[messages,setMessages]=useState<ChatMessage[]>([]);
 async function headers():Promise<Record<string,string>>{const {data:{session}}=await db.auth.getSession();return session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{}}
 async function load(){try{const h=await headers();const [t,n]=await Promise.all([fetch("/api/support/ticket",{headers:h,cache:"no-store"}),fetch("/api/notifications",{cache:"no-store"})]);if(t.ok)setTickets((await t.json()).tickets||[]);if(n.ok)setNotices((await n.json()).notifications||[])}catch{}}
 async function loadChat(id:string){try{const r=await fetch(`/api/support/messages?ticket_id=${encodeURIComponent(id)}`,{headers:await headers(),cache:"no-store"});const j=await r.json();if(r.ok)setMessages(j.messages||[]);else setFeedback(j.error||"Historique indisponible")}catch{setFeedback("Historique indisponible")}}
 useEffect(()=>{void load();const timer=setInterval(()=>{void load();if(active)void loadChat(active)},20000);return()=>clearInterval(timer)},[active]);
 async function send(){if(!file&&draft.trim().length<(active?1:10)){setFeedback("Écris un message plus détaillé.");return;}setBusy(true);setFeedback("");try{
 if(file){if(!active)throw Error("Ouvre d’abord la conversation avec un message, puis joins ton image.");const form=new FormData();form.set("ticket_id",active);form.set("file",file);form.set("message",draft.trim());const r=await fetch("/api/support/attachment",{method:"POST",headers:await headers(),body:form});const j=await r.json();if(!r.ok)throw Error(j.error||"Envoi impossible");setDraft("");setFile(null);await loadChat(active);await load();setFeedback("Message et image envoyés.");return;}
 const r=await fetch(active?"/api/support/messages":"/api/support/ticket",{method:"POST",headers:{...(await headers()),"Content-Type":"application/json"},body:JSON.stringify(active?{ticket_id:active,message:draft}:{subject,message:draft})});const j=await r.json();if(!r.ok)throw Error(j.error||"Envoi impossible");setDraft("");if(!active&&j.ticket?.id){setActive(j.ticket.id);await loadChat(j.ticket.id)}else if(active)await loadChat(active);await load();setFeedback("Message envoyé.")
 }catch(e){setFeedback(e instanceof Error?e.message:"Erreur d’envoi")}finally{setBusy(false)}}
 const unread=notices.filter(x=>!x.read_at).length;
 return <div className="ip-support-floating fixed bottom-[68px] right-4 z-[1400] md:bottom-6 md:right-6">
 {open?<section className="mb-3 flex max-h-[min(70dvh,620px)] w-[min(385px,calc(100vw-32px))] flex-col rounded-2xl border border-amber-500/30 bg-[#0b0e0c] p-4 text-white shadow-2xl">
 <header className="flex items-center justify-between"><strong className="text-sm">{t("Assistance InvestPro")}</strong><button onClick={()=>setOpen(false)} aria-label={t("Fermer")}><X size={16}/></button></header>
 <nav className="my-3 flex gap-2"><button onClick={()=>setTab("help")} className={`rounded-lg px-3 py-2 text-xs ${tab==="help"?"bg-amber-400 text-black":"bg-white/10"}`}>{t("Support")}</button><button onClick={()=>setTab("notices")} className={`rounded-lg px-3 py-2 text-xs ${tab==="notices"?"bg-amber-400 text-black":"bg-white/10"}`}>{t("Notifications (")}{unread})</button></nav>
  {tab==="help"?<><div className="mb-2 flex items-center justify-between text-xs"><strong>{active? tickets.find(t=>t.id===active)?.subject||t("Conversation"):t("Nouvelle conversation")}</strong>{active?<button className="text-amber-300" onClick={()=>{setActive(null);setDraft("");setMessages([])}}>{t("← Mes demandes")}</button>:null}</div>
 {active?<div className="mb-2 min-h-28 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2" style={{maxHeight:"32vh"}}>{messages.map(m=><div key={m.id} className={`flex ${m.sender_role==="client"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] rounded-xl p-2 text-xs ${m.sender_role==="client"?"bg-amber-500/20":"bg-white/10"}`}><div className="mb-1 text-[10px] text-amber-200">{t(m.sender_role==="client"?"Vous":"Support InvestPro")}</div><p className="whitespace-pre-wrap break-words">{m.body}</p>{m.attachment_url?<a href={m.attachment_url} target="_blank" rel="noopener noreferrer"><img src={m.attachment_url} alt={t("Capture jointe")} className="mt-2 max-h-44 max-w-full rounded-lg"/></a>:null}<div className="mt-1 text-[9px] text-white/40">{new Date(m.created_at).toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</div></div></div>)}{!messages.length?<div className="text-xs text-white/50">{t("Chargement de la conversation…")}</div>:null}</div>:<><p className="mb-2 text-xs text-white/60">{t("Une question ? Notre équipe vous répond ici.")}</p><select aria-label={t("Sujet")} value={subject} onChange={e=>setSubject(e.target.value)} className="mb-2 w-full rounded-lg border border-white/20 bg-[#111] p-2 text-xs"><option value="InvestPro Copier">{t("InvestPro Copier")}</option><option value="Connexion MT4/MT5">{t("Connexion MT4/MT5")}</option><option value="Mon compte">{t("Mon compte")}</option><option value="Autre question">{t("Autre question")}</option></select></>}
 {active&&tickets.find(t=>t.id===active)?.status!=="closed"?<div className="my-2 flex items-center gap-2 text-xs"><input aria-label={t("Ajouter une capture")} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)} className="min-w-0 max-w-[215px]"/>{file?<span className="text-[10px] text-amber-300">{t("Image prête ✓")}</span>:null}</div>:null}
 {active&&tickets.find(t=>t.id===active)?.status==="closed"?<div className="my-2 rounded-lg border border-amber-500/30 p-3 text-xs text-amber-200">{t("🔒 Cette conversation est définitivement clôturée. Pour une nouvelle demande, ouvre un nouveau ticket.")}</div>:null}
 <textarea aria-label={t("Votre message")} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={8000} rows={3} placeholder={t("Écrire un message…")} className="w-full rounded-lg border border-white/20 bg-[#111] p-2 text-xs"/><button disabled={busy||(!draft.trim()&&!file)||!!(active&&tickets.find(t=>t.id===active)?.status==="closed")} onClick={()=>void send()} className="mt-2 flex justify-center gap-2 rounded-lg bg-amber-400 p-2 text-xs font-bold text-black disabled:opacity-40"><Send size={14}/>{t(busy?"Envoi…":"Envoyer")}</button>
 {active&&tickets.find(t=>t.id===active)?.status==="closed"?<p className="mt-2 text-xs text-amber-300">{t("Conversation clôturée. Contacte le support avec une nouvelle demande.")}</p>:null}
 {feedback?<p role="status" className="mt-2 text-xs text-amber-200">{t(feedback)}</p>:null}
 {!active?<div className="mt-3 max-h-36 overflow-y-auto border-t border-white/10 pt-2"><div className="mb-1 text-xs font-semibold">{t("Mes conversations")}</div><div className="mb-2 flex gap-2"><button className={!archive?"text-amber-300":"text-white/50"} onClick={()=>setArchive(false)}>{t("Actives")}</button><button className={archive?"text-amber-300":"text-white/50"} onClick={()=>setArchive(true)}>{t("Clôturées")}</button></div>{tickets.filter(t=>archive?t.status==="closed":t.status!=="closed").map(t=><button key={t.id} onClick={()=>{setActive(t.id);setFeedback("");void loadChat(t.id)}} className="mb-1 block w-full rounded-lg bg-white/5 p-2 text-left text-xs"><strong>{t.subject}</strong> · {t.status}<div className="text-white/50">{new Date(t.created_at).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR")}</div></button>)}</div>:null}</>:<div className="max-h-56 overflow-y-auto">{notices.map(n=><div key={n.id} className="mb-2 rounded-lg bg-white/5 p-2 text-xs"><strong>{n.title}</strong><p>{n.message}</p></div>)}{!notices.length?<p className="text-xs text-white/60">{t("Aucune notification.")}</p>:null}</div>}
 </section>:null}
 <button onClick={()=>{setOpen(!open);if(!open)void load()}} className="ip-support-trigger relative flex items-center justify-center gap-2 rounded-full border border-amber-500/50 bg-[#171811] px-4 py-3 text-sm font-semibold text-amber-300 shadow-2xl"><Headset size={19}/><span className="ip-support-label">{t("Support")}</span>{unread>0?<span className="ip-support-badge rounded-full bg-amber-400 px-2 text-xs text-black">{unread}</span>:null}</button>
 <style jsx global>{`@media (max-width: 900px) and (display-mode: standalone) {
   .ip-support-floating { bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; }
 }
 @media (max-width: 900px) {
   .ip-support-trigger { width: 56px; height: 56px; padding: 0; }
   .ip-support-label { display: none; }
   .ip-support-badge { position: absolute; top: -6px; right: -4px; min-width: 22px; padding-left: 6px; padding-right: 6px; text-align: center; }
 }`}</style></div>
}
