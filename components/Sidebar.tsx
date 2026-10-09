"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useMemo,useState} from 'react';
import {LayoutDashboard,GraduationCap,Library,TrendingUp,WalletCards,BarChart3,CalendarDays,Globe2,BookOpen,Calculator,Repeat2,Trophy,Target,Users,User,LifeBuoy,ClipboardCheck,Settings,CreditCard,Bug,History,Zap,Cable,Handshake} from 'lucide-react';
import {defaultVisibility,type NavigationKey} from '@/lib/navigation/config';

type MenuItem={key:NavigationKey;g:string;p:string;l:string;i:React.ElementType;soon?:boolean};
const menu:MenuItem[]=[
 {key:'dashboard',g:'ACCUEIL',p:'',l:'Dashboard',i:LayoutDashboard},
 {key:'accounts',g:'TRADING',p:'/comptes',l:'Mes comptes',i:WalletCards},
 {key:'connections',g:'TRADING',p:'/connexions',l:'Connexions',i:Cable},
 {key:'journal',g:'TRADING',p:'/journal',l:'Journal',i:BookOpen},
 {key:'plan',g:'TRADING',p:'/plan',l:'Plan de trading',i:ClipboardCheck},
 {key:'risk',g:'TRADING',p:'/simulateur',l:'Simulateur risque',i:Calculator},
 {key:'reports',g:'TRADING',p:'/rapports',l:'Rapports',i:BarChart3},
 {key:'copy',g:'TRADING',p:'/copieur',l:'InvestPro Copier',i:Repeat2},
 {key:'tradingview',g:'MARCHÉS & ANALYSE',p:'/tradingview',l:'TradingView',i:BarChart3},
 {key:'calendar',g:'MARCHÉS & ANALYSE',p:'/calendrier',l:'Calendrier éco',i:CalendarDays},
 {key:'fundamentals',g:'MARCHÉS & ANALYSE',p:'/analyse-fondamentale',l:'Analyse fondamentale',i:Globe2},
 {key:'financialjuice',g:'MARCHÉS & ANALYSE',p:'/financialjuice',l:'FinancialJuice',i:Zap},
 {key:'vip',g:'COMMUNAUTÉ',p:'/performances-vip',l:'Performances VIP',i:TrendingUp},
 {key:'ranking',g:'COMMUNAUTÉ',p:'/classement',l:'Classement',i:Trophy},
 {key:'challenges',g:'COMMUNAUTÉ',p:'/challenges',l:'Challenges',i:Target},
 {key:'members',g:'COMMUNAUTÉ',p:'/membres',l:'Membres',i:Users},
 {key:'partners',g:'ÉCOSYSTÈME',p:'/partenaires',l:'Partenaires',i:Handshake},
 {key:'academy',g:'ACADEMY',p:'/academy',l:'Mes formations',i:GraduationCap},
 {key:'library',g:'ACADEMY',p:'/academy/bibliotheque',l:'Bibliothèque',i:Library},
 {key:'progression',g:'ACADEMY',p:'/academy/progression',l:'Progression',i:TrendingUp},
 {key:'profile',g:'COMPTE',p:'/profil',l:'Profil',i:User},
 {key:'subscription',g:'COMPTE',p:'/abonnement',l:'Abonnement',i:CreditCard},
 {key:'billing',g:'COMPTE',p:'/facturation',l:'Facturation',i:CreditCard},
 {key:'history',g:'COMPTE',p:'/historique',l:'Historique',i:History},
 {key:'settings',g:'COMPTE',p:'/parametres',l:'Paramètres',i:Settings},
 {key:'bug',g:'COMPTE',p:'/bug',l:'Signaler un bug',i:Bug},
 {key:'support',g:'COMPTE',p:'/contact',l:'Support',i:LifeBuoy},
];

export default function Sidebar(){
 const pathname=usePathname();
 const [adminDestination,setAdminDestination]=useState("");
 useEffect(()=>{let live=true;import("@/lib/supabase/client").then(({createClient})=>createClient().auth.getSession()).then(({data})=>{if(!data.session?.access_token)return;return fetch("/api/admin/me",{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:"no-store"}).then(r=>{if(live&&r.ok)r.json().then(j=>{if(!live)return;const sections=["overview","inbox","copier","users","moderation","finance","system","navigation","staff"];const selected=sections.find(p=>j?.permissions?.includes(p));const route=({overview:"",inbox:"/inbox",copier:"/copieur",users:"/utilisateurs",moderation:"/moderation",finance:"/finance",system:"/systeme",navigation:"/navigation",staff:"/staff"} as Record<string,string>)[selected||"overview"];setAdminDestination("/dashboard/admin"+route)})})}).catch(()=>{});return()=>{live=false}},[]);
 const [visibility,setVisibility]=useState<Record<NavigationKey,boolean>>(defaultVisibility());
 useEffect(()=>{let dead=false;fetch('/api/navigation',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(!dead&&d?.visibility)setVisibility(v=>({...v,...d.visibility}))}).catch(()=>{});return()=>{dead=true}},[pathname]);
 const visibleMenu=useMemo(()=>menu.filter(item=>visibility[item.key]!==false),[visibility]);
 const active=(p:string)=>pathname==='/dashboard'+p||(p==='/classement'&&pathname.startsWith('/dashboard/classement/'));
 const links=<nav aria-label="Navigation principale">{visibleMenu.map((m,n)=><div key={m.key}>{(n===0||visibleMenu[n-1].g!==m.g)&&<div className="aura-nav-label">{m.g}</div>}<Link href={'/dashboard'+m.p} className={'aura-nav-item '+(active(m.p)?'active':'')} aria-current={active(m.p)?'page':undefined}><m.i size={18}/><span>{m.l}</span>{m.soon&&<small>Bientôt</small>}</Link></div>)}</nav>;
 const brand=<Link href="/" className="aura-brand"><BarChart3 size={32}/><span>investpro<small>TRADING</small></span></Link>;
 return <aside className="aura-sidebar">{brand}<p className="aura-workspace-label">TRADING HUB</p><div className="aura-nav-scroll">{links}{adminDestination&&<><div className="aura-nav-label">ÉQUIPE</div><Link href={adminDestination} className="aura-nav-item"><Settings size={18}/><span>Administration</span></Link></>}</div><Link className="aura-sidebar-footer" href="/dashboard/profil"><User size={19}/><span>Mon espace personnel</span></Link></aside>;

}
