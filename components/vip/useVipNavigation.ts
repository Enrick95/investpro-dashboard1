"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";

/** Menu visibility is presentation only: every VIP endpoint independently validates server access. */
export function useVipNavigation(pathname:string) {
  const client=useMemo(()=>createClient(),[]);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    let alive=true;
    async function check(token?:string) {
      try {
        const accessToken=token||(await client.auth.getSession()).data.session?.access_token;
        if(!accessToken){if(alive)setVisible(false);return;}
        const response=await fetch("/api/vip/access",{headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store"});
        const data=response.ok?await response.json():null;
        if(alive)setVisible(Boolean(data&&(data.admin||data.membership)));
      }catch{if(alive)setVisible(false);}
    }
    void check();
    const auth=client.auth.onAuthStateChange((_event,session)=>{if(!session){if(alive)setVisible(false);}else void check(session.access_token);});
    const onChange=()=>void check();
    window.addEventListener("investpro-vip-access-changed",onChange);
    window.addEventListener("focus",onChange);
    return()=>{alive=false;auth.data.subscription.unsubscribe();window.removeEventListener("investpro-vip-access-changed",onChange);window.removeEventListener("focus",onChange);};
  },[client,pathname]);
  return visible;
}
