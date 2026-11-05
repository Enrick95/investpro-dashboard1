"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";

type Application={
  id:string;revision:number;status:"submitted"|"approved"|"denied"|"claimed";
  first_name:string;last_name:string;email:string;telegram_username:string;phone_whatsapp:string;
  affiliation_broker:string;mt_platform:string;broker_account_id:string;mt_server:string;
  deposit_range:string;declared_deposit_usd:number;proof_path:string;created_at:string;
  approval_email_sent_at:string|null;claim_expires_at:string|null;claimed_user_id:string|null;
};
const style:Record<string,React.CSSProperties>={
  section:{background:"#101110",border:"1px solid #2d302d",borderRadius:18,padding:20,marginBottom:18,color:"#f3efe6"},
  heading:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,margin:"16px 0"},
  fact:{background:"#151715",border:"1px solid #2b302b",borderRadius:12,padding:12},
  label:{display:"block",color:"#aeb5ae",fontSize:12,marginBottom:5},
  input:{width:"100%",background:"#0d0f0d",border:"1px solid #383d38",borderRadius:9,color:"#f3efe6",padding:"10px 12px"},
  button:{background:"#f0c575",border:0,borderRadius:9,padding:"10px 14px",color:"#17140d",fontWeight:700,cursor:"pointer"},
  secondary:{background:"#151715",border:"1px solid #424742",borderRadius:9,padding:"10px 14px",color:"#f3efe6",fontWeight:600,cursor:"pointer"},
  muted:{color:"#aeb5ae",fontSize:13,lineHeight:1.55},
  error:{color:"#f0a39a",fontSize:13},
  card:{border:"1px solid #303430",borderRadius:15,padding:16,marginTop:14},
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
  return <section style={style.section}>
    <div style={style.heading}><div><h2 style={{margin:0}}>Nouveaux membres à vérifier {items&&<span style={{color:"#f0c575"}}>({items.filter(x=>x.status==="submitted").length})</span>}</h2><p style={style.muted}>Les dossiers envoyés sans compte apparaissent ici. Après validation, la personne reçoit un lien pour créer son compte ou se connecter.</p></div><button type="button" style={style.secondary} onClick={()=>void load()}>Actualiser</button></div>
    {error&&<p role="alert" style={style.error}>{error}</p>}
    {items===null?<p style={style.muted}>Chargement des dossiers…</p>:items.length===0?<p style={style.muted}>Aucun nouveau dossier pour le moment.</p>:items.map(item=>{
      const form=formValue(item);
      return <article key={item.id} style={style.card}>
        <div style={style.heading}><div><h3 style={{margin:"0 0 5px"}}>{item.first_name} {item.last_name}</h3><a href={`mailto:${item.email}`} style={{color:"#f0c575"}}>{item.email}</a></div><span style={{color:item.status==="submitted"?"#f0c575":"#91d6d0"}}>{item.status==="submitted"?"À vérifier":item.status==="claimed"?"Compte créé · accès VIP ouvert":"Validée · compte en attente"}</span></div>
        <p style={style.muted}>Reçue le {dateLabel(item.created_at)} · Téléphone WhatsApp : <a href={`https://wa.me/${item.phone_whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{color:"#91d6d0"}}>{item.phone_whatsapp}</a> · Telegram : <a href={`https://t.me/${encodeURIComponent(item.telegram_username)}`} target="_blank" rel="noreferrer" style={{color:"#91d6d0"}}>@{item.telegram_username}</a></p>
        <div style={style.grid}>
          <div style={style.fact}><span style={style.label}>Broker</span>{vipAffiliationBrokerLabel(item.affiliation_broker)||item.affiliation_broker}</div>
          <div style={style.fact}><span style={style.label}>Compte MetaTrader</span>{item.mt_platform} · {item.broker_account_id}</div>
          <div style={style.fact}><span style={style.label}>Serveur</span>{item.mt_server}</div>
          <div style={style.fact}><span style={style.label}>Dépôt déclaré</span>{depositLabel(item.deposit_range)}</div>
        </div>
        {proofs[item.id]?<a href={proofs[item.id]} target="_blank" rel="noreferrer" style={{color:"#f0c575"}}>Ouvrir la preuve de dépôt ↗</a>:<p style={style.muted}>Chargement de la preuve privée…</p>}
        {item.status==="submitted"?<form onSubmit={event=>void act(item,"approve",event)} style={{marginTop:16}}>
          <div style={style.grid}>
            <label><span style={style.label}>Prénom vérifié</span><input style={style.input} value={form.firstName} maxLength={80} onChange={e=>update(item,"firstName",e.target.value)}/></label>
            <label><span style={style.label}>Nom vérifié</span><input style={style.input} value={form.lastName} maxLength={80} onChange={e=>update(item,"lastName",e.target.value)}/></label>
            <label><span style={style.label}>Dépôt réel vérifié en USD, hors bonus</span><input style={style.input} type="number" min="300" step="0.01" value={form.deposit} onChange={e=>update(item,"deposit",e.target.value)} placeholder="300.00"/></label>
          </div>
          <label style={{display:"flex",gap:9,alignItems:"flex-start",...style.muted}}><input type="checkbox" checked={form.linked} onChange={e=>update(item,"linked",e.target.checked)}/>J’ai confirmé le rattachement de ce compte dans l’espace partenaire du broker.</label>
          <label style={{display:"block",marginTop:12}}><span style={style.label}>Motif de refus (si nécessaire)</span><input style={style.input} value={form.reason} maxLength={300} onChange={e=>update(item,"reason",e.target.value)} placeholder="Ex. dépôt insuffisant, compte non affilié…"/></label>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
            <button style={style.button} disabled={!!busy} type="submit">{busy===item.id?"Traitement…":"Valider et envoyer le lien de création du compte"}</button>
            <button style={style.secondary} disabled={!!busy} type="button" onClick={()=>void act(item,"deny")}>Refuser</button>
          </div>
        </form>:<div style={{marginTop:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <span style={style.muted}>{item.claimed_user_id?"Le compte a été rattaché.":item.approval_email_sent_at?`Lien envoyé le ${dateLabel(item.approval_email_sent_at)}`:"L’e-mail n’a pas été envoyé."}</span>
          {item.status==="approved"&&!item.claimed_user_id&&<button style={style.secondary} disabled={!!busy} onClick={()=>void act(item,"resend")}>{busy===item.id?"Envoi…":"Renvoyer le lien"}</button>}
        </div>}
      </article>
    })}
  </section>;
}
