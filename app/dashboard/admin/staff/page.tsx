"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
const definitions=[
["overview","Tableau de bord"],["users","Consulter les membres"],["users_write","Modifier les membres"],
["moderation","Modération"],["inbox","Consulter les messages"],["inbox_write","Traiter les messages"],
["copier","Voir les demandes InvestPro Copier (données sensibles)"],["copier_write","Gérer InvestPro Copier"],
["finance","Finances"],["analytics","Statistiques"],["feedback","Consulter les avis"],["feedback_write","Gérer les avis"],
["system","Système / maintenance"],["navigation","Modifier la navigation"]
] as const;
type Item={user_id:string;permissions:string[];enabled:boolean;updated_at:string};
export default function StaffPage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [items,setItems]=useState<Item[]>([]),[userId,setUserId]=useState(""),[selected,setSelected]=useState<string[]>([]),[enabled,setEnabled]=useState(true),[error,setError]=useState(""),[info,setInfo]=useState(""),[saving,setSaving]=useState(false);
 const headers=useCallback(async()=>{const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw Error("Connexion requise");return {Authorization:`Bearer ${data.session.access_token}`}},[supabase]);
 const reload=useCallback(async()=>{try{const r=await fetch("/api/admin/staff",{headers:await headers(),cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setItems(j.items||[])}catch(e:any){setError(e.message)}},[headers]);
 useEffect(()=>{void reload()},[reload]);
 function choose(item:Item){setUserId(item.user_id);setSelected(item.permissions);setEnabled(item.enabled);setInfo("");setError("")}
 async function save(){setError("");setInfo("");setSaving(true);try{const r=await fetch("/api/admin/staff",{method:"POST",headers:{...(await headers()),"Content-Type":"application/json"},body:JSON.stringify({user_id:userId.trim(),permissions:selected,enabled})});const j=await r.json();if(!r.ok)throw Error(j.error||"Enregistrement impossible");setInfo("Permissions enregistrées. Les prochains appels API utilisent ces droits.");await reload()}catch(e:any){setError(e.message)}finally{setSaving(false)}}
 return <div className="max-w-4xl space-y-5"><h2 className="text-xl font-bold">Gestion de l’équipe</h2><p className="text-sm text-white/60">Le propriétaire est défini par INVESTPRO_ADMIN_USER_IDS et ne peut pas être modifié ici. Saisissez l’UUID Supabase du membre (pas son e-mail).</p>
 {error&&<p className="rounded-lg border border-red-700 p-3 text-red-300">{error}</p>}{info&&<p className="text-emerald-400">{info}</p>}
 <div className="rounded-2xl border border-white/10 p-5 space-y-4"><label className="block text-sm">UUID du membre<input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="UUID Supabase" className="mt-2 w-full rounded-lg border border-white/20 bg-black p-3 text-white"/></label>
 <div className="grid gap-3 sm:grid-cols-2">{definitions.map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(key)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,key]:prev.filter(v=>v!==key))}/>{label}</label>)}</div>
 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Accès actif</label>
 <button disabled={saving||!userId} onClick={()=>void save()} className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{saving?"Enregistrement…":"Enregistrer les permissions"}</button><p className="text-xs text-white/50">Pour retirer l’accès : décochez « Accès actif » et enregistrez.</p></div>
 <div className="space-y-2"><h3 className="font-bold">Membres autorisés</h3>{items.map(item=><button key={item.user_id} onClick={()=>choose(item)} className="block w-full rounded-xl border border-white/10 p-3 text-left text-sm"><span className="font-mono">{item.user_id}</span> — {item.enabled?"Actif":"Désactivé"} — {item.permissions.join(", ")||"Aucune permission"}</button>)}</div></div>
}
