'use client';
import {useCallback,useEffect,useState} from 'react';
type Item={id:string;broker:string;platform:string;server:string;status:string;created_at:string};
const labels:Record<string,string>={pending:'Demande reçue',preparing:'En préparation',available:'Disponible dans la liste des serveurs',declined:'Non disponible — contacte le support'};
const field='block w-full rounded-lg bg-black border border-white/15 p-3';
export default function ServerRequests({admin=false}:{admin?:boolean}){
 const [items,setItems]=useState<Item[]>([]),[broker,setBroker]=useState(''),[server,setServer]=useState(''),[platform,setPlatform]=useState('MT4');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [templates,setTemplates]=useState<Record<string,string>>({}),[tested,setTested]=useState<Record<string,boolean>>({});
 const load=useCallback(async()=>{const r=await fetch('/api/metasync/servers'+(admin?'?admin=1':''),{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error);setItems(j.requests??[]);},[admin]);
 useEffect(()=>{void load().catch(e=>setError(e.message));const t=setInterval(()=>void load().catch(e=>setError(e.message)),30000);return()=>clearInterval(t);},[load]);
 async function send(value:object){setBusy(true);setError('');setNotice('');try{
 const r=await fetch('/api/metasync/servers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),j=await r.json();if(!r.ok)throw Error(j.error);
 setNotice(admin?'Modification enregistrée.':'Demande enregistrée. Tu pourras connecter ton compte lorsque le serveur sera disponible.');await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="rounded-xl border border-white/15 p-4" open={admin||undefined}>
 <summary className="cursor-pointer font-semibold">{admin?'Demandes de serveurs':'Mon serveur est absent'}</summary>
 <div className="mt-4 space-y-4">
 <p className="text-sm text-white/65">{admin?'Prépare le modèle sur Windows, teste sa connexion et redémarre le connecteur avant de publier. La publication met à jour la liste du site sans redéploiement.':'Indique le nom exact affiché dans MetaTrader. Nous préparerons la connexion ; aucun logiciel ne sera à installer de ton côté.'}</p>
 {!admin&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void send({broker,server,platform});}}>
 <div className="grid gap-3 sm:grid-cols-3"><label>Broker<input required minLength={2} maxLength={80} className={field} value={broker} onChange={e=>setBroker(e.target.value)} placeholder="Ex. Fusion Markets"/></label>
 <label>Plateforme<select className={field} value={platform} onChange={e=>setPlatform(e.target.value)}><option>MT4</option><option>MT5</option></select></label>
 <label>Nom exact du serveur<input required minLength={2} maxLength={120} className={field} value={server} onChange={e=>setServer(e.target.value)} placeholder="Ex. FusionMarkets-Live 3"/></label></div>
 <button disabled={busy} className="rounded-lg bg-amber-300 px-4 py-2 text-black disabled:opacity-40">Demander ce serveur</button></form>}
 {error&&<p role="alert" className="text-red-300">{error}</p>}{notice&&<p role="status" className="text-green-300">{notice}</p>}
 <button type="button" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))} className="text-sm underline">Actualiser les demandes</button>
 {!items.length&&<p className="text-sm text-white/60">Aucune demande pour le moment.</p>}
 {items.map(i=><article key={i.id} className="rounded-lg border border-white/10 p-4 space-y-2"><strong>{i.broker} · {i.platform}</strong><p className="break-words">{i.server}</p><p className="text-sm text-amber-200">{labels[i.status]??i.status}</p><p className="text-xs text-white/50">{new Date(i.created_at).toLocaleString('fr-FR')}</p>
 {admin&&i.status!=='available'&&<div className="space-y-3">
 <div className="flex flex-wrap gap-4"><button disabled={busy} onClick={()=>void send({action:'review',id:i.id,status:'preparing'})} className="underline">En préparation</button><button disabled={busy} onClick={()=>void send({action:'review',id:i.id,status:'declined'})} className="underline">Non disponible</button></div>
 <label className="block text-sm">Identifiant du modèle Windows<input className={field} maxLength={60} value={templates[i.id]??''} onChange={e=>setTemplates({...templates,[i.id]:e.target.value.trim()})} placeholder="fusionmarkets-mt4-live3"/></label>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={tested[i.id]??false} onChange={e=>setTested({...tested,[i.id]:e.target.checked})}/>J’ai préparé et testé ce modèle pour ce serveur exact, puis redémarré le connecteur.</label>
 <button disabled={busy||!tested[i.id]||!templates[i.id]} className="rounded-lg bg-amber-300 text-black px-4 py-2 disabled:opacity-40" onClick={()=>void send({action:'review',id:i.id,status:'available',template:templates[i.id],tested:tested[i.id]})}>Rendre disponible</button>
 </div>}</article>)}
 </div></details>;
}
