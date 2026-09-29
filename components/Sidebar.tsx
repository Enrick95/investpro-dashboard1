"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {LayoutDashboard,GraduationCap,Library,TrendingUp,WalletCards,BarChart3,CalendarDays,Globe2,BookOpen,Calculator,Repeat2,Monitor,Trophy,Target,Users,User,LifeBuoy,ClipboardCheck,Grid2X2,X,Settings,CreditCard,Bug,History,Zap} from 'lucide-react';
const menu=[
 {g:'ACCUEIL',p:'',l:'Dashboard',i:LayoutDashboard},
 {g:'ACADEMY',p:'/academy',l:'Mes formations',i:GraduationCap,soon:true},
 {g:'ACADEMY',p:'/academy/bibliotheque',l:'Bibliothèque',i:Library,soon:true},
 {g:'ACADEMY',p:'/academy/progression',l:'Progression',i:TrendingUp,soon:true},
 {g:'TRADING',p:'/comptes',l:'Mes comptes',i:WalletCards},
 {g:'TRADING',p:'/tradingview',l:'TradingView',i:BarChart3},
 {g:'TRADING',p:'/calendrier',l:'Calendrier éco',i:CalendarDays},
 {g:'TRADING',p:'/analyse-fondamentale',l:'Analyse fondamentale',i:Globe2},
 {g:'TRADING',p:'/financialjuice',l:'FinancialJuice',i:Zap},
 {g:'TRADING',p:'/journal',l:'Journal',i:BookOpen},
 {g:'TRADING',p:'/plan',l:'Plan de trading',i:ClipboardCheck},
 {g:'TRADING',p:'/simulateur',l:'Simulateur risque',i:Calculator},
 {g:'TRADING',p:'/rapports',l:'Rapports',i:BarChart3},
 {g:'COMMUNAUTÉ',p:'/classement',l:'Classement',i:Trophy},
 {g:'COMMUNAUTÉ',p:'/performances-vip',l:'Performances VIP',i:TrendingUp},
 {g:'COMMUNAUTÉ',p:'/challenges',l:'Challenges',i:Target},
 {g:'COMMUNAUTÉ',p:'/membres',l:'Membres',i:Users},
 {g:'AUTOMATISATION',p:'/copieur',l:'Copieur',i:Repeat2,soon:true},
 {g:'AUTOMATISATION',p:'/terminal',l:'Terminal',i:Monitor,soon:true},
 {g:'COMPTE',p:'/profil',l:'Profil',i:User},
 {g:'COMPTE',p:'/abonnement',l:'Abonnement',i:CreditCard},
 {g:'COMPTE',p:'/facturation',l:'Facturation',i:CreditCard},
 {g:'COMPTE',p:'/historique',l:'Historique',i:History},
 {g:'COMPTE',p:'/parametres',l:'Paramètres',i:Settings},
 {g:'COMPTE',p:'/bug',l:'Signaler un bug',i:Bug},
 {g:'COMPTE',p:'/contact',l:'Support',i:LifeBuoy}
];
export default function Sidebar(){
 const pathname=usePathname(),[open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{setOpen(false)},[pathname]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 useEffect(()=>{if(!open)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before}},[open]);
 const active=(p:string)=>pathname==='/dashboard'+p||(p==='/classement'&&pathname.startsWith('/dashboard/classement/'));
 const links=<nav aria-label="Navigation principale">{menu.map((m,n)=><div key={m.p}>{(n===0||menu[n-1].g!==m.g)&&<div className="aura-nav-label">{m.g}</div>}<Link href={'/dashboard'+m.p} onClick={()=>setOpen(false)} className={'aura-nav-item '+(active(m.p)?'active':'')} aria-current={active(m.p)?'page':undefined}><m.i size={18}/><span>{m.l}</span>{m.soon&&<small>Bientôt</small>}</Link></div>)}</nav>;
 const brand=<Link href="/" className="aura-brand"><BarChart3 size={32}/><span>investpro<small>TRADING</small></span></Link>;
 return <><aside className="aura-sidebar">{brand}<p className="aura-workspace-label">ACADEMY & TRADING HUB</p><div className="aura-nav-scroll">{links}</div><Link className="aura-sidebar-footer" href="/dashboard/profil"><User size={19}/><span>Mon espace personnel</span></Link></aside>
 <nav className="aura-dock" aria-label="Navigation mobile">{[{p:'',l:'Accueil',i:LayoutDashboard},{p:'/journal',l:'Journal',i:BookOpen},{p:'/performances-vip',l:'VIP',i:TrendingUp}].map(m=><Link key={m.p} href={'/dashboard'+m.p} aria-current={active(m.p)?'page':undefined}><m.i size={21}/><span>{m.l}</span></Link>)}<button onClick={()=>setOpen(true)} aria-label="Ouvrir toutes les catégories" aria-expanded={open}><Grid2X2 size={21}/><span>Plus</span></button></nav>
 <dialog ref={dialog} className="aura-mobile-menu" onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="aura-mobile-menu-head">{brand}<button onClick={()=>setOpen(false)} aria-label="Fermer le menu"><X/></button></div>{links}</dialog></>;
}
