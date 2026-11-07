"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { normalizeAccessCode } from "@/lib/vip/access-code";

type RequestInfo={first_name?:string;last_name?:string;member_number?:number;channel_invite_url?:string};
const box:CSSProperties={maxWidth:620,margin:"8vh auto",padding:28,background:"#111310",border:"1px solid #3b3526",borderRadius:22,color:"#f3efe6",fontFamily:"Manrope,Arial,sans-serif",boxShadow:"0 24px 90px #0008"};
const button:CSSProperties={display:"inline-block",background:"#f0c575",color:"#15130e",padding:"13px 18px",borderRadius:10,fontWeight:800,textDecoration:"none",margin:"8px 8px 0 0",border:"none",fontSize:16,cursor:"pointer"};
const outline:CSSProperties={display:"inline-block",border:"1px solid #444",color:"#f3efe6",padding:"13px 18px",borderRadius:10,fontWeight:700,textDecoration:"none",margin:"8px 8px 0 0"};
const field:CSSProperties={display:"block",width:"100%",boxSizing:"border-box",marginTop:8,padding:"13px 14px",borderRadius:10,border:"1px solid #3b3526",background:"#0b0d0b",color:"#f3efe6",fontSize:16};
const label:CSSProperties={display:"block",marginTop:18,color:"#d8d2c4",fontWeight:700,fontSize:14};

/** Rattache le dossier au compte connecté. Le serveur vérifie l’adresse e-mail et l’état de la demande. */
async function claimApplication(applicationId:string,accessToken:string):Promise<RequestInfo> {
  const response=await fetch("/api/vip/nouveau-membre/claim",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},
    body:JSON.stringify({applicationId}),cache:"no-store",
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(typeof payload?.error==="string"?payload.error:"Impossible de rattacher le dossier au compte.");
  return (payload?.request as RequestInfo|undefined)||{};
}

function signInMessage(message:string):string {
  if(/confirm/i.test(message)) return "Confirme d’abord ton adresse e-mail (le lien reçu lors de ton inscription), puis réessaie.";
  return "Identifiant ou code incorrect. Vérifie l’e-mail reçu, ou utilise ton mot de passe InvestPro si tu avais déjà un compte.";
}

export default function VipMemberClaimClient({applicationId}:{applicationId:string}) {
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [request,setRequest]=useState<RequestInfo|null>(null);
  const [identifier,setIdentifier]=useState("");
  const [code,setCode]=useState("");

  useEffect(()=>{
    let active=true;
    async function finish(){
      if(!/^[0-9a-f-]{36}$/i.test(applicationId)){if(active){setError("Le lien de demande est invalide.");setLoading(false)}return}
      try{
        const {data,error:sessionError}=await createClient().auth.getSession();
        if(sessionError) throw sessionError;
        const token=data.session?.access_token;
        if(token){const info=await claimApplication(applicationId,token);if(active)setRequest(info)}
      }catch(e){if(active)setError(e instanceof Error?e.message:"Impossible de terminer la demande.")}
      finally{if(active)setLoading(false)}
    }
    void finish();
    return()=>{active=false};
  },[applicationId]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy) return;
    setBusy(true);setError("");
    try{
      const client=createClient();
      const typed=code.trim();
      const canonical=normalizeAccessCode(typed)??"";
      // D’abord la saisie telle quelle (mot de passe déjà existant), puis la forme canonique du code généré.
      const attempts=[typed,canonical].filter((value,index,all)=>value.length>0&&all.indexOf(value)===index);
      let token:string|null=null;
      let lastMessage="";
      for(const password of attempts){
        const {data,error:signError}=await client.auth.signInWithPassword({email:identifier.trim().toLowerCase(),password});
        if(!signError&&data.session){token=data.session.access_token;break}
        lastMessage=signError?.message??"";
      }
      if(!token) throw new Error(signInMessage(lastMessage));
      setRequest(await claimApplication(applicationId,token));
    }catch(e){setError(e instanceof Error?e.message:"Impossible de terminer la connexion.")}
    finally{setBusy(false)}
  }

  const next=`/vip/nouveau-membre/compte?application=${encodeURIComponent(applicationId)}`;
  const login=`/login?next=${encodeURIComponent(next)}`;
  const signup=`/signup?next=${encodeURIComponent(next)}`;
  return <main style={{minHeight:"100dvh",padding:"24px",background:"#0b0d0b",boxSizing:"border-box"}}>
    <section style={box}>
      <p style={{color:"#f0c575",letterSpacing:".16em",fontSize:12,fontWeight:800}}>INVESTPRO · ACCÈS VIP</p>
      {loading?<><h1>On rattache ton dossier…</h1><p style={{color:"#b7bcb6"}}>Vérification de ton compte et finalisation de l’accès VIP.</p></>
      :request?<><h1>Bienvenue dans le VIP{request.first_name?`, ${request.first_name}`:""}.</h1><p style={{color:"#91d6d0",fontWeight:700}}>Ton compte est créé et ton accès est ouvert.</p><p style={{color:"#b7bcb6"}}>Ton numéro de membre : {request.member_number||"—"}</p>{request.channel_invite_url&&<a style={button} href={request.channel_invite_url} target="_blank" rel="noreferrer">Rejoindre le canal VIP ↗</a>}<Link style={outline} href="/dashboard/vip">Ouvrir mon espace VIP</Link></>
      :<>
        <h1>Ta demande VIP est validée</h1>
        <p style={{color:"#b7bcb6",lineHeight:1.7}}>Connecte-toi avec l’adresse e-mail de ta demande et le code reçu par e-mail. Si tu avais déjà un compte InvestPro, utilise ton mot de passe habituel.</p>
        {error&&<p role="alert" style={{color:"#f0a39a",lineHeight:1.6}}>{error}</p>}
        <form onSubmit={submit}>
          <label htmlFor="vip-identifiant" style={label}>Identifiant (ton adresse e-mail)</label>
          <input id="vip-identifiant" type="email" autoComplete="username" required value={identifier} onChange={e=>setIdentifier(e.target.value)} style={field}/>
          <label htmlFor="vip-code" style={label}>Code reçu par e-mail (majuscules et minuscules comptent)</label>
          <input id="vip-code" type="text" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={code} onChange={e=>setCode(e.target.value)} style={field}/>
          <button type="submit" disabled={busy} style={{...button,opacity:busy?.7:1,cursor:busy?"wait":"pointer"}}>{busy?"Vérification…":"Ouvrir mon accès VIP"}</button>
        </form>
        <p style={{color:"#8c938b",fontSize:13,marginTop:22,lineHeight:1.6}}>Mot de passe oublié ? <Link href={login} style={{color:"#f0c575"}}>Connexion</Link>. Pas de compte ni de code ? <Link href={signup} style={{color:"#f0c575"}}>Créer un compte avec cette adresse</Link>.</p>
        <p style={{color:"#8c938b",fontSize:13,marginTop:10}}>Tu ne reconnais pas cette adresse ou le lien a expiré ? Écris à @EquipeInvestPro.</p>
      </>}
    </section>
  </main>;
}
