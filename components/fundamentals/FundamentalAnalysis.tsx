'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Sparkles,ExternalLink,Globe2,Clock3,Newspaper} from 'lucide-react';
import {currencies,pairs,safeSource,type Brief,type Citation} from '@/lib/fundamentals/catalog';
function CitedText({text,citations}:{text:string;citations:Citation[]}){
 const out:ReactNode[]=[];let cursor=0;
 for(const [i,c] of [...citations].sort((a,b)=>a.start_index-b.start_index).entries()){
  if(!safeSource(c.url)||c.start_index<cursor||c.end_index>text.length||c.end_index<c.start_index)continue;
  out.push(text.slice(cursor,c.start_index));out.push(<a key={i} href={c.url} target="_blank" rel="noopener noreferrer" title={c.title}>[{i+1} · {c.title||new URL(c.url).hostname}]</a>);cursor=c.end_index;
 }out.push(text.slice(cursor));return <p className="fa-prose">{out}</p>;
}
export default function FundamentalAnalysis({demo=false}:{demo?:boolean}){
 const [pair,setPair]=useState('CHFJPY'),[result,setResult]=useState<Brief|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const base=pair.slice(0,3),quote=pair.slice(3),sources=[...new Map((result?.blocks.flatMap(b=>b.citations)||[]).filter(c=>safeSource(c.url)).map(c=>[c.url,c])).values()];
 function change(value:string){request.current?.abort();request.current=null;setBusy(false);setPair(value);setResult(null);setError('');}
 async function analyse(){
  if(demo){setError('Aperçu de la rubrique. La synthèse en direct sera disponible sur le site après activation du service IA. Les sources ci-dessous sont consultables dès maintenant.');return;}
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');setResult(null);
  try{const r=await fetch('/api/fundamentals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pair}),signal:controller.signal});const d=await r.json() as Brief & {error?:string};if(!r.ok)throw Error(d.error||'Analyse indisponible. Réessayez plus tard.');if(request.current===controller)setResult(d);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Analyse indisponible.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 return <div className="fa-workspace">
  <section className="fa-hero"><div><span className="fa-eyebrow"><Globe2 size={15}/> LE CONTEXTE AVANT LE TRADE</span><h2>Deux devises.<br/><em>Une vue d’ensemble.</em></h2><p>Comparez les moteurs économiques de votre paire et retrouvez les publications à la source.</p></div><div className="fa-search"><label htmlFor="fa-pair">Votre paire</label><select id="fa-pair" value={pair} onChange={e=>change(e.target.value)}>{pairs.map(p=><option key={p} value={p}>{p.slice(0,3)} / {p.slice(3)}{p==='XAUUSD'?' · GOLD':''}</option>)}</select><button className="fa-primary" onClick={analyse} disabled={busy}><Sparkles size={18}/>{busy?'Recherche des sources…':'Analyser la paire'}</button><span className="fa-meta">{demo?'Aperçu · IA en direct à activer':'Synthèse à la demande · Sources citées'}</span></div></section>
  <div className="fa-currencies">{[base,quote].map((c,i)=><section className="fa-card" key={c}><span className="fa-eyebrow">{i===0?'01 · DEVISE DE BASE':'02 · DEVISE DE COTATION'}</span><div className="fa-currency-title"><h3>{c}</h3><span>{currencies[c].name}</span></div><p>{currencies[c].focus}</p><a href={currencies[c].url} target="_blank" rel="noopener noreferrer">{currencies[c].bank}<ExternalLink size={15}/></a></section>)}</div>
  <section className="fa-card fa-brief" aria-busy={busy}><div className="fa-title"><h3><Sparkles size={19}/> Synthèse fondamentale</h3><span className="fa-meta"><Clock3 size={14}/>{result?new Date(result.generatedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})+' · Paris':'Aucune analyse générée'}</span></div>
   {error&&<p role="alert" className="fa-notice">{error}</p>}
   {busy?<p role="status">Recherche des publications et des annonces concernant {base} et {quote}. Cela peut prendre une minute.</p>:result?<><p className="fa-meta">Photographie du contexte à la date affichée, sans suivi des cours en continu.</p>{result.blocks.map((b,i)=><CitedText key={i} {...b}/>)}</>:<div className="fa-empty"><Newspaper size={30}/><h4>Comprendre ce qui peut faire bouger {pair}</h4><p>L’analyse recherchera les dernières publications, les prochaines échéances et les facteurs favorables ou défavorables aux deux devises. Les informations manquantes seront signalées.</p><div className="fa-pills"><span>Banques centrales</span><span>Inflation & emploi</span><span>Scénarios & incertitudes</span></div></div>}
   {sources.length>0&&<div className="fa-sources"><h4>Publications citées</h4>{sources.map(c=><a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer">{c.title||new URL(c.url).hostname}<ExternalLink size={14}/></a>)}</div>}
  </section>
  <div className="fa-footer"><span>Analyse informative, pas un signal d’achat ou de vente.</span><a href="https://fr.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">Calendrier des annonces <ExternalLink size={14}/></a><a href="https://www.financialjuice.com/home" target="_blank" rel="noopener noreferrer">Fil FinancialJuice <ExternalLink size={14}/></a></div>
 </div>;
}
