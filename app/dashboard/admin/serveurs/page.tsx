"use client";
import ServerRequests from '@/components/metasync/ServerRequests';
import { useLocale } from "@/components/i18n/LocaleProvider";
import {Server} from 'lucide-react';
export default function Page(){
  const { t: tr } = useLocale();return <main className="space-y-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 text-[color:var(--gold)]"><Server size={20}/></div><div><h1 className="text-xl font-semibold text-white">{tr("Serveurs MT4 / MT5")}</h1><p className="mt-1 text-xs text-white/40">{tr("Prépare les serveurs demandés par les membres et rends-les disponibles.")}</p></div></div><ServerRequests admin/></main>;}
