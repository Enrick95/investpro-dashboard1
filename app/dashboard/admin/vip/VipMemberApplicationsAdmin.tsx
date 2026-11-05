"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { vipRequest } from "@/lib/vip/client";
import { vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import a from "./VipApplications.module.css";

type Application={
  id:string;revision:number;status:"submitted"|"approved"|"denied"|"claimed";
  first_name:string;last_name:string;email:string;telegram_username:string;phone_whatsapp:string;
  affiliation_broker:string;mt_platform:string;broker_account_id:string;mt_server:string;
  deposit_range:string;declared_deposit_usd:number;proof_path:string;created_at:string;
  approval_email_sent_at:string|null;claim_expires_at:string|null;claimed_user_id:string|null;
};
function depositLabel(value:string){return value==="300-499"?"300 $ à 499 $":value==="500-999"?"500 $ à 999 $":"1 000 $ ou plus";}
function dateLabel(value:string|null){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Paris"}).format(d);}

export default function VipMemberApplicationsAdmin(){
  const [items,setItems]=useState<Application[]|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [proofs,setProofs]=useState<Record<string,string>>({});
  const [values,setValues]=useState<Record<string,{firstName:string;lastName:string;deposit:string;linked:boolean;reason:string}>>({});
  const load=useCallback(async()=>{
    setError("");
    try{const result=await vipRequest<{applications:Application[]}>("/api/admin/vip/member-applications");setItems(result.applications);}
    catch(e){setError(e instanceof Error?e.message:"Les nouveaux dossiers sont indisponibles.");}
  },[]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    let active=true;
    for(const item of items||[]){
      if(!item.proof_path||proofs[item.id])continue;
      void vipRequest<{url:string}>(`/api/admin/vip/member-applications/${item.id}/preuve`).then(r=>{if(active)setProofs(old=>({...old,[item.id]:r.url}))}).catch(()=>{});
    }
    return()=>{active=false};
  },[items,proofs]);
  function formValue(item:Application){return values[item.id]||{firstName:item.first_name,lastName:item.last_name,deposit:"",linked:false,reason:""}}
  async function act(item:Application,action:"approve"|"deny"|"resend",event?:FormEvent){
    event?.preventDefault();
    if(busy)return;
    const form=formValue(item);
    if(action==="approve"&&(!form.linked||Number(form.deposit)<300)){setError("Confirme le rattachement et saisis le dépôt réel vérifié (300 $ minimum).");return}
    if(action==="deny"&&form.reason.trim().length<5){setError("Indique un motif de refus d’au moins 5 caractères.");return}
    setBusy(item.id);setError("");
    try{
      const result=await vipRequest<{ok:true;emailSent?:boolean}>("/api/admin/vip/member-applications",{method:"POST",body:JSON.stringify({
        action,id:item.id,expectedRevision:item.revision,
        firstName:form.firstName,lastName:form.lastName,affiliationBroker:item.affiliation_broker,
        brokerLinkedVerified:form.linked,verifiedDepositUsd:Number(form.deposit),reason:form.reason,
      })});
      await load();
      if(action==="approve"&&!result.emailSent)setError("Demande validée, mais l’e-mail n’a pas pu partir. Utilise « Renvoyer le lien » sur le dossier.");
      if(action==="resend"&&!result.emailSent)setError("Le lien n’a pas pu être envoyé. Vérifie la configuration e-mail.");
    }catch(e){setError(e instanceof Error?e.message:"Impossible de traiter le dossier.");}
    finally{setBusy("");}
  }
  const update=(item:Application,key:string,value:string|boolean)=>setValues(old=>({...old,[item.id]:{...formValue(item),[key]:value}}));
  const [filter,setFilter]=useState<"submitted"|"done">("submitted");
  const [selectedId,setSelectedId]=useState("");
  const pending=(items||[]).filter(item=>item.status==="submitted");
  const done=(items||[]).filter(item=>item.status!=="submitted");
  const shown=filter==="submitted"?pending:done;
  const selected=shown.find(item=>item.id===selectedId)||shown[0]||null;
  const statusLabel=(item:Application)=>item.status==="submitted"?"À vérifier":item.status==="claimed"?"Compte créé · VIP ouvert":item.status==="denied"?"Refusé":"Validé · compte en attente";
  return <section className={a.section}>
    <div className={a.heading}><div><span className={a.kicker}>Nouveaux membres</span><h2>Dossiers à vérifier <b>{pending.length}</b></h2><p>Les dossiers envoyés depuis la page « Nouveau membre ». Après validation, la personne reçoit un lien pour créer son compte.</p></div><button type="button" className={a.ghost} onClick={()=>void load()}>Actualiser</button></div>
    <div className={a.tabs} role="tablist">
      <button type="button" role="tab" aria-selected={filter==="submitted"} onClick={()=>setFilter("submitted")}>À vérifier <b>{pending.length}</b></button>
      <button type="button" role="tab" aria-selected={filter==="done"} onClick={()=>setFilter("done")}>Traités <b>{done.length}</b></button>
    </div>
    {error&&<p role="alert" className={a.error}>{error}</p>}
    {items===null?<p className={a.muted}>Chargement des dossiers…</p>:!shown.length?<p className={a.empty}>{filter==="submitted"?"Aucun nouveau dossier pour le moment.":"Aucun dossier traité."}</p>:<div className={a.split}>
      <ul className={a.list}>{shown.map(item=><li key={item.id}><button type="button" aria-pressed={selected?.id===item.id} onClick={()=>setSelectedId(item.id)}>
        <span className={a.avatar} aria-hidden="true">{item.first_name.charAt(0).toUpperCase()}{item.last_name.charAt(0).toUpperCase()}</span>
        <span className={a.who}><b>{item.first_name} {item.last_name}</b><small>{vipAffiliationBrokerLabel(item.affiliation_broker)||item.affiliation_broker} · {dateLabel(item.created_at)}</small></span>
        <span className={a.state} data-status={item.status}>{item.status==="submitted"?"Nouveau":item.status==="denied"?"Refusé":"Validé"}</span>
      </button></li>)}</ul>
      {selected&&(()=>{const item=selected;const form=formValue(item);return <article className={a.sheet} key={item.id}>
        <header className={a.sheetHead}><div><h3>{item.first_name} {item.last_name}</h3><a href={`mailto:${item.email}`}>{item.email}</a></div><span className={a.state} data-status={item.status}>{statusLabel(item)}</span></header>
        <div className={a.block}><h4>Contact</h4><div className={a.facts}>
          <div><span>WhatsApp</span><a href={`https://wa.me/${item.phone_whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer">{item.phone_whatsapp} ↗</a></div>
          <div><span>Telegram</span><a href={`https://t.me/${encodeURIComponent(item.telegram_username)}`} target="_blank" rel="noreferrer">@{item.telegram_username} ↗</a></div>
          <div><span>Reçu le</span>{dateLabel(item.created_at)}</div>
        </div></div>
        <div className={a.block}><h4>Compte de trading</h4><div className={a.facts}>
          <div><span>Broker</span>{vipAffiliationBrokerLabel(item.affiliation_broker)||item.affiliation_broker}</div>
          <div><span>Compte MetaTrader</span>{item.mt_platform} · {item.broker_account_id}</div>
          <div><span>Serveur</span>{item.mt_server}</div>
          <div><span>Dépôt déclaré</span>{depositLabel(item.deposit_range)}</div>
        </div></div>
        <div className={a.block}><h4>Preuve de dépôt</h4>{proofs[item.id]?<a className={a.proof} href={proofs[item.id]} target="_blank" rel="noreferrer">Ouvrir la preuve de dépôt ↗</a>:<p className={a.muted}>{item.proof_path?"Chargement de la preuve privée…":"Aucune preuve jointe."}</p>}</div>
        {item.status==="submitted"?<form onSubmit={event=>void act(item,"approve",event)} className={a.verify}>
          <h4>✅ Ta vérification</h4>
          <div className={a.fields}>
            <label><span>Prénom vérifié</span><input value={form.firstName} maxLength={80} onChange={e=>update(item,"firstName",e.target.value)}/></label>
            <label><span>Nom vérifié</span><input value={form.lastName} maxLength={80} onChange={e=>update(item,"lastName",e.target.value)}/></label>
            <label><span>Dépôt réel vérifié en USD, hors bonus</span><input type="number" min="300" step="0.01" value={form.deposit} onChange={e=>update(item,"deposit",e.target.value)} placeholder="300.00"/></label>
          </div>
          <label className={a.check}><input type="checkbox" checked={form.linked} onChange={e=>update(item,"linked",e.target.checked)}/><span>J’ai confirmé le rattachement de ce compte dans l’espace partenaire du broker.</span></label>
          <ul className={a.auto}><li data-ok={form.linked||undefined}>Rattachement confirmé</li><li data-ok={Number(form.deposit)>=300||undefined}>Dépôt vérifié ≥ 300 $</li></ul>
          <label className={a.reason}><span>Motif de refus (si tu refuses)</span><input value={form.reason} maxLength={300} onChange={e=>update(item,"reason",e.target.value)} placeholder="Ex. dépôt insuffisant, compte non affilié…"/></label>
          <div className={a.actions}>
            <button className={a.ghost} disabled={!!busy} type="button" onClick={()=>void act(item,"deny")}>Refuser</button>
            <button className={a.primary} disabled={!!busy} type="submit">{busy===item.id?"Traitement…":"Valider et envoyer le lien"}</button>
          </div>
        </form>:<div className={a.block}><h4>Suivi</h4><p className={a.muted}>{item.claimed_user_id?"Le compte a été créé et rattaché.":item.approval_email_sent_at?`Lien envoyé le ${dateLabel(item.approval_email_sent_at)}`:item.status==="denied"?"Dossier refusé.":"L’e-mail n’a pas été envoyé."}</p>
          {item.status==="approved"&&!item.claimed_user_id&&<button className={a.ghost} disabled={!!busy} onClick={()=>void act(item,"resend")}>{busy===item.id?"Envoi…":"Renvoyer le lien"}</button>}
        </div>}
      </article>})()}
    </div>}
  </section>;
}
