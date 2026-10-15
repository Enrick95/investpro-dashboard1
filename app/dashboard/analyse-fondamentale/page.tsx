"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import FundamentalAnalysis from '@/components/fundamentals/FundamentalAnalysis';
export default function Page(){
  const { t: translate } = useLocale();
return <><div className="aura-page-heading"><span>{translate("TRADING / CONTEXTE MACRO")}</span><h1>{translate("Analyse fondamentale")}</h1><p>{translate("Les bonnes sources pour éclairer votre prochaine décision.")}</p></div><FundamentalAnalysis/></>;}
