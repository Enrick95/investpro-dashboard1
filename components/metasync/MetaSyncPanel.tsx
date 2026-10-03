'use client';
import {useCallback,useEffect,useState} from 'react';
type Connection={platform:'MT4'|'MT5';id:string;account_id:number;login:string;server:string;revoked:boolean;last_sync:string|null;warnings:string[]};
export default function MetaSyncPanel(){
 const [enabled,setEnabled]=useState(false),[rows,setRows]=useState<Connection[]>([]),[error,setError]=useState(''),[token,setToken]=useState(''),[busy,setBusy]=useState(false);
 const [platform,setPlatform]=useState('MT4');
 const [login,setLogin]=useState(''),[server,setServer]=useState(''),[currency,setCurrency]=useState('EUR'),[capital,setCapital]=useState(''),[type,setType]=useState('demo');
 const load=useCallback(async()=>{try{const r=await fetch('/api/metasync/connect',{cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error);setEnabled(j.enabled);setRows(j.connections??[]);setError('');}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void load();const t=setInterval(()=>void load(),30000);return()=>clearInterval(t);},[load]);
 async function submit(action='pair',id?:string){setBusy(true);setError('');try{
  const r=await fetch('/api/metasync/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,platform,login,server,currency:currency.toUpperCase(),initial_balance:Number(capital.replace(',','.')),account_type:type})}),j=await r.json();if(!r.ok)throw Error(j.error);if(j.token)setToken(j.token);await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!enabled&&!error)return null;
 return <section className="rounded-2xl border border-amber-400/30 bg-white/[.03] p-5 space-y-4">
 <h2 className="text-lg font-semibold">Synchronisation MT4 / MT5 · installation pilote</h2>
 <p className="text-sm text-white/60">Associe le compte déjà connecté au terminal Windows. Un compte distinct sera créé pour l’historique importé. Aucun mot de passe MetaTrader à saisir ici.</p>
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 {enabled&&<><label className="block text-sm">Plateforme<select className="ml-3 rounded-lg bg-black p-3" value={platform} onChange={e=>{setPlatform(e.target.value);setToken('');}}><option value="MT4">MetaTrader 4</option><option value="MT5">MetaTrader 5</option></select></label><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {[["Numéro du compte",login,setLogin],["Serveur exact du broker",server,setServer],["Devise du compte",currency,setCurrency],["Capital de référence pour les %",capital,setCapital]].map(([label,value,set])=><label key={label as string} className="text-sm">{label as string}<input className="mt-1 w-full rounded-lg border border-white/20 bg-black p-3" value={value as string} onChange={e=>(set as (v:string)=>void)(e.target.value)}/></label>)}
 <label className="text-sm">Type<select className="mt-1 w-full rounded-lg border border-white/20 bg-black p-3" value={type} onChange={e=>setType(e.target.value)}><option value="demo">Démo</option><option value="real">Réel</option><option value="prop">Prop firm</option></select></label>
 </div><button disabled={busy} className="rounded-lg bg-amber-300 px-4 py-3 text-black disabled:opacity-50" onClick={()=>void submit()}>{busy?'En cours…':'Créer / renouveler ma clé de synchronisation'}</button>
 <p className="text-xs text-white/60">Renouveler la clé du même compte désactive l’ancienne. Les % du journal sont calculés sur le capital de référence saisi ; ils ne corrigent pas les dépôts/retraits.</p>
 {token&&<div className="space-y-2"><p>Copie cette clé dans le connecteur de la plateforme choisie (MT4 : SyncKey ; MT5 : assistant Windows). Elle ne sera plus affichée après rechargement.</p><input aria-label="Clé de synchronisation" readOnly type="password" value={token} className="w-full bg-black p-3"/><button onClick={()=>{void navigator.clipboard.writeText(token).catch(()=>setError('Copie automatique indisponible : sélectionne la clé dans le champ.'));}}>Copier la clé</button></div>}
 <div className="space-y-3">{rows.map(c=><div key={c.id} className="rounded-lg border border-white/10 p-3 text-sm"><strong>{c.platform} {c.login} · {c.server}</strong><p>{c.revoked?'Déconnecté':!c.last_sync?'En attente du connecteur':`Dernière réception : ${new Date(c.last_sync).toLocaleString('fr-FR')}`}</p>{!c.revoked&&c.last_sync&&Date.now()-Date.parse(c.last_sync)>180000&&<p className="text-amber-300">Réception ancienne : vérifier le connecteur Windows.</p>}{c.warnings?.map(w=><p key={w} className="text-amber-300">{w}</p>)}{!c.revoked&&<button disabled={busy} onClick={()=>void submit('revoke',c.id)} className="mt-2 underline">Révoquer la clé</button>}</div>)}</div>
 <p className="text-sm">Après la première réception, recharge Mes comptes puis ouvre le journal ou les rapports et sélectionne « MT4 · numéro du compte » ou « MT5 · numéro du compte ».</p></>}
 </section>;
}
