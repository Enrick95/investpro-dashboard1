"use client";
import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProductAnalytics(){
  const pathname=usePathname();
  const supabase=useMemo(()=>createClient(),[]);
  useEffect(()=>{
    let cancelled=false;
    async function send(){
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token||cancelled)return;
      let sessionId=localStorage.getItem("investpro_product_session");
      if(!sessionId){ sessionId=crypto.randomUUID(); localStorage.setItem("investpro_product_session",sessionId); }
      const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as Navigator & {standalone?:boolean}).standalone===true;
      void fetch("/api/analytics/event",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({event_name:"page_view",page_path:pathname,session_id:sessionId,properties:{viewport:window.innerWidth<640?"mobile":window.innerWidth<1024?"tablet":"desktop",pwa:Boolean(standalone)}})}).catch(()=>{});
    }
    void send();
    return()=>{cancelled=true};
  },[pathname,supabase]);
  return null;
}
