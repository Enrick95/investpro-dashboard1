'use client';
import { useLocale } from "@/components/i18n/LocaleProvider";
import {useCallback,useEffect,useState} from 'react';
import {Server, ChevronDown, RefreshCw, Plus, CheckCircle2} from 'lucide-react';
type Item={id:string;broker:string;platform:string;server:string;status:string;created_at:string};
const labels:Record<string,string>={pending:'Demande reçue',preparing:'En préparation',available:'Disponible dans la liste des serveurs',declined:'Non disponible — contacte le support'};
const field='mt-2 block h-11 w-full rounded-xl bg-black/25 border border-white/[0.08] px-3 text-xs text-white outline-none focus:border-[color:var(--gold-border)]';
const button='inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 py-3 text-xs font-bold text-black disabled:opacity-40';
export default function ServerRequests({admin=false,platformDefault="MT5"}:{admin?:boolean;platformDefault?:string}){
  const { t: translate } = useLocale();

 const [items,setItems]=useState<Item[]>([]),[broker,setBroker]=useState(''),[server,setServer]=useState(''),[platform,setPlatform]=useState(platformDefault);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [templates,setTemplates]=useState<Record<string,string>>({}),[tested,setTested]=useState<Record<string,boolean>>({});
 useEffect(()=>{if(!admin)setPlatform(platformDefault);},[platformDefault,admin]);
 const load=useCallback(async()=>{const r=await fetch('/api/metasync/servers'+(admin?'?admin=1':''),{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error);setItems(j.requests??[]);},[admin]);
 useEffect(()=>{void load().catch(e=>setError(e.message));const t=setInterval(()=>void load().catch(e=>setError(e.message)),30000);return()=>clearInterval(t);},[load]);
 async function send(value:object){setBusy(true);setError('');setNotice('');try{
 const r=await fetch('/api/metasync/servers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),j=await r.json();if(!r.ok)throw Error(j.error);
 setNotice(admin?'Modification enregistrée.':'Demande enregistrée. Tu pourras connecter ton compte lorsque le serveur sera disponible.');await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="group rounded-2xl border border-[color:var(--gold-border)] bg-black/15 p-4 md:p-5" open={admin||undefined}>
 <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[color:var(--gold)]"><Server size={14}/>{admin?translate("Demandes de serveurs"):translate("Mon broker ou mon serveur est absent")}<ChevronDown size={14} className="ml-auto transition group-open:rotate-180"/></summary>
 <div className="mt-4 space-y-4">
 <p className="text-xs leading-5 text-white/60">{admin?translate("Prépare le modèle sur Windows, teste sa connexion et redémarre le connecteur avant de publier. La publication met à jour la liste du site sans redéploiement."):translate("Indique ton broker, MT4 ou MT5 et le nom exact du serveur affiché dans MetaTrader. Ta demande est transmise à l’équipe InvestPro pour préparer la connexion.")}</p>
 {!admin&&<p className="text-xs leading-5 text-white/60">{translate("Retrouve le suivi de ta demande ci-dessous. Lorsqu’elle indique « Disponible dans la liste des serveurs », sélectionne ce serveur dans le formulaire de connexion. Aucun mot de passe n’est demandé ici.")}</p>}
 {!admin&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void send({broker,server,platform});}}>
 <div className="grid gap-4 sm:grid-cols-2"><label className="text-[10px] text-white/45">{translate("Broker")}<input required minLength={2} maxLength={80} className={field} value={broker} onChange={e=>setBroker(e.target.value)} placeholder={translate("Ex. Fusion Markets")}/></label>
 <label className="text-[10px] text-white/45">{translate("Plateforme")}<select className={field} value={platform} onChange={e=>setPlatform(e.target.value)}><option value="MT4">{translate("MT4")}</option><option value="MT5">{translate("MT5")}</option></select></label>
 <label className="text-[10px] text-white/45 sm:col-span-2">{translate("Nom exact du serveur")}<input required minLength={2} maxLength={120} className={field} value={server} onChange={e=>setServer(e.target.value)} placeholder={translate("Ex. FusionMarkets-Live 3")}/></label></div>
 <button disabled={busy} className={button}><Plus size={14}/>{translate("Demander ce serveur")}</button></form>}
 {error&&<p role="alert" className="text-red-300">{translate(error)}</p>}{notice&&<p role="status" className="text-green-300">{translate(notice)}</p>}
 <button type="button" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))} className="inline-flex items-center gap-2 text-[10px] text-white/50 hover:text-white"><RefreshCw size={12}/>{translate("Actualiser les demandes")}</button>
 {!items.length&&<p className="text-sm text-white/60">{translate("Aucune demande pour le moment.")}</p>}
 {items.map(i=><article key={i.id} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 space-y-3"><strong className="text-xs text-white">{i.broker} · {i.platform}</strong><p className="break-words text-xs text-white/50">{i.server}</p><p className={i.status==='available'?"text-[10px] text-emerald-400":"text-[10px] text-[color:var(--gold)]"}>{translate(labels[i.status]??i.status)}</p><p className="text-[10px] text-white/30">{new Date(i.created_at).toLocaleString('fr-FR')}</p>
 {admin&&i.status!=='available'&&<div className="space-y-3">
 <div className="flex flex-wrap gap-4 text-xs text-white/60"><button disabled={busy} onClick={()=>void send({action:'review',id:i.id,status:'preparing'})} className="underline">{translate("En préparation")}</button><button disabled={busy} onClick={()=>void send({action:'review',id:i.id,status:'declined'})} className="underline">{translate("Non disponible")}</button></div>
 <label className="block text-xs text-white/50">{translate("Identifiant du modèle Windows")}<input className={field} maxLength={60} value={templates[i.id]??''} onChange={e=>setTemplates({...templates,[i.id]:e.target.value.trim()})} placeholder={translate("fusionmarkets-mt4-live3")}/></label>
 <label className="flex items-start gap-2 text-xs leading-5 text-white/50"><input type="checkbox" checked={tested[i.id]??false} onChange={e=>setTested({...tested,[i.id]:e.target.checked})}/>{translate("J’ai préparé et testé ce modèle pour ce serveur exact, puis redémarré le connecteur.")}</label>
 <button disabled={busy||!tested[i.id]||!templates[i.id]} className={button} onClick={()=>void send({action:'review',id:i.id,status:'available',template:templates[i.id],tested:tested[i.id]})}><CheckCircle2 size={14}/>{translate("Rendre disponible")}</button>
 </div>}</article>)}
 </div></details>;
}
