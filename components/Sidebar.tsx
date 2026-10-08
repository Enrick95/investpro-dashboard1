"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useMemo,useRef,useState} from 'react';
import {LayoutDashboard,GraduationCap,Library,TrendingUp,WalletCards,BarChart3,CalendarDays,Globe2,BookOpen,Calculator,Repeat2,Trophy,Target,Users,User,LifeBuoy,ClipboardCheck,Grid2X2,X,Settings,CreditCard,Bug,History,Zap,Cable,Handshake} from 'lucide-react';
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
 {key:'copy',g:'TRADING',p:'/copieur',l:'Copieur multi-comptes',i:Repeat2},
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
 const pathname=usePathname(),[open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 const [visibility,setVisibility]=useState<Record<NavigationKey,boolean>>(defaultVisibility());
 useEffect(()=>{setOpen(false)},[pathname]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 useEffect(()=>{if(!open)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before}},[open]);
 useEffect(()=>{let dead=false;fetch('/api/navigation',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(!dead&&d?.visibility)setVisibility(v=>({...v,...d.visibility}))}).catch(()=>{});return()=>{dead=true}},[pathname]);
 const visibleMenu=useMemo(()=>menu.filter(item=>visibility[item.key]!==false),[visibility]);
 const active=(p:string)=>pathname==='/dashboard'+p||(p==='/classement'&&pathname.startsWith('/dashboard/classement/'));
 const links=<nav aria-label="Navigation principale">{visibleMenu.map((m,n)=><div key={m.key}>{(n===0||visibleMenu[n-1].g!==m.g)&&<div className="aura-nav-label">{m.g}</div>}<Link href={'/dashboard'+m.p} onClick={()=>setOpen(false)} className={'aura-nav-item '+(active(m.p)?'active':'')} aria-current={active(m.p)?'page':undefined}><m.i size={18}/><span>{m.l}</span>{m.soon&&<small>Bientôt</small>}</Link></div>)}</nav>;
 const brand=<Link href="/" className="aura-brand"><BarChart3 size={32}/><span>investpro<small>TRADING</small></span></Link>;
 return <><aside className="aura-sidebar">{brand}<p className="aura-workspace-label">TRADING HUB</p><div className="aura-nav-scroll">{links}</div><Link className="aura-sidebar-footer" href="/dashboard/profil"><User size={19}/><span>Mon espace personnel</span></Link></aside>
 <nav className="aura-dock" aria-label="Navigation mobile">{[{p:'',l:'Accueil',i:LayoutDashboard},{p:'/journal',l:'Journal',i:BookOpen},{p:'/comptes',l:'Comptes',i:WalletCards},{p:'/rapports',l:'Rapports',i:BarChart3}].map(m=><Link key={m.p} href={'/dashboard'+m.p} aria-current={active(m.p)?'page':undefined}><m.i size={21}/><span>{m.l}</span></Link>)}<button onClick={()=>setOpen(true)} aria-label="Ouvrir toutes les catégories" aria-expanded={open}><Grid2X2 size={21}/><span>Plus</span></button></nav>
 <dialog ref={dialog} className="aura-mobile-menu" onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="aura-mobile-menu-head">{brand}<button onClick={()=>setOpen(false)} aria-label="Fermer le menu"><X/></button></div>{links}</dialog></>;
}
