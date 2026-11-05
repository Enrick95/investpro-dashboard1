"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type RequestInfo={first_name?:string;last_name?:string;member_number?:number;channel_invite_url?:string};
const box:CSSProperties={maxWidth:620,margin:"8vh auto",padding:28,background:"#111310",border:"1px solid #3b3526",borderRadius:22,color:"#f3efe6",fontFamily:"Manrope,Arial,sans-serif",boxShadow:"0 24px 90px #0008"};
const button:React.CSSProperties={display:"inline-block",background:"#f0c575",color:"#15130e",padding:"13px 18px",borderRadius:10,fontWeight:800,textDecoration:"none",margin:"8px 8px 0 0"};
const outline:React.CSSProperties={display:"inline-block",border:"1px solid #444",color:"#f3efe6",padding:"13px 18px",borderRadius:10,fontWeight:700,textDecoration:"none",margin:"8px 8px 0 0"};

export default function VipMemberClaimClient({applicationId}:{applicationId:string}) {
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [request,setRequest]=useState<RequestInfo|null>(null);
  const [authenticated,setAuthenticated]=useState(false);
  useEffect(()=>{
    let active=true;
    async function finish(){
      if(!/^[0-9a-f-]{36}$/i.test(applicationId)){setError("Le lien de demande est invalide.");setLoading(false);return}
      try{
        const client=createClient();
        const {data,error:sessionError}=await client.auth.getSession();
        if(sessionError) throw sessionError;
        const session=data.session;
        if(!session){if(active){setAuthenticated(false);setLoading(false)}return}
        if(active)setAuthenticated(true);
        const response=await fetch("/api/vip/nouveau-membre/claim",{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({applicationId}),cache:"no-store",
        });
        const payload=await response.json().catch(()=>null);
        if(!response.ok) throw new Error(typeof payload?.error==="string"?payload.error:"Impossible de rattacher le dossier au compte.");
        if(active)setRequest(payload.request||{});
      }catch(e){if(active)setError(e instanceof Error?e.message:"Impossible de terminer la demande.");}
      finally{if(active)setLoading(false)}
    }
    void finish();
    return()=>{active=false};
  },[applicationId]);
  const next=`/vip/nouveau-membre/compte?application=${encodeURIComponent(applicationId)}`;
  const signup=`/signup?next=${encodeURIComponent(next)}`;
  const login=`/login?next=${encodeURIComponent(next)}`;
  return <main style={{minHeight:"100dvh",padding:"24px",background:"#0b0d0b",boxSizing:"border-box"}}>
    <section style={box}>
      <p style={{color:"#f0c575",letterSpacing:".16em",fontSize:12,fontWeight:800}}>INVESTPRO · ACCÈS VIP</p>
      {loading?<><h1>On rattache ton dossier…</h1><p style={{color:"#b7bcb6"}}>Vérification de ton compte et finalisation de l’accès VIP.</p></>:request?<><h1>Bienvenue dans le VIP{request.first_name?`, ${request.first_name}`:""}.</h1><p style={{color:"#91d6d0",fontWeight:700}}>Ton compte est créé et ton accès est ouvert.</p><p style={{color:"#b7bcb6"}}>Ton numéro de membre : {request.member_number||"—"}</p>{request.channel_invite_url&&<a style={button} href={request.channel_invite_url} target="_blank" rel="noreferrer">Rejoindre le canal VIP ↗</a>}<Link style={outline} href="/dashboard/vip">Ouvrir mon espace VIP</Link></>:<>
        <h1>{authenticated?"Finaliser ton accès":"Ta demande VIP est validée"}</h1>
        <p style={{color:"#b7bcb6",lineHeight:1.7}}>{authenticated?"Vérifie que tu es connecté avec la même adresse e-mail que celle utilisée pour la demande.":"Crée ton compte InvestPro ou connecte-toi avec l’adresse e-mail utilisée pour ta demande. Le dossier sera rattaché après confirmation de cette adresse."}</p>
        {error&&<p role="alert" style={{color:"#f0a39a",lineHeight:1.6}}>{error}</p>}
        <Link style={button} href={signup}>Créer mon compte</Link>
        <Link style={outline} href={login}>J’ai déjà un compte</Link>
        <p style={{color:"#8c938b",fontSize:13,marginTop:22}}>Tu ne reconnais pas cette adresse ou le lien a expiré ? Écris à @EquipeInvestPro.</p>
      </>}
    </section>
  </main>;
}
