'use client';
import {useCallback,useEffect,useState} from 'react';
type Broker={id:string;label:string;platform:string;server:string};
type Connection={id:string;active:boolean;status:string;investpro_mt_connections:{login:string;platform:string;last_sync:string|null;warnings:string[]}};
export default function HostedSyncPanel(){
 const [enabled,setEnabled]=useState(false),[brokers,setBrokers]=useState<Broker[]>([]),[connections,setConnections]=useState<Connection[]>([]);
 const [platform,setPlatform]=useState('MT4'),[broker,setBroker]=useState(''),[login,setLogin]=useState(''),[password,setPassword]=useState(''),[currency,setCurrency]=useState('USD'),[capital,setCapital]=useState(''),[type,setType]=useState('real'),[readOnly,setReadOnly]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const r=await fetch('/api/metasync/hosted',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error);setEnabled(j.enabled);setBrokers(j.brokers??[]);setConnections(j.connections??[]);},[]);
 useEffect(()=>{void load().catch(()=>{});const t=setInterval(()=>void load().catch(()=>{}),15000);return()=>clearInterval(t);},[load]);
 async function send(id?:string){setBusy(true);setError('');setNotice('');try{
  const r=await fetch('/api/metasync/hosted',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{action:'stop',id}:{broker,login,password,currency,capital:Number(capital.replace(',','.')),type,readOnly})});const j=await r.json();if(!r.ok)throw Error(j.error);setPassword('');setNotice(id?'Déconnexion demandée. L’historique importé est conservé.':'Demande enregistrée. La connexion sera traitée par notre serveur.');await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!enabled)return null;
 const labels:Record<string,string>={queued:'En attente de connexion',connecting:'Connexion en cours',syncing:'Synchronisation active',error:'Connexion à vérifier — accès investisseur, devise ou serveur',capacity:'En attente de disponibilité',stopped:'Déconnecté'};
 return <section className="rounded-2xl border border-amber-300/30 bg-white/[.03] p-5 space-y-4">
  <div><h2 className="text-lg font-semibold">Connecter mon compte MT4 / MT5</h2><p className="text-sm text-white/60">Votre journal se remplit automatiquement. Rien à installer sur votre ordinateur.</p></div>
  <form onSubmit={e=>{e.preventDefault();void send();}} className="space-y-4">
   <div className="grid gap-3 sm:grid-cols-2">
    <label>Plateforme<select className="block w-full bg-black p-3 rounded-lg" value={platform} onChange={e=>{setPlatform(e.target.value);setBroker('');}}><option>MT4</option><option>MT5</option></select></label>
    <label>Broker et serveur<select required className="block w-full bg-black p-3 rounded-lg" value={broker} onChange={e=>setBroker(e.target.value)}><option value="">Choisir un serveur</option>{brokers.filter(b=>b.platform===platform).map(b=><option key={b.id} value={b.id}>{b.label} · {b.server}</option>)}</select></label>
    <label>Numéro du compte<input required inputMode="numeric" pattern="[0-9]+" autoComplete="off" className="block w-full bg-black p-3 rounded-lg" value={login} onChange={e=>setLogin(e.target.value.trim())}/></label>
    <label>Mot de passe investisseur<input required type="password" maxLength={128} autoComplete="new-password" className="block w-full bg-black p-3 rounded-lg" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label>Devise du compte<input required maxLength={3} pattern="[A-Z]{3}" className="block w-full bg-black p-3 rounded-lg" value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
    <label>Capital de départ<input required inputMode="decimal" className="block w-full bg-black p-3 rounded-lg" value={capital} onChange={e=>setCapital(e.target.value)}/></label>
    <label>Type de compte<select className="block w-full bg-black p-3 rounded-lg" value={type} onChange={e=>setType(e.target.value)}><option value="real">Réel</option><option value="demo">Démo</option><option value="prop">Prop firm</option></select></label>
   </div>
   <p className="text-xs text-white/60">Le capital de départ sert au calcul des %. Le mot de passe investisseur donne un accès en lecture seule. Si votre serveur n’apparaît pas, contactez le support pour son ajout.</p>
   <label className="flex gap-3 text-sm"><input required type="checkbox" checked={readOnly} onChange={e=>setReadOnly(e.target.checked)}/>Je suis autorisé à consulter ce compte et j’utilise son mot de passe investisseur pour synchroniser mes données.</label>
   <button disabled={busy||!broker} className="rounded-lg bg-amber-300 px-5 py-3 font-medium text-black disabled:opacity-40">{busy?'En cours…':'Connecter mon compte'}</button>
  </form>
  {error&&<p role="alert" className="text-red-300">{error}</p>}{notice&&<p role="status" className="text-green-300">{notice}</p>}
  {connections.map(c=>{const a=c.investpro_mt_connections,old=!a.last_sync||Date.now()-Date.parse(a.last_sync)>180000;return <div key={c.id} className="rounded-xl border border-white/10 p-4"><strong>{a.platform} · {a.login}</strong><p className="text-sm text-white/70">{c.active&&c.status==='syncing'&&old?'Synchronisation interrompue — reconnexion en attente':labels[c.status]??'En attente'}</p>{a.last_sync&&<p className="text-xs text-white/50">Dernière réception : {new Date(a.last_sync).toLocaleString('fr-FR')}</p>}{a.warnings?.map(w=><p key={w} className="text-xs text-amber-200">{w}</p>)}{c.active&&<button type="button" disabled={busy} onClick={()=>void send(c.id)} className="mt-2 underline text-sm">Déconnecter</button>}</div>;})}
 </section>;
}
