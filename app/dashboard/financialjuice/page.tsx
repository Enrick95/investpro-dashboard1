"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import MarketWidget from '@/components/markets/MarketWidget';
export default function Page(){
  const { t: translate } = useLocale();
return <><div className='aura-page-heading'><h1>{translate("FinancialJuice")}</h1><p>{translate("Le fil des annonces et des actualités des marchés.")}</p></div><MarketWidget kind='financialjuice'/></>;}
