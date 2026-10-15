'use client';
import { useLocale } from "@/components/i18n/LocaleProvider";

import {usePathname} from 'next/navigation';
export default function Breadcrumb(){
  const { t } = useLocale();
const path=usePathname();const names:Record<string,string>={'dashboard':'Dashboard','journal':'Journal','comptes':'Mes comptes','plan':'Plan de trading','performances-vip':'Performances VIP','analyse-fondamentale':'Analyse fondamentale','calendrier':'Calendrier éco','financialjuice':'FinancialJuice','tradingview':'TradingView','copieur':'InvestPro Copy CFD','copieur-futures':'InvestPro Copy Futures','vip':'Mon espace VIP','rapports':'Rapports','profil':'Profil','parametres':'Paramètres','abonnement':'Abonnement','facturation':'Facturation','historique':'Historique','simulateur':'Simulateur de risque','connexions':'Connexions','compte':'Compte & sécurité','contact':'Support','partenaires':'Partenaires','admin':'Administration','utilisateurs':'Utilisateurs','serveurs':'Serveurs','navigation':'Navigation','systeme':'Système','finance':'Finance','staff':'Équipe','sauvegarde':'Sauvegarde & export','sante':'Santé du compte','activite':'Centre d’activité','rapport-mensuel':'Bilan mensuel'};const last=path.split('/').filter(Boolean).at(-1)||'dashboard';return <div className="aura-breadcrumb">{t("Espace trader ")}<b>› {t(names[last]||last.replaceAll('-',' '))}</b></div>}
